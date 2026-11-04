// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package d2api

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"
)

func call(t *testing.T, req CompileRequest) CompileResponse {
	t.Helper()
	arg, _ := json.Marshal(req)
	out := Call("compile", string(arg))
	var res CompileResponse
	if err := json.Unmarshal([]byte(out), &res); err != nil {
		t.Fatalf("not JSON: %s", out)
	}
	if strings.Contains(out, `"error"`) {
		t.Fatalf("the engine failed: %s", out)
	}
	return res
}

// The pin is part of the design (docs/diagrams-design.md, decision 4): a
// newer D2 is a deliberate change, and this test is where it shows. A test
// binary does not record its dependencies' versions, so the pin is read
// from go.mod; the engine reports its own at run time (D2Version).
func TestPinnedVersion(t *testing.T) {
	mod, err := os.ReadFile("../../go.mod")
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`(?m)^\s*(require\s+)?oss\.terrastruct\.com/d2 v0\.7\.2\b`).Match(mod) {
		t.Fatal("go.mod no longer pins D2 v0.7.2; moving the pin means checking every test here and the design's facts")
	}
}

func TestCompileDraws(t *testing.T) {
	res := call(t, CompileRequest{Text: "a -> b: hello\nb -> c\n"})
	if len(res.Problems) != 0 {
		t.Fatalf("problems: %+v", res.Problems)
	}
	if !strings.HasPrefix(strings.TrimSpace(res.SVG), "<?xml") && !strings.Contains(res.SVG, "<svg") {
		t.Fatalf("no SVG: %.200s", res.SVG)
	}
	if !strings.Contains(res.SVG, "hello") {
		t.Fatal("the connection's label is not in the drawing")
	}
	if res.Width <= 0 || res.Height <= 0 {
		t.Fatalf("size %dx%d", res.Width, res.Height)
	}
}

// The same text draws the same drawing, so the page can cache it by hash.
func TestCompileIsDeterministic(t *testing.T) {
	req := CompileRequest{Text: "x: {a -> b}\nx.b -> y\n"}
	if a, b := call(t, req).SVG, call(t, req).SVG; a != b {
		t.Fatal("two compiles of one text drew differently")
	}
}

func TestELKLaysOutContainers(t *testing.T) {
	res := call(t, CompileRequest{Text: "web: {api; ui}\ndb: {shape: cylinder}\nweb.api -> db\n", Layout: "elk"})
	if len(res.Problems) != 0 || res.SVG == "" {
		t.Fatalf("ELK: %+v", res.Problems)
	}
}

func TestUnknownLayoutIsRefused(t *testing.T) {
	out := Call("compile", `{"text":"a","layout":"tala"}`)
	if !strings.Contains(out, `"error"`) || !strings.Contains(out, "tala") {
		t.Fatalf("got %s", out)
	}
}

// A mistake in the text is a problem with its place, never a failure.
func TestMistakeHasItsPlace(t *testing.T) {
	text := "a -> b\nc: {shape: nosuchshape}\n"
	res := call(t, CompileRequest{Text: text})
	if len(res.Problems) == 0 {
		t.Fatal("no problem reported")
	}
	p := res.Problems[0]
	if p.Line != 2 {
		t.Fatalf("problem on line %d, want 2: %+v", p.Line, p)
	}
	if p.Message != `unknown shape "nosuchshape"` {
		t.Fatalf("message %q, want it without the file and place", p.Message)
	}
	if p.From < len("a -> b\n") || p.To > len(text) || p.From > p.To {
		t.Fatalf("offsets %d..%d do not fall on line 2", p.From, p.To)
	}
	if res.SVG != "" {
		t.Fatal("a text with a problem was drawn")
	}
}

func TestSourceTooLargeIsRefused(t *testing.T) {
	res := call(t, CompileRequest{Text: strings.Repeat("a -> b\n", MaxSource/7+1)})
	if len(res.Problems) != 1 || !strings.Contains(res.Problems[0].Message, "KB") {
		t.Fatalf("got %+v", res.Problems)
	}
}

func TestTooManyShapesAreRefusedBeforeLayout(t *testing.T) {
	var b strings.Builder
	for i := 0; i <= MaxObjects; i++ {
		b.WriteString("n")
		b.WriteString(strings.Repeat("x", 1+i%5))
		b.WriteString(string(rune('a' + i%26)))
		b.WriteString(itoa(i))
		b.WriteString("\n")
	}
	res := call(t, CompileRequest{Text: b.String()})
	if len(res.Problems) != 1 || !strings.Contains(res.Problems[0].Message, "shapes") {
		t.Fatalf("got %+v", res.Problems)
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var d []byte
	for ; n > 0; n /= 10 {
		d = append([]byte{byte('0' + n%10)}, d...)
	}
	return string(d)
}

// An icon on another host is never drawn, so a diagram cannot make the
// reader's browser contact it, and the page is told which were left out.
func TestRemoteIconsAreNotDrawn(t *testing.T) {
	res := call(t, CompileRequest{Text: "a: {icon: https://tracker.example/pixel.png}\nb: {shape: image; icon: https://tracker.example/b.svg}\na -> b\n"})
	if len(res.Problems) != 0 {
		t.Fatalf("problems: %+v", res.Problems)
	}
	if strings.Contains(res.SVG, "tracker.example") {
		t.Fatal("the drawing still refers to the remote icon")
	}
	if len(res.Icons) != 2 {
		t.Fatalf("icons reported: %v", res.Icons)
	}
}

func TestDataIconIsKept(t *testing.T) {
	icon := "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLz4="
	res := call(t, CompileRequest{Text: "a: {icon: \"" + icon + "\"}\n"})
	if len(res.Icons) != 0 || !strings.Contains(res.SVG, "data:image/svg+xml") {
		t.Fatalf("icons %v, kept in drawing: %v", res.Icons, strings.Contains(res.SVG, "data:image/svg+xml"))
	}
}

// An import reads only the files given; nothing else can be reached.
func TestImportsReadOnlyGivenFiles(t *testing.T) {
	ok := call(t, CompileRequest{Text: "x: @parts\nx.a -> b\n", Files: map[string]string{"parts.d2": "a; c"}})
	if len(ok.Problems) != 0 {
		t.Fatalf("a given file could not be imported: %+v", ok.Problems)
	}
	for _, path := range []string{"x: @/etc/passwd", "x: @../secret", "x: @missing"} {
		res := call(t, CompileRequest{Text: path + "\n"})
		if len(res.Problems) == 0 {
			t.Errorf("%q was not refused", path)
		}
	}
}

// A diagram's own d2-config block chooses its theme over the page's.
func TestDiagramConfigWins(t *testing.T) {
	dark := int64(200)
	plain := call(t, CompileRequest{Text: "a -> b\n", ThemeID: &dark})
	own := call(t, CompileRequest{Text: "vars: {d2-config: {theme-id: 0}}\na -> b\n", ThemeID: &dark})
	if plain.SVG == own.SVG {
		t.Fatal("the diagram's theme-id made no difference")
	}
}

// The file's layout-engine wins over the page's, and one that is not
// bundled is a problem in the text.
func TestDiagramLayoutEngine(t *testing.T) {
	text := "web: {api; ui}\nweb.api -> db\n"
	dagre := call(t, CompileRequest{Text: text})
	elk := call(t, CompileRequest{Text: "vars: {d2-config: {layout-engine: elk}}\n" + text, Layout: "dagre"})
	if elk.SVG == "" || dagre.SVG == "" || elk.SVG == dagre.SVG {
		t.Fatal("the diagram's layout-engine made no difference")
	}
	// Where ELK is not in the build, as in the browser, a diagram that asks
	// for it is told so in words, and nothing fails.
	elkInBuild = false
	defer func() { elkInBuild = true }()
	for _, req := range []CompileRequest{{Text: "vars: {d2-config: {layout-engine: elk}}\na -> b\n"}, {Text: "a -> b\n", Layout: "elk"}} {
		res := call(t, req)
		if len(res.Problems) != 1 || res.Problems[0].Message != errNoELK {
			t.Fatalf("without ELK: %+v", res.Problems)
		}
	}
	tala := call(t, CompileRequest{Text: "vars: {d2-config: {layout-engine: tala}}\na -> b\n"})
	if len(tala.Problems) != 1 || !strings.Contains(tala.Problems[0].Message, "tala") {
		t.Fatalf("got %+v", tala.Problems)
	}
}

// The page's background becomes the canvas, so a diagram has no box of its
// own, and only a plain hex colour is taken.
func TestBackground(t *testing.T) {
	plain := call(t, CompileRequest{Text: "a -> b\n"})
	page := call(t, CompileRequest{Text: "a -> b\n", Background: "#f6f7f9"})
	if plain.SVG == page.SVG || !strings.Contains(strings.ToLower(page.SVG), "#f6f7f9") {
		t.Fatal("the page's background was not used")
	}
	for _, bad := range []string{"red", "#fff", "#f6f7f9; } svg { display:none", "url(x)"} {
		if got := call(t, CompileRequest{Text: "a -> b\n", Background: bad}); got.SVG != plain.SVG {
			t.Errorf("%q changed the drawing", bad)
		}
	}
}

// The page's palette replaces D2's by role, only plain hex colours under
// D2's names are taken, and a diagram with a theme of its own keeps it.
func TestPagePalette(t *testing.T) {
	theme := map[string]string{"b1": "#123456", "b2": "#123456", "n1": "#654321", "b6": "#fedcba", "zz": "#111111", "b4": "red", "b3": "#12345"}
	res := call(t, CompileRequest{Text: "a -> b: label\n", Theme: theme})
	svg := strings.ToLower(res.SVG)
	for _, want := range []string{"#123456", "#654321", "#fedcba"} {
		if !strings.Contains(svg, want) {
			t.Errorf("the page's %s is not in the drawing", want)
		}
	}
	if strings.Contains(svg, "#0d32b2") {
		t.Error("D2's own accent is still drawn where the page gave one")
	}
	for _, own := range []string{"vars: {d2-config: {theme-id: 200}}\n", "vars: {d2-config: {theme-overrides: {B1: \"#aa0000\"}}}\n"} {
		got := strings.ToLower(call(t, CompileRequest{Text: own + "a -> b\n", Theme: theme}).SVG)
		if strings.Contains(got, "#123456") {
			t.Errorf("the page's palette replaced the diagram's own with %q", own)
		}
	}
}

func TestUnknownFunctionAndBadJSON(t *testing.T) {
	if out := Call("nothing", ""); !strings.Contains(out, "no function") {
		t.Fatal(out)
	}
	if out := Call("compile", "{"); !strings.Contains(out, "not valid JSON") {
		t.Fatal(out)
	}
}

func callJSON(t *testing.T, name string, req any, into any) string {
	t.Helper()
	arg, _ := json.Marshal(req)
	out := Call(name, string(arg))
	if err := json.Unmarshal([]byte(out), into); err != nil {
		t.Fatalf("not JSON: %s", out)
	}
	return out
}

// Completions come from D2's own language service: the shapes after
// "shape:" and the style names after "style.", counted from 0 as the
// service counts.
func TestCompletions(t *testing.T) {
	var res struct{ Items []Completion }
	callJSON(t, "completions", TextRequest{Text: "a.shape: ", Line: 0, Column: 9}, &res)
	has := func(label string) bool {
		for _, it := range res.Items {
			if it.Label == label {
				return true
			}
		}
		return false
	}
	if !has("cylinder") || !has("sequence_diagram") {
		t.Fatalf("shape completions lack cylinder or sequence_diagram: %+v", res.Items)
	}
	callJSON(t, "completions", TextRequest{Text: "a.style.", Line: 0, Column: 8}, &res)
	if !has("fill") || !has("stroke") {
		t.Fatalf("style completions lack fill or stroke: %+v", res.Items)
	}
	callJSON(t, "completions", TextRequest{Text: "a -> ", Line: 0, Column: 5}, &res)
	if res.Items == nil {
		t.Fatal("no completions is an empty list, not null")
	}
}

// Formatting writes the text as D2's formatter does, and a text with a
// mistake is left alone, its problems reported.
func TestFormat(t *testing.T) {
	var res struct {
		Text     string
		Problems []Problem
	}
	callJSON(t, "format", TextRequest{Text: "a:   {  shape: cylinder }\n# kept\na->b\n"}, &res)
	if !strings.Contains(res.Text, "a: {shape: cylinder}") || !strings.Contains(res.Text, "# kept") || !strings.Contains(res.Text, "a -> b") {
		t.Fatalf("formatted:\n%s", res.Text)
	}
	res.Text, res.Problems = "", nil
	callJSON(t, "format", TextRequest{Text: "a: {\n"}, &res)
	if len(res.Problems) == 0 || res.Text != "" {
		t.Fatalf("a broken text was formatted: %+v", res)
	}
}

// The outline is the diagram's shapes and connections, each with where it
// is written, in UTF-16 offsets, so a place found from the outline selects
// the right characters in CodeMirror even after a non-ASCII character.
func TestOutline(t *testing.T) {
	text := "# é\nweb: Web {\n  app: App\n}\ndb: {shape: cylinder}\nweb.app -> db: reads\nlayers: {\n  deploy: {\n    x\n  }\n}\n"
	var res OutlineResponse
	callJSON(t, "outline", TextRequest{Text: text}, &res)
	if len(res.Problems) != 0 {
		t.Fatalf("problems: %+v", res.Problems)
	}
	byID := map[string]Shape{}
	for _, s := range res.Shapes {
		byID[s.ID] = s
	}
	app, ok := byID["web.app"]
	if !ok || app.Parent != "web" || app.Label != "App" {
		t.Fatalf("web.app: %+v (all %+v)", app, res.Shapes)
	}
	if byID["db"].Shape != "cylinder" || byID["web"].Shape != "rectangle" {
		t.Fatalf("shapes: %+v", res.Shapes)
	}
	at := app.Places[0]
	// "# é\n" is four UTF-16 units, so "app" on line 3 starts where the
	// JavaScript string has it.
	js := strings.Index(text, "app: App") - 1 // é is two bytes, one unit
	if at.Line != 3 || at.From != js || at.To != js+3 {
		t.Fatalf("web.app is placed at %+v, want line 3 from %d", at, js)
	}
	if len(res.Connections) != 1 || res.Connections[0].From != "web.app" || res.Connections[0].To != "db" || res.Connections[0].Label != "reads" {
		t.Fatalf("connections: %+v", res.Connections)
	}
	if len(res.Boards) != 1 || res.Boards[0] != "deploy" {
		t.Fatalf("boards: %+v", res.Boards)
	}
	res = OutlineResponse{}
	callJSON(t, "outline", TextRequest{Text: "a: {\n"}, &res)
	if len(res.Problems) == 0 || res.Shapes == nil {
		t.Fatalf("a broken text: %+v", res)
	}
}

func TestTextRequestLimit(t *testing.T) {
	out := Call("outline", `{"text":"`+strings.Repeat("a", MaxSource+1)+`"}`)
	if !strings.Contains(out, `"error"`) {
		t.Fatalf("an oversized text was read: %.100s", out)
	}
}
