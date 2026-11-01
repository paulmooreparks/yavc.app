// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package web is the yavc.app engine's HTTP face: the desktop at the site's
// domain, each applet standalone at its own subdomain, the applet
// packages' files and registry, PUDL, and the session's state and
// appearance (DESIGN.md).
package web

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
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
	// Sessions keeps the readers' sessions.
	Sessions *session.Store
	// Title is the site's name, shown in the topbar and the page titles.
	Title string

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
	s.versions()
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
	sub, _ := fs.Sub(static, "static")
	m.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(sub)))
	m.Handle("GET /pudl/", http.StripPrefix("/pudl/", http.FileServerFS(os.DirFS(s.PUDL))))
	m.HandleFunc("GET /applets/registry.js", s.registry)
	m.HandleFunc("GET /applets/{name}/{file...}", s.appletFile)
	m.HandleFunc("GET /win/{key}", s.window)
	m.HandleFunc("GET /api/site/tree", s.siteTree)
	m.HandleFunc("GET /api/site/text/{slug}", s.siteText)
	m.HandleFunc("GET /api/site/texts", s.siteTexts)
	// parkscomputing.com's applets link to pages under /page/; here a
	// page is at the root.
	m.HandleFunc("GET /page/{slug}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/"+r.PathValue("slug"), http.StatusPermanentRedirect)
	})
	m.HandleFunc("GET /state/{key}", s.getState)
	m.HandleFunc("PUT /state/{key}", s.putState)
	m.HandleFunc("GET /config/{name}", s.getConfig)
	m.HandleFunc("PUT /config/{name}", s.putConfig)
	m.HandleFunc("GET /appearance", s.getAppearance)
	m.HandleFunc("PUT /appearance", s.putAppearance)
	m.HandleFunc("DELETE /session", s.deleteSession)
	m.HandleFunc("GET /{$}", s.root)
	s.agentRoutes(m)
	s.retain = s.Sessions.Retain
	m.HandleFunc("GET /pages", s.listPage)
	m.HandleFunc("GET /about", s.aboutPage)
	m.HandleFunc("GET /about/pudl", s.aboutPage)
	m.HandleFunc("GET /{slug}", s.classicPage)
	return s, nil
}

// ServeHTTP checks where a request came from, then routes it.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// A change must come from a page of this site: the session cookie is
	// SameSite=Lax, so another site's form cannot send it, and a change
	// whose Origin is another host is refused as well.
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		if o := r.Header.Get("Origin"); o != "" {
			if u, err := url.Parse(o); err != nil || !strings.EqualFold(u.Host, r.Host) {
				http.Error(w, "A change must come from this site's own pages.", http.StatusForbidden)
				return
			}
		}
		limit := int64(1 << 20)
		// An agent's report may hold an action's artifacts, up to 4 MB
		// each by PUDL's rule, and an MCP call may hold a deck.
		if r.URL.Path == "/agent/report" || r.URL.Path == "/mcp" {
			limit = 16 << 20
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
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
		if _, ok := s.appletByName(slug); ok {
			return "applet", slug
		}
	}
	return "other", ""
}

func (s *Server) scheme() string {
	if s.Secure {
		return "https"
	}
	return "http"
}

// port is the port the request came in on, with its colon, when the
// request's host has one, so a local run's addresses keep it.
func port(r *http.Request) string {
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
	return s.scheme() + "://" + s.Domain + port(r) + "/"
}

// appletPageURL is an applet's own page, at its subdomain.
func (s *Server) appletPageURL(r *http.Request, name string) string {
	if s.Domain == "" {
		return "/" + name
	}
	return s.scheme() + "://" + name + "." + s.Domain + port(r) + "/"
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

// update changes the request's session under the store's lock, making
// the session first if there is none.
func (s *Server) update(w http.ResponseWriter, r *http.Request, change func(*session.Session)) error {
	sess, err := s.ensureSession(w, r)
	if err != nil {
		return err
	}
	_, err = s.Sessions.Update(sess.ID, change)
	return err
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

// skins is the release's catalogue of admitted skins, from
// pudl-skins.json, never a list written into the engine.
func (s *Server) skins() []skinEntry {
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

// palettes is the colour themes the release ships, pudl-theme-<id>.css,
// with Standard first.
func (s *Server) palettes() []skinEntry {
	out := []skinEntry{{ID: "standard", Label: "Standard"}}
	matches, _ := filepath.Glob(filepath.Join(s.PUDL, "pudl-theme-*.css"))
	for _, m := range matches {
		id := strings.TrimSuffix(strings.TrimPrefix(filepath.Base(m), "pudl-theme-"), ".css")
		out = append(out, skinEntry{ID: id, Label: strings.ToUpper(id[:1]) + id[1:], Stylesheet: filepath.Base(m)})
	}
	return out
}

// pageData is what every page's template gets.
func (s *Server) pageData(r *http.Request, title string) map[string]any {
	sess := s.sessionOf(r)
	state := map[string]string{}
	config := map[string]string{}
	if sess != nil {
		state, config = sess.State, sess.Config
	}
	return map[string]any{
		"Site": s.Title, "Title": title, "SiteURL": s.siteURL(r),
		"Appearance": s.appearanceOf(sess), "Skins": s.skins(), "Palettes": s.palettes(),
		"State": state, "Config": config,
		"Applets": s.appletEntries(r), "Dialog": "", "PUDLVersion": s.pudlVersion, "Retention": s.retention(), "StaticVersion": s.staticVersion, "SiteOrigin": strings.TrimSuffix(s.siteURL(r), "/"),
		"Agents": agentCount(sess),
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
	switch kind {
	case "applet":
		a, _ := s.appletByName(name)
		data := s.pageData(r, a.Title)
		data["Applet"] = a
		data["Mount"] = appletBody(a, true)
		data["Standalone"] = true
		data["Dialog"] = dialog
		s.render(w, http.StatusOK, "standalone", data)
	case "desktop":
		data := s.pageData(r, s.Title)
		data["Desktop"] = true
		data["Dialog"] = dialog
		// The windows the address names are drawn into the page, as PUDL's
		// window contract asks of a server, so the desktop holds its content
		// without script and a reader arriving by a shared link sees it.
		var wins strings.Builder
		if q := r.URL.Query(); q.Has("open") {
			for _, k := range strings.Split(q.Get("open"), ",") {
				if m := winKey.FindStringSubmatch(k); m != nil {
					wins.WriteString(s.windowMarkup(r, k))
				}
			}
		}
		data["Windows"] = template.HTML(wins.String())
		data["Bar"] = parseDesktop(r.URL.Query()).bar()
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

// listPage is /pages at the site's domain, the Classic view: the
// applications as a list of pages.
func (s *Server) listPage(w http.ResponseWriter, r *http.Request) {
	if kind, _ := s.hostKind(r); kind != "desktop" {
		http.Redirect(w, r, s.siteURL(r)+"pages", http.StatusTemporaryRedirect)
		return
	}
	s.render(w, http.StatusOK, "list", s.pageData(r, "Applications"))
}

// classicPage is /{slug} at the site's domain: the applet as a page of
// the site, with the site's topbar, which is also what a window shows.
func (s *Server) classicPage(w http.ResponseWriter, r *http.Request) {
	kind, _ := s.hostKind(r)
	if kind != "desktop" {
		http.Redirect(w, r, s.siteURL(r)+r.PathValue("slug"), http.StatusTemporaryRedirect)
		return
	}
	if p, ok := s.page(r.PathValue("slug")); ok {
		data := s.pageData(r, p.Title)
		data["Article"] = p.Body
		data["Slug"] = p.Slug
		s.render(w, http.StatusOK, "article", data)
		return
	}
	a, ok := s.appletByName(r.PathValue("slug"))
	if !ok {
		s.notFound(w, r)
		return
	}
	data := s.pageData(r, a.Title)
	data["Applet"] = a
	data["Mount"] = appletBody(a, false)
	s.render(w, http.StatusOK, "page", data)
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
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	io.WriteString(w, s.windowMarkup(r, key))
}

// windowMarkup draws one window, for the window endpoint and for the
// desktop page. The key has been checked.
func (s *Server) windowMarkup(r *http.Request, key string) string {
	m := winKey.FindStringSubmatch(key)
	a, isApplet := s.appletByName(m[1])
	if !isApplet {
		p, ok := s.page(key)
		if !ok {
			return ""
		}
		d := parseDesktop(r.URL.Query())
		data := s.pageData(r, p.Title)
		data["Article"], data["Slug"], data["Key"] = p.Body, p.Slug, key
		data["Page"] = s.siteURL(r) + p.Slug
		data["Minimize"], data["Maximize"], data["Close"] = d.minimize(key), d.maximize(key, "0.6", "0.8"), d.close(key)
		data["Style"] = template.CSS("--win-x:0.08; --win-y:0.06; --win-w:0.6; --win-h:0.8")
		var b strings.Builder
		if err := s.pages.ExecuteTemplate(&b, "window-article", data); err != nil {
			log.Printf("render window: %v", err)
		}
		return b.String()
	}
	data := s.pageData(r, a.Title)
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
	d := parseDesktop(r.URL.Query())
	data["Minimize"], data["Maximize"], data["Close"] = d.minimize(key), d.maximize(key, w, h), d.close(key)
	var b strings.Builder
	if err := s.pages.ExecuteTemplate(&b, "window", data); err != nil {
		log.Printf("render window: %v", err)
	}
	return b.String()
}

func (s *Server) registry(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	// Written for each request, and never to be kept: a proxy that caches
	// scripts by their extension, as Cloudflare does, rewrites no-cache to
	// a browser lifetime of hours, and a package's new version then waits.
	w.Header().Set("Cache-Control", "no-store")
	io.WriteString(w, s.registryScript(r))
}

// appletFile serves a package's files from wherever that package lives,
// and the files of a collection's shared folder, which sits beside its
// packages under its own name with no manifest, as the package format
// has it (PUDLSplash's games load ../shared/ at run time).
func (s *Server) appletFile(w http.ResponseWriter, r *http.Request) {
	name, file := r.PathValue("name"), r.PathValue("file")
	// A package's files may be named freely (a score is "Chopin -
	// Życzenie.mxl"); what is refused is a path that is not a path inside
	// the package, which fs.ValidPath settles: no "..", no leading slash,
	// no empty element.
	if file == "" || !fs.ValidPath(file) || strings.ContainsAny(file, "\\\x00") {
		s.notFound(w, r)
		return
	}
	if a, ok := s.appletByName(name); ok {
		http.ServeFileFS(w, r, os.DirFS(a.Dir), file)
		return
	}
	if dir, ok := s.sharedFolder(name); ok {
		http.ServeFileFS(w, r, os.DirFS(dir), file)
		return
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

// A reader's state resources answer only on the site's own hosts.
func (s *Server) own(w http.ResponseWriter, r *http.Request) bool {
	if kind, _ := s.hostKind(r); kind == "other" {
		http.Error(w, "Not here.", http.StatusNotFound)
		return false
	}
	return true
}

func readText(r *http.Request) (string, error) {
	b, err := io.ReadAll(r.Body)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// getState is an applet instance's continuity, as text, or 204 for none.
func (s *Server) getState(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if !s.own(w, r) || !session.ValidKey(key) {
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
	key := r.PathValue("key")
	if !s.own(w, r) || !session.ValidKey(key) {
		http.Error(w, "No such state.", http.StatusNotFound)
		return
	}
	text, err := readText(r)
	if err != nil {
		http.Error(w, "The state could not be read.", http.StatusBadRequest)
		return
	}
	err = s.update(w, r, func(sess *session.Session) {
		if text == "" {
			delete(sess.State, key)
		} else {
			sess.State[key] = text
		}
	})
	s.done(w, err)
}

func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !s.own(w, r) || !appletName.MatchString(name) {
		http.Error(w, "No such settings.", http.StatusNotFound)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if sess := s.sessionOf(r); sess != nil {
		if v, ok := sess.Config[name]; ok {
			io.WriteString(w, v)
			return
		}
	}
	io.WriteString(w, "{}")
}

func (s *Server) putConfig(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !s.own(w, r) || !appletName.MatchString(name) {
		http.Error(w, "No such settings.", http.StatusNotFound)
		return
	}
	text, err := readText(r)
	if err != nil || !json.Valid([]byte(text)) {
		http.Error(w, "Settings must be a JSON object.", http.StatusBadRequest)
		return
	}
	err = s.update(w, r, func(sess *session.Session) { sess.Config[name] = text })
	s.done(w, err)
}

func (s *Server) getAppearance(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	a := s.appearanceOf(s.sessionOf(r))
	json.NewEncoder(w).Encode(map[string]string{"skin": a.Skin, "palette": a.Palette, "mode": a.Mode})
}

var appearanceID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,39}$`)

// putAppearance keeps the reader's three choices. A field left out keeps
// its value, as Dinah's appearance store does.
func (s *Server) putAppearance(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	var in struct{ Skin, Palette, Mode *string }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "Appearance must be a JSON object of skin, palette and mode.", http.StatusBadRequest)
		return
	}
	ok := func(p *string) bool { return p == nil || appearanceID.MatchString(*p) }
	if !ok(in.Skin) || !ok(in.Palette) || (in.Mode != nil && *in.Mode != "light" && *in.Mode != "dark" && *in.Mode != "system") {
		http.Error(w, "That is not an appearance choice.", http.StatusUnprocessableEntity)
		return
	}
	err := s.update(w, r, func(sess *session.Session) {
		if in.Skin != nil {
			sess.Appearance.Skin = *in.Skin
		}
		if in.Palette != nil {
			sess.Appearance.Palette = *in.Palette
		}
		if in.Mode != nil {
			sess.Appearance.Mode = *in.Mode
		}
	})
	s.done(w, err)
}

// deleteSession forgets everything the engine keeps for the reader and
// drops the cookie.
func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	if c, err := r.Cookie(cookieName); err == nil {
		if err := s.Sessions.Delete(c.Value); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("delete session: %v", err)
		}
	}
	http.SetCookie(w, s.cookie("", -1))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) done(w http.ResponseWriter, err error) {
	if err != nil {
		log.Printf("session: %v", err)
		http.Error(w, "The change could not be kept.", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// agentCount is how many agents the reader has paired, for the page's
// bridge script, which keeps a stream open only when there are any.
func agentCount(sess *session.Session) int {
	if sess == nil {
		return 0
	}
	return len(sess.Agents)
}
