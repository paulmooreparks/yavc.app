package web

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func seedOf(t *testing.T, dir string) (map[string]homeEntry, string) {
	t.Helper()
	return readHome(dir)
}

func TestHomeSeedKeys(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "README.md", "one\r\ntwo\r\n")
	write(t, dir, "Howto/Slides.md", "deck")
	write(t, dir, "Documents/.keep", "")
	want := map[string]homeEntry{
		"/README.md":       {Kind: "f", Content: "one\ntwo\n"},
		"/Howto":           {Kind: "d"},
		"/Howto/Slides.md": {Kind: "f", Content: "deck"},
		"/Documents":       {Kind: "d"},
	}
	// The folder's path may be written with a trailing slash or ./, and
	// the keys are the same.
	cwd, _ := os.Getwd()
	rel, err := filepath.Rel(cwd, dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{dir, dir + string(filepath.Separator), filepath.Join(dir, ".") + string(filepath.Separator), "." + string(filepath.Separator) + rel} {
		files, _ := seedOf(t, d)
		if len(files) != len(want) {
			t.Fatalf("%q: %v", d, files)
		}
		for k, v := range want {
			if files[k] != v {
				t.Fatalf("%q: %s is %+v, want %+v", d, k, files[k], v)
			}
		}
	}
}

func TestHomeSeedDigest(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "a.txt", "x")
	_, v1 := seedOf(t, dir)
	_, again := seedOf(t, dir)
	if v1 == "" || v1 != again {
		t.Fatalf("the digest is not stable: %q %q", v1, again)
	}
	// CRLF and LF are the same file to the reader.
	write(t, dir, "a.txt", "x")
	write(t, dir, "b.txt", "l\r\n")
	_, crlf := seedOf(t, dir)
	write(t, dir, "b.txt", "l\n")
	if _, lf := seedOf(t, dir); lf != crlf {
		t.Fatal("line ends changed the digest")
	}
	// A file that becomes a folder of the same name changes it.
	os.Remove(filepath.Join(dir, "b.txt"))
	_, gone := seedOf(t, dir)
	os.Mkdir(filepath.Join(dir, "b.txt"), 0o755)
	if _, folder := seedOf(t, dir); folder == gone {
		t.Fatal("an entry's kind is not in the digest")
	}
	write(t, dir, "a.txt", "y")
	if _, changed := seedOf(t, dir); changed == gone {
		t.Fatal("a changed file did not change the digest")
	}
}

func TestHomeSeedHandler(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "GET", site("/api/site/home"), "")
	if w.Code != 200 {
		t.Fatalf("home: %d", w.Code)
	}
	var body struct {
		Version string               `json:"version"`
		Files   map[string]homeEntry `json:"files"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	tag := w.Header().Get("ETag")
	if tag != `"`+body.Version+`"` || body.Files["/README.md"].Content != "Read me.\n" || body.Files["/Documents"].Kind != "d" {
		t.Fatalf("home: %q %+v", tag, body)
	}
	if w := req(t, s, "GET", site("/api/site/home"), "", "If-None-Match", tag); w.Code != http.StatusNotModified {
		t.Fatalf("an unchanged home: %d", w.Code)
	}
	// A changed file is read again once the folder is looked at again.
	write(t, s.Home, "README.md", "Changed and longer.\n")
	s.home.mu.Lock()
	s.home.checked = time.Time{}
	s.home.mu.Unlock()
	if w := req(t, s, "GET", site("/api/site/home"), "", "If-None-Match", tag); w.Code != 200 || w.Header().Get("ETag") == tag {
		t.Fatalf("a changed home: %d %q", w.Code, w.Header().Get("ETag"))
	}
}
