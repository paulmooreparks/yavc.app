// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
//
// Lifted from PUDL Desktop (internal/web/applets.go, Apache-2.0) under
// DESIGN.md decision 9, and changed where yavc.app differs: packages come
// from several folders, each applet's page is its own subdomain, and the
// manifest's continuity, wants and needs are read.

package web

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// The applet packages installed on this site: each a folder under one of
// the applet folders (-applets, which may be given more than once) with an
// applet.json, the one file read here, as the package format describes
// (the README of the pudl-applet-packages repo). From the manifests the
// engine writes what a host writes for each applet: its define() in
// /applets/registry.js, its page at {name}.yavc.app and /{name}, its window
// by its name, and its entry in the Applets menu. The folders are read
// again when a manifest or a page body changes. A manifest that breaks
// the rules is left out, and said once in the log.

var (
	appletName   = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
	appletFile   = regexp.MustCompile(`^(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+$`)
	appletShape  = regexp.MustCompile(`^(0?\.[0-9]+|1(\.0+)?),(0?\.[0-9]+|1(\.0+)?)$`)
	appletPixels = regexp.MustCompile(`^[1-9][0-9]*,[1-9][0-9]*$`)
)

// An applet package as its manifest says. Every file is relative to the
// package's folder.
type applet struct {
	Name, Title, Version, Description string
	Src, Css, Icon                    string
	Body, Fit                         string
	Shape, Min, Max                   string
	Handles                           json.RawMessage
	Instances                         int
	Actions                           string
	Continuity                        bool
	Needs, Wants                      []string
	Dir                               string
}

// URL is a file of the package by its address on the site.
func (a applet) URL(file string) string { return "/applets/" + a.Name + "/" + file }

// IconURL is the package's icon, or empty.
func (a applet) IconURL() string {
	if a.Icon == "" {
		return ""
	}
	return a.URL(a.Icon)
}

type appletCatalog struct {
	mu      sync.Mutex
	stamp   string
	checked time.Time
	list    []applet
	byName  map[string]int
	digest  string
	warned  map[string]string
	// The actions manifests read for the catalogue, by applet, with the
	// stamp they were read under.
	actions      map[string]*actionsDoc
	actionsStamp string
}

// catalogCheck is how often the applet folders are looked at again for a
// changed manifest or page body.
const catalogCheck = time.Second

type manifest struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Version     string `json:"version"`
	Description string `json:"description"`
	Src         string `json:"src"`
	Css         string `json:"css"`
	Icon        string `json:"icon"`
	Page        *struct {
		Body string `json:"body"`
		Fit  string `json:"fit"`
	} `json:"page"`
	Window *struct {
		Shape string `json:"shape"`
		Min   string `json:"min"`
		Max   string `json:"max"`
	} `json:"window"`
	Handles    json.RawMessage `json:"handles"`
	Instances  int             `json:"instances"`
	Actions    string          `json:"actions"`
	Continuity bool            `json:"continuity"`
	Needs      []string        `json:"needs"`
	Wants      []string        `json:"wants"`
}

// The host services this engine offers, which a manifest's needs are
// checked against.
var offered = map[string]bool{"snapshot": true, "config": true, "fs": false}

// applets is the installed packages, in name order, read again when a
// folder has changed since. The folders are looked at no more than once a
// second. A name found in two folders takes the first folder's. The list
// is shared and must not be changed.
func (s *Server) applets() []applet {
	c := &s.catalog
	c.mu.Lock()
	defer c.mu.Unlock()
	s.refreshLocked()
	return c.list
}

// catalogDigest is a digest of the installed packages' manifests and page
// bodies, which the registry's address has, so a changed package is
// fetched again and an unchanged registry can be kept.
func (s *Server) catalogDigest() string {
	c := &s.catalog
	c.mu.Lock()
	defer c.mu.Unlock()
	s.refreshLocked()
	return c.digest
}

func (s *Server) refreshLocked() {
	c := &s.catalog
	now := time.Now()
	if c.list != nil && now.Sub(c.checked) < catalogCheck {
		return
	}
	c.checked = now
	stamp := appletStamp(s.Applets)
	if stamp == c.stamp && c.list != nil {
		return
	}
	if c.warned == nil {
		c.warned = map[string]string{}
	}
	var list []applet
	seen := map[string]bool{}
	for _, folder := range s.Applets {
		entries, _ := os.ReadDir(folder)
		for _, e := range entries {
			if !e.IsDir() || seen[e.Name()] {
				continue
			}
			dir := filepath.Join(folder, e.Name())
			raw, err := os.ReadFile(filepath.Join(dir, "applet.json"))
			if err != nil {
				continue
			}
			a, err := readApplet(dir, e.Name(), raw)
			if err != nil {
				if c.warned[e.Name()] != err.Error() {
					log.Printf("the applet package %s was left out: %v", e.Name(), err)
					c.warned[e.Name()] = err.Error()
				}
				continue
			}
			delete(c.warned, e.Name())
			seen[a.Name] = true
			list = append(list, a)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	if list == nil {
		list = []applet{}
	}
	c.byName = make(map[string]int, len(list))
	for i, a := range list {
		c.byName[a.Name] = i
	}
	sum := sha256.Sum256([]byte(stamp))
	c.stamp, c.list, c.digest = stamp, list, hex.EncodeToString(sum[:])[:12]
}

// appletStamp is what the folders hold that the catalogue depends on:
// each package's manifest, page body and actions manifest, with when they
// changed.
func appletStamp(dirs []string) string {
	var b strings.Builder
	for _, dir := range dirs {
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			for _, f := range []string{"applet.json", "page.html", "actions.json"} {
				if fi, err := os.Stat(filepath.Join(dir, e.Name(), f)); err == nil {
					fmt.Fprintf(&b, "%s/%s/%s:%d:%d;", dir, e.Name(), f, fi.ModTime().UnixNano(), fi.Size())
				}
			}
		}
	}
	return b.String()
}

// readApplet applies the manifest's rules, so the engine trusts nothing
// it did not check: the name is the folder's, every file named is a
// relative path inside the package and is there, and every service it
// needs is one the engine offers.
func readApplet(dir, folder string, raw []byte) (applet, error) {
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return applet{}, fmt.Errorf("applet.json cannot be read: %v", err)
	}
	file := func(key, v string) (string, error) {
		if v == "" {
			return "", nil
		}
		if !appletFile.MatchString(v) || strings.Contains("/"+v+"/", "/../") || strings.Contains("/"+v+"/", "/./") {
			return "", fmt.Errorf("%s must be a relative path inside the package", key)
		}
		if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(v))); err != nil {
			return "", fmt.Errorf("%s names %s, which is not in the package", key, v)
		}
		return v, nil
	}
	if !appletName.MatchString(m.Name) {
		return applet{}, errors.New("name must be lower-case letters, digits and hyphens, starting with a letter")
	}
	if m.Name != folder {
		return applet{}, fmt.Errorf("name must be the folder's name, %s", folder)
	}
	if strings.TrimSpace(m.Title) == "" {
		return applet{}, errors.New("title is missing")
	}
	if strings.TrimSpace(m.Version) == "" {
		return applet{}, errors.New("version is missing")
	}
	for _, need := range m.Needs {
		if !offered[need] {
			return applet{}, fmt.Errorf("it needs the %s service, which this site does not offer", need)
		}
	}
	a := applet{Name: m.Name, Title: strings.TrimSpace(m.Title), Version: strings.TrimSpace(m.Version), Description: m.Description,
		Dir: dir, Handles: m.Handles, Instances: m.Instances, Continuity: m.Continuity, Needs: m.Needs, Wants: m.Wants}
	var err error
	if m.Src == "" {
		return applet{}, errors.New("src is missing")
	}
	if a.Src, err = file("src", m.Src); err != nil {
		return applet{}, err
	}
	if a.Css, err = file("css", m.Css); err != nil {
		return applet{}, err
	}
	if a.Icon, err = file("icon", m.Icon); err != nil {
		return applet{}, err
	}
	if a.Actions, err = file("actions", m.Actions); err != nil {
		return applet{}, err
	}
	if m.Page != nil {
		if m.Page.Fit != "" && m.Page.Fit != "fill" && m.Page.Fit != "flow" {
			return applet{}, errors.New("page.fit must be fill or flow")
		}
		a.Fit = m.Page.Fit
		body, err := file("page.body", m.Page.Body)
		if err != nil {
			return applet{}, err
		}
		if body != "" {
			text, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(body)))
			if err != nil {
				return applet{}, err
			}
			a.Body = string(text)
		}
	}
	if m.Window != nil {
		if m.Window.Shape != "" && !appletShape.MatchString(m.Window.Shape) {
			return applet{}, errors.New("window.shape must be fractions of the desktop, such as 0.28,0.88")
		}
		if (m.Window.Min != "" && !appletPixels.MatchString(m.Window.Min)) || (m.Window.Max != "" && !appletPixels.MatchString(m.Window.Max)) {
			return applet{}, errors.New("window.min and window.max must be pixels, such as 420,220")
		}
		a.Shape, a.Min, a.Max = m.Window.Shape, m.Window.Min, m.Window.Max
	}
	if m.Instances < 0 {
		return applet{}, errors.New("instances must be a whole number from 1")
	}
	return a, nil
}

func (s *Server) appletByName(name string) (applet, bool) {
	if !appletName.MatchString(name) {
		return applet{}, false
	}
	c := &s.catalog
	c.mu.Lock()
	defer c.mu.Unlock()
	s.refreshLocked()
	i, ok := c.byName[name]
	if !ok {
		return applet{}, false
	}
	return c.list[i], true
}

// actionsManifest is an applet's actions manifest, read once for each
// state of the catalogue and shared by every caller, which must not change
// it. A manifest that cannot be read is said once in the log.
func (s *Server) actionsManifest(a applet) (*actionsDoc, bool) {
	c := &s.catalog
	c.mu.Lock()
	defer c.mu.Unlock()
	s.refreshLocked()
	if c.actionsStamp != c.stamp {
		c.actions, c.actionsStamp = map[string]*actionsDoc{}, c.stamp
	}
	if m, ok := c.actions[a.Name]; ok {
		return m, m != nil
	}
	var m *actionsDoc
	raw, err := os.ReadFile(filepath.Join(a.Dir, filepath.FromSlash(a.Actions)))
	if err == nil {
		var doc actionsDoc
		if json.Unmarshal(raw, &doc) == nil && doc.ID != "" {
			m = &doc
		}
	}
	if m == nil {
		log.Printf("applet %s: its actions manifest could not be read", a.Name)
	}
	c.actions[a.Name] = m
	return m, m != nil
}

// registryScript writes /applets/registry.js: a define() for each
// package, with its files at their addresses, its page at its own
// subdomain, and its version as the cache stamp; then the names of the
// packages that ask for continuity, for the continuity script.
func (s *Server) registryScript(r *http.Request) string {
	var b strings.Builder
	b.WriteString("/* The applet packages installed on this site, from each applets folder's\n   <name>/applet.json. Written by the engine; not a file. */\n")
	var continuity []string
	for _, a := range s.applets() {
		cfg := map[string]any{"src": a.URL(a.Src), "page": s.appletPageURL(r, a.Name), "ver": a.Version}
		if a.Css != "" {
			cfg["css"] = a.URL(a.Css)
		}
		if len(a.Handles) > 0 {
			cfg["handles"] = json.RawMessage(a.Handles)
		}
		if a.Instances > 0 {
			cfg["instances"] = a.Instances
		}
		if a.Actions != "" {
			cfg["actions"] = a.URL(a.Actions)
		}
		if a.Continuity {
			continuity = append(continuity, a.Name)
		}
		name, _ := json.Marshal(a.Name)
		js, _ := json.Marshal(cfg)
		fmt.Fprintf(&b, "pudlApplets.define(%s, %s);\n", name, js)
	}
	names, _ := json.Marshal(continuity)
	fmt.Fprintf(&b, "if (window.yavcContinuity) { %s.forEach(window.yavcContinuity.add); }\n", names)
	return b.String()
}

// appletBody is the page's body for a package: the manifest's own, which
// the package wrote and the engine trusts as it trusts the package's
// script, or a bare mount. On a page that is nothing but the applet, the
// standalone page, a mount that says nothing about its fit fills it, as
// PUDL's applet contract describes a page of the applet's own.
func appletBody(a applet, fill bool) template.HTML {
	fit := a.Fit
	if fit == "" && fill {
		fit = "fill"
	}
	if a.Body != "" {
		body := strings.TrimRight(a.Body, "\n") + "\n"
		if fit != "" && !strings.Contains(body, "data-applet-fit=") && !strings.Contains(body, "data-applet-window-size=") {
			body = strings.Replace(body, `data-applet="`, `data-applet-fit="`+fit+`" data-applet="`, 1)
		}
		return template.HTML(body)
	}
	if fit != "" {
		fit = ` data-applet-fit="` + fit + `"`
	}
	t := html.EscapeString(a.Title)
	return template.HTML(`<div data-applet="` + a.Name + `"` + fit + ` role="application" aria-label="` + t + `"><noscript><p>` + t + ` needs JavaScript to run.</p></noscript></div>` + "\n")
}

// appletEntries is what the Applets menu and the launcher list.
func (s *Server) appletEntries(r *http.Request) []map[string]string {
	var out []map[string]string
	for _, a := range s.applets() {
		out = append(out, map[string]string{"Name": a.Name, "Title": a.Title, "Icon": a.IconURL(), "Description": a.Description,
			"Page": s.appletPageURL(r, a.Name), "Shape": a.Shape})
	}
	return out
}
