package pageview

import (
	"bytes"
	"strings"
	"testing"

	"github.com/yuin/goldmark/text"
)

// typed is a paragraph as a person types it in Page view: the lines, with
// a soft break between each.
func typed(lines ...string) *Node {
	p := &Node{Type: "paragraph"}
	for i, l := range lines {
		if i > 0 {
			p.Content = append(p.Content, &Node{Type: "soft_break"})
		}
		if l != "" {
			p.Content = append(p.Content, &Node{Type: "text", Text: l})
		}
	}
	return &Node{Type: "doc", Content: []*Node{p}}
}

// shown is the HTML the page draws for Markdown, by the parser the page
// view reads with.
func shown(t testing.TB, src string) string {
	t.Helper()
	var b bytes.Buffer
	if err := md.Renderer().Render(&b, []byte(src), md.Parser().Parse(text.NewReader([]byte(src)))); err != nil {
		t.Fatal(err)
	}
	return b.String()
}

// paragraphOf is the HTML of one paragraph holding the lines as text. The
// spaces at the end of a line, which a page never shows, are not written.
func paragraphOf(lines ...string) string {
	esc := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	for i, l := range lines {
		lines[i] = esc.Replace(strings.TrimRight(l, " \t"))
	}
	return "<p>" + strings.Join(lines, "\n") + "</p>\n"
}

// What a person types in Page view is what the page shows: text that
// Markdown would read as structure is escaped.
func TestSerializeTypedIsShown(t *testing.T) {
	for _, lines := range [][]string{
		{"# not a heading"},
		{"#"},
		{"a", "# b"},
		{"a", "---"},
		{"a", "==="},
		{"a", "+++"},
		{"* * *"},
		{"- - -"},
		{"___"},
		{"-"},
		{"+"},
		{"1."},
		{"1)"},
		{"a", "- b"},
		{"a", "1. b"},
		{"2024. A year"},
		{"~"},
		{"~~struck~~"},
		{"~~~"},
		{"```"},
		{"[foo]: /url"},
		{"a", "[foo]: /url \"t\""},
		{"    indented"},
		{"\tTabbed"},
		{"trailing  "},
		{"a  ", "b"},
		{"> quote"},
		{"a|b", "-|-"},
		{"a | b", "--- | ---"},
		{"{{tip}}"},
		{"{{kbd:Ctrl+C}} typed"},
		{"{{{"},
		{"&copy; and &amp; and &#169;"},
		{"AT&T"},
		{"<div>"},
		{"<?php"},
		{"<!-- c -->"},
		{"a \\"},
		{"back\\slash\\*"},
		{"[a](b) and [c][d]"},
		{"_under_ and *star*"},
		{"`code`"},
		{"x <y"},
	} {
		want := paragraphOf(append([]string(nil), lines...)...)
		md, err := Serialize(typed(lines...))
		if err != nil {
			t.Fatalf("%q: %v", lines, err)
		}
		if got := shown(t, md); got != want {
			t.Errorf("%q written as %q is shown as %q, want %q", lines, md, got, want)
		}
		// And it reads back as rich text, the same text.
		doc, err := Parse(md)
		if err != nil {
			t.Errorf("%q written as %q does not read back: %v", lines, md, err)
			continue
		}
		if back, _ := Serialize(doc); back != md {
			t.Errorf("%q written as %q reads back as %q", lines, md, back)
		}
	}
}

func TestHeadingEscapes(t *testing.T) {
	for title, want := range map[string]string{
		"Title #":  "<h2>Title #</h2>\n",
		"###":      "<h2>###</h2>\n",
		"C#":       "<h2>C#</h2>\n",
		" spaced ": "<h2> spaced</h2>\n",
		"{{tip}}":  "<h2>{{tip}}</h2>\n",
	} {
		doc := &Node{Type: "doc", Content: []*Node{{Type: "heading", Attrs: map[string]any{"level": 2}, Content: []*Node{{Type: "text", Text: title}}}}}
		md, err := Serialize(doc)
		if err != nil {
			t.Fatal(err)
		}
		if got := shown(t, md); got != want {
			t.Errorf("%q written as %q is shown as %q", title, md, got)
		}
	}
	// A heading as it was written comes back byte for byte.
	for _, src := range []string{"# C#", "## A *b*"} {
		doc, err := Parse(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		if back, _ := Serialize(doc); back != src {
			t.Fatalf("%q came back as %q", src, back)
		}
	}
}

// Code that starts and ends with a space keeps both.
func TestCodeSpanSpaces(t *testing.T) {
	doc := &Node{Type: "doc", Content: []*Node{{Type: "paragraph", Content: []*Node{{Type: "text", Text: " a ", Marks: []Mark{{Type: "code"}}}}}}}
	md, _ := Serialize(doc)
	if got := shown(t, md); got != "<p><code> a </code></p>\n" {
		t.Fatalf("written %q, shown %q", md, got)
	}
}

// An entity reference is read as its character, so the page view shows
// what the page shows.
func TestEntitiesRead(t *testing.T) {
	doc, err := Parse("A &copy; B")
	if err == nil {
		// The text is written back with the character itself, which is not
		// the source byte for byte, so the block stays as its Markdown.
		t.Fatalf("an entity reference read back as %+v", doc)
	}
	if got := unescape(`&copy; \&copy; &bogus; &#65;`); got != "© &copy; &bogus; A" {
		t.Fatalf("unescape gave %q", got)
	}
}

// A document from the editor with nil children writes what it can.
func TestSerializeNilChildren(t *testing.T) {
	doc := &Node{Type: "doc", Content: []*Node{
		nil,
		{Type: "paragraph", Content: []*Node{nil, {Type: "text", Text: "a"}}},
		{Type: "bullet_list", Content: []*Node{nil, {Type: "list_item", Content: []*Node{nil, {Type: "paragraph", Content: []*Node{{Type: "text", Text: "b"}}}}}}},
		{Type: "table", Content: []*Node{nil, {Type: "table_row", Content: []*Node{nil, {Type: "table_header", Content: []*Node{{Type: "text", Text: "h"}}}}}}},
		{Type: "columns", Content: []*Node{nil, {Type: "column", Content: []*Node{nil}}}},
		{Type: "container", Attrs: map[string]any{"name": "tip"}, Content: []*Node{nil}},
	}}
	if _, err := Serialize(&Node{Type: "doc", Content: doc.Content[:4]}); err != nil {
		t.Fatal(err)
	}
	if _, err := SerializeDocument(doc); err != nil {
		t.Fatal(err)
	}
}
