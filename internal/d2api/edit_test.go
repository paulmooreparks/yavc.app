// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package d2api

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
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
		{"reconnect a connection's end", EditRequest{Op: "reconnect", Key: "(web.app -> db)[0]", To: ptr("web")}, "(web.app -> web)[0]",
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

// Placing a shape of a chosen kind is one change, and so is dragging a
// connection out to empty space, which makes the shape at its far end.
func TestEditCreateWithShape(t *testing.T) {
	head := "# A plan\ndirection: right\n\nweb: Web {\n  app: App\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: reads\n"
	res := editCall(t, EditRequest{Op: "create", Key: "web.item", Shape: "hexagon"})
	if want := "# A plan\ndirection: right\n\nweb: Web {\n  app: App\n  item: {shape: hexagon}\n}\ndb: Database {shape: cylinder}\n\nweb.app -> db: reads\n"; res.Text != want || res.Key != "web.item" {
		t.Errorf("a hexagon inside web (key %q):\n%s", res.Key, res.Text)
	}
	res = editCall(t, EditRequest{Op: "create", Key: "db -> item", Shape: "person"})
	if !strings.HasPrefix(res.Text, head) || !strings.Contains(res.Text, "db -> item") || !strings.Contains(res.Text, "item.shape: person") {
		t.Errorf("a connection to a new person:\n%s", res.Text)
	}
	// A connection between shapes that exist changes neither end's kind.
	res = editCall(t, EditRequest{Op: "create", Key: "db -> web", Shape: "person"})
	if strings.Contains(res.Text, "person") {
		t.Errorf("an existing end changed its kind:\n%s", res.Text)
	}
	// Rectangle is D2's own kind, so nothing is written for it.
	res = editCall(t, EditRequest{Op: "create", Key: "plain", Shape: "rectangle"})
	if strings.Contains(res.Text, "plain:") {
		t.Errorf("a rectangle wrote its kind:\n%s", res.Text)
	}
}

// A connection's direction changes at every place it is written, so a
// setting written elsewhere still reaches it, and the key it has after is
// returned.
func TestEditArrows(t *testing.T) {
	src := "a\nb\na -> b: x\n(a -> b)[0].style.stroke-dash: 5\n"
	for _, c := range []struct{ arrows, key, line string }{
		{"<->", "(a <-> b)[0]", "a <-> b: x"},
		{"--", "(a -- b)[0]", "a -- b: x"},
		{"<-", "(a <- b)[0]", "a <- b: x"},
	} {
		res := editCall(t, EditRequest{Text: src, Op: "arrows", Key: "(a -> b)[0]", Value: ptr(c.arrows)})
		if len(res.Problems) != 0 || res.Key != c.key || !strings.Contains(res.Text, c.line) || !strings.Contains(res.Text, c.key+".style.stroke-dash: 5") {
			t.Errorf("%s: key %q problems %+v\n%s", c.arrows, res.Key, res.Problems, res.Text)
		}
	}
	if res := editCall(t, EditRequest{Text: src, Op: "arrows", Key: "(a -> b)[0]", Value: ptr("=>")}); len(res.Problems) == 0 {
		t.Errorf("an unknown direction was written: %s", res.Text)
	}
}

// Setting nothing takes a setting away, puts a shape's kind back to the
// rectangle, and never removes a shape or a connection.
func TestEditClear(t *testing.T) {
	src := "a: A {shape: oval; style.fill: red; tooltip: hi}\nb\na -> b: x {target-arrowhead.shape: diamond}\n"
	for _, c := range []struct{ key, gone, want string }{
		{"a.style.fill", "fill", ""},
		{"a.tooltip", "tooltip", ""},
		{"(a -> b)[0].target-arrowhead.shape", "diamond", ""},
		{"a.shape", "oval", "shape: rectangle"},
	} {
		res := editCall(t, EditRequest{Text: src, Op: "set", Key: c.key})
		if len(res.Problems) != 0 || strings.Contains(res.Text, c.gone) || !strings.Contains(res.Text, c.want) || strings.Contains(res.Text, c.key+"\n") {
			t.Errorf("clearing %s:\n%s", c.key, res.Text)
		}
	}
	for _, key := range []string{"a", "(a -> b)[0]"} {
		if res := editCall(t, EditRequest{Text: src, Op: "set", Key: key}); len(res.Problems) == 0 {
			t.Errorf("setting nothing on %s was allowed:\n%s", key, res.Text)
		}
	}
}

// The outline carries what the inspector shows: a shape's style, icon,
// link and tooltip, and a connection's direction, arrowheads and style.
func TestOutlineSettings(t *testing.T) {
	src := "a: A {shape: oval; style.fill: \"#ff0000\"; style.bold: true; link: https://example.com; tooltip: hi}\nb\nb <-> a: x {source-arrowhead: 1; target-arrowhead.shape: diamond; style.stroke-dash: 5}\n"
	var res OutlineResponse
	callJSON(t, "outline", TextRequest{Text: src}, &res)
	var a Shape
	for _, s := range res.Shapes {
		if s.ID == "a" {
			a = s
		}
	}
	if a.Style["fill"] != "#ff0000" || a.Style["bold"] != "true" || a.Link != "https://example.com" || a.Tooltip != "hi" {
		t.Errorf("shape a: %+v", a)
	}
	c := res.Connections[0]
	if c.Arrows != "<->" || c.Source == nil || c.Source.Label != "1" || c.Target == nil || c.Target.Shape != "diamond" || c.Style["stroke-dash"] != "5" {
		t.Errorf("connection: %+v source %+v target %+v", c, c.Source, c.Target)
	}
}

// A curved route's points are read as D2's renderer draws them: the first
// is the start, then cubic Bezier control points in threes. D2 does not
// document this (Paul accepted it as a pinned exception, 2026-11-04), so
// this test holds the reading to D2's own drawing: every control point the
// engine reports must be one the drawn path uses, in order. The path's
// first and last points are moved by the arrowheads, so they are left out.
// A newer D2 that draws curves differently fails here.
func TestCurvedRouteMatchesDrawing(t *testing.T) {
	// A loop back makes dagre curve its lines.
	res := call(t, CompileRequest{Text: "a -> b -> c -> a\na -> c\n", Pad: ptrInt(0)})
	var curved *ConnectionPath
	for i := range res.Connections {
		if res.Connections[i].Curve && len(res.Connections[i].Points) >= 4 {
			curved = &res.Connections[i]
			break
		}
	}
	if curved == nil {
		t.Fatalf("dagre drew no curved connection to check: %+v", res.Connections)
	}
	if (len(curved.Points)-1)%3 != 0 {
		t.Fatalf("a curved route of %d points is not a start and threes", len(curved.Points))
	}
	// The drawn paths, in the drawing's own numbers.
	paths := regexp.MustCompile(`<path d="(M [^"]+)"[^>]*class="connection`).FindAllStringSubmatch(res.SVG, -1)
	num := regexp.MustCompile(`-?[0-9]+(?:\.[0-9]+)?`)
	// The engine's points are offset by the drawing's origin; the view box of
	// the drawn diagram gives the same origin.
	vb := regexp.MustCompile(`class="[^"]*d2-svg"[^>]*viewBox="(-?[0-9.]+) (-?[0-9.]+) `).FindStringSubmatch(res.SVG)
	if vb == nil {
		t.Fatal("the drawing has no view box to place the route in")
	}
	ox, oy := atof(vb[1]), atof(vb[2])
	inner := curved.Points[1 : len(curved.Points)-1]
	for _, m := range paths {
		if !strings.Contains(m[1], " C ") {
			continue
		}
		ns := num.FindAllString(m[1], -1)
		var drawn [][2]float64
		for i := 0; i+1 < len(ns); i += 2 {
			drawn = append(drawn, [2]float64{atof(ns[i]) - ox, atof(ns[i+1]) - oy})
		}
		if len(drawn) != len(curved.Points) {
			continue
		}
		ok := true
		for i, p := range inner {
			d := drawn[i+1]
			if math.Abs(d[0]-p[0]) > 0.01 || math.Abs(d[1]-p[1]) > 0.01 {
				ok = false
				break
			}
		}
		if ok {
			return
		}
	}
	t.Fatalf("no drawn path uses the control points of %s: %v", curved.ID, curved.Points)
}

func ptrInt(n int64) *int64 { return &n }

func atof(s string) float64 { f, _ := strconv.ParseFloat(s, 64); return f }
