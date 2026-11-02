//go:build js && wasm

// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// yavc-md is the Markdown engine the Editor runs in the browser, compiled
// to WebAssembly: the preview renderer and the page view's parser and
// serializer from Dinah Desktop (internal/preview and internal/pageview),
// so a document's text never leaves the browser (DESIGN.md, decision 11).
// It puts one object on the page, yavcMd, whose functions take and return
// JSON text:
//
//	preview(text)   -> {blocks: [{line, html, diagrams}], problems: [{line, severity, message}]}
//	doc(text)       -> the page view's document, a ProseMirror document as JSON
//	markdown(doc)   -> the document's text
//	blocks(text)    -> new blocks for the page to insert
//	source(src)     -> {html, diagrams}, a block's source drawn as the preview draws it
//
// Each returns {error: "..."} as JSON when it cannot.
package main

import (
	"encoding/json"
	"syscall/js"

	"yavc.app/internal/pageview"
	"yavc.app/internal/preview"
	"yavc.app/internal/shortcodes"
)

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

func out(v any, err error) string {
	if err != nil {
		b, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(b)
	}
	b, err := json.Marshal(v)
	if err != nil {
		b, _ = json.Marshal(map[string]string{"error": err.Error()})
	}
	return string(b)
}

func fn(f func(string) string) js.Func {
	return js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) < 1 {
			return out(nil, errText("one argument is needed"))
		}
		return f(args[0].String())
	})
}

type errText string

func (e errText) Error() string { return string(e) }

func main() {
	api := js.Global().Get("Object").New()
	api.Set("preview", fn(func(text string) string {
		blocks, problems := render(text)
		return out(map[string]any{"blocks": blocks, "problems": problems}, nil)
	}))
	api.Set("doc", fn(func(text string) string {
		blocks, _ := render(text)
		return out(pageview.ParseDocument(text, pageview.Units(blocks)), nil)
	}))
	api.Set("markdown", fn(func(doc string) string {
		var n pageview.Node
		if err := json.Unmarshal([]byte(doc), &n); err != nil {
			return out(nil, err)
		}
		text, err := pageview.SerializeDocument(&n)
		return out(text, err)
	}))
	api.Set("blocks", fn(func(text string) string {
		blocks, _ := render(text)
		doc := pageview.ParseDocument(text, pageview.Units(blocks))
		return out(pageview.Fresh(doc.Content), nil)
	}))
	api.Set("container", fn(func(line string) string {
		c, ok := shortcodes.ContainerOf(line)
		if !ok {
			return out(nil, errText("not a container's opening line"))
		}
		return out(map[string]any{"name": c.Name, "args": c.Args, "before": c.Before, "after": c.After, "sep": c.Separator, "open": shortcodes.OpenLine(c.Name, c.Args)}, nil)
	}))
	api.Set("source", fn(func(src string) string {
		blocks, _ := render(src)
		html, diagrams := "", []preview.Diagram{}
		for _, u := range pageview.Units(blocks) {
			html += u.HTML
			diagrams = append(diagrams, u.Diagrams...)
		}
		return out(map[string]any{"html": html, "diagrams": diagrams}, nil)
	}))
	js.Global().Set("yavcMd", api)
	select {}
}
