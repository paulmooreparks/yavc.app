// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

import (
	"bytes"
	"encoding/json"
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

// A site page: its slug, title (the first heading) and rendered body.
type sitePage struct {
	Slug, Title string
	Body        template.HTML
	Text        string
	Modified    time.Time
}

// page reads a page from the pages folder, or reports that there is none.
func (s *Server) page(slug string) (sitePage, bool) {
	if s.Pages == "" || !slugRe.MatchString(slug) {
		return sitePage{}, false
	}
	path := filepath.Join(s.Pages, slug+".md")
	raw, err := os.ReadFile(path)
	if err != nil {
		return sitePage{}, false
	}
	fi, _ := os.Stat(path)
	// A page may say {{retention}}, which becomes the engine's setting, so
	// the privacy policy and the terms never contradict the flag.
	raw = bytes.ReplaceAll(raw, []byte("{{retention}}"), []byte(s.retention()))
	var out bytes.Buffer
	if err := markdown.Convert(raw, &out); err != nil {
		return sitePage{}, false
	}
	title := slug
	for _, line := range strings.Split(string(raw), "\n") {
		if strings.HasPrefix(line, "# ") {
			title = strings.TrimSpace(line[2:])
			break
		}
	}
	p := sitePage{Slug: slug, Title: title, Body: template.HTML(out.String()), Text: string(raw)}
	if fi != nil {
		p.Modified = fi.ModTime()
	}
	return p, true
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
	apps := &treeEntry{Name: "apps", Kind: "dir", Title: str("Applications"), Description: str("Each runs in a window, as a page, and at its own address"), Children: []*treeEntry{}}
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
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	json.NewEncoder(w).Encode(s.tree(r))
}

// pageText is a page's text as the terminal shows it: the Markdown source
// for a page, and a line about an application for an app.
func (s *Server) pageText(slug string) (string, bool) {
	if p, ok := s.page(slug); ok {
		return p.Text, true
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

func (s *Server) siteTexts(w http.ResponseWriter, r *http.Request) {
	out := map[string]string{}
	for i, slug := range strings.Split(r.URL.Query().Get("slugs"), ",") {
		if i >= 500 {
			break
		}
		if text, ok := s.pageText(slug); ok {
			out[slug] = text
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	json.NewEncoder(w).Encode(out)
}
