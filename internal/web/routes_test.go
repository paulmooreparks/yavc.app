package web

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	s := newSite(t, testDomain)
	s.Secure = true
	for _, target := range []string{site("/"), site("/win/dice"), site("/state/dice"), "http://dice." + testDomain + "/"} {
		w := req(t, s, "GET", target, "")
		if w.Code >= 400 {
			t.Fatalf("%s: %d", target, w.Code)
		}
		h := w.Header()
		for name, want := range map[string]string{
			"Content-Security-Policy":    contentSecurityPolicy,
			"X-Content-Type-Options":     "nosniff",
			"X-Frame-Options":            "SAMEORIGIN",
			"Referrer-Policy":            "same-origin",
			"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
			"Strict-Transport-Security":  "max-age=31536000; includeSubDomains",
		} {
			if got := h.Get(name); got != want {
				t.Errorf("%s: %s is %q, want %q", target, name, got, want)
			}
		}
	}
	// HSTS only over HTTPS.
	plain := newSite(t, testDomain)
	if h := req(t, plain, "GET", site("/"), "").Header().Get("Strict-Transport-Security"); h != "" {
		t.Fatalf("HSTS without HTTPS: %q", h)
	}
}

// The desktop is windowed only (DESIGN.md, decision 26): the Pages view's
// list leads to the desktop, an application's address opens its window
// there, and a site page is still a page of its own.
func TestWindowedOnly(t *testing.T) {
	s := newSite(t, testDomain)
	if w := req(t, s, "GET", site("/pages"), ""); w.Code != http.StatusMovedPermanently || w.Header().Get("Location") != site("/") {
		t.Fatalf("/pages: %d %q", w.Code, w.Header().Get("Location"))
	}
	if w := req(t, s, "GET", site("/dice"), ""); w.Code != http.StatusTemporaryRedirect || w.Header().Get("Location") != site("/")+"?open=dice&top=dice" {
		t.Fatalf("/dice: %d %q", w.Code, w.Header().Get("Location"))
	}
	if w := req(t, s, "GET", site("/hello"), ""); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Hello") {
		t.Fatalf("/hello: %d", w.Code)
	}
	body := req(t, s, "GET", site("/"), "").Body.String()
	for _, gone := range []string{"view-seg", ">Pages<", "yavc-glyph-classic"} {
		if strings.Contains(body, gone) {
			t.Errorf("the desktop still has %q", gone)
		}
	}
	// The application's window still opens its page at its subdomain.
	if w := req(t, s, "GET", site("/win/dice"), ""); !strings.Contains(w.Body.String(), `data-win-action="page" href="http://dice.`+testDomain+`/"`) {
		t.Fatal("the window's Open as a Page does not lead to the subdomain")
	}
}

// Every top bar has PUDL's slot for Show as ribbon, which the site's
// stylesheet puts at the bar's right (Paul, 2026-11-03).
func TestRibbonSlot(t *testing.T) {
	s := newSite(t, testDomain)
	for _, target := range []string{site("/"), site("/hello"), "http://dice." + testDomain + "/"} {
		body := req(t, s, "GET", target, "").Body.String()
		if strings.Count(body, "data-menubar-ribbon-slot") != 1 {
			t.Errorf("%s has %d ribbon slots, want 1", target, strings.Count(body, "data-menubar-ribbon-slot"))
		}
	}
}

// An alias address serves its applet standalone under its own title, with
// the mount marked so the applet starts its own way, and the rest of the
// applet's address (help, files) behaves as at the applet's own address.
// docs is the Editor started for documents (docs-design, decision 17).
func TestHostAlias(t *testing.T) {
	if a := hostAliases["docs"]; a.applet != "editor" || a.title != "Docs" || a.start != "documents" {
		t.Fatalf("docs alias is %+v", a)
	}
	if _, err := os.Stat(filepath.Join("..", "..", "apps", "editor", "applet.json")); err != nil {
		t.Fatalf("docs serves an applet that is not installed: %v", err)
	}
	hostAliases["roll"] = hostAlias{applet: "dice", title: "Roll", start: "quick"}
	hostAliases["gone"] = hostAlias{applet: "nosuch", title: "Gone", start: "x"}
	defer delete(hostAliases, "roll")
	defer delete(hostAliases, "gone")
	s := newSite(t, testDomain)
	body := req(t, s, "GET", "http://roll."+testDomain+"/", "").Body.String()
	for _, want := range []string{`<title>Roll`, `data-dice-start="quick" data-applet="dice"`, `>Dice on the Desktop<`} {
		if !strings.Contains(body, want) {
			t.Errorf("the alias's page lacks %s", want)
		}
	}
	if own := req(t, s, "GET", "http://dice."+testDomain+"/", "").Body.String(); strings.Contains(own, "data-dice-start") {
		t.Error("the applet's own address is marked as the alias")
	}
	if w := req(t, s, "GET", "http://roll."+testDomain+"/applets/dice/dice.js", ""); w.Code != 200 {
		t.Errorf("the applet's files at the alias answer %d", w.Code)
	}
	if w := req(t, s, "GET", "http://gone."+testDomain+"/", ""); w.Code != http.StatusTemporaryRedirect {
		t.Errorf("an alias of an applet that is not installed answers %d, want a redirect to the desktop", w.Code)
	}
}

// A link in a page drawn in a window that leads to another of the site's
// windows opens that window on the desktop; any other link is left as it
// was, and the page of its own is unchanged.
func TestArticleLinksOpenWindows(t *testing.T) {
	s := newSite(t, testDomain)
	write(t, s.Pages, "links.md", "# Links\n\n[Dice](/dice), [Hello](/hello), [Nowhere](/nowhere), [Out](https://example.com/dice) and [Part](/hello#x).\n")
	win := req(t, s, "GET", site("/win/links"), "").Body.String()
	for _, want := range []string{`href="/dice" data-win-open="dice"`, `href="/hello" data-win-open="hello"`} {
		if !strings.Contains(win, want) {
			t.Errorf("window lacks %s", want)
		}
	}
	for _, unchanged := range []string{`href="/nowhere">`, `href="https://example.com/dice">`, `href="/hello#x">`} {
		if !strings.Contains(win, unchanged) {
			t.Errorf("window changed or lost %s", unchanged)
		}
	}
	if page := req(t, s, "GET", site("/links"), "").Body.String(); strings.Contains(page, "data-win-open=\"dice\">Dice") {
		t.Error("the page of its own was given window links")
	}
}

// The D2 engine's worker alone runs under a policy that allows eval, and
// that policy lets it reach no host at all (docs/diagrams-design.md,
// decision 3). Every other file of the same folder keeps the page's.
func TestEngineWorkerPolicy(t *testing.T) {
	s := newSite(t, testDomain)
	for _, target := range []string{site("/applets/diagram-kit/worker.js"), "http://dice." + testDomain + "/applets/diagram-kit/worker.js"} {
		w := req(t, s, "GET", target, "")
		if w.Code != http.StatusOK {
			t.Fatalf("%s: %d", target, w.Code)
		}
		if got := w.Header().Get("Content-Security-Policy"); got != workerPolicy {
			t.Fatalf("%s: policy %q", target, got)
		}
	}
	if !strings.Contains(workerPolicy, "default-src 'none'") || strings.Contains(workerPolicy, "connect-src") {
		t.Fatal("the worker's policy must leave every fetch to default-src 'none'")
	}
	for _, target := range []string{site("/applets/diagram-kit/d2.js"), site("/applets/shared/lib.js"), site("/applets/dice/dice.js")} {
		if got := req(t, s, "GET", target, "").Header().Get("Content-Security-Policy"); got != contentSecurityPolicy {
			t.Errorf("%s: policy %q, want the page's", target, got)
		}
	}
	if strings.Contains(contentSecurityPolicy, "'unsafe-eval'") {
		t.Fatal("the page's policy must never allow eval")
	}
}

// Every route that answers only on the site's own hosts says so in one
// body, written once, on a host that is not one of them.
func TestUnknownHostRoutes(t *testing.T) {
	s := newSite(t, testDomain)
	for _, route := range [][2]string{
		{"GET", "/state/dice"}, {"PUT", "/state/dice"}, {"GET", "/config/dice"}, {"PUT", "/config/dice"},
		{"GET", "/appearance"}, {"PUT", "/appearance"}, {"DELETE", "/session"}, {"GET", "/api/actions"},
		{"GET", "/api/site/home"}, {"GET", "/agent/tokens"}, {"POST", "/agent/tokens"}, {"DELETE", "/agent/tokens/abcdefgh"},
		{"GET", "/agent/stream?page=0123456789abcdef01234567"}, {"POST", "/agent/front"}, {"POST", "/agent/report"},
		{"POST", "/mcp"}, {"DELETE", "/mcp"},
		// A bad key or name on an unknown host is still the host's answer.
		{"GET", "/state/BAD"}, {"PUT", "/config/BAD"},
	} {
		w := req(t, s, route[0], "http://nowhere."+testDomain+route[1], "{}")
		if w.Code != http.StatusNotFound || w.Body.String() != "Not here.\n" {
			t.Errorf("%s %s: %d %q", route[0], route[1], w.Code, w.Body.String())
		}
	}
}

func TestForeignOriginRefused(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "PUT", site("/state/dice"), "x", "Origin", "https://evil.example")
	if w.Code != http.StatusForbidden {
		t.Fatalf("a foreign Origin: %d", w.Code)
	}
	w = req(t, s, "PUT", site("/state/dice"), "x", "Origin", "http://"+testDomain)
	if w.Code != http.StatusNoContent {
		t.Fatalf("the site's own Origin: %d", w.Code)
	}
}

func TestMutationRequiresSecFetchSite(t *testing.T) {
	s := newSite(t, testDomain)
	for site_, want := range map[string]int{"cross-site": 403, "same-site": 403, "same-origin": 204, "none": 204, "": 204} {
		w := req(t, s, "PUT", site("/state/dice"), "x", "Sec-Fetch-Site", site_)
		if w.Code != want {
			t.Errorf("Sec-Fetch-Site %q: %d, want %d", site_, w.Code, want)
		}
	}
	// A read is never refused for it.
	if w := req(t, s, "GET", site("/appearance"), "", "Sec-Fetch-Site", "cross-site"); w.Code != 200 {
		t.Fatalf("a cross-site read: %d", w.Code)
	}
}

func TestBodyLimits(t *testing.T) {
	s := newSite(t, testDomain)
	big := strings.Repeat("x", 1<<20+1)
	if w := req(t, s, "PUT", site("/state/dice"), big); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("state over 1 MB: %d", w.Code)
	}
	if w := req(t, s, "PUT", site("/appearance"), `{"skin":"`+big+`"}`); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("appearance over 1 MB: %d", w.Code)
	}
	// A report and an MCP call may be 16 MB.
	twoMB := `{"id":"x","view":{"status":"done"},"pad":"` + strings.Repeat("x", 2<<20) + `"}`
	if w := req(t, s, "POST", site("/agent/report"), twoMB); w.Code == http.StatusRequestEntityTooLarge {
		t.Fatal("a 2 MB report was refused for its size")
	}
	if w := req(t, s, "POST", site("/agent/report"), `{"pad":"`+strings.Repeat("x", 16<<20)+`"}`); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("a report over 16 MB: %d", w.Code)
	}
	mcpBody := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"pad":"` + strings.Repeat("x", 2<<20) + `"}}`
	if w := req(t, s, "POST", site("/mcp"), mcpBody); w.Code != http.StatusOK {
		t.Fatalf("a 2 MB MCP call: %d", w.Code)
	}
}

func TestStreamAndReportNeedSession(t *testing.T) {
	s := newSite(t, testDomain)
	if w := req(t, s, "GET", site("/agent/stream?page=0123456789abcdef01234567"), ""); w.Code != http.StatusForbidden {
		t.Fatalf("a stream without a session: %d", w.Code)
	}
	if w := req(t, s, "POST", site("/agent/report"), `{"id":"x","view":{"status":"done"}}`); w.Code != http.StatusForbidden {
		t.Fatalf("a report without a session: %d", w.Code)
	}
	cookie := cookieOf(t, req(t, s, "PUT", site("/state/dice"), "x"))
	for _, page := range []string{"", "short", "0123456789ABCDEF01234567", "0123456789abcdef012345678", "../0123456789abcdef0123"} {
		if w := req(t, s, "GET", site("/agent/stream?page="+page), "", "Cookie", cookie); w.Code != http.StatusBadRequest {
			t.Errorf("page id %q: %d", page, w.Code)
		}
	}
	if w := req(t, s, "POST", site("/agent/front"), `{"page":"nope"}`, "Cookie", cookie); w.Code != http.StatusBadRequest {
		t.Fatalf("front with a bad page id: %d", w.Code)
	}
	if w := req(t, s, "POST", site("/agent/report"), `{"id":"x","view":{"status":"done"}}`, "Cookie", cookie); w.Code != http.StatusNotFound {
		t.Fatalf("a report on no invocation: %d", w.Code)
	}
}

func TestPersistenceThroughHTTP(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "PUT", site("/state/dice:2"), "rolled 6")
	if w.Code != http.StatusNoContent {
		t.Fatalf("put state: %d", w.Code)
	}
	cookie := cookieOf(t, w)
	if w := req(t, s, "PUT", site("/config/dice"), `{"sides":20}`, "Cookie", cookie); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"modified"`) {
		t.Fatalf("put config: %d %q", w.Code, w.Body.String())
	}
	for _, bad := range []string{`[1,2]`, `"text"`, `null`, `12`, `{`} {
		if w := req(t, s, "PUT", site("/config/dice"), bad, "Cookie", cookie); w.Code != http.StatusBadRequest {
			t.Errorf("config %s: %d", bad, w.Code)
		}
	}
	if w := req(t, s, "PUT", site("/appearance"), `{"skin":"classic","mode":"light"}`, "Cookie", cookie); w.Code != http.StatusNoContent {
		t.Fatalf("put appearance: %d", w.Code)
	}
	if w := req(t, s, "PUT", site("/appearance"), `{"mode":"purple"}`, "Cookie", cookie); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a bad mode: %d", w.Code)
	}
	// An applet's subdomain reads the same session.
	if w := req(t, s, "GET", "http://dice."+testDomain+"/state/dice:2", "", "Cookie", cookie); w.Body.String() != "rolled 6" {
		t.Fatalf("state at the subdomain: %q", w.Body.String())
	}
	w = req(t, s, "GET", site("/config/dice"), "", "Cookie", cookie)
	if w.Body.String() != `{"sides":20}`+"\n" || w.Header().Get("Content-Type") != "application/json; charset=utf-8" || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("get config: %q %v", w.Body.String(), w.Header())
	}
	if w := req(t, s, "GET", site("/appearance"), "", "Cookie", cookie); !strings.Contains(w.Body.String(), `"skin":"classic"`) || !strings.Contains(w.Body.String(), `"mode":"light"`) {
		t.Fatalf("get appearance: %q", w.Body.String())
	}
	// The page is drawn with the choices on its root.
	if w := req(t, s, "GET", site("/"), "", "Cookie", cookie); !strings.Contains(w.Body.String(), `data-skin="classic"`) {
		t.Fatal("the desktop was not drawn with the reader's skin")
	}
	// An empty body forgets the state.
	req(t, s, "PUT", site("/state/dice:2"), "", "Cookie", cookie)
	if w := req(t, s, "GET", site("/state/dice:2"), "", "Cookie", cookie); w.Code != http.StatusNoContent {
		t.Fatalf("forgotten state: %d", w.Code)
	}
	if w := req(t, s, "GET", site("/state/Bad"), "", "Cookie", cookie); w.Code != http.StatusNotFound {
		t.Fatalf("a bad key: %d", w.Code)
	}
}

func TestPutStateSessionBudget(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "PUT", site("/state/dice"), strings.Repeat("x", maxValue))
	if w.Code != http.StatusNoContent {
		t.Fatalf("64 KB of state: %d", w.Code)
	}
	cookie := cookieOf(t, w)
	if w := req(t, s, "PUT", site("/state/dice"), strings.Repeat("x", maxValue+1), "Cookie", cookie); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("one key over 64 KB: %d", w.Code)
	}
	value := strings.Repeat("y", 60<<10)
	code := 0
	for i := 0; i < 20 && code != http.StatusRequestEntityTooLarge; i++ {
		code = req(t, s, "PUT", site("/state/dice:"+string(rune('a'+i))), value, "Cookie", cookie).Code
	}
	if code != http.StatusRequestEntityTooLarge {
		t.Fatal("state over 1 MB in all was kept")
	}
	sess, _ := s.Sessions.Load(sessionID(cookie))
	total := 0
	for k, v := range sess.State {
		total += len(k) + len(v)
	}
	if total > maxTotal {
		t.Fatalf("the session keeps %d bytes of state", total)
	}
	// Replacing a key counts its new value, not both.
	if w := req(t, s, "PUT", site("/state/dice"), "small", "Cookie", cookie); w.Code != http.StatusNoContent {
		t.Fatalf("replacing a value: %d", w.Code)
	}
	// Settings have the same budget.
	big := `{"v":"` + strings.Repeat("z", maxValue) + `"}`
	if w := req(t, s, "PUT", site("/config/dice"), big, "Cookie", cookie); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("settings over 64 KB: %d", w.Code)
	}
}

func TestPageRedirectStaysOnSite(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "GET", site("/page/hello"), "")
	if w.Code != http.StatusPermanentRedirect || w.Header().Get("Location") != "/hello" {
		t.Fatalf("a page: %d %q", w.Code, w.Header().Get("Location"))
	}
	for _, path := range []string{"/page/%2F%2Fevil.example", "/page/%5C%5Cevil.example", "/page/%2Fevil", "/page/..%2F..", "/page/Hello"} {
		w := req(t, s, "GET", site(path), "")
		if w.Code != http.StatusNotFound || w.Header().Get("Location") != "" {
			t.Errorf("%s: %d to %q", path, w.Code, w.Header().Get("Location"))
		}
	}
	// A page at an applet's subdomain goes to the desktop's, by slug only.
	w = req(t, s, "GET", "http://dice."+testDomain+"/%2F%2Fevil.example", "")
	if loc := w.Header().Get("Location"); strings.Contains(loc, "evil") {
		t.Fatalf("a subdomain redirect left the site: %q", loc)
	}
}

func TestSiteURLIgnoresHostPortInProduction(t *testing.T) {
	s := newSite(t, testDomain)
	r := httptestRequest("http://" + testDomain + ":8400/")
	if got := s.siteURL(r); got != "http://"+testDomain+"/" {
		t.Fatalf("siteURL %q", got)
	}
	if got := s.appletPageURL(r, "dice"); got != "http://dice."+testDomain+"/" {
		t.Fatalf("appletPageURL %q", got)
	}
	local := newSite(t, "localhost")
	r = httptestRequest("http://localhost:8400/")
	if got := local.siteURL(r); got != "http://localhost:8400/" {
		t.Fatalf("a local run keeps its port: %q", got)
	}
	bare := newSite(t, "")
	if got := bare.siteURL(r); got != "/" {
		t.Fatalf("a bare run: %q", got)
	}
}

func httptestRequest(target string) *http.Request {
	r, _ := http.NewRequest("GET", target, nil)
	r.Host = r.URL.Host
	return r
}

func TestWindowKeyPattern(t *testing.T) {
	for key, want := range map[string]string{
		"dice": "dice", "dice-2": "dice", "dice-9": "dice", "dice-10": "dice-10", "theme-studio": "theme-studio",
		"theme-studio-3": "theme-studio", "dice-1": "dice-1",
	} {
		m := winKey.FindStringSubmatch(key)
		if m == nil || m[1] != want {
			t.Errorf("%q reads as %v, want applet %q", key, m, want)
		}
	}
	for _, key := range []string{"Dice", "1dice", "dice_2", "", "-dice", "dice/2"} {
		if winKey.MatchString(key) {
			t.Errorf("%q should not be a window key", key)
		}
	}
	s := newSite(t, testDomain)
	if w := req(t, s, "GET", site("/win/dice-2"), ""); w.Code != 200 || !strings.Contains(w.Body.String(), `data-win="dice-2"`) {
		t.Fatalf("a numbered window: %d", w.Code)
	}
	if w := req(t, s, "GET", site("/win/hello"), ""); w.Code != 200 || !strings.Contains(w.Body.String(), "Hello") {
		t.Fatalf("a page's window: %d", w.Code)
	}
	if w := req(t, s, "GET", site("/win/nothing"), ""); w.Code != 404 {
		t.Fatalf("no such window: %d", w.Code)
	}
}

func TestDesktopOpenCapped(t *testing.T) {
	keys := []string{"dice", "dice", "dice-2", "dice"}
	for i := 0; i < 40; i++ {
		keys = append(keys, "w"+string(rune('a'+i%26))+string(rune('a'+i/26)))
	}
	d := parseDesktop(map[string][]string{"open": {strings.Join(keys, ",")}})
	if len(d.open) != maxWindows {
		t.Fatalf("%d windows open, want %d", len(d.open), maxWindows)
	}
	if d.open[0] != "dice" || d.open[1] != "dice-2" {
		t.Fatalf("a window should be kept once, at its first place: %v", d.open[:3])
	}
	s := newSite(t, testDomain)
	body := req(t, s, "GET", site("/?open=dice,dice,dice,dice-2,hello"), "").Body.String()
	if n := strings.Count(body, `data-win="dice"`); n != 1 {
		t.Fatalf("dice drawn %d times", n)
	}
	if !strings.Contains(body, `data-win="dice-2"`) || !strings.Contains(body, `data-win="hello"`) {
		t.Fatal("the other windows should be drawn")
	}
}

func TestHTTPServerTimeouts(t *testing.T) {
	s := newSite(t, testDomain)
	srv := s.HTTPServer(t.Context(), "127.0.0.1:0")
	if srv.ReadHeaderTimeout <= 0 || srv.ReadTimeout <= 0 || srv.IdleTimeout <= 0 {
		t.Fatalf("timeouts %v %v %v", srv.ReadHeaderTimeout, srv.ReadTimeout, srv.IdleTimeout)
	}
	if srv.BaseContext == nil {
		t.Fatal("no base context, so a shutdown cannot end the streams")
	}
	if !streaming("/agent/stream") || !streaming("/mcp") || streaming("/") || streaming("/state/x") {
		t.Fatal("only the stream and the MCP endpoint go without a write deadline")
	}
}
