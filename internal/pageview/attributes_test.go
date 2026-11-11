// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package pageview

import (
	"strings"
	"testing"
)

// An attribute block after a heading or a link is kept with it and out of
// its words, and the part writes back as it was (decision 123).
func TestAttributeBlocksRoundTrip(t *testing.T) {
	for _, src := range []string{
		"# Excel Employee Capacity Spreadsheet {#top}",
		"## Capacity and Utilisation At a Glance {#at_a_glance}",
		"### With **bold** words {#b .wide lang=en}",
		`It took a bit of Excel ["kung fu"](https://example.com/kung-fu){target="_blank" rel="noopener"} to accomplish this.`,
		`You may [download](a.xlsx){target="_blank" rel="noopener"} it from my [repository](https://example.com){target="_blank" rel="noopener"}.`,
		`- an item with [a link](b){.ext}`,
		`> quoted [link](b){#q}`,
	} {
		doc, err := Parse(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		var words strings.Builder
		blocks := 0
		var walk func(n *Node)
		walk = func(n *Node) {
			words.WriteString(n.Text)
			if raw, _ := n.Attrs["attributes"].(string); raw != "" {
				blocks++
			}
			for _, m := range n.Marks {
				if raw, _ := m.Attrs["attributes"].(string); raw != "" {
					blocks++
				}
			}
			for _, c := range n.Content {
				walk(c)
			}
		}
		walk(doc)
		if blocks == 0 || strings.ContainsAny(words.String(), "{}") {
			t.Fatalf("%q: the block was not taken out of the words: %d kept, words %q", src, blocks, words.String())
		}
		back, err := Serialize(doc)
		if err != nil || back != src {
			t.Fatalf("%q wrote back as %q (%v)", src, back, err)
		}
	}
}

// Words an author typed that only look like a block are written so that they
// stay words.
func TestBracesThatAreWordsStayWords(t *testing.T) {
	heading := &Node{Type: "doc", Content: []*Node{{Type: "heading", Attrs: map[string]any{"level": 2}, Content: []*Node{{Type: "text", Text: "Set {x=1}"}}}}}
	back, err := Serialize(heading)
	if err != nil || back != `## Set \{x=1}` {
		t.Fatalf("a heading wrote %q (%v)", back, err)
	}
	link := Mark{Type: "link", Attrs: map[string]any{"href": "b", "title": nil}}
	para := &Node{Type: "doc", Content: []*Node{{Type: "paragraph", Content: []*Node{{Type: "text", Text: "a", Marks: []Mark{link}}, {Type: "text", Text: "{.one} and (b){.two}"}}}}}
	back, err = Serialize(para)
	if err != nil || back != `[a](b)\{.one} and (b){.two}` {
		t.Fatalf("a paragraph wrote %q (%v)", back, err)
	}
	for _, src := range []string{`## Set \{x=1}`, `[a](b)\{.one} and (b){.two}`, "# Use {braces} here", `[a](b) {.spaced}`} {
		doc, err := Parse(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		if again, err := Serialize(doc); err != nil || again != src {
			t.Fatalf("%q wrote back as %q (%v)", src, again, err)
		}
	}
}

// An editor could send any text as a block. Only a block is written, and two
// links with different blocks are not joined.
func TestAttributeBlocksFromAnEditor(t *testing.T) {
	bad := &Node{Type: "doc", Content: []*Node{{Type: "heading", Attrs: map[string]any{"level": 1, "attributes": "#a}\n# Injected {#b"}, Content: []*Node{{Type: "text", Text: "Title"}}}}}
	if back, err := Serialize(bad); err != nil || back != "# Title" {
		t.Fatalf("a forged block wrote %q (%v)", back, err)
	}
	one := Mark{Type: "link", Attrs: map[string]any{"href": "b", "attributes": ".one"}}
	two := Mark{Type: "link", Attrs: map[string]any{"href": "b", "attributes": ".two"}}
	para := &Node{Type: "doc", Content: []*Node{{Type: "paragraph", Content: []*Node{{Type: "text", Text: "x", Marks: []Mark{one}}, {Type: "text", Text: "y", Marks: []Mark{two}}}}}}
	if back, err := Serialize(para); err != nil || back != "[x](b){.one}[y](b){.two}" {
		t.Fatalf("two links wrote %q (%v)", back, err)
	}
	empty := &Node{Type: "doc", Content: []*Node{{Type: "heading", Attrs: map[string]any{"level": 1, "attributes": "#only"}}}}
	if back, err := Serialize(empty); err != nil || back != "# {#only}" {
		t.Fatalf("an empty heading wrote %q (%v)", back, err)
	}
}
