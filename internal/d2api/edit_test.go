// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package d2api

import (
	"encoding/json"
	"strings"
	"testing"
)

// The text every edit starts from: a comment, a setting, a container, a
// shape with settings of its own and a labelled connection, so a test
// shows what an edit keeps as well as what it changes.
const editSource = "# A plan\ndirection: right\n\nweb: Web {\n  app: App\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: reads\n"

func editCall(t *testing.T, r EditRequest) EditResponse {
	t.Helper()
	if r.Text == "" {
		r.Text = editSource
	}
	b, _ := json.Marshal(r)
	out := Call("edit", string(b))
	var res EditResponse
	if err := json.Unmarshal([]byte(out), &res); err != nil || strings.Contains(out, `"error"`) {
		t.Fatalf("%s %s: the engine failed: %s", r.Op, r.Key, out)
	}
	return res
}

func ptr(s string) *string { return &s }

// Golden texts for each edit the visual editor makes (docs/diagrams-design.md,
// decisions 4 and 5). They are what D2 0.7.2's oracle and formatter write,
// so a newer D2 that writes differently shows here as a failing test, to be
// read and accepted on purpose.
func TestEditGolden(t *testing.T) {
	head := "# A plan\ndirection: right\n\n"
	for _, c := range []struct {
		name string
		req  EditRequest
		key  string
		want string
	}{
		{"create a shape", EditRequest{Op: "create", Key: "cache"}, "cache",
			head + "web: Web {\n  app: App\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: reads\ncache\n"},
		{"create a shape whose name is taken", EditRequest{Op: "create", Key: "db"}, "db 2",
			head + "web: Web {\n  app: App\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: reads\ndb 2\n"},
		{"create a shape inside a container", EditRequest{Op: "create", Key: "web.worker"}, "web.worker",
			head + "web: Web {\n  app: App\n  worker\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: reads\n"},
		{"connect two shapes", EditRequest{Op: "create", Key: "web.app -> db"}, "(web.app -> db)[1]",
			head + "web: Web {\n  app: App\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: reads\nweb.app -> db\n"},
		{"set a label", EditRequest{Op: "set", Key: "db", Value: ptr("Main database")}, "db",
			head + "web: Web {\n  app: App\n}\ndb: Main database {shape: cylinder}\n\nweb.app -> db: reads\n"},
		{"set a shape", EditRequest{Op: "set", Key: "web.app.shape", Value: ptr("hexagon")}, "web.app.shape",
			head + "web: Web {\n  app: App {shape: hexagon}\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: reads\n"},
		{"set a style", EditRequest{Op: "set", Key: "db.style.fill", Value: ptr("#ffcc00")}, "db.style.fill",
			head + "web: Web {\n  app: App\n}\ndb: Database {\n  shape: cylinder\n  style.fill: \"#ffcc00\"\n}\n\nweb.app -> db: reads\n"},
		{"set a connection's label", EditRequest{Op: "set", Key: "(web.app -> db)[0]", Value: ptr("writes")}, "(web.app -> db)[0]",
			head + "web: Web {\n  app: App\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: writes\n"},
		{"delete a shape and its connections", EditRequest{Op: "delete", Key: "db"}, "db",
			head + "web: Web {\n  app: App\n}\n"},
		{"delete a connection", EditRequest{Op: "delete", Key: "(web.app -> db)[0]"}, "(web.app -> db)[0]",
			head + "web: Web {\n  app: App\n}\ndb: Database {shape: cylinder}\n"},
		{"rename, with the references following", EditRequest{Op: "rename", Key: "db", Name: "store"}, "store",
			head + "web: Web {\n  app: App\n}\nstore: Database {shape: cylinder}\n\nweb.app -> store: reads\n"},
		{"move into a container", EditRequest{Op: "move", Key: "db", To: ptr("web.db")}, "web.db",
			head + "web: Web {\n  app: App\n  db: Database {shape: cylinder}\n}\n\nweb.app -> web.db: reads\n"},
		{"move out of a container", EditRequest{Op: "move", Key: "web.app", To: ptr("app")}, "app",
			head + "web: Web\ndb: Database {shape: cylinder}\n\napp -> db: reads\napp: App\n"},
		{"reconnect a connection's end", EditRequest{Op: "reconnect", Key: "(web.app -> db)[0]", To: ptr("web")}, "(web.app -> db)[0]",
			head + "web: Web {\n  app: App\n}\ndb: Database {shape: cylinder}\n\nweb.app -> web: reads\n"},
	} {
		t.Run(c.name, func(t *testing.T) {
			res := editCall(t, c.req)
			if len(res.Problems) != 0 {
				t.Fatalf("problems: %+v", res.Problems)
			}
			if res.Key != c.key {
				t.Errorf("key %q, want %q", res.Key, c.key)
			}
			if res.Text != c.want {
				t.Errorf("text:\n%s\nwant:\n%s", res.Text, c.want)
			}
			// Whatever an edit writes, the engine draws.
			if p := call(t, CompileRequest{Text: res.Text}).Problems; len(p) != 0 {
				t.Errorf("the edited text does not draw: %+v", p)
			}
		})
	}
}

// An edit needs a diagram that compiles, and says why it cannot be made
// rather than failing; an unknown edit is the caller's mistake.
func TestEditRefusals(t *testing.T) {
	if res := editCall(t, EditRequest{Text: "a: {\n", Op: "create", Key: "b"}); len(res.Problems) == 0 || res.Text != "" {
		t.Errorf("an edit of a broken text: %+v", res)
	}
	if res := editCall(t, EditRequest{Op: "create", Key: " "}); len(res.Problems) == 0 {
		t.Errorf("an edit with no key: %+v", res)
	}
	if res := editCall(t, EditRequest{Op: "rename", Key: "db", Name: " "}); len(res.Problems) == 0 {
		t.Errorf("a rename to nothing: %+v", res)
	}
	if res := editCall(t, EditRequest{Op: "move", Key: "db"}); len(res.Problems) == 0 {
		t.Errorf("a move to nowhere: %+v", res)
	}
	if out := Call("edit", `{"text":"a","op":"explode","key":"a"}`); !strings.Contains(out, `"error"`) {
		t.Errorf("an unknown edit: %s", out)
	}
	if out := Call("edit", `{"text":"`+strings.Repeat("a", MaxSource+1)+`","op":"create","key":"b"}`); !strings.Contains(out, `"error"`) {
		t.Errorf("an oversized text was edited: %.80s", out)
	}
}

// The drawing reports where each shape and connection is, in its own
// pixels, with the keys the edit function takes, so a click on the
// drawing finds what it landed on.
func TestCompileGeometry(t *testing.T) {
	res := call(t, CompileRequest{Text: editSource})
	byID := map[string]ShapeBox{}
	for _, s := range res.Shapes {
		byID[s.ID] = s
		if s.X < 0 || s.Y < 0 || s.X+s.W > res.Width || s.Y+s.H > res.Height {
			t.Errorf("%s at %+v lies outside the %dx%d drawing", s.ID, s, res.Width, res.Height)
		}
	}
	web, app, db := byID["web"], byID["web.app"], byID["db"]
	if web.W == 0 || app.W == 0 || db.Type != "cylinder" {
		t.Fatalf("shapes: %+v", res.Shapes)
	}
	if !(app.X >= web.X && app.Y >= web.Y && app.X+app.W <= web.X+web.W && app.Y+app.H <= web.Y+web.H) {
		t.Errorf("web.app %+v is not inside web %+v", app, web)
	}
	if len(res.Connections) != 1 || res.Connections[0].ID != "(web.app -> db)[0]" || len(res.Connections[0].Points) < 2 {
		t.Fatalf("connections: %+v", res.Connections)
	}
	// The connection's key is one the edit function accepts.
	if r := editCall(t, EditRequest{Op: "delete", Key: res.Connections[0].ID}); len(r.Problems) != 0 || strings.Contains(r.Text, "->") {
		t.Errorf("deleting by the drawn key: %+v", r)
	}
}
