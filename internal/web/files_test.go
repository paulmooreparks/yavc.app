package web

import (
	"compress/gzip"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDocumentTabsPrecedeAppletStartup(t *testing.T) {
	s := newSite(t, testDomain)
	for _, url := range []string{site("/"), "https://dice." + testDomain + "/"} {
		page := req(t, s, "GET", url, "").Body.String()
		last := -1
		for _, src := range []string{"/pudl/pudl-tabs.js?v=", "/static/doc-tabs.js?v=", "/pudl/pudl-applets.js?v=", "/applets/registry.js?v="} {
			at := strings.Index(page, `src="`+src)
			if at < 0 || at <= last || strings.Count(page, `src="`+src) != 1 {
				t.Fatalf("%s must load %s once, after its dependencies", url, src)
			}
			last = at
		}
	}
}

func TestStaticDigestAndCaching(t *testing.T) {
	s := newSite(t, testDomain)
	if len(s.staticVersion) != 12 {
		t.Fatalf("static version %q", s.staticVersion)
	}
	versioned := req(t, s, "GET", site("/static/site.css?v="+s.staticVersion), "")
	if versioned.Code != 200 || versioned.Header().Get("Cache-Control") != immutable {
		t.Fatalf("a versioned file: %d %q", versioned.Code, versioned.Header().Get("Cache-Control"))
	}
	tag := versioned.Header().Get("ETag")
	if tag == "" || tag != s.staticTag["site.css"] {
		t.Fatalf("ETag %q", tag)
	}
	if ct := versioned.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/css") {
		t.Fatalf("content type %q", ct)
	}
	for _, q := range []string{"", "?v=old", "?v="} {
		if c := req(t, s, "GET", site("/static/site.css"+q), "").Header().Get("Cache-Control"); c != revalidate {
			t.Errorf("site.css%s: %q", q, c)
		}
	}
	if w := req(t, s, "GET", site("/static/site.css"), "", "If-None-Match", tag); w.Code != http.StatusNotModified {
		t.Fatalf("If-None-Match: %d", w.Code)
	}
	if w := req(t, s, "GET", site("/static/"), ""); w.Code != 404 {
		t.Fatalf("the static folder: %d", w.Code)
	}
	if w := req(t, s, "GET", site("/static/shots"), ""); w.Code != 404 {
		t.Fatalf("a static subfolder: %d", w.Code)
	}
	// PUDL's files take the release's version, a package's its own, a
	// shared folder's the static digest.
	if c := req(t, s, "GET", site("/pudl/pudl.css?v="+s.pudlVersion), "").Header().Get("Cache-Control"); c != immutable {
		t.Fatalf("a versioned PUDL file: %q", c)
	}
	if c := req(t, s, "GET", site("/applets/dice/dice.js?v=1.2.3"), "").Header().Get("Cache-Control"); c != immutable {
		t.Fatalf("a versioned package file: %q", c)
	}
	if c := req(t, s, "GET", site("/applets/dice/dice.js?v=1.0.0"), "").Header().Get("Cache-Control"); c != revalidate {
		t.Fatalf("a package file with an old version: %q", c)
	}
	if c := req(t, s, "GET", site("/applets/shared/lib.js?v="+s.staticVersion), "").Header().Get("Cache-Control"); c != immutable {
		t.Fatalf("a versioned shared file: %q", c)
	}
	if w := req(t, s, "GET", site("/applets/shared/engine.wasm"), ""); w.Header().Get("Content-Type") != "application/wasm" {
		t.Fatalf("wasm content type %q", w.Header().Get("Content-Type"))
	}
}

// The registry's address has the catalogue's digest, which the page
// writes, and only that address is kept.
func TestRegistryAddress(t *testing.T) {
	s := newSite(t, testDomain)
	digest := s.catalogDigest()
	page := req(t, s, "GET", site("/"), "").Body.String()
	if !strings.Contains(page, `src="/applets/registry.js?v=`+digest+`"`) {
		t.Fatal("the page does not load the registry by its digest")
	}
	if c := req(t, s, "GET", site("/applets/registry.js?v="+digest), "").Header().Get("Cache-Control"); c != immutable {
		t.Fatalf("the current registry: %q", c)
	}
	if c := req(t, s, "GET", site("/applets/registry.js"), "").Header().Get("Cache-Control"); c != "no-store" {
		t.Fatalf("the registry without its digest: %q", c)
	}
	// A changed manifest changes the digest, once the catalogue looks again.
	dice := s.applets()[0]
	write(t, dice.Dir, "applet.json", `{"name":"dice","title":"Dice","version":"1.2.4","src":"dice.js"}`)
	s.catalog.mu.Lock()
	s.catalog.checked = s.catalog.checked.Add(-2 * catalogCheck)
	s.catalog.mu.Unlock()
	if s.catalogDigest() == digest {
		t.Fatal("the digest did not follow the manifest")
	}
}

func TestCompression(t *testing.T) {
	s := newSite(t, testDomain)
	for _, c := range []struct {
		path string
		gzip bool
	}{
		{"/static/site.css", true}, {"/applets/dice/dice.js", true}, {"/applets/shared/engine.wasm", true},
		{"/api/actions", true}, {"/", true}, {"/applets/dice/picture.png", false},
	} {
		w := req(t, s, "GET", site(c.path), "", "Accept-Encoding", "gzip, br")
		if got := w.Header().Get("Content-Encoding") == "gzip"; got != c.gzip {
			t.Errorf("%s: gzip %v, want %v", c.path, got, c.gzip)
			continue
		}
		if !strings.Contains(w.Header().Get("Vary"), "Accept-Encoding") {
			t.Errorf("%s: no Vary", c.path)
		}
		if c.gzip {
			zr, err := gzip.NewReader(w.Body)
			if err != nil {
				t.Fatalf("%s: %v", c.path, err)
			}
			if b, err := io.ReadAll(zr); err != nil || len(b) == 0 {
				t.Fatalf("%s: %d bytes, %v", c.path, len(b), err)
			}
			if tag := w.Header().Get("ETag"); tag != "" && !strings.HasPrefix(tag, "W/") {
				t.Errorf("%s: a compressed answer keeps a strong tag %q", c.path, tag)
			}
		}
	}
	// No compression without asking, for a range, or when gzip is refused.
	if w := req(t, s, "GET", site("/static/site.css"), ""); w.Header().Get("Content-Encoding") != "" {
		t.Fatal("compressed without Accept-Encoding")
	}
	if w := req(t, s, "GET", site("/static/site.css"), "", "Accept-Encoding", "gzip", "Range", "bytes=0-9"); w.Code != http.StatusPartialContent || w.Header().Get("Content-Encoding") != "" {
		t.Fatalf("a range: %d %q", w.Code, w.Header().Get("Content-Encoding"))
	}
	if w := req(t, s, "GET", site("/static/site.css"), "", "Accept-Encoding", "gzip;q=0"); w.Header().Get("Content-Encoding") != "" {
		t.Fatal("compressed though gzip was refused")
	}
}

func TestAppletDirNoListing(t *testing.T) {
	s := newSite(t, testDomain)
	// A path with .. in it is cleaned by the router, which redirects, so
	// it never reaches a folder.
	for _, path := range []string{"/applets/dice/sub", "/applets/dice/sub/", "/applets/shared/", "/pudl/", "/applets/dice/"} {
		w := req(t, s, "GET", site(path), "")
		if w.Code != http.StatusNotFound || strings.Contains(w.Body.String(), "inner.txt") {
			t.Errorf("%s: %d", path, w.Code)
		}
	}
	if w := req(t, s, "GET", site("/applets/dice/sub/inner.txt"), ""); w.Code != 200 || w.Body.String() != "inside\n" {
		t.Fatalf("a file in a subfolder: %d", w.Code)
	}
	if w := req(t, s, "GET", site("/applets/dice/sub/index.html"), ""); w.Code != 404 {
		t.Fatalf("a missing index: %d", w.Code)
	}
}

func TestAppletSymlinkEscape(t *testing.T) {
	s := newSite(t, testDomain)
	outside := filepath.Join(t.TempDir(), "secret.txt")
	const payload = "outside-package-confidential-fixture"
	os.WriteFile(outside, []byte(payload), 0o644)
	dice, _ := s.appletByName("dice")
	if err := os.Symlink(outside, filepath.Join(dice.Dir, "escape.txt")); err != nil {
		t.Skipf("this system cannot make a link here: %v", err)
	}
	if err := os.Symlink(filepath.Dir(outside), filepath.Join(dice.Dir, "escape-dir")); err != nil {
		t.Skipf("this system cannot make a link to a folder here: %v", err)
	}
	for _, path := range []string{"/applets/dice/escape.txt", "/applets/dice/escape-dir/secret.txt"} {
		if w := req(t, s, "GET", site(path), ""); w.Code != 404 || strings.Contains(w.Body.String(), payload) {
			t.Errorf("%s led out of the package: %d", path, w.Code)
		}
	}
	// A link that stays inside the package is followed.
	if err := os.Symlink("dice.js", filepath.Join(dice.Dir, "alias.js")); err == nil {
		if w := req(t, s, "GET", site("/applets/dice/alias.js"), ""); w.Code != 200 {
			t.Fatalf("a link inside the package: %d", w.Code)
		}
	}
}

func TestReadAppletManifestRules(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "a.js", "")
	write(t, dir, "body.html", `<div data-applet="x"></div>`)
	for manifest, want := range map[string]string{
		`{"name":"x","title":"X","version":"1","src":"a.js"}`: "",
		`not json`: "cannot be read",
		`{"name":"X","title":"X","version":"1","src":"a.js"}`:                               "lower-case",
		`{"name":"y","title":"X","version":"1","src":"a.js"}`:                               "folder's name",
		`{"name":"x","title":" ","version":"1","src":"a.js"}`:                               "title is missing",
		`{"name":"x","title":"X","src":"a.js"}`:                                             "version is missing",
		`{"name":"x","title":"X","version":"1"}`:                                            "src is missing",
		`{"name":"x","title":"X","version":"1","src":"../a.js"}`:                            "inside the package",
		`{"name":"x","title":"X","version":"1","src":"/a.js"}`:                              "inside the package",
		`{"name":"x","title":"X","version":"1","src":"./a.js"}`:                             "inside the package",
		`{"name":"x","title":"X","version":"1","src":"b.js"}`:                               "not in the package",
		`{"name":"x","title":"X","version":"1","src":"a.js","needs":["fs"]}`:                "does not offer",
		`{"name":"x","title":"X","version":"1","src":"a.js","page":{"fit":"wide"}}`:         "page.fit",
		`{"name":"x","title":"X","version":"1","src":"a.js","window":{"shape":"2,1"}}`:      "window.shape",
		`{"name":"x","title":"X","version":"1","src":"a.js","window":{"min":"0,10"}}`:       "pixels",
		`{"name":"x","title":"X","version":"1","src":"a.js","instances":-1}`:                "instances",
		`{"name":"x","title":"X","version":"1","src":"a.js","page":{"body":"body.html"}}`:   "",
		`{"name":"x","title":"X","version":"1","src":"a.js","window":{"shape":"0.3,0.88"}}`: "",
	} {
		_, err := readApplet(dir, "x", []byte(manifest))
		switch {
		case want == "" && err != nil:
			t.Errorf("%s: %v", manifest, err)
		case want != "" && (err == nil || !strings.Contains(err.Error(), want)):
			t.Errorf("%s: %v, want %q", manifest, err, want)
		}
	}
}
