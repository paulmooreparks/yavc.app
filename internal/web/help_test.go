package web

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// helpSite is the small site with a help page for its package and the
// help contents (DESIGN.md, decision 19).
func helpSite(t *testing.T) *Server {
	t.Helper()
	s := newSite(t, testDomain)
	write(t, s.Pages, "help/index.md", "# Help Contents\n\nEvery application's help.\n\n{{help-list}}\n")
	write(t, s.Pages, "help/dice.md", "# Dice Help\n\nRoll the dice with **Roll**.\n")
	// A help page for a package that is not installed is never served.
	write(t, s.Pages, "help/absent.md", "# Absent Help\n")
	return s
}

func TestHelpPages(t *testing.T) {
	s := helpSite(t)
	w := req(t, s, "GET", site("/help/dice"), "")
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("/help/dice: %d %q", w.Code, w.Header().Get("Content-Type"))
	}
	if body := w.Body.String(); !strings.Contains(body, "<strong>Roll</strong>") || !strings.Contains(body, "<title>Dice Help") {
		t.Fatalf("/help/dice is not the rendered page:\n%s", body)
	}
	w = req(t, s, "GET", site("/help"), "")
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("/help: %d %q", w.Code, w.Header().Get("Content-Type"))
	}
	if body := w.Body.String(); !strings.Contains(body, `<a href="/help/dice">Dice Help</a>: Roll dice.`) || strings.Contains(body, "{{help-list}}") || strings.Contains(body, "/help/absent") {
		t.Fatalf("/help does not list the help pages:\n%s", body)
	}
	for _, path := range []string{"/help/nothing", "/help/absent", "/help/Dice", "/help/dice.md", "/help-nothing"} {
		if w := req(t, s, "GET", site(path), ""); w.Code != http.StatusNotFound {
			t.Errorf("%s: %d", path, w.Code)
		}
	}
}

// Each page's Help menu links to every help page and to the contents; on
// the desktop the links open windows.
func TestHelpMenu(t *testing.T) {
	s := helpSite(t)
	desktop := req(t, s, "GET", site("/"), "").Body.String()
	for _, want := range []string{`data-win-open="help">Help Contents</a>`, `data-win-open="help-dice">Dice Help</a>`, `?open=help-dice&amp;top=help-dice"`} {
		if !strings.Contains(desktop, want) {
			t.Errorf("the desktop's Help menu has no %s", want)
		}
	}
	standalone := req(t, s, "GET", "http://dice."+testDomain+"/", "").Body.String()
	for _, want := range []string{`href="http://` + testDomain + `/help/dice">Dice Help</a>`, `href="http://` + testDomain + `/help">Help Contents</a>`} {
		if !strings.Contains(standalone, want) {
			t.Errorf("the standalone page's Help menu has no %s", want)
		}
	}
}

// A help page's window is drawn by its slug, and its Open as a Page link
// is its address.
func TestHelpWindows(t *testing.T) {
	s := helpSite(t)
	for key, page := range map[string]string{"help": "/help", "help-dice": "/help/dice"} {
		w := req(t, s, "GET", site("/win/"+key), "")
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `data-win="`+key+`"`) || !strings.Contains(w.Body.String(), `href="http://`+testDomain+page+`"`) {
			t.Errorf("/win/%s: %d\n%s", key, w.Code, w.Body.String())
		}
	}
	if w := req(t, s, "GET", site("/win/help-absent"), ""); w.Code != http.StatusNotFound {
		t.Errorf("/win/help-absent: %d", w.Code)
	}
	// The desktop draws an address's help window into the page.
	if body := req(t, s, "GET", site("/?open=help-dice"), "").Body.String(); !strings.Contains(body, `data-win="help-dice"`) {
		t.Error("the desktop did not draw the help window its address opens")
	}
}

// A help page's slug, an old guide's address and a help address at a
// subdomain each go to the help page's own address.
func TestHelpRedirects(t *testing.T) {
	s := helpSite(t)
	for from, to := range map[string]string{
		site("/help-dice"):                          "/help/dice",
		site("/page/help-dice"):                     "/help-dice",
		site("/files-guide"):                        "/help/files",
		site("/terminal-guide"):                     "/help/terminal",
		"http://dice." + testDomain + "/help":       "http://" + testDomain + "/help/dice",
		"http://dice." + testDomain + "/help/dice":  "http://" + testDomain + "/help/dice",
		"http://dice." + testDomain + "/help/other": "http://" + testDomain + "/help/other",
		"http://nowhere." + testDomain + "/help":    "http://" + testDomain + "/",
	} {
		w := req(t, s, "GET", from, "")
		if w.Code < 300 || w.Code > 399 || w.Header().Get("Location") != to {
			t.Errorf("%s: %d to %q, want %q", from, w.Code, w.Header().Get("Location"), to)
		}
	}
	// An applet with no help page sends its /help to the contents.
	os.Remove(filepath.Join(s.Pages, "help", "dice.md"))
	if w := req(t, s, "GET", "http://dice."+testDomain+"/help", ""); w.Header().Get("Location") != "http://"+testDomain+"/help" {
		t.Errorf("an applet without help: %d to %q", w.Code, w.Header().Get("Location"))
	}
}

// The help pages are in the site tree, by slug, and their texts can be
// read, as the Terminal and Files read pages.
func TestHelpInTree(t *testing.T) {
	s := helpSite(t)
	var root treeEntry
	if err := json.Unmarshal(req(t, s, "GET", site("/api/site/tree"), "").Body.Bytes(), &root); err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, d := range root.Children {
		if d.Name == "help" {
			for _, c := range d.Children {
				names = append(names, c.Name+":"+c.Kind)
			}
		}
	}
	if strings.Join(names, ",") != "help:page,help-dice:page" {
		t.Fatalf("the tree's help folder is %v", names)
	}
	w := req(t, s, "GET", site("/api/site/text/help-dice"), "")
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Body.String(), "# Dice Help") {
		t.Fatalf("the help page's text: %d %q", w.Code, w.Body.String())
	}
}

// Every one of the repository's own applications, the packages under
// apps/, has a help page, and the contents lists each of them.
func TestEveryAppHasHelp(t *testing.T) {
	s := realSite(t)
	contents := req(t, s, "GET", site("/help"), "")
	if contents.Code != http.StatusOK {
		t.Fatalf("/help: %d", contents.Code)
	}
	entries, err := os.ReadDir(filepath.Join("..", "..", "apps"))
	if err != nil {
		t.Fatal(err)
	}
	found := 0
	for _, e := range entries {
		if _, err := os.Stat(filepath.Join("..", "..", "apps", e.Name(), "applet.json")); err != nil {
			continue
		}
		found++
		w := req(t, s, "GET", site("/help/"+e.Name()), "")
		if w.Code != http.StatusOK {
			t.Errorf("/help/%s: %d", e.Name(), w.Code)
		}
		if !strings.Contains(contents.Body.String(), `href="/help/`+e.Name()+`"`) {
			t.Errorf("/help does not list %s", e.Name())
		}
	}
	if found == 0 {
		t.Fatal("no packages under apps/")
	}
}
