// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package d2api is what the D2 engine offers the page (cmd/yavc-d2, compiled
// to WebAssembly and run in a worker; docs/diagrams-design.md): D2 itself,
// pinned to one release, turning a diagram's text into a drawing. Each
// function takes JSON text and returns JSON text, as internal/mdapi does,
// and the package has no build tag, so the functions are tested and fuzzed
// as any other package is, and cmd/yavc-d2 only puts them on the page.
//
//	compile(req)  -> {svg, width, height, problems, icons}
//	version()     -> {d2}
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

	"oss.terrastruct.com/d2/d2compiler"
	"oss.terrastruct.com/d2/d2graph"
	"oss.terrastruct.com/d2/d2layouts/d2dagrelayout"
	"oss.terrastruct.com/d2/d2layouts/d2elklayout"
	"oss.terrastruct.com/d2/d2lib"
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
}

var functions = map[string]func(string) (any, error){
	"compile": compile,
	"version": func(string) (any, error) { return map[string]string{"d2": D2Version()}, nil },
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

	if hexColour.MatchString(req.Background) {
		bg := req.Background
		if ropts.ThemeOverrides == nil {
			ropts.ThemeOverrides = &d2target.ThemeOverrides{}
		}
		if ropts.ThemeOverrides.N7 == nil {
			ropts.ThemeOverrides.N7 = &bg
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
	return &CompileResponse{SVG: string(svg), Width: br.X - tl.X + 2*pad, Height: br.Y - tl.Y + 2*pad, Icons: icons}, nil
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
