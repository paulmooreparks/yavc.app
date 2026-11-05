// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package web

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStartCatalogAndRoutes(t *testing.T) {
	s := newSite(t, testDomain)
	r := httptest.NewRequest("GET", site("/?open=dice&file=kept&start=1&start-q=roll&start-category=games"), nil)
	catalog := s.startCatalog(r)
	items := catalog["Items"].([]map[string]string)
	if len(items) != 1 || items[0]["Category"] != "games" || !strings.Contains(items[0]["Href"], "file=kept") || strings.Contains(items[0]["Href"], "start=") {
		t.Fatalf("catalog: %#v", items)
	}
	if catalog["Query"] != "roll" || catalog["Category"] != "games" {
		t.Fatal(catalog)
	}
	for _, key := range []string{"SettingsHref", "HelpHref"} {
		href := catalog[key].(string)
		if !strings.Contains(href, "open=dice%2C") || !strings.Contains(href, "file=kept") || strings.Contains(href, "start=") {
			t.Fatalf("footer lost desktop state: %s", href)
		}
	}
	for _, rawURL := range []string{site("/"), "https://dice." + testDomain + "/"} {
		body := req(t, s, "GET", rawURL, "").Body.String()
		if strings.Count(body, `id="site-start"`) != 1 || !strings.Contains(body, `/pudl/pudl-start.js?v=0.98.0`) || !strings.Contains(body, `data-start-category="games"`) || strings.Contains(body, "ZgotmplZ") {
			t.Fatalf("Start markup invalid at %s", rawURL)
		}
	}
	desktopBody := req(t, s, "GET", site("/"), "").Body.String()
	if strings.Contains(desktopBody, `class="md-sidebar"`) || strings.Contains(desktopBody, `data-site-command="sidebar"`) || strings.Contains(desktopBody, `data-md-action="toggle"`) {
		t.Fatal("Start replaces the application sidebar and its commands")
	}
	invalid := s.startCatalog(httptest.NewRequest("GET", site("/?start-category=missing&start-q="+strings.Repeat("a", 600)), nil))
	if invalid["Category"] != "" || len(invalid["Query"].(string)) != 512 {
		t.Fatal("unbounded or unknown Start state")
	}
}

func TestStartTaxonomyCoversInstalledApplications(t *testing.T) {
	known := map[string]bool{}
	for _, category := range startTaxonomy {
		for _, name := range category.Apps {
			known[name] = true
		}
	}
	for _, name := range []string{"diagrams", "editor", "slides", "files", "terminal", "diff", "theme-studio", "barcode-scanner", "barcodes", "flashcards", "sight-reader", "conway", "asteroids", "dice", "invaders", "sudoku", "settings"} {
		if !known[name] {
			t.Errorf("uncategorized installed app: %s", name)
		}
	}
	s := newSite(t, testDomain)
	write(t, s.Applets[0], "new-app/applet.json", `{"name":"new-app","title":"New App","version":"1","src":"app.js"}`)
	write(t, s.Applets[0], "new-app/app.js", "")
	entries := s.startCatalog(httptest.NewRequest("GET", site("/"), nil))["Items"].([]map[string]string)
	found := false
	for _, entry := range entries {
		if entry["Name"] == "new-app" {
			found = entry["Category"] == "other"
		}
	}
	if !found {
		t.Fatal("new packages must remain available in Other")
	}
}
