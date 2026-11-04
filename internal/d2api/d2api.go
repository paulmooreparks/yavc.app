// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package d2api is what the D2 engine offers the page (cmd/yavc-d2, compiled
// to WebAssembly and run in a worker; docs/diagrams-design.md): D2 itself,
// pinned to one release, turning a diagram's text into a drawing. Each
// function takes JSON text and returns JSON text, as internal/mdapi does,
// and the package has no build tag, so the functions are tested and fuzzed
// as any other package is, and cmd/yavc-d2 only puts them on the page.
//
//	compile(req)      -> {svg, width, height, problems, icons}
//	completions(req)  -> {items}
//	edit(req)         -> {text, key} or {problems}
//	format(req)       -> {text} or {problems}
//	outline(req)      -> {shapes, connections, boards, problems}
//	version()         -> {d2}
//
// A diagram's text is untrusted. The engine reads only the files it is
// given, never draws an icon that is not already a data address, refuses a
// source or a diagram over a limit, and returns a mistake in the text as a
// problem with a position, never as a failure of the engine.
package d2api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"regexp"
	"runtime/debug"
	"strings"

	"oss.terrastruct.com/d2/d2ast"
	"oss.terrastruct.com/d2/d2compiler"
	"oss.terrastruct.com/d2/d2format"
	"oss.terrastruct.com/d2/d2graph"
	"oss.terrastruct.com/d2/d2layouts/d2dagrelayout"
	"oss.terrastruct.com/d2/d2layouts/d2elklayout"
	"oss.terrastruct.com/d2/d2lib"
	"oss.terrastruct.com/d2/d2lsp"
	"oss.terrastruct.com/d2/d2oracle"
	"oss.terrastruct.com/d2/d2parser"
	"oss.terrastruct.com/d2/d2renderers/d2svg"
	"oss.terrastruct.com/d2/d2target"
	d2log "oss.terrastruct.com/d2/lib/log"
	"oss.terrastruct.com/d2/lib/memfs"
	"oss.terrastruct.com/d2/lib/textmeasure"
)

// Failed begins the error of a function that failed in a way nobody
// foresaw, so a test can tell it from an error the function meant.
const Failed = "the diagram engine failed: "

const (
	// MaxSource is the longest diagram text compiled, in bytes.
	MaxSource = 256 << 10
	// MaxObjects is the most shapes (containers included) a diagram may have
	// before it is laid out (docs/diagrams-design.md, decision 3). Dagre took
	// 1.5 s for 1,000 shapes in Chromium, growing about linearly, so 2,000
	// stays well inside the worker's 20 s limit (apps/diagram-kit/d2.js).
	MaxObjects = 2000
	// inputPath is the name the diagram's own text is given in the file map,
	// which is also the name an error's position refers to.
	inputPath = "index.d2"
)

// CompileRequest is what compile takes.
type CompileRequest struct {
	Text string `json:"text"`
	// Layout is "dagre" (the default) or "elk".
	Layout string `json:"layout,omitempty"`
	// ThemeID is one of D2's theme numbers; the page chooses a light or a
	// dark one from the site's mode. A theme-id in the diagram's own
	// d2-config block wins.
	ThemeID *int64 `json:"themeID,omitempty"`
	Sketch  bool   `json:"sketch,omitempty"`
	// Pad is the space around the drawing, in pixels.
	Pad *int64 `json:"pad,omitempty"`
	// Files are the other files an import may read, by name. Nothing else is
	// readable.
	Files map[string]string `json:"files,omitempty"`
	// Background is the page's colour behind the diagram, as #rrggbb, which
	// D2 then paints its canvas with, so a diagram sits on the page with no
	// box of its own. Anything that is not a plain hex colour is ignored, and
	// a diagram's own theme-overrides win.
	Background string `json:"background,omitempty"`
	// Theme is the page's colours for D2's palette, by the names D2 gives
	// its roles (n1 to n7 for the text through to the background, b1 to b6
	// for the accent through to its faintest tint, and aa2, aa4, aa5, ab4
	// and ab5), each #rrggbb, so a diagram takes the site's look
	// (docs/diagrams-design.md, decision 12). Anything else is ignored.
	Theme map[string]string `json:"theme,omitempty"`
}

// Problem is something in the text the engine cannot draw as written. Line
// and Column are 1-based, and 0 for a problem with the diagram as a whole. From and To are offsets into the text in UTF-16
// code units, which are the offsets a JavaScript string and CodeMirror use.
type Problem struct {
	Message string `json:"message"`
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	From    int    `json:"from"`
	To      int    `json:"to"`
}

// CompileResponse is what compile gives back. SVG is empty when there are
// problems.
type CompileResponse struct {
	SVG      string    `json:"svg,omitempty"`
	Width    int       `json:"width,omitempty"`
	Height   int       `json:"height,omitempty"`
	Problems []Problem `json:"problems,omitempty"`
	// Icons are the addresses of icons the diagram asked for and the engine
	// did not draw, because the page has not allowed them.
	Icons []string `json:"icons,omitempty"`
	// Shapes and Connections are where the drawing put each shape and
	// connection of the diagram's top board, in the drawing's own pixels
	// from its top-left corner, so the visual editor can tell what a click
	// lands on (docs/diagrams-design.md, decision 4: positions come from
	// D2's compiled diagram, never from the SVG). Each ID is the key the
	// edit function takes.
	Shapes      []ShapeBox       `json:"shapes,omitempty"`
	Connections []ConnectionPath `json:"connections,omitempty"`
}

// ShapeBox is a drawn shape: its full name, its kind and its box.
type ShapeBox struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
	W    int    `json:"w"`
	H    int    `json:"h"`
}

// ConnectionPath is a drawn connection: its key, its ends and its route.
// When Curve is false the line runs straight from point to point. When it
// is true the points after the first are cubic Bezier control points in
// threes, the third of each three an end of the segment, which is how D2's
// SVG renderer draws a curved route (d2svg pathData). D2 does not document
// that reading of a curved route, so it is a deliberate exception to the
// rule against relying on undocumented behaviour (Paul, 2026-11-04), held
// to D2's own drawing by TestCurvedRouteMatchesDrawing at the pinned
// release.
type ConnectionPath struct {
	ID     string       `json:"id"`
	From   string       `json:"from"`
	To     string       `json:"to"`
	Points [][2]float64 `json:"points"`
	Curve  bool         `json:"curve,omitempty"`
}

var functions = map[string]func(string) (any, error){
	"compile":     compile,
	"completions": completions,
	"edit":        edit,
	"format":      format,
	"outline":     outline,
	"version":     func(string) (any, error) { return map[string]string{"d2": D2Version()}, nil },
}

// TextRequest is what completions, format and outline take. Line and
// Column, for completions, are where the cursor is, counted from 0.
type TextRequest struct {
	Text   string `json:"text"`
	Line   int    `json:"line,omitempty"`
	Column int    `json:"column,omitempty"`
}

func textRequest(arg string) (TextRequest, error) {
	var req TextRequest
	if err := json.Unmarshal([]byte(arg), &req); err != nil {
		return req, errors.New("the request is not valid JSON")
	}
	if len(req.Text) > MaxSource {
		return req, fmt.Errorf("the diagram is over %d KB", MaxSource>>10)
	}
	return req, nil
}

// Completion is one thing D2's language service offers to type at the
// cursor. Insert is the text to put in, when it differs from Label.
type Completion struct {
	Label  string `json:"label"`
	Detail string `json:"detail,omitempty"`
	Insert string `json:"insert,omitempty"`
	Kind   string `json:"kind"`
}

// completions is D2's own language service (d2lsp), which knows the
// keywords, the shapes, the style names and the values each takes.
func completions(arg string) (any, error) {
	req, err := textRequest(arg)
	if err != nil {
		return nil, err
	}
	items, err := d2lsp.GetCompletionItems(req.Text, req.Line, req.Column)
	if err != nil {
		return map[string]any{"items": []Completion{}}, nil
	}
	kinds := map[d2lsp.CompletionKind]string{d2lsp.KeywordCompletion: "keyword", d2lsp.StyleCompletion: "style", d2lsp.ShapeCompletion: "shape"}
	out := make([]Completion, 0, len(items))
	for _, it := range items {
		c := Completion{Label: it.Label, Detail: it.Detail, Kind: kinds[it.Kind]}
		if c.Kind == "" {
			c.Kind = "value"
		}
		if it.InsertText != "" && it.InsertText != it.Label {
			c.Insert = it.InsertText
		}
		out = append(out, c)
	}
	return map[string]any{"items": out}, nil
}

// format is the text as D2's formatter writes it, which is how the visual
// editor's edits will write it too (docs/diagrams-design.md, decision 5).
// A text with a mistake in it is not formatted, and its problems are
// returned instead.
func format(arg string) (any, error) {
	req, err := textRequest(arg)
	if err != nil {
		return nil, err
	}
	ast, err := d2parser.Parse(inputPath, strings.NewReader(req.Text), &d2parser.ParseOptions{UTF16Pos: true})
	if err != nil {
		return map[string]any{"problems": problemsOf(err, req.Text)}, nil
	}
	return map[string]any{"text": d2format.Format(ast)}, nil
}

// Place is where something is written in the text: 1-based lines and
// columns, and UTF-16 offsets as Problem has.
type Place struct {
	Line   int `json:"line"`
	Column int `json:"column"`
	From   int `json:"from"`
	To     int `json:"to"`
}

// Shape is one object of the diagram in an outline: a shape or a
// container, by its full name (a.b for b inside a).
type Shape struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	Shape  string  `json:"shape"`
	Parent string  `json:"parent,omitempty"`
	Places []Place `json:"places"`
	// Style is the shape's own style settings, by D2's names (fill,
	// stroke-dash, bold); Icon, Link and Tooltip are set when it has them.
	// The inspector shows them.
	Style   map[string]string `json:"style,omitempty"`
	Icon    string            `json:"icon,omitempty"`
	Link    string            `json:"link,omitempty"`
	Tooltip string            `json:"tooltip,omitempty"`
}

// Connection is one connection of the diagram in an outline.
type Connection struct {
	ID     string  `json:"id"`
	From   string  `json:"from"`
	To     string  `json:"to"`
	Label  string  `json:"label,omitempty"`
	Places []Place `json:"places"`
	// Arrows is the connection's direction as written: ->, <-, <-> or --.
	Arrows string `json:"arrows"`
	// Source and Target are its arrowheads' settings, when it has any.
	Source *Arrowhead        `json:"source,omitempty"`
	Target *Arrowhead        `json:"target,omitempty"`
	Style  map[string]string `json:"style,omitempty"`
}

// Arrowhead is one end of a connection: its shape (triangle, diamond,
// cf-many and the rest) and the label beside it.
type Arrowhead struct {
	Shape string `json:"shape,omitempty"`
	Label string `json:"label,omitempty"`
}

// styleOf is a style's settings by D2's own names, leaving out the ones not
// set; nil when none are.
func styleOf(st d2graph.Style) map[string]string {
	out := map[string]string{}
	for name, v := range map[string]*d2graph.Scalar{
		"opacity": st.Opacity, "stroke": st.Stroke, "fill": st.Fill, "fill-pattern": st.FillPattern, "stroke-width": st.StrokeWidth,
		"stroke-dash": st.StrokeDash, "border-radius": st.BorderRadius, "shadow": st.Shadow, "3d": st.ThreeDee, "multiple": st.Multiple,
		"font": st.Font, "font-size": st.FontSize, "font-color": st.FontColor, "animated": st.Animated, "bold": st.Bold, "italic": st.Italic,
		"underline": st.Underline, "filled": st.Filled, "double-border": st.DoubleBorder, "text-transform": st.TextTransform,
	} {
		if v != nil {
			out[name] = v.Value
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func arrowheadOf(a *d2graph.Attributes) *Arrowhead {
	if a == nil || (a.Shape.Value == "" && a.Label.Value == "") {
		return nil
	}
	return &Arrowhead{Shape: a.Shape.Value, Label: a.Label.Value}
}

func arrowsOf(e *d2graph.Edge) string {
	switch {
	case e.SrcArrow && e.DstArrow:
		return "<->"
	case e.SrcArrow:
		return "<-"
	case e.DstArrow:
		return "->"
	}
	return "--"
}

// OutlineResponse is the diagram's structure, for the Outline pane, an
// agent and the visual editor: its shapes and connections in text order,
// each with where it is written, and the names of its boards.
type OutlineResponse struct {
	Shapes      []Shape      `json:"shapes"`
	Connections []Connection `json:"connections"`
	Boards      []string     `json:"boards,omitempty"`
	Problems    []Problem    `json:"problems,omitempty"`
}

func placeOf(r d2ast.Range, n int) Place {
	return Place{Line: r.Start.Line + 1, Column: r.Start.Column + 1, From: clamp(r.Start.Byte, n), To: clamp(r.End.Byte, n)}
}

// outline compiles the text without laying it out, which is quick, and
// reads the structure D2's compiler documents.
func outline(arg string) (any, error) {
	req, err := textRequest(arg)
	if err != nil {
		return nil, err
	}
	fsys, err := memfs.New(map[string]string{inputPath: req.Text})
	if err != nil {
		return nil, errors.New("the diagram is not usable")
	}
	g, _, err := d2compiler.Compile(inputPath, strings.NewReader(req.Text), &d2compiler.CompileOptions{UTF16Pos: true, FS: fsys})
	if err != nil {
		return &OutlineResponse{Shapes: []Shape{}, Connections: []Connection{}, Problems: problemsOf(err, req.Text)}, nil
	}
	if len(g.Objects) > MaxObjects {
		return &OutlineResponse{Shapes: []Shape{}, Connections: []Connection{}, Problems: []Problem{{Message: fmt.Sprintf("The diagram has %d shapes, which is more than the %d Diagrams will read.", len(g.Objects), MaxObjects)}}}, nil
	}
	n := len(req.Text)
	out := &OutlineResponse{Shapes: make([]Shape, 0, len(g.Objects)), Connections: make([]Connection, 0, len(g.Edges))}
	for _, o := range g.Objects {
		s := Shape{ID: o.AbsID(), Label: o.Label.Value, Shape: o.Shape.Value, Places: []Place{}, Style: styleOf(o.Style)}
		if o.Icon != nil {
			s.Icon = o.Icon.String()
		}
		if o.Link != nil {
			s.Link = o.Link.Value
		}
		if o.Tooltip != nil {
			s.Tooltip = o.Tooltip.Value
		}
		if s.Shape == "" {
			s.Shape = "rectangle"
		}
		if o.Parent != nil && o.Parent != g.Root {
			s.Parent = o.Parent.AbsID()
		}
		for _, ref := range o.References {
			if ref.Key != nil && ref.Key.Range.Path == inputPath {
				s.Places = append(s.Places, placeOf(ref.Key.Range, n))
			}
		}
		out.Shapes = append(out.Shapes, s)
	}
	for _, e := range g.Edges {
		c := Connection{ID: e.AbsID(), From: e.Src.AbsID(), To: e.Dst.AbsID(), Label: e.Label.Value, Places: []Place{},
			Arrows: arrowsOf(e), Source: arrowheadOf(e.SrcArrowhead), Target: arrowheadOf(e.DstArrowhead), Style: styleOf(e.Style)}
		for _, ref := range e.References {
			if ref.Edge != nil && ref.Edge.Range.Path == inputPath {
				c.Places = append(c.Places, placeOf(ref.Edge.Range, n))
			}
		}
		out.Connections = append(out.Connections, c)
	}
	for _, boards := range [][]*d2graph.Graph{g.Layers, g.Scenarios, g.Steps} {
		for _, b := range boards {
			out.Boards = append(out.Boards, b.Name)
		}
	}
	return out, nil
}

// Names is the functions Call knows, in no particular order.
func Names() []string {
	out := make([]string, 0, len(functions))
	for name := range functions {
		out = append(out, name)
	}
	return out
}

// Call runs the function called name on arg and returns its answer as JSON
// text, or {"error": "..."} when it cannot. A panic inside the function is
// recovered and returned as an error beginning with Failed.
func Call(name, arg string) (out string) {
	defer func() {
		if r := recover(); r != nil {
			out = encode(nil, fmt.Errorf("%s%s: %v", Failed, name, r))
		}
	}()
	f, ok := functions[name]
	if !ok {
		return encode(nil, fmt.Errorf("there is no function called %s", name))
	}
	v, err := f(arg)
	return encode(v, err)
}

func encode(v any, err error) string {
	if err == nil {
		var b []byte
		if b, err = json.Marshal(v); err == nil {
			return string(b)
		}
	}
	b, _ := json.Marshal(map[string]string{"error": err.Error()})
	return string(b)
}

// D2Version is the release of D2 this build contains, as the module system
// recorded it, so a test notices when the pin moves.
func D2Version() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, dep := range info.Deps {
			if dep.Path == "oss.terrastruct.com/d2" {
				return dep.Version
			}
		}
	}
	return "unknown"
}

// elkInBuild says whether this build can lay out with ELK. Natively it can,
// through the JavaScript interpreter D2 bundles. In the browser D2 expects
// its own worker to have loaded ELK and a setup script that makes ELK's
// asynchronous layout run synchronously; that arrangement is private to D2
// and undocumented, so the browser build does not rely on it and refuses
// ELK until Paul decides (docs/diagrams-design.md, open question 7).
var elkInBuild = true

// errNoELK is the problem a diagram that asks for ELK gets where ELK is not
// in the build.
const errNoELK = "This diagram asks for the ELK layout, which Diagrams cannot draw in the browser yet. Take out layout-engine: elk to draw it with dagre."

func layoutResolver(engine string) (d2graph.LayoutGraph, error) {
	switch engine {
	case "dagre":
		return d2dagrelayout.DefaultLayout, nil
	case "elk":
		if !elkInBuild {
			return nil, errors.New(errNoELK)
		}
		return d2elklayout.DefaultLayout, nil
	}
	return nil, fmt.Errorf("the layout %q is not one of dagre or elk", engine)
}

func compile(arg string) (any, error) {
	var req CompileRequest
	if err := json.Unmarshal([]byte(arg), &req); err != nil {
		return nil, errors.New("the request is not valid JSON")
	}
	if len(req.Text) > MaxSource {
		return problem(fmt.Sprintf("The diagram is over %d KB, which is more than Diagrams will draw.", MaxSource>>10), 0, 0, 0, 0), nil
	}
	if req.Layout != "" {
		if _, err := layoutResolver(req.Layout); err != nil {
			if req.Layout == "elk" {
				return problem(errNoELK, 0, 0, 0, 0), nil
			}
			return nil, err
		}
	}

	// Only the diagram's own text and the files it was given can be read.
	files := map[string]string{inputPath: req.Text}
	for name, text := range req.Files {
		if name != inputPath {
			files[name] = text
		}
	}
	fsys, err := memfs.New(files)
	if err != nil {
		return nil, errors.New("the files given with the diagram are not usable")
	}

	// Read the text first, so that a mistake in it and a diagram too large
	// to draw are reported before any layout is run.
	g, config, err := d2compiler.Compile(inputPath, strings.NewReader(req.Text), &d2compiler.CompileOptions{UTF16Pos: true, FS: fsys})
	if err != nil {
		return &CompileResponse{Problems: problemsOf(err, req.Text)}, nil
	}
	if len(g.Objects) > MaxObjects {
		return problem(fmt.Sprintf("The diagram has %d shapes, which is more than the %d Diagrams will draw.", len(g.Objects), MaxObjects), 0, 0, 0, 0), nil
	}

	// A diagram's own d2-config block wins over what the page asks for
	// (docs/diagrams-design.md, decisions 6 and 12). D2 gives the caller's
	// options precedence, so the page's are passed only where the file sets
	// nothing.
	layout := req.Layout
	if config != nil && config.LayoutEngine != nil {
		layout = *config.LayoutEngine
		if _, err := layoutResolver(layout); err != nil {
			if layout == "elk" {
				return problem(errNoELK, 0, 0, 0, 0), nil
			}
			return problem("The layout engine "+layout+" is not available here; Diagrams draws with dagre.", 1, 1, 0, 0), nil
		}
	}
	if layout == "" {
		layout = "dagre"
	}
	ropts := &d2svg.RenderOpts{Pad: req.Pad}
	if config == nil || config.ThemeID == nil {
		ropts.ThemeID = req.ThemeID
	}
	if req.Sketch && (config == nil || config.Sketch == nil) {
		sketch := true
		ropts.Sketch = &sketch
	}

	ruler, err := textmeasure.NewRuler()
	if err != nil {
		return nil, fmt.Errorf("text cannot be measured: %w", err)
	}
	copts := &d2lib.CompileOptions{UTF16Pos: true, FS: fsys, InputPath: inputPath, Layout: &layout, LayoutResolver: layoutResolver, Ruler: ruler}
	// D2 logs through a logger in the context and prints a stack trace when
	// there is none; nothing it logs is for the reader.
	ctx := d2log.With(context.Background(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	diagram, _, err := d2lib.Compile(ctx, req.Text, copts, ropts)
	if err != nil {
		return &CompileResponse{Problems: problemsOf(err, req.Text)}, nil
	}

	// The page's palette replaces D2's, unless the diagram chose its own
	// theme or colours, which win. D2 lets a file's theme-overrides replace
	// the caller's as the diagram compiles, so the page's are set after.
	if config == nil || (config.ThemeID == nil && config.ThemeOverrides == nil) {
		if ov := pagePalette(req); ov != nil {
			ropts.ThemeOverrides = ov
		}
	}
	icons := blockIcons(diagram)
	svg, err := d2svg.Render(diagram, ropts)
	if err != nil {
		return nil, fmt.Errorf("the diagram could not be drawn: %w", err)
	}
	pad := 100
	if ropts.Pad != nil {
		pad = int(*ropts.Pad)
	}
	tl, br := diagram.BoundingBox()
	res := &CompileResponse{SVG: string(svg), Width: br.X - tl.X + 2*pad, Height: br.Y - tl.Y + 2*pad, Icons: icons}
	// The drawing's top-left corner is the bounding box's, less the
	// padding, as D2's renderer sets out its view box.
	ox, oy := tl.X-pad, tl.Y-pad
	for _, sh := range diagram.Shapes {
		res.Shapes = append(res.Shapes, ShapeBox{ID: sh.ID, Type: sh.Type, X: sh.Pos.X - ox, Y: sh.Pos.Y - oy, W: sh.Width, H: sh.Height})
	}
	for _, c := range diagram.Connections {
		cp := ConnectionPath{ID: c.ID, From: c.Src, To: c.Dst, Points: make([][2]float64, 0, len(c.Route)), Curve: c.IsCurve}
		for _, pt := range c.Route {
			cp.Points = append(cp.Points, [2]float64{pt.X - float64(ox), pt.Y - float64(oy)})
		}
		res.Connections = append(res.Connections, cp)
	}
	return res, nil
}

func problem(message string, line, column, from, to int) *CompileResponse {
	return &CompileResponse{Problems: []Problem{{Message: message, Line: line, Column: column, From: from, To: to}}}
}

// problemsOf turns what D2 reports about a text into positions in it.
func problemsOf(err error, text string) []Problem {
	var pe *d2parser.ParseError
	if errors.As(err, &pe) && len(pe.Errors) > 0 {
		out := make([]Problem, 0, len(pe.Errors))
		for _, e := range pe.Errors {
			// D2 begins each message with the file, line and column, which
			// are reported apart and would only repeat the engine's own
			// name for the text.
			out = append(out, Problem{Message: placePrefix.ReplaceAllString(e.Message, ""), Line: e.Range.Start.Line + 1, Column: e.Range.Start.Column + 1, From: clamp(e.Range.Start.Byte, len(text)), To: clamp(e.Range.End.Byte, len(text))})
		}
		return out
	}
	return []Problem{{Message: err.Error(), Line: 1, Column: 1}}
}

var (
	placePrefix = regexp.MustCompile(`^[^\s:]+:\d+:\d+:\s*`)
	hexColour   = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

func clamp(n, max int) int {
	if n < 0 {
		return 0
	}
	if n > max {
		return max
	}
	return n
}

// pagePalette is the page's colours as D2's theme overrides, or nil when
// the page gave none. The background, when given apart, is the canvas, N7.
func pagePalette(req CompileRequest) *d2target.ThemeOverrides {
	ov := &d2target.ThemeOverrides{}
	slots := map[string]**string{
		"n1": &ov.N1, "n2": &ov.N2, "n3": &ov.N3, "n4": &ov.N4, "n5": &ov.N5, "n6": &ov.N6, "n7": &ov.N7,
		"b1": &ov.B1, "b2": &ov.B2, "b3": &ov.B3, "b4": &ov.B4, "b5": &ov.B5, "b6": &ov.B6,
		"aa2": &ov.AA2, "aa4": &ov.AA4, "aa5": &ov.AA5, "ab4": &ov.AB4, "ab5": &ov.AB5,
	}
	any := false
	for name, value := range req.Theme {
		if slot, ok := slots[name]; ok && hexColour.MatchString(value) {
			v := value
			*slot = &v
			any = true
		}
	}
	if hexColour.MatchString(req.Background) {
		bg := req.Background
		ov.N7 = &bg
		any = true
	}
	if !any {
		return nil
	}
	return ov
}

// missingPicture is drawn where an image shape's picture was not allowed.
func missingPicture() *url.URL {
	u, _ := url.Parse("data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="0.5" y="0.5" width="15" height="15" fill="none" stroke="#8a8f98" stroke-dasharray="2 2"/></svg>`)))
	return u
}

// blockIcons takes out every icon that is not a data address, from the
// diagram and its boards, and returns their addresses. D2 draws an icon as
// an image that the browser would load, and a diagram someone else wrote
// must not make a reader's browser contact another host (DESIGN.md,
// decision 6). It works on the compiled structure, which D2 documents, and
// never on the drawing.
func blockIcons(d *d2target.Diagram) []string {
	var found []string
	seen := map[string]bool{}
	note := func(icon string) {
		if !seen[icon] {
			seen[icon] = true
			found = append(found, icon)
		}
	}
	var walk func(*d2target.Diagram)
	walk = func(d *d2target.Diagram) {
		if d == nil {
			return
		}
		if d.Root.Icon != nil && d.Root.Icon.Scheme != "data" {
			note(d.Root.Icon.String())
			d.Root.Icon = nil
		}
		for i := range d.Shapes {
			if ic := d.Shapes[i].Icon; ic != nil && ic.Scheme != "data" {
				note(ic.String())
				d.Shapes[i].Icon = nil
				// An image shape is its picture, and D2 cannot draw one
				// without it, so it gets an empty dashed frame instead.
				if d.Shapes[i].Type == d2target.ShapeImage {
					d.Shapes[i].Icon = missingPicture()
				}
			}
		}
		for i := range d.Connections {
			if ic := d.Connections[i].Icon; ic != nil && ic.Scheme != "data" {
				note(ic.String())
				d.Connections[i].Icon = nil
			}
		}
		for _, boards := range [][]*d2target.Diagram{d.Layers, d.Scenarios, d.Steps} {
			for _, b := range boards {
				walk(b)
			}
		}
	}
	walk(d)
	return found
}

// EditRequest is one change to a diagram, as the visual editor makes it
// (docs/diagrams-design.md, decision 5): D2's own oracle (d2oracle) edits
// the text, keeping its comments and updating every reference, and the
// text comes back as D2's formatter writes it. Op is one of:
//
//	create     Key is the new shape (a.b for b inside a); a name already
//	           taken gets a number, and Key in the answer is the one used.
//	           A key with an arrow, such as "a -> b", is a connection.
//	set        Key is what to set, such as a, a.shape or a.style.fill, and
//	           Value its value; no Value takes the value away.
//	delete     Key is a shape or a connection, such as (a -> b)[0]; a
//	           shape's connections go with it.
//	rename     Key is a shape, Name its new name, and every reference to it
//	           follows.
//	move       Key is a shape and To its new full name, which moves it into
//	           or out of a container; Descendants moves what is inside it
//	           too.
//	reconnect  Key is a connection, and From and To its new ends.
//	arrows     Key is a connection, and Value its direction: ->, <-, <->
//	           or --. Every place the connection is written changes, so
//	           settings given it elsewhere still reach it.
type EditRequest struct {
	Text        string  `json:"text"`
	Op          string  `json:"op"`
	Key         string  `json:"key"`
	Value       *string `json:"value,omitempty"`
	Name        string  `json:"name,omitempty"`
	From        *string `json:"from,omitempty"`
	To          *string `json:"to,omitempty"`
	Descendants bool    `json:"descendants,omitempty"`
	// Shape, with create, is the new shape's kind, such as cylinder, set in
	// the same change so that one Undo takes the whole placing back. With a
	// connection's key it is the kind of the shape at its far end, when the
	// connection makes that shape.
	Shape string `json:"shape,omitempty"`
}

// EditResponse is the text after the change, and the key the change made
// or changed, or the problems that stopped it, in which case the text is
// unchanged and empty here.
type EditResponse struct {
	Text     string    `json:"text,omitempty"`
	Key      string    `json:"key,omitempty"`
	Problems []Problem `json:"problems,omitempty"`
}

func edit(arg string) (any, error) {
	var req EditRequest
	if err := json.Unmarshal([]byte(arg), &req); err != nil {
		return nil, errors.New("the request is not valid JSON")
	}
	if len(req.Text) > MaxSource {
		return nil, fmt.Errorf("the diagram is over %d KB", MaxSource>>10)
	}
	if strings.TrimSpace(req.Key) == "" {
		return &EditResponse{Problems: []Problem{{Message: "The change does not say which shape or connection it is for."}}}, nil
	}
	fsys, err := memfs.New(map[string]string{inputPath: req.Text})
	if err != nil {
		return nil, errors.New("the diagram is not usable")
	}
	g, _, err := d2compiler.Compile(inputPath, strings.NewReader(req.Text), &d2compiler.CompileOptions{FS: fsys})
	if err != nil {
		// A visual edit needs a diagram that compiles (decision 5).
		return &EditResponse{Problems: problemsOf(err, req.Text)}, nil
	}
	key := req.Key
	switch req.Op {
	case "create":
		had := map[string]bool{}
		for _, o := range g.Objects {
			had[o.AbsID()] = true
		}
		g, key, err = d2oracle.Create(g, nil, req.Key)
		if err == nil && req.Shape != "" && req.Shape != "rectangle" {
			target := key
			if mk, perr := d2parser.ParseMapKey(req.Key); perr == nil && len(mk.Edges) == 1 {
				// The far end, when the connection made it.
				target = ""
				if dst := lastObject(g); dst != "" && !had[dst] {
					target = dst
				}
			}
			if target != "" {
				shape := req.Shape
				g, err = d2oracle.Set(g, nil, target+".shape", nil, &shape)
			}
		}
	case "set":
		if req.Value == nil {
			// No value takes a setting away. D2's delete does that for a
			// style, an arrowhead, an icon, a link or a tooltip; a shape's
			// kind goes back to D2's own, the rectangle, written out, since
			// the delete leaves it; and a shape or a connection itself is
			// never taken away by a set, which would delete it.
			switch {
			case strings.HasSuffix(req.Key, ".shape") && !strings.Contains(req.Key, "-arrowhead"):
				rect := "rectangle"
				g, err = d2oracle.Set(g, nil, req.Key, nil, &rect)
			case settingKey.MatchString(req.Key):
				g, err = d2oracle.Delete(g, nil, req.Key)
			default:
				return &EditResponse{Problems: []Problem{{Message: "Only a setting can be taken away by setting nothing; to remove " + req.Key + " itself, delete it."}}}, nil
			}
		} else {
			g, err = d2oracle.Set(g, nil, req.Key, nil, req.Value)
		}
	case "delete":
		g, err = d2oracle.Delete(g, nil, req.Key)
	case "rename":
		if strings.TrimSpace(req.Name) == "" {
			return &EditResponse{Problems: []Problem{{Message: "A shape needs a name."}}}, nil
		}
		g, key, err = d2oracle.Rename(g, nil, req.Key, req.Name)
	case "move":
		if req.To == nil || strings.TrimSpace(*req.To) == "" {
			return &EditResponse{Problems: []Problem{{Message: "A move needs the shape's new name."}}}, nil
		}
		g, err = d2oracle.Move(g, nil, req.Key, *req.To, req.Descendants)
		key = *req.To
	case "reconnect":
		// The connection's key changes with its ends; the one it has
		// afterwards is found by its new ends and the line it is on.
		line, src, dst := -1, "", ""
		for _, e := range g.Edges {
			if e.AbsID() == req.Key {
				src, dst = e.Src.AbsID(), e.Dst.AbsID()
				for _, ref := range e.References {
					if ref.Edge != nil && line < 0 {
						line = ref.Edge.Range.Start.Line
					}
				}
			}
		}
		g, err = d2oracle.ReconnectEdge(g, nil, req.Key, req.From, req.To)
		if err == nil {
			if req.From != nil {
				src = *req.From
			}
			if req.To != nil {
				dst = *req.To
			}
			if k := edgeKeyAt(g, src, dst, "", line); k != "" {
				key = k
			}
		}
	case "arrows":
		if req.Value == nil {
			return &EditResponse{Problems: []Problem{{Message: "A direction is one of ->, <-, <-> or --."}}}, nil
		}
		g, key, err = setArrows(g, req.Key, *req.Value)
	default:
		return nil, fmt.Errorf("there is no edit called %q", req.Op)
	}
	if err != nil {
		return &EditResponse{Problems: []Problem{{Message: oracleMessage(err)}}}, nil
	}
	text := d2format.Format(g.AST)
	if len(text) > MaxSource {
		return &EditResponse{Problems: []Problem{{Message: fmt.Sprintf("The change would make the diagram over %d KB.", MaxSource>>10)}}}, nil
	}
	if len(g.Objects) > MaxObjects {
		return &EditResponse{Problems: []Problem{{Message: fmt.Sprintf("The change would give the diagram more than %d shapes.", MaxObjects)}}}, nil
	}
	return &EditResponse{Text: text, Key: key}, nil
}

// oracleMessage is the oracle's error as a person reads it: its own words
// after the "failed to ..." wrappers it adds, which repeat the request.
func oracleMessage(err error) string {
	msg := err.Error()
	if i := strings.LastIndex(msg, ": "); i >= 0 && strings.HasPrefix(msg, "failed to ") {
		msg = msg[i+2:]
	}
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return "The change could not be made."
	}
	return strings.ToUpper(msg[:1]) + msg[1:] + "."
}

// lastObject is the full name of the object a compile lists last, which
// after a connection is created is the shape that connection made, if it
// made one.
func lastObject(g *d2graph.Graph) string {
	if len(g.Objects) == 0 {
		return ""
	}
	return g.Objects[len(g.Objects)-1].AbsID()
}

// settingKey matches a key whose last part is one of a shape's or a
// connection's settings, which D2's delete takes away on its own.
var settingKey = regexp.MustCompile(`\.(style\.[a-z0-9-]+|icon|link|tooltip|near|width|height|(source|target)-arrowhead(\.(shape|label))?)$`)

// setArrows changes a connection's direction. D2's oracle has no edit for
// it, so the arrows are changed on the parsed text, at every reference to
// the connection, since a connection is known by its arrows and a setting
// written elsewhere as (a -> b)[0].style.x must still reach it; the text
// is then written by D2's formatter and compiled again, and the key the
// connection has afterwards is found by its ends and the line it starts on.
func setArrows(g *d2graph.Graph, key, arrows string) (*d2graph.Graph, string, error) {
	src, dst := "", ""
	switch arrows {
	case "->":
		dst = ">"
	case "<-":
		src = "<"
	case "<->":
		src, dst = "<", ">"
	case "--":
	default:
		return nil, "", fmt.Errorf("a direction is one of ->, <-, <-> or --, not %q", arrows)
	}
	var edge *d2graph.Edge
	for _, e := range g.Edges {
		if e.AbsID() == key {
			edge = e
		}
	}
	if edge == nil {
		return nil, "", fmt.Errorf("there is no connection %s", key)
	}
	line := -1
	for _, ref := range edge.References {
		if ref.Edge == nil {
			continue
		}
		if line < 0 {
			line = ref.Edge.Range.Start.Line
		}
		ref.Edge.SrcArrow, ref.Edge.DstArrow = src, dst
	}
	text := d2format.Format(g.AST)
	fsys, err := memfs.New(map[string]string{inputPath: text})
	if err != nil {
		return nil, "", err
	}
	g2, _, err := d2compiler.Compile(inputPath, strings.NewReader(text), &d2compiler.CompileOptions{FS: fsys})
	if err != nil {
		return nil, "", err
	}
	return g2, edgeKeyAt(g2, edge.Src.AbsID(), edge.Dst.AbsID(), arrows, line), nil
}

// edgeKeyAt is the key of the connection from src to dst (with the given
// arrows, or any when empty) written on line, or of the first such
// connection when none is on that line.
func edgeKeyAt(g *d2graph.Graph, src, dst, arrows string, line int) string {
	found := ""
	for _, e := range g.Edges {
		if e.Src.AbsID() != src || e.Dst.AbsID() != dst || (arrows != "" && arrowsOf(e) != arrows) {
			continue
		}
		if found == "" {
			found = e.AbsID()
		}
		for _, ref := range e.References {
			if ref.Edge != nil && ref.Edge.Range.Start.Line == line {
				return e.AbsID()
			}
		}
	}
	return found
}
