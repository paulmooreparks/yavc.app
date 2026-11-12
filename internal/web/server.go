// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package web is the yavc.app engine's HTTP face: the desktop at the site's
// domain, each applet standalone at its own subdomain, the applet
// packages' files and registry, PUDL, and the session's state and
// appearance (DESIGN.md).
package web

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"io/fs"
	"log"
	"maps"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"yavc.app/internal/mcp"
	"yavc.app/internal/relay"
	"yavc.app/internal/session"
)

//go:embed templates/*.html
var templates embed.FS

//go:embed static
var static embed.FS

// Server is the engine.
type Server struct {
	// Domain is the site's domain, such as yavc.app. The desktop answers
	// at it and at www; an applet answers at {name}.Domain. Empty means
	// every host is the desktop, for a bare local run.
	Domain string
	// Secure says the site is reached over HTTPS, so cookies are marked.
	Secure bool
	// Applets is the folders of installed applet packages, in order.
	Applets []string
	// PUDL is the folder holding the PUDL release's dist files.
	PUDL string
	// Pages is the folder of the site's pages, Markdown files served at
	// /{slug}; Bin is the folder of the site's scripts, listed under
	// /site/bin by the file system.
	Pages, Bin string
	// Home is the folder of the stock files a reader's home folder starts
	// with (home.go).
	Home string
	// Sessions keeps the readers' sessions.
	Sessions *session.Store
	// Title is the site's name, shown in the topbar and the page titles.
	Title string
	// DocumentGrouping selects single-document windows or tabbed workspaces.
	DocumentGrouping string

	catalog appletCatalog
	pages   *template.Template
	mux     *http.ServeMux
	// The agents' relay and the MCP endpoint (agents.go).
	hub *relay.Hub
	mcp *mcp.Server
	// The versions written into asset addresses as ?v=, so a changed file
	// is fetched again: the site's own files take a digest of their
	// contents, and PUDL's take the release's version from pudl.css.
	staticVersion, pudlVersion string
	retain                     time.Duration
	// The embedded files, and each one's entity tag.
	staticFS  fs.FS
	staticTag map[string]string
	// The release's skins and colour themes, read once at start-up.
	skinList, paletteList []skinEntry
	// The site's pages as last rendered, and the home folder's stock files
	// as last read (site.go, home.go).
	pageMu    sync.Mutex
	pageCache map[string]cachedPage
	home      homeCache
	now       func() time.Time
}

// The server's timeouts. A handler's answer must be written within
// writeTimeout, except the page's event stream and the MCP endpoint,
// whose answers wait on the person's page.
const (
	readHeaderTimeout = 10 * time.Second
	readTimeout       = 30 * time.Second
	idleTimeout       = 120 * time.Second
	writeTimeout      = 2 * time.Minute
)

// HTTPServer is the HTTP server for the engine at addr, with its timeouts.
// Requests' contexts derive from base, so cancelling it ends the streams
// that would otherwise hold a shutdown open.
func (s *Server) HTTPServer(base context.Context, addr string) *http.Server {
	return &http.Server{
		Addr: addr, Handler: s,
		ReadHeaderTimeout: readHeaderTimeout, ReadTimeout: readTimeout, IdleTimeout: idleTimeout,
		BaseContext: func(net.Listener) context.Context { return base },
	}
}

// Run sweeps what the engine keeps in memory, the relay's records and the
// MCP sessions, once a minute until ctx ends.
func (s *Server) Run(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.hub.Sweep()
			s.mcp.Sweep()
		}
	}
}

// retention says how long a session lives unseen, for the reader.
func (s *Server) retention() string {
	days := int(s.retain.Hours() / 24)
	switch {
	case s.retain <= 0:
		return "as long as this site runs"
	case days >= 2:
		return strconv.Itoa(days) + " days"
	default:
		return s.retain.String()
	}
}

// asset is an asset's address with its version, for the templates.
func (s *Server) asset(path string) string {
	switch {
	case strings.HasPrefix(path, "/static/"):
		return path + "?v=" + s.staticVersion
	case strings.HasPrefix(path, "/pudl/"):
		return path + "?v=" + s.pudlVersion
	}
	return path
}

func (s *Server) versions() {
	h := sha256.New()
	fs.WalkDir(static, "static", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			b, _ := static.ReadFile(p)
			h.Write([]byte(p))
			h.Write(b)
		}
		return nil
	})
	// A shared folder beside the packages, such as apps/md-engine, has no
	// version of its own, and the scripts that load it stamp its files
	// with this version, so its files go into the digest as well.
	for _, folder := range s.Applets {
		entries, err := os.ReadDir(folder)
		if err != nil {
			continue
		}
		for _, e := range entries {
			dir := filepath.Join(folder, e.Name())
			if !e.IsDir() {
				continue
			}
			if _, err := os.Stat(filepath.Join(dir, "applet.json")); err == nil {
				continue
			}
			filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
				if err == nil && !d.IsDir() {
					b, _ := os.ReadFile(p)
					h.Write([]byte(filepath.ToSlash(p)))
					h.Write(b)
				}
				return nil
			})
		}
	}
	s.staticVersion = hex.EncodeToString(h.Sum(nil))[:12]
	s.pudlVersion = "0"
	if head, err := os.ReadFile(filepath.Join(s.PUDL, "pudl.css")); err == nil {
		if m := regexp.MustCompile(`Version ([0-9]+(?:\.[0-9]+)*)`).FindSubmatch(head[:min(len(head), 400)]); m != nil {
			s.pudlVersion = string(m[1])
		}
	}
}

const cookieName = "yavc"

var winKey = regexp.MustCompile(`^([a-z][a-z0-9-]*?)(?:-([2-9]))?$`)

// New prepares the server's routes and templates.
func New(s *Server) (*Server, error) {
	if s.Title == "" {
		s.Title = "yavc.app"
	}
	if s.now == nil {
		s.now = time.Now
	}
	s.versions()
	s.skinList, s.paletteList = s.readSkins(), s.readPalettes()
	s.staticFS, _ = fs.Sub(static, "static")
	s.staticTag = staticTags(s.staticFS)
	s.pageCache = map[string]cachedPage{}
	var err error
	s.pages, err = template.New("").Funcs(template.FuncMap{
		"asset": s.asset,
		"checked": func(have, want string) template.HTMLAttr {
			if have == want {
				return `aria-checked="true"`
			}
			return `aria-checked="false"`
		},
		"json": func(v any) template.JS { b, _ := json.Marshal(v); return template.JS(b) },
		"dict": func(kv ...any) map[string]any {
			m := map[string]any{}
			for i := 0; i+1 < len(kv); i += 2 {
				m[kv[i].(string)] = kv[i+1]
			}
			return m
		},
	}).ParseFS(templates, "templates/*.html")
	if err != nil {
		return nil, err
	}
	m := http.NewServeMux()
	s.mux = m
	m.HandleFunc("GET /static/{file...}", s.staticFile)
	m.HandleFunc("GET /pudl/{file...}", s.pudlFile)
	m.HandleFunc("GET /applets/registry.js", s.registry)
	m.HandleFunc("GET /applets/{name}/{file...}", s.appletFile)
	m.HandleFunc("GET /win/{key}", s.window)
	m.HandleFunc("GET /applet/{applet}", s.root)
	m.HandleFunc("GET /api/site/tree", s.siteTree)
	m.HandleFunc("GET /api/site/text/{slug}", s.siteText)
	m.HandleFunc("GET /api/site/texts", s.siteTexts)
	m.HandleFunc("GET /api/site/home", s.homeSeedHandler)
	m.HandleFunc("GET /api/shortcodes", s.shortcodeList)
	m.HandleFunc("GET /page/{slug}", s.pageRedirect)
	m.HandleFunc("GET /state/{key}", s.getState)
	m.HandleFunc("PUT /state/{key}", s.putState)
	m.HandleFunc("GET /config/{name}", s.getConfig)
	m.HandleFunc("PUT /config/{name}", s.putConfig)
	m.HandleFunc("POST /config/{name}/adopt", s.adoptConfig)
	m.HandleFunc("DELETE /config/{name}", s.deleteConfig)
	m.HandleFunc("GET /config", s.listConfig)
	m.HandleFunc("GET /appearance", s.getAppearance)
	m.HandleFunc("PUT /appearance", s.putAppearance)
	m.HandleFunc("DELETE /session", s.deleteSession)
	m.HandleFunc("GET /{$}", s.root)
	s.agentRoutes(m)
	s.retain = s.Sessions.Retain
	m.HandleFunc("GET /pages", s.pagesGone)
	m.HandleFunc("GET /about", s.aboutPage)
	m.HandleFunc("GET /about/pudl", s.aboutPage)
	m.HandleFunc("GET /help", s.helpPage)
	m.HandleFunc("GET /help/{app}", s.helpPage)
	m.HandleFunc("GET /{slug}", s.slugPage)
	return s, nil
}

// bodyLimit is the most bytes a request's body may have. An agent's report
// may hold an action's artifacts, up to 4 MB each by PUDL's rule, and an
// MCP call may hold a deck.
func bodyLimit(path string) int64 {
	if path == "/agent/report" || path == "/mcp" {
		return 16 << 20
	}
	return 1 << 20
}

// streaming says whether a path's answer waits on the person's page, and
// so has no write deadline and is not compressed.
func streaming(path string) bool { return path == "/agent/stream" || path == "/mcp" }

// ServeHTTP checks where a request came from, then routes it.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	securityHeaders(w.Header(), s.Secure)
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		// A change must come from a page of this site. The session cookie
		// is SameSite=Lax, so another site's form cannot send it; a
		// browser that says where the request came from (Sec-Fetch-Site)
		// must say this origin, or that no page sent it; and a change
		// whose Origin is another host is refused as well. An agent's
		// client sends neither header.
		if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
			http.Error(w, "A change must come from this site's own pages.", http.StatusForbidden)
			return
		}
		if o := r.Header.Get("Origin"); o != "" {
			if u, err := url.Parse(o); err != nil || !strings.EqualFold(u.Host, r.Host) {
				http.Error(w, "A change must come from this site's own pages.", http.StatusForbidden)
				return
			}
		}
		r.Body = http.MaxBytesReader(w, r.Body, bodyLimit(r.URL.Path))
	}
	s.touchSession(w, r)
	rc := http.NewResponseController(w)
	if streaming(r.URL.Path) {
		// An error says only that the writer underneath has no deadlines,
		// as a test's recorder has none, which leaves nothing to clear.
		_ = rc.SetWriteDeadline(time.Time{})
		s.mux.ServeHTTP(w, r)
		return
	}
	_ = rc.SetWriteDeadline(time.Now().Add(writeTimeout))
	if r.Method != http.MethodHead && r.Header.Get("Range") == "" && acceptsGzip(r) {
		gz := &gzipWriter{ResponseWriter: w}
		defer gz.close()
		w = gz
	}
	s.mux.ServeHTTP(w, r)
}

// === Hosts ==================================================================

// hostKind says what a request's host asks for: the desktop, one applet
// standalone (with its name), or neither.
func (s *Server) hostKind(r *http.Request) (kind, name string) {
	host := strings.ToLower(r.Host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	d := strings.ToLower(s.Domain)
	if d == "" || host == d || host == "www."+d {
		return "desktop", ""
	}
	if strings.HasSuffix(host, "."+d) {
		slug := strings.TrimSuffix(host, "."+d)
		if a, ok := hostAliases[slug]; ok {
			if _, ok := s.appletByName(a.applet); ok {
				return "applet", a.applet
			}
		}
		if _, ok := s.appletByName(slug); ok {
			return "applet", slug
		}
	}
	return "other", ""
}

// hostAlias is an address that serves an applet started another way. Its
// page has its own title, and the applet's mount is marked with
// data-{applet}-start, which the applet reads to know how to start.
type hostAlias struct {
	applet, title, start string
}

// hostAliases are the subdomains that serve an applet under another name.
// Aliases are looked up before installed applets. Docs is a real package.
var hostAliases = map[string]hostAlias{}

// aliasOf is the alias the request's host is, if it is one.
func (s *Server) aliasOf(r *http.Request) (hostAlias, bool) {
	host := strings.ToLower(r.Host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	d := strings.ToLower(s.Domain)
	if d == "" || !strings.HasSuffix(host, "."+d) {
		return hostAlias{}, false
	}
	a, ok := hostAliases[strings.TrimSuffix(host, "."+d)]
	return a, ok
}

func (s *Server) scheme() string {
	if s.Secure {
		return "https"
	}
	return "http"
}

// port is the port the request came in on, with its colon, for a local
// run at localhost, whose addresses keep it. A site at a real domain is
// reached on the scheme's own port, whatever the Host header says.
func (s *Server) port(r *http.Request) string {
	if s.Domain != "localhost" {
		return ""
	}
	if _, p, err := net.SplitHostPort(r.Host); err == nil && p != "" {
		return ":" + p
	}
	return ""
}

// siteURL is the desktop's address.
func (s *Server) siteURL(r *http.Request) string {
	if s.Domain == "" {
		return "/"
	}
	return s.scheme() + "://" + s.Domain + s.port(r) + "/"
}

// appletPageURL is an applet's own page, at its subdomain.
func (s *Server) appletPageURL(r *http.Request, name string) string {
	if s.Domain == "" {
		return "/" + name
	}
	return s.scheme() + "://" + name + "." + s.Domain + s.port(r) + "/"
}

// === Sessions ===============================================================

func (s *Server) cookie(value string, maxAge int) *http.Cookie {
	c := &http.Cookie{Name: cookieName, Value: value, Path: "/", HttpOnly: true, Secure: s.Secure,
		SameSite: http.SameSiteLaxMode, MaxAge: maxAge}
	// A cookie on the domain itself is sent to every subdomain (RFC 6265,
	// section 5.1.3), which is what shares one session between the desktop
	// and the standalone pages. Browsers refuse a Domain of localhost, so
	// a bare local run keeps the cookie host-only.
	if s.Domain != "" && s.Domain != "localhost" {
		c.Domain = s.Domain
	}
	return c
}

// touchSession records that the request's session was used, at most once a
// day (session.Store.Touch), and when it does, sets the cookie again with
// the full retention period, so the browser drops the cookie when the
// store drops the session and not before. Files whose addresses carry a
// version are skipped: every page that loads them makes other requests.
func (s *Server) touchSession(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path
	if strings.HasPrefix(p, "/static/") || strings.HasPrefix(p, "/pudl/") || strings.HasPrefix(p, "/applets/") {
		return
	}
	c, err := r.Cookie(cookieName)
	if err != nil {
		return
	}
	wrote, err := s.Sessions.Touch(c.Value)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Printf("session: %v", err)
	}
	if wrote {
		http.SetCookie(w, s.cookie(c.Value, int(s.Sessions.Retain/time.Second)))
	}
}

// lookup is the request's session: nil with no error when the request has
// no cookie or its session is gone, and an error when the store could not
// be read, which is never taken for an absent session.
func (s *Server) lookup(r *http.Request) (*session.Session, error) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return nil, nil
	}
	sess, err := s.Sessions.Load(c.Value)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	return sess, err
}

// sessionOf is the request's session for drawing a page, or nil when it
// has none; a store failure draws the page as for a new reader, and is
// logged.
func (s *Server) sessionOf(r *http.Request) *session.Session {
	sess, err := s.lookup(r)
	if err != nil {
		log.Printf("session: %v", err)
	}
	return sess
}

// ensureSession is the request's session, made now if it has none; the
// cookie is set on the answer. A session is made only by a request that
// has something to keep, so a reader who only looks gets no cookie.
func (s *Server) ensureSession(w http.ResponseWriter, r *http.Request) (*session.Session, error) {
	sess, err := s.lookup(r)
	if err != nil || sess != nil {
		return sess, err
	}
	sess, err = s.Sessions.Create()
	if err != nil {
		return nil, err
	}
	http.SetCookie(w, s.cookie(sess.ID, int(s.Sessions.Retain/time.Second)))
	return sess, nil
}

// update changes the request's session under its lock, making the session
// first if there is none, and returns the session as changed. A change
// that returns an error is not kept.
func (s *Server) update(w http.ResponseWriter, r *http.Request, change func(*session.Session) error) (*session.Session, error) {
	sess, err := s.ensureSession(w, r)
	if err != nil {
		return nil, err
	}
	return s.Sessions.Update(sess.ID, change)
}

// === Pages ==================================================================

type appearance struct{ Skin, Palette, Mode string }

func (s *Server) appearanceOf(sess *session.Session) appearance {
	a := appearance{Skin: "standard", Palette: "standard", Mode: "system"}
	if sess == nil {
		return a
	}
	if sess.Appearance.Skin != "" {
		a.Skin = sess.Appearance.Skin
	}
	if sess.Appearance.Palette != "" {
		a.Palette = sess.Appearance.Palette
	}
	if sess.Appearance.Mode != "" {
		a.Mode = sess.Appearance.Mode
	}
	return a
}

// The mode written on the root before the theme script runs: system
// resolves in the browser, and starts dark as PUDL does.
func (a appearance) Theme() string {
	if a.Mode == "light" {
		return "light"
	}
	return "dark"
}

type skinEntry struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Stylesheet string `json:"stylesheet"`
	Admitted   bool   `json:"admitted"`
}

// readSkins is the release's catalogue of admitted skins, from
// pudl-skins.json, never a list written into the engine.
func (s *Server) readSkins() []skinEntry {
	raw, err := os.ReadFile(filepath.Join(s.PUDL, "pudl-skins.json"))
	if err != nil {
		return []skinEntry{{ID: "standard", Label: "Standard", Admitted: true}}
	}
	var cat struct {
		Skins []skinEntry `json:"skins"`
	}
	if err := json.Unmarshal(raw, &cat); err != nil {
		return []skinEntry{{ID: "standard", Label: "Standard", Admitted: true}}
	}
	var out []skinEntry
	for _, k := range cat.Skins {
		if k.Admitted {
			out = append(out, k)
		}
	}
	return out
}

// readPalettes is the colour themes the release ships,
// pudl-theme-<id>.css, with Standard first.
func (s *Server) readPalettes() []skinEntry {
	out := []skinEntry{{ID: "standard", Label: "Standard"}}
	matches, _ := filepath.Glob(filepath.Join(s.PUDL, "pudl-theme-*.css"))
	for _, m := range matches {
		id := strings.TrimSuffix(strings.TrimPrefix(filepath.Base(m), "pudl-theme-"), ".css")
		if id == "" {
			continue
		}
		out = append(out, skinEntry{ID: id, Label: strings.ToUpper(id[:1]) + id[1:], Stylesheet: filepath.Base(m)})
	}
	return out
}

// pageData is what every page's template gets. A request builds it once.
func (s *Server) pageData(r *http.Request, title string) map[string]any {
	sess := s.sessionOf(r)
	state := map[string]string{}
	config := map[string]string{}
	if sess != nil {
		state, config = sess.State, sess.Config
	}
	suffix := ""
	if r.URL.RawQuery != "" {
		suffix = "?" + r.URL.RawQuery
	}
	return map[string]any{
		"AboutSite": "/about" + suffix, "AboutPUDL": "/about/pudl" + suffix,
		"Site": s.Title, "Title": title, "SiteURL": s.siteURL(r), "DocumentGrouping": s.DocumentGrouping, "Analytics": s.Secure,
		"Appearance": s.appearanceOf(sess), "Skins": s.skinList, "Palettes": s.paletteList,
		"State": state, "Config": config,
		"Applets": s.appletEntries(r), "Dialog": "", "PUDLVersion": s.pudlVersion, "Retention": s.retention(), "StaticVersion": s.staticVersion, "SiteOrigin": strings.TrimSuffix(s.siteURL(r), "/"),
		"Agents": agentCount(sess), "Registry": "/applets/registry.js?v=" + s.catalogDigest(),
		"Help":  s.helpEntries(),
		"Start": s.startCatalog(r),
	}
}

func (s *Server) render(w http.ResponseWriter, status int, page string, data map[string]any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := s.pages.ExecuteTemplate(w, page, data); err != nil {
		log.Printf("render %s: %v", page, err)
	}
}

// root is the desktop at the site's domain, an applet's standalone page at
// its subdomain, and a redirect to the desktop from any other subdomain.
func (s *Server) root(w http.ResponseWriter, r *http.Request) { s.rootWith(w, r, "") }

func (s *Server) rootWith(w http.ResponseWriter, r *http.Request, dialog string) {
	kind, name := s.hostKind(r)
	if requested := r.PathValue("applet"); requested != "" {
		if kind != "desktop" {
			s.notFound(w, r)
			return
		}
		if _, ok := s.appletByName(requested); !ok {
			s.notFound(w, r)
			return
		}
		kind, name = "applet", requested
	}
	switch kind {
	case "applet":
		a, _ := s.appletByName(name)
		title, mount := a.Title, appletBody(a, true)
		if al, ok := s.aliasOf(r); ok {
			title = al.title
			mount = template.HTML(strings.Replace(string(mount), `data-applet="`+a.Name+`"`,
				`data-`+a.Name+`-start="`+al.start+`" data-applet="`+a.Name+`"`, 1))
		}
		data := s.pageData(r, title)
		data["Applet"] = a
		data["Mount"] = mount
		data["Standalone"] = true
		data["AppletHelp"] = s.helpFor(name)
		data["Dialog"] = dialog
		// Standalone applications keep site information in floating windows
		// over their own page, with the open set represented in its URL.
		d := parseDesktop(r.URL.Query())
		links := map[string]string{}
		for _, k := range []string{"help", "author", "agents", "privacy", "terms"} {
			links[k] = d.openWindow(k)
		}
		for _, h := range s.helpEntries() {
			links["help-"+h["Name"]] = d.openWindow("help-" + h["Name"])
		}
		data["WindowLinks"] = links
		var wins strings.Builder
		for _, k := range d.open {
			wins.WriteString(s.windowMarkup(r, data, d, k))
		}
		data["Windows"] = template.HTML(wins.String())
		s.render(w, http.StatusOK, "standalone", data)
	case "desktop":
		data := s.pageData(r, s.Title)
		data["Desktop"] = true
		data["Dialog"] = dialog
		// The windows the address has open are drawn into the page, as
		// PUDL's window contract asks of a server, so the desktop holds its
		// content without script and a reader arriving by a shared link
		// sees it.
		d := parseDesktop(r.URL.Query())
		var wins strings.Builder
		for _, k := range d.open {
			wins.WriteString(s.windowMarkup(r, data, d, k))
		}
		data["Windows"] = template.HTML(wins.String())
		data["Bar"] = d.bar()
		s.render(w, http.StatusOK, "desktop", data)
	default:
		http.Redirect(w, r, s.siteURL(r), http.StatusTemporaryRedirect)
	}
}

// aboutPage is /about and /about/pudl: the page the reader is on, with
// the About dialog open. At the site's domain that page is the desktop;
// at an applet's subdomain it is the applet's standalone page.
func (s *Server) aboutPage(w http.ResponseWriter, r *http.Request) {
	dialog := "about-site"
	if strings.HasSuffix(r.URL.Path, "/pudl") {
		dialog = "about-pudl"
	}
	r2 := r.Clone(r.Context())
	r2.URL.Path = "/"
	s.rootWith(w, r2, dialog)
}

// pagesGone is /pages, where the Pages view listed the applications until
// the site became windowed only (DESIGN.md, decision 26). An old link
// arrives at the desktop.
func (s *Server) pagesGone(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, s.siteURL(r), http.StatusMovedPermanently)
}

// pageRedirect is /page/{slug}, where parkscomputing.com's applets link to
// a page; here a page is at the root. Only a page's slug is redirected,
// so the address cannot lead off the site.
func (s *Server) pageRedirect(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !slugRe.MatchString(slug) {
		s.notFound(w, r)
		return
	}
	http.Redirect(w, r, "/"+slug, http.StatusPermanentRedirect)
}

// slugPage is /{slug}. At the site's domain it is a site page, drawn as a
// page of its own, which is where the Open as a Page button of that page's
// window leads; or an application, which opens in its window on the
// desktop, since the site is windowed only and an application's page of
// its own is at its subdomain (DESIGN.md, decision 26). A link to an
// application in an article, or one kept from the Pages view, therefore
// still arrives. At any other host it goes to the same address at the
// site's domain.
func (s *Server) slugPage(w http.ResponseWriter, r *http.Request) {
	kind, _ := s.hostKind(r)
	if kind != "desktop" {
		slug := r.PathValue("slug")
		if !slugRe.MatchString(slug) {
			s.notFound(w, r)
			return
		}
		http.Redirect(w, r, s.siteURL(r)+slug, http.StatusTemporaryRedirect)
		return
	}
	slug := r.PathValue("slug")
	if p, ok := s.page(slug); ok {
		// A help page reached by its slug goes to its own address.
		if p.Path != "/"+slug {
			http.Redirect(w, r, p.Path, http.StatusPermanentRedirect)
			return
		}
		s.article(w, r, p)
		return
	}
	if to, ok := movedPages[slug]; ok {
		http.Redirect(w, r, to, http.StatusPermanentRedirect)
		return
	}
	if _, ok := s.appletByName(slug); !ok {
		s.notFound(w, r)
		return
	}
	http.Redirect(w, r, s.siteURL(r)+"?open="+slug+"&top="+slug, http.StatusTemporaryRedirect)
}

// windowLink is a link a site page's Markdown makes to another of the
// site's windows: an application at /{name}, a page at /{slug}, or help at
// /help and /help/{app}, whose window keys are help and help-{app}.
var windowLink = regexp.MustCompile(`<a href="/((?:help/)?[a-z][a-z0-9-]*)"`)

// windowLinks gives each link in a page drawn in a window that leads to
// another of the site's windows PUDL's data-win-open, so on the desktop it
// opens that window beside the others rather than leaving the desktop
// (DESIGN.md, decision 26). The address stays as written, which is where a
// browser without script, or a page of its own, still goes.
func (s *Server) windowLinks(body template.HTML) template.HTML {
	return template.HTML(windowLink.ReplaceAllStringFunc(string(body), func(m string) string {
		key := strings.Replace(windowLink.FindStringSubmatch(m)[1], "/", "-", 1)
		if !winKey.MatchString(key) {
			return m
		}
		if _, ok := s.appletByName(key); !ok {
			if _, ok := s.page(key); !ok {
				return m
			}
		}
		return m + ` data-win-open="` + key + `"`
	}))
}

// article draws a site page as a page of the site.
func (s *Server) article(w http.ResponseWriter, r *http.Request, p sitePage) {
	data := s.pageData(r, p.Title)
	data["Article"] = p.Body
	data["Slug"] = p.Slug
	s.render(w, http.StatusOK, "article", data)
}

// helpPage is /help, the contents of the applications' help, and
// /help/{app}, an application's help (DESIGN.md, decision 19). They are
// pages of the desktop's host, as every site page is; at an applet's
// subdomain, /help goes to that applet's help, or to the contents when it
// has none, and /help/{app} to the same address at the desktop's host.
func (s *Server) helpPage(w http.ResponseWriter, r *http.Request) {
	app := r.PathValue("app")
	slug := helpSlug
	if app != "" {
		if !appletName.MatchString(app) {
			s.notFound(w, r)
			return
		}
		slug = helpPrefix + app
	}
	switch kind, name := s.hostKind(r); kind {
	case "desktop":
	case "applet":
		if app == "" && s.helpFor(name) {
			slug = helpPrefix + name
		}
		http.Redirect(w, r, strings.TrimSuffix(s.siteURL(r), "/")+pagePath(slug), http.StatusTemporaryRedirect)
		return
	default:
		http.Redirect(w, r, s.siteURL(r), http.StatusTemporaryRedirect)
		return
	}
	p, ok := s.page(slug)
	if !ok {
		s.notFound(w, r)
		return
	}
	s.article(w, r, p)
}

// window serves an applet's window, which PUDL's windows fetch by key.
// The key is the applet's name, or name-2 to name-9 for the numbered
// windows requests open.
func (s *Server) window(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	m := winKey.FindStringSubmatch(key)
	if m == nil {
		s.notFound(w, r)
		return
	}
	if _, ok := s.appletByName(m[1]); !ok {
		if _, ok := s.page(key); !ok {
			s.notFound(w, r)
			return
		}
	}
	data := s.pageData(r, "")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	io.WriteString(w, s.windowMarkup(r, data, parseDesktop(r.URL.Query()), key))
}

// windowMarkup draws one window, for the window endpoint and for the
// desktop page, from the request's page data, which it does not change.
// The key has been checked.
func (s *Server) windowMarkup(r *http.Request, base map[string]any, d desktopState, key string) string {
	m := winKey.FindStringSubmatch(key)
	if m == nil {
		return ""
	}
	data := maps.Clone(base)
	a, isApplet := s.appletByName(m[1])
	if !isApplet {
		p, ok := s.page(key)
		if !ok {
			return ""
		}
		data["Title"] = p.Title
		data["Article"], data["Slug"], data["Key"] = s.windowLinks(p.Body), p.Slug, key
		data["Page"] = strings.TrimSuffix(s.siteURL(r), "/") + p.Path
		data["Minimize"], data["Maximize"], data["Close"] = d.minimize(key), d.maximize(key, "0.6", "0.8"), d.close(key)
		data["Style"] = template.CSS("--win-x:0.08; --win-y:0.06; --win-w:0.6; --win-h:0.8")
		var b strings.Builder
		if err := s.pages.ExecuteTemplate(&b, "window-article", data); err != nil {
			log.Printf("render window: %v", err)
		}
		return b.String()
	}
	data["Title"] = a.Title
	data["Applet"] = a
	data["Mount"] = appletBody(a, false)
	data["Key"] = key
	data["Page"] = s.appletPageURL(r, a.Name)
	data["Content"] = strings.Contains(a.Body, `data-applet-window-size="content"`)
	w, h := "0.5", "0.7"
	if a.Shape != "" {
		parts := strings.Split(a.Shape, ",")
		wf, _ := strconv.ParseFloat(parts[0], 64)
		hf, _ := strconv.ParseFloat(parts[1], 64)
		w, h = strconv.FormatFloat(wf, 'f', 3, 64), strconv.FormatFloat(hf, 'f', 3, 64)
		// A window opens a little in from the top left, as a cascade
		// starts; PUDL then cascades later ones itself.
		data["Style"] = template.CSS("--win-x:0.05; --win-y:0.06; --win-w:" + w + "; --win-h:" + h)
	}
	data["Minimize"], data["Maximize"], data["Close"] = d.minimize(key), d.maximize(key, w, h), d.close(key)
	var b strings.Builder
	if err := s.pages.ExecuteTemplate(&b, "window", data); err != nil {
		log.Printf("render window: %v", err)
	}
	return b.String()
}

// registry is /applets/registry.js. The page asks for it with the
// catalogue's digest in its address, and an address with the current
// digest is kept for good; any other is written for the request and never
// kept, since a proxy that caches scripts by their extension, as
// Cloudflare does, rewrites no-cache to a browser lifetime of hours, and a
// package's new version would then wait.
func (s *Server) registry(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	if c := cacheFor(r, s.catalogDigest()); c == immutable {
		w.Header().Set("Cache-Control", c)
	} else {
		w.Header().Set("Cache-Control", "no-store")
	}
	io.WriteString(w, s.registryScript(r))
}

// staticFile serves the site's own embedded files.
func (s *Server) staticFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("file")
	if !serveFile(w, r, s.staticFS, name, cacheFor(r, s.staticVersion), s.staticTag[name]) {
		s.notFound(w, r)
	}
}

// pudlFile serves the PUDL release's files.
func (s *Server) pudlFile(w http.ResponseWriter, r *http.Request) {
	if !serveDir(w, r, s.PUDL, r.PathValue("file"), cacheFor(r, s.pudlVersion)) {
		s.notFound(w, r)
	}
}

// appletFile serves a package's files from wherever that package lives,
// and the files of a collection's shared folder, which sits beside its
// packages under its own name with no manifest, as the package format
// has it (PUDLSplash's games load ../shared/ at run time). A package's
// files may be named freely (a score is "Chopin - Życzenie.mxl"); what is
// refused is a path that is not a path inside the package, and a link
// that leads out of it.
func (s *Server) appletFile(w http.ResponseWriter, r *http.Request) {
	name, file := r.PathValue("name"), r.PathValue("file")
	if a, ok := s.appletByName(name); ok {
		if serveDir(w, r, a.Dir, file, cacheFor(r, a.Version)) {
			return
		}
	} else if dir, ok := s.sharedFolder(name); ok {
		if name+"/"+file == engineWorker {
			w.Header().Set("Content-Security-Policy", workerPolicy)
		}
		if serveDir(w, r, dir, file, cacheFor(r, s.staticVersion)) {
			return
		}
	}
	s.notFound(w, r)
}

// sharedFolder is a folder under one of the applet folders that holds
// no manifest: a collection's shared code.
func (s *Server) sharedFolder(name string) (string, bool) {
	if !appletName.MatchString(name) {
		return "", false
	}
	for _, folder := range s.Applets {
		dir := filepath.Join(folder, name)
		if fi, err := os.Stat(dir); err == nil && fi.IsDir() {
			if _, err := os.Stat(filepath.Join(dir, "applet.json")); err != nil {
				return dir, true
			}
		}
	}
	return "", false
}

func (s *Server) notFound(w http.ResponseWriter, r *http.Request) {
	data := s.pageData(r, "Not found")
	data["Message"] = "There is nothing at this address."
	s.render(w, http.StatusNotFound, "problem", data)
}

// === State, settings and appearance =========================================

// own says whether the request came to one of the site's own hosts, the
// desktop's or an applet's; a reader's resources answer only there. When
// it did not, own has answered 404 and the handler must stop.
func (s *Server) own(w http.ResponseWriter, r *http.Request) bool {
	if kind, _ := s.hostKind(r); kind == "other" {
		http.Error(w, "Not here.", http.StatusNotFound)
		return false
	}
	return true
}

// desktopOnly says whether the request came to the desktop's host. A
// pairing token is made and revoked only there, the one place Settings
// shows them; elsewhere the answer is 404 and the handler must stop.
func (s *Server) desktopOnly(w http.ResponseWriter, r *http.Request) bool {
	if kind, _ := s.hostKind(r); kind != "desktop" {
		http.Error(w, "Not here.", http.StatusNotFound)
		return false
	}
	return true
}

// The most a session keeps of applet state and of settings: each key's
// value, and all of them together.
const (
	maxValue = 64 << 10
	maxTotal = 1 << 20
)

// withinBudget says whether a map of state or settings, with key set to
// value, is within a session's budget.
func withinBudget(m map[string]string, key, value string) error {
	if len(value) > maxValue {
		return errTooLarge
	}
	total := len(key) + len(value)
	for k, v := range m {
		if k != key {
			total += len(k) + len(v)
		}
	}
	if total > maxTotal {
		return errTooLarge
	}
	return nil
}

// getState is an applet instance's continuity, as text, or 204 for none.
func (s *Server) getState(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	key := r.PathValue("key")
	if !session.ValidKey(key) {
		http.Error(w, "No such state.", http.StatusNotFound)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if sess := s.sessionOf(r); sess != nil {
		if v, ok := sess.State[key]; ok {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			io.WriteString(w, v)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// putState keeps an applet instance's continuity; an empty body forgets it.
func (s *Server) putState(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	key := r.PathValue("key")
	if !session.ValidKey(key) {
		http.Error(w, "No such state.", http.StatusNotFound)
		return
	}
	text, err := readText(r)
	if err != nil {
		s.done(w, err, "The state could not be read.")
		return
	}
	_, err = s.update(w, r, func(sess *session.Session) error {
		if text == "" {
			delete(sess.State, key)
			return nil
		}
		if err := withinBudget(sess.State, key, text); err != nil {
			return err
		}
		sess.State[key] = text
		return nil
	})
	s.done(w, err, "")
}

func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	name := r.PathValue("name")
	if !appletName.MatchString(name) {
		http.Error(w, "No such settings.", http.StatusNotFound)
		return
	}
	value := "{}"
	if sess := s.sessionOf(r); sess != nil {
		if v, ok := sess.Config[name]; ok {
			value = v
		}
	}
	writeJSON(w, http.StatusOK, json.RawMessage(value))
}

// putConfig keeps an applet's settings, which are a JSON object.
func (s *Server) putConfig(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	name := r.PathValue("name")
	if !appletName.MatchString(name) {
		http.Error(w, "No such settings.", http.StatusNotFound)
		return
	}
	text, err := readText(r)
	if err != nil {
		s.done(w, err, "The settings could not be read.")
		return
	}
	var object map[string]json.RawMessage
	if json.Unmarshal([]byte(text), &object) != nil || object == nil {
		http.Error(w, "Settings must be a JSON object.", http.StatusBadRequest)
		return
	}
	var at time.Time
	_, err = s.update(w, r, func(sess *session.Session) error {
		if err := withinBudget(sess.Config, name, text); err != nil {
			return err
		}
		at = time.Now().UTC()
		sess.Config[name] = text
		sess.ConfigAt[name] = at
		return nil
	})
	if err != nil {
		s.done(w, err, "")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"modified": at})
}

// listConfig is every setting the session keeps, each with its text and
// when it last changed: what the browser shows as the files of ~/.config
// (DESIGN.md, decision 22). All of it is under the session's 1 MB budget,
// so one answer carries it.
func (s *Server) listConfig(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	type setting struct {
		Text     string    `json:"text"`
		Modified time.Time `json:"modified"`
	}
	out := map[string]setting{}
	if sess := s.sessionOf(r); sess != nil {
		for name, text := range sess.Config {
			at := sess.ConfigAt[name]
			if at.IsZero() {
				at = sess.Created
			}
			out[name] = setting{Text: text, Modified: at}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": out})
}

// deleteConfig forgets one setting, as deleting its file does.
func (s *Server) deleteConfig(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	name := r.PathValue("name")
	if !appletName.MatchString(name) {
		http.Error(w, "No such settings.", http.StatusNotFound)
		return
	}
	sess, err := s.lookup(r)
	if err != nil {
		s.done(w, err, "")
		return
	}
	if sess == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	_, err = s.Sessions.Update(sess.ID, func(sess *session.Session) error {
		delete(sess.Config, name)
		delete(sess.ConfigAt, name)
		return nil
	})
	if errors.Is(err, os.ErrNotExist) {
		err = nil
	}
	s.done(w, err, "")
}

func (s *Server) getAppearance(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	a := s.appearanceOf(s.sessionOf(r))
	writeJSON(w, http.StatusOK, map[string]string{"skin": a.Skin, "palette": a.Palette, "mode": a.Mode})
}

var appearanceID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,39}$`)

// putAppearance keeps the reader's three choices. A field left out keeps
// its value, as Dinah's appearance store does.
func (s *Server) putAppearance(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	var in struct{ Skin, Palette, Mode *string }
	if !decodeJSON(w, r, &in, "Appearance must be a JSON object of skin, palette and mode.") {
		return
	}
	ok := func(p *string) bool { return p == nil || appearanceID.MatchString(*p) }
	if !ok(in.Skin) || !ok(in.Palette) || (in.Mode != nil && *in.Mode != "light" && *in.Mode != "dark" && *in.Mode != "system") {
		http.Error(w, "That is not an appearance choice.", http.StatusUnprocessableEntity)
		return
	}
	_, err := s.update(w, r, func(sess *session.Session) error {
		if in.Skin != nil {
			sess.Appearance.Skin = *in.Skin
		}
		if in.Palette != nil {
			sess.Appearance.Palette = *in.Palette
		}
		if in.Mode != nil {
			sess.Appearance.Mode = *in.Mode
		}
		return nil
	})
	s.done(w, err, "")
}

// deleteSession forgets everything the engine keeps for the reader: the
// session, the tokens it made, and the streams its pages hold open; and it
// drops the cookie.
func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	if c, err := r.Cookie(cookieName); err == nil && session.ValidID(c.Value) {
		if err := s.Sessions.Delete(c.Value); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("delete session: %v", err)
		}
		s.hub.CloseSession(c.Value)
	}
	http.SetCookie(w, s.cookie("", -1))
	w.WriteHeader(http.StatusNoContent)
}

// done answers a change: 204 when it was kept, 413 when it was larger than
// the site takes, 400 with unreadable when the request could not be read,
// and 500 when the store failed.
func (s *Server) done(w http.ResponseWriter, err error, unreadable string) {
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case tooLarge(err):
		http.Error(w, "That is larger than this site keeps.", http.StatusRequestEntityTooLarge)
	case unreadable != "":
		http.Error(w, unreadable, http.StatusBadRequest)
	default:
		log.Printf("session: %v", err)
		http.Error(w, "The change could not be kept.", http.StatusInternalServerError)
	}
}

// agentCount is how many agents the reader has paired, for the page's
// bridge script, which keeps a stream open only when there are any.
func agentCount(sess *session.Session) int {
	if sess == nil {
		return 0
	}
	return len(sess.Agents)
}
