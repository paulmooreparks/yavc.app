package web

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yavc.app/internal/session"
)

const testDomain = "yavc.test"

// write makes a file under dir, with its folders.
func write(t testing.TB, dir, name, body string) {
	t.Helper()
	path := filepath.Join(dir, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// newSite is an engine over a small site of its own in a temporary folder:
// one package (dice, with actions), a shared folder, a page, a home folder,
// and the repository's PUDL release.
func newSite(t testing.TB, domain string) *Server {
	t.Helper()
	dir := t.TempDir()
	apps := filepath.Join(dir, "applets")
	write(t, apps, "dice/applet.json", `{"name":"dice","title":"Dice","version":"1.2.3","description":"Roll dice.","src":"dice.js","css":"dice.css","actions":"actions.json","window":{"shape":"0.3,0.5"}}`)
	write(t, apps, "dice/dice.js", "pudlApplets.register('dice', {});\n")
	write(t, apps, "dice/dice.css", ".dice { color: red; }\n")
	write(t, apps, "dice/actions.json", `{"id":"test.dice","title":"Dice","actions":[{"ref":"test.dice/roll@1","title":"Roll"}]}`)
	write(t, apps, "dice/sub/inner.txt", "inside\n")
	write(t, apps, "dice/picture.png", "\x89PNG\r\n\x1a\nnot really")
	write(t, apps, "shared/lib.js", "var shared = 1;\n")
	write(t, apps, "shared/engine.wasm", "\x00asm"+strings.Repeat("\x00", 2000))
	write(t, apps, "diagram-kit/worker.js", "self.onmessage = null;\n")
	write(t, apps, "diagram-kit/d2.js", "var d2 = 1;\n")
	write(t, dir, "pages/hello.md", "# Hello\n\nSessions last {{retention}}.\n")
	write(t, dir, "home/README.md", "Read me.\r\n")
	write(t, dir, "home/Documents/.keep", "")
	store, err := session.New(filepath.Join(dir, "data"), 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(&Server{Domain: domain, Applets: []string{apps}, PUDL: filepath.Join("..", "..", "web", "pudl"),
		Pages: filepath.Join(dir, "pages"), Bin: filepath.Join(dir, "bin"), Home: filepath.Join(dir, "home"), Sessions: store, Title: "Test"})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// req makes a request of the engine. target is a full address, so its
// host is the request's; headers are name and value in turn.
func req(t testing.TB, h http.Handler, method, target, body string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	r := httptest.NewRequest(method, target, rd)
	for i := 0; i+1 < len(headers); i += 2 {
		r.Header.Set(headers[i], headers[i+1])
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

// cookieOf is the session cookie a response set, as a Cookie header.
func cookieOf(t testing.TB, w *httptest.ResponseRecorder) string {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == cookieName && c.Value != "" {
			return cookieName + "=" + c.Value
		}
	}
	t.Fatalf("no session cookie in %v", w.Header())
	return ""
}

// sessionID is the session a Cookie header holds.
func sessionID(cookie string) string { return strings.TrimPrefix(cookie, cookieName+"=") }

func site(path string) string { return "http://" + testDomain + path }
