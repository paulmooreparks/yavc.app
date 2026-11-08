// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

import (
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// Host-owned placement keeps installed packages unchanged. New packages
// remain discoverable in Other until the host assigns their category.
type startCategory struct {
	Key, Label, Glyph, Href string
	Apps                    []string
	Count                   int
}

var startTaxonomy = []startCategory{
	{Key: "create", Label: "Create", Glyph: "pencil", Apps: []string{"diagrams", "docs", "editor", "slides", "theme-studio"}},
	{Key: "tools", Label: "Tools", Glyph: "folder", Apps: []string{"files", "terminal", "diff"}},
	{Key: "barcodes", Label: "Barcodes", Glyph: "app", Apps: []string{"barcode-scanner", "barcodes", "flashcards"}},
	{Key: "learning", Label: "Learning", Glyph: "document", Apps: []string{"flashcards", "sight-reader", "conway"}},
	{Key: "games", Label: "Games", Glyph: "app", Apps: []string{"asteroids", "conway", "dice", "invaders", "sudoku"}},
	{Key: "settings", Label: "Settings", Glyph: "gear", Apps: []string{"settings", "theme-studio"}},
	{Key: "other", Label: "Other", Glyph: "app"},
}

func startHref(r *http.Request, category, query string) string {
	q := r.URL.Query()
	q.Set("start", "1")
	q.Del("start-category")
	q.Del("start-q")
	if category != "" {
		q.Set("start-category", category)
	}
	if query != "" {
		q.Set("start-q", query)
	}
	return r.URL.Path + "?" + q.Encode()
}

func (s *Server) startCatalog(r *http.Request) map[string]any {
	placements := map[string][]string{}
	for _, c := range startTaxonomy {
		for _, name := range c.Apps {
			placements[name] = append(placements[name], c.Key)
		}
	}
	entries := s.appletEntries(r)
	counts := map[string]int{}
	kind, _ := s.hostKind(r)
	q := r.URL.Query()
	for _, key := range []string{"start", "start-mode", "start-q", "start-category"} {
		q.Del(key)
	}
	desktop := parseDesktop(q)
	for _, a := range entries {
		category := placements[a["Name"]]
		if len(category) == 0 {
			category = []string{"other"}
		}
		a["Category"] = strings.Join(category, " ")
		for _, key := range category {
			counts[key]++
		}
		a["Keywords"] = a["Name"]
		for alias, target := range hostAliases {
			if target.applet == a["Name"] {
				a["Keywords"] += " " + alias
			}
		}
		a["Href"] = a["Page"]
		if kind == "desktop" {
			a["Href"] = s.siteURL(r) + desktop.openWindow(a["Name"])
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		return strings.ToLower(entries[i]["Title"]) < strings.ToLower(entries[j]["Title"])
	})
	queryRunes := []rune(r.URL.Query().Get("start-q"))
	query := string(queryRunes[:min(512, len(queryRunes))])
	category := r.URL.Query().Get("start-category")
	if counts[category] == 0 {
		category = ""
	}
	categories := []startCategory{{Label: "All", Glyph: "app", Count: len(entries), Href: startHref(r, "", query)}}
	for _, c := range startTaxonomy {
		if counts[c.Key] > 0 {
			c.Count, c.Href = counts[c.Key], startHref(r, c.Key, query)
			categories = append(categories, c)
		}
	}
	var hidden []map[string]string
	for key, values := range r.URL.Query() {
		if key == "start" || key == "start-mode" || key == "start-q" || key == "start-category" {
			continue
		}
		for _, value := range values {
			hidden = append(hidden, map[string]string{"Name": key, "Value": value})
		}
	}
	sort.Slice(hidden, func(i, j int) bool { return hidden[i]["Name"] < hidden[j]["Name"] })
	settingsHref := s.siteURL(r) + desktop.openWindow("settings")
	if kind != "desktop" {
		settingsHref = desktop.openWindow("settings")
	}
	return map[string]any{"Categories": categories, "Items": entries, "Query": query, "Category": category, "Hidden": hidden,
		"SettingsHref": settingsHref, "HelpHref": s.siteURL(r) + desktop.openWindow("help"),
		"Action": (&url.URL{Path: r.URL.Path}).String()}
}
