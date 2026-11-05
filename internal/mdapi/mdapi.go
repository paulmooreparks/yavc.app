// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package mdapi is what the Markdown engine the Editor runs in the browser
// offers the page (cmd/yavc-md, compiled to WebAssembly): the preview
// renderer, the page view's parser and serializer, the shortcodes and the
// front matter, each a function that takes text and returns JSON text.
// It has no build tag, so the functions are tested and fuzzed as any other
// package is, and cmd/yavc-md only puts them on the page.
//
//	preview(text)    -> {blocks: [{line, html, diagrams}], problems: [{line, severity, message}]}
//	doc(text)        -> the page view's document, a ProseMirror document as JSON
//	markdown(doc)    -> the document's text
//	blocks(text)     -> new blocks for the page to insert
//	container(line)  -> a container shortcode's parts, from its opening line
//	inline(raw)      -> {html}, an inline shortcode drawn as the page draws it
//	glyphs()         -> PUDL's glyph names
//	front(text)      -> the document's front matter, read
//	frontset(req)    -> {text}, the document with its front matter changed
//	source(src)      -> {html, diagrams}, a block's source drawn as the preview draws it
//
// Each returns {error: "..."} as JSON when it cannot, and a function that
// fails in a way nobody foresaw returns that too, rather than stopping the
// engine for the rest of the page's life.
package mdapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"yavc.app/internal/frontmatter"
	"yavc.app/internal/pageview"
	"yavc.app/internal/preview"
	"yavc.app/internal/shortcodes"
)

// Failed begins the error of a function that failed in a way nobody
// foresaw, so a test can tell it from an error the function meant.
const Failed = "the Markdown engine failed: "

type problem struct {
	Line     int    `json:"line"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
}

func render(text string) ([]preview.Block, []problem) {
	blocks, found := preview.Render(text)
	if blocks == nil {
		blocks = []preview.Block{}
	}
	problems := []problem{}
	for _, p := range found {
		problems = append(problems, problem{Line: p.Line, Severity: "warning", Message: p.Message})
	}
	return blocks, problems
}

var functions = map[string]func(string) (any, error){
	"outline": func(source string) (any, error) { return outline(source), nil },
	"outline-state": func(source string) (any, error) {
		return map[string]any{"entries": outline(source), "revision": sourceRevision(source)}, nil
	},
	"section-move": moveSection,
	"export-preview": func(request string) (any, error) {
		var r struct{ Text, Definitions, Shared string }
		if err := json.Unmarshal([]byte(request), &r); err != nil {
			return nil, err
		}
		registry := shortcodes.DiscoverMacros(r.Definitions, r.Shared)
		blocks, problems, err := preview.RenderExport(r.Text, registry)
		if err != nil {
			return nil, err
		}
		calls, err := shortcodes.ExportCalls(r.Text, registry, "slide")
		settings := map[string]string{}
		if len(calls) > 0 {
			settings = calls[0].Named
		}
		if blocks == nil {
			blocks = []preview.Block{}
		}
		return map[string]any{"blocks": blocks, "problems": problems, "slideSettings": settings}, err
	},
	"macro-context": func(request string) (any, error) {
		var r struct{ Op, Text, Definitions, Shared string }
		if err := json.Unmarshal([]byte(request), &r); err != nil {
			return nil, err
		}
		registry := shortcodes.DiscoverMacros(r.Definitions, r.Shared)
		if r.Op == "catalog" {
			for i := range registry.Entries {
				entry := &registry.Entries[i]
				source := r.Definitions
				if entry.Shared {
					source = r.Shared
				}
				entry.From = utf16Length(source[:entry.From])
				entry.To = utf16Length(source[:entry.To])
			}
			return registry, nil
		}
		blocks, _ := preview.RenderWithMacros(r.Text, registry)
		switch r.Op {
		case "preview":
			return map[string]any{"blocks": blocks, "problems": []problem{}}, nil
		case "doc":
			return pageview.ParseDocumentWithMacros(r.Text, pageview.Units(blocks), registry), nil
		case "blocks":
			return pageview.Fresh(pageview.ParseDocumentWithMacros(r.Text, pageview.Units(blocks), registry).Content), nil
		case "container":
			c, ok := registry.ContainerOf(r.Text)
			if !ok {
				c, ok = shortcodes.ContainerOf(r.Text)
			}
			if !ok {
				return nil, errors.New("not a rich container's opening line")
			}
			return map[string]any{"name": c.Name, "args": c.Args, "before": c.Before, "after": c.After, "sep": c.Separator, "open": shortcodes.OpenLine(c.Name, c.Args)}, nil
		case "inline":
			return map[string]any{"html": shortcodes.InlineHTMLWithMacros(r.Text, registry)}, nil
		case "source":
			var output strings.Builder
			diagrams := []preview.Diagram{}
			for _, unit := range pageview.Units(blocks) {
				output.WriteString(unit.HTML)
				diagrams = append(diagrams, unit.Diagrams...)
			}
			return map[string]any{"html": output.String(), "diagrams": diagrams}, nil
		}
		return nil, errors.New("unknown macro context operation")
	},
	"styles": func(source string) (any, error) {
		out := []map[string]any{}
		position, units := 0, 0
		count := func(value string) int {
			n := 0
			for _, r := range value {
				n++
				if r > 0xffff {
					n++
				}
			}
			return n
		}
		for _, block := range shortcodes.StyleBlocks(source) {
			units += count(source[position:block.From])
			from := units
			units += count(source[block.From:block.To])
			position = block.To
			out = append(out, map[string]any{"css": block.CSS, "slide": block.Slide,
				"from": from, "to": units})
		}
		return out, nil
	},
	"preview": func(text string) (any, error) {
		blocks, problems := render(text)
		return map[string]any{"blocks": blocks, "problems": problems}, nil
	},
	"doc": func(text string) (any, error) {
		blocks, _ := render(text)
		return pageview.ParseDocument(text, pageview.Units(blocks)), nil
	},
	"markdown": func(doc string) (any, error) {
		var n pageview.Node
		if err := json.Unmarshal([]byte(doc), &n); err != nil {
			return nil, err
		}
		text, err := pageview.SerializeDocument(&n)
		if err != nil {
			return nil, err
		}
		return text, nil
	},
	"blocks": func(text string) (any, error) {
		blocks, _ := render(text)
		doc := pageview.ParseDocument(text, pageview.Units(blocks))
		return pageview.Fresh(doc.Content), nil
	},
	"container": func(line string) (any, error) {
		c, ok := shortcodes.ContainerOf(line)
		if !ok {
			return nil, errors.New("not a container's opening line")
		}
		return map[string]any{"name": c.Name, "args": c.Args, "before": c.Before, "after": c.After, "sep": c.Separator, "open": shortcodes.OpenLine(c.Name, c.Args)}, nil
	},
	"inline": func(raw string) (any, error) {
		return map[string]any{"html": shortcodes.InlineHTML(raw)}, nil
	},
	"glyphs": func(string) (any, error) {
		return shortcodes.GlyphNames(), nil
	},
	"front": func(text string) (any, error) {
		return frontmatter.Read(strings.ReplaceAll(text, "\r\n", "\n")), nil
	},
	"frontset": func(req string) (any, error) {
		var r struct {
			Text  string             `json:"text"`
			Set   map[string]*string `json:"set"`
			Order []string           `json:"order"`
		}
		if err := json.Unmarshal([]byte(req), &r); err != nil {
			return nil, err
		}
		text, err := frontmatter.Set(strings.ReplaceAll(r.Text, "\r\n", "\n"), r.Set, r.Order)
		if err != nil {
			return nil, err
		}
		return map[string]string{"text": text}, nil
	},
	"source": func(src string) (any, error) {
		blocks, _ := render(src)
		var html strings.Builder
		diagrams := []preview.Diagram{}
		for _, u := range pageview.Units(blocks) {
			html.WriteString(u.HTML)
			diagrams = append(diagrams, u.Diagrams...)
		}
		return map[string]any{"html": html.String(), "diagrams": diagrams}, nil
	},
}

func utf16Length(text string) int {
	n := 0
	for _, ch := range text {
		n++
		if ch > 0xffff {
			n++
		}
	}
	return n
}

// Names is the functions Call knows, in order.
func Names() []string {
	out := make([]string, 0, len(functions))
	for name := range functions {
		out = append(out, name)
	}
	sort.Strings(out)
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
