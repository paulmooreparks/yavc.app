// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

import (
	"bytes"
	"html/template"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer/html"
)

// The site's pages and its tree, for the file system the Terminal, Files
// and the Editor share (static/sitefs.js, from parkscomputing.com). A
// page is a Markdown file in the pages folder, served at /{slug} and in a
// window by its slug. The tree, /api/site/tree, is the shape
// parkscomputing.com's TerminalController serves: the site's entries,
// each an app, a page or a link, and a bin folder of the site's scripts.

var (
	slugRe   = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
	scriptRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,39}$`)
	markdown = goldmark.New(goldmark.WithExtensions(extension.GFM, extension.Typographer),
		goldmark.WithRendererOptions(html.WithUnsafe()))
)

// A site page: its slug, which is also its window's key, its address on
// the site, its title (the first heading) and its rendered body.
type sitePage struct {
	Slug, Path, Title string
	Body              template.HTML
	Text              string
	Modified          time.Time
}

// The applications' help (DESIGN.md, decision 19) is a set of site pages
// under the pages folder's help folder: help/{app}.md for each installed
// application that has one, and help/index.md, the contents, whose
// {{help-list}} the engine writes as the list of them. They are at /help
// and /help/{app}, and their slugs, which name their windows and their
// entries in the site tree, are help and help-{app}, since a window's key
// has no slash.
const (
	helpSlug   = "help"
	helpPrefix = "help-"
)

// movedPages are pages that have moved to an address of their own, with
// where they went, so a link or a bookmark to the old address still
// arrives.
var movedPages = map[string]string{
	"files-guide":    "/help/files",
	"terminal-guide": "/help/terminal",
}

// pagePath is a page's address on the site, from its slug.
func pagePath(slug string) string {
	if slug == helpSlug {
		return "/help"
	}
	if app, ok := strings.CutPrefix(slug, helpPrefix); ok {
		return "/help/" + app
	}
	return "/" + slug
}

// helpFor says whether an installed application has a help page.
func (s *Server) helpFor(app string) bool {
	_, _, ok := s.pageFile(helpPrefix + app)
	return ok
}

// helpApplets is the installed applications that have a help page, in the
// catalogue's order.
func (s *Server) helpApplets() []applet {
	var out []applet
	for _, a := range s.applets() {
		if s.helpFor(a.Name) {
			out = append(out, a)
		}
	}
	return out
}

// helpSlugs is the slugs of the applications' help pages.
func helpSlugs(apps []applet) []string {
	out := make([]string, len(apps))
	for i, a := range apps {
		out[i] = helpPrefix + a.Name
	}
	return out
}

// helpEntries is the help pages, for the Help menus.
func (s *Server) helpEntries() []map[string]string {
	var out []map[string]string
	for _, a := range s.helpApplets() {
		out = append(out, map[string]string{"Name": a.Name, "Title": a.Title})
	}
	return out
}

// helpList is the contents page's list of the applications' help, as
// Markdown, for {{help-list}}.
func (s *Server) helpList() string {
	var b strings.Builder
	for _, a := range s.helpApplets() {
		b.WriteString("- [" + a.Title + " Help](/help/" + a.Name + ")")
		if a.Description != "" {
			b.WriteString(": " + a.Description)
		}
		b.WriteString("\n")
	}
	return b.String()
}

// cachedPage is a page as last rendered, with its file's modification time
// and size then.
type cachedPage struct {
	page sitePage
	size int64
}

// pageFile is a page's file, when the slug is a page's and the file is
// there. A help page's slug finds its file in the help folder, and only
// for an application that is installed.
func (s *Server) pageFile(slug string) (string, os.FileInfo, bool) {
	if s.Pages == "" || !slugRe.MatchString(slug) {
		return "", nil, false
	}
	path := filepath.Join(s.Pages, slug+".md")
	if slug == helpSlug {
		path = filepath.Join(s.Pages, "help", "index.md")
	} else if app, ok := strings.CutPrefix(slug, helpPrefix); ok {
		if _, installed := s.appletByName(app); !installed {
			return "", nil, false
		}
		path = filepath.Join(s.Pages, "help", app+".md")
	}
	fi, err := os.Stat(path)
	if err != nil || fi.IsDir() {
		return "", nil, false
	}
	return path, fi, true
}

// pageSource is a page's text as written, with {{retention}} made the
// engine's setting, so the privacy policy and the terms never contradict
// the flag, and {{help-list}} the list of the applications' help.
func (s *Server) pageSource(path string) (string, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	text := strings.ReplaceAll(string(raw), "{{retention}}", s.retention())
	if strings.Contains(text, "{{help-list}}") {
		text = strings.ReplaceAll(text, "{{help-list}}", s.helpList())
	}
	return text, true
}

// page reads a page from the pages folder, or reports that there is none.
// A page is rendered once and again only when its file changes. The help
// contents is rendered every time, since its list follows the installed
// applications rather than its file.
func (s *Server) page(slug string) (sitePage, bool) {
	path, fi, ok := s.pageFile(slug)
	if !ok {
		return sitePage{}, false
	}
	s.pageMu.Lock()
	c, hit := s.pageCache[slug]
	s.pageMu.Unlock()
	if hit && slug != helpSlug && c.page.Modified.Equal(fi.ModTime()) && c.size == fi.Size() {
		return c.page, true
	}
	text, ok := s.pageSource(path)
	if !ok {
		return sitePage{}, false
	}
	var out bytes.Buffer
	if err := markdown.Convert([]byte(text), &out); err != nil {
		return sitePage{}, false
	}
	p := sitePage{Slug: slug, Path: pagePath(slug), Title: pageTitle(slug, text), Body: template.HTML(out.String()), Text: text, Modified: fi.ModTime()}
	s.pageMu.Lock()
	s.pageCache[slug] = cachedPage{page: p, size: fi.Size()}
	s.pageMu.Unlock()
	return p, true
}

// pageTitle is a page's first heading, or its slug.
func pageTitle(slug, text string) string {
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(line[2:])
		}
	}
	return slug
}

// pages lists the site's pages, by slug.
func (s *Server) pageList() []sitePage {
	var out []sitePage
	if s.Pages == "" {
		return nil
	}
	matches, _ := filepath.Glob(filepath.Join(s.Pages, "*.md"))
	for _, m := range matches {
		slug := strings.TrimSuffix(filepath.Base(m), ".md")
		if p, ok := s.page(slug); ok {
			out = append(out, p)
		}
	}
	return out
}

// An entry of the site tree, as parkscomputing.com writes it: every field
// present, null where it has no value, in camel case.
type treeEntry struct {
	Name        string       `json:"name"`
	Kind        string       `json:"kind"`
	Title       *string      `json:"title"`
	Description *string      `json:"description"`
	Tags        []string     `json:"tags"`
	Date        *time.Time   `json:"date"`
	URL         *string      `json:"url"`
	Children    []*treeEntry `json:"children"`
	Source      *string      `json:"source"`
	Icon        *string      `json:"icon"`
}

func str(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// tree is the site as the file system shows it under /site: an app per
// installed package, a page per site page, and bin, the site's scripts.
func (s *Server) tree(r *http.Request) *treeEntry {
	root := &treeEntry{Name: "", Kind: "dir", Title: str(s.Title), Description: str("The " + s.Title + " desktop"), Children: []*treeEntry{}}
	apps := &treeEntry{Name: "apps", Kind: "dir", Title: str("Applications"), Description: str("Each runs in a window and at its own address"), Children: []*treeEntry{}}
	for _, a := range s.applets() {
		url := s.appletPageURL(r, a.Name)
		apps.Children = append(apps.Children, &treeEntry{Name: a.Name, Kind: "app", Title: str(a.Title), Description: str(a.Description),
			Tags: []string{}, URL: &url, Icon: str(a.IconURL())})
	}
	root.Children = append(root.Children, apps)
	if pages := s.pageList(); len(pages) > 0 {
		dir := &treeEntry{Name: "pages", Kind: "dir", Title: str("Pages"), Description: str("The site's pages"), Children: []*treeEntry{}}
		for _, p := range pages {
			d := p.Modified
			dir.Children = append(dir.Children, &treeEntry{Name: p.Slug, Kind: "page", Title: str(p.Title), Tags: []string{}, Date: &d})
		}
		root.Children = append(root.Children, dir)
	}
	// The help pages, by slug, so a page opened from the tree goes to the
	// help page's window and its address.
	if apps := s.helpApplets(); len(apps) > 0 {
		dir := &treeEntry{Name: "help", Kind: "dir", Title: str("Help"), Description: str("Each application's help"), Children: []*treeEntry{}}
		for _, slug := range append([]string{helpSlug}, helpSlugs(apps)...) {
			if p, ok := s.page(slug); ok {
				d := p.Modified
				dir.Children = append(dir.Children, &treeEntry{Name: p.Slug, Kind: "page", Title: str(p.Title), Tags: []string{}, Date: &d})
			}
		}
		root.Children = append(root.Children, dir)
	}
	if bin := s.scripts(); bin != nil {
		root.Children = append(root.Children, bin)
	}
	return root
}

// scripts is the site's bin folder: files of terminal commands, shell
// scripts ending in .sh and Lua scripts ending in .lua, each with its
// source, as parkscomputing.com serves content/bin.
func (s *Server) scripts() *treeEntry {
	if s.Bin == "" {
		return nil
	}
	entries, err := os.ReadDir(s.Bin)
	if err != nil {
		return nil
	}
	bin := &treeEntry{Name: "bin", Kind: "dir", Title: str("Scripts"), Description: str("The site's scripts, run by name"), Children: []*treeEntry{}}
	names := []string{}
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	if len(names) > 200 {
		names = names[:200]
	}
	for _, name := range names {
		bare := name
		switch {
		case strings.HasSuffix(name, ".sh"):
			bare = strings.TrimSuffix(name, ".sh")
		case strings.HasSuffix(name, ".lua"):
			bare = strings.TrimSuffix(name, ".lua")
		case strings.HasSuffix(name, ".txt"):
			bare = strings.TrimSuffix(name, ".txt")
			name = bare
		}
		path := filepath.Join(s.Bin, name)
		if !strings.HasSuffix(name, ".sh") && !strings.HasSuffix(name, ".lua") {
			if _, err := os.Stat(path); err != nil {
				path = filepath.Join(s.Bin, name+".txt")
			}
		}
		fi, err := os.Stat(path)
		if err != nil || !scriptRe.MatchString(bare) || fi.Size() > 16*1024 {
			continue
		}
		src, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		source := string(src)
		mod := fi.ModTime().UTC()
		bin.Children = append(bin.Children, &treeEntry{Name: name, Kind: "script", Title: str(bare), Description: str(scriptSummary(bare, source)), Date: &mod, Source: &source})
	}
	return bin
}

// scriptSummary is a script's first comment line, less a leading "name:".
func scriptSummary(name, source string) string {
	for _, l := range strings.Split(source, "\n") {
		l = strings.TrimSpace(l)
		var text string
		switch {
		case strings.HasPrefix(l, "#") && !strings.HasPrefix(l, "#!"):
			text = strings.TrimSpace(strings.TrimLeft(l, "#"))
		case strings.HasPrefix(l, "--") && !strings.HasPrefix(l, "--["):
			text = strings.TrimSpace(l[2:])
		default:
			continue
		}
		return strings.TrimSpace(strings.TrimPrefix(text, name+":"))
	}
	return ""
}

func (s *Server) siteTree(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, http.StatusOK, s.tree(r))
}

// pageText is a page's text as the terminal shows it: the Markdown source
// for a page, which is read without rendering it, and a line about an
// application for an app.
func (s *Server) pageText(slug string) (string, bool) {
	if path, _, ok := s.pageFile(slug); ok {
		return s.pageSource(path)
	}
	if a, ok := s.appletByName(slug); ok {
		return a.Title + "\n\n" + a.Description + "\n\n[The " + a.Title + " applet runs here. Type \"open " + a.Name + "\" to use it.]\n", true
	}
	return "", false
}

func (s *Server) siteText(w http.ResponseWriter, r *http.Request) {
	text, ok := s.pageText(r.PathValue("slug"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	io.WriteString(w, text)
}

// maxTexts is the most pages one request for texts may ask for; the rest
// are left out.
const maxTexts = 50

func (s *Server) siteTexts(w http.ResponseWriter, r *http.Request) {
	out := map[string]string{}
	for i, slug := range strings.Split(r.URL.Query().Get("slugs"), ",") {
		if i >= maxTexts {
			break
		}
		if text, ok := s.pageText(slug); ok {
			out[slug] = text
		}
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, http.StatusOK, out)
}
