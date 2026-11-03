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

func TestUnknownFunctionAndBadJSON(t *testing.T) {
	if out := Call("nothing", ""); !strings.Contains(out, "no function") {
		t.Fatal(out)
	}
	if out := Call("compile", "{"); !strings.Contains(out, "not valid JSON") {
		t.Fatal(out)
	}
}
