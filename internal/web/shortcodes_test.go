package web

import (
	"encoding/json"
	"strings"
	"testing"
)

// The Editor reads its completion and hover help from /api/shortcodes. It
// needs no session, and each entry has the fields the Editor reads.
func TestShortcodeList(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "GET", site("/api/shortcodes"), "")
	if w.Code != 200 || w.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("list: %d %s", w.Code, w.Header().Get("Content-Type"))
	}
	if c := w.Header().Get("Set-Cookie"); c != "" {
		t.Fatalf("the list started a session: %q", c)
	}
	var body struct {
		Shortcodes []struct {
			Name, Title, Description, Example, Kind string
			Params                                  []struct {
				Name, Description string
				Required          bool
			}
		}
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("list is not JSON: %v", err)
	}
	by := map[string]int{}
	for i, sc := range body.Shortcodes {
		by[sc.Name] = i
		if sc.Name == "" || sc.Title == "" || sc.Description == "" || sc.Kind == "" {
			t.Errorf("incomplete entry: %+v", sc)
		}
	}
	tip, ok := by["tip"]
	if !ok || body.Shortcodes[tip].Kind != "container" {
		t.Fatalf("tip is missing or not a container: %+v", body.Shortcodes)
	}
	kbd, ok := by["kbd"]
	if !ok || body.Shortcodes[kbd].Description == "" {
		t.Fatalf("kbd is missing or has no description")
	}
	fig, ok := by["figure"]
	if !ok || len(body.Shortcodes[fig].Params) == 0 || body.Shortcodes[fig].Params[0].Name != "src" || !body.Shortcodes[fig].Params[0].Required {
		t.Fatalf("figure's parameters: %+v", body.Shortcodes[fig])
	}
	// A shortcode with no named arguments still has a params array, not null.
	if raw := w.Body.String(); !strings.Contains(raw, `"name":"kbd"`) || strings.Contains(raw, `"params":null`) {
		t.Fatalf("params must be an array: %s", raw)
	}
}
