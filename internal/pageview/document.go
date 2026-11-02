// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Lifted from Dinah Desktop (internal/preview and internal/pageview, Apache-2.0).

package pageview

import (
	"errors"
	"html"
	"strings"

	"yavc.app/internal/frontmatter"
	"yavc.app/internal/preview"
	"yavc.app/internal/shortcodes"
)

// A whole document in the editor. ParseDocument turns a document's text and
// its preview's parts (Units) into one editor's document: each top-level
// paragraph, heading, list or table that writes back unchanged is rich text,
// and anything else (code, a diagram, an image, a quote, HTML) is a source
// block, drawn as the preview draws it, whose Markdown is edited as text.
//
// Every block keeps the text it was read from (src) and the text before it
// (gap: blank lines, mostly). SerializeDocument writes a block whose content
// still writes back as its src exactly as it was read, and a changed or new
// block from the editor, so an edit never rewrites a block the person did not
// change. Front matter is kept on the document and is not shown.

// richKinds are the parts that may be rich text.
var richKinds = map[string]bool{"paragraph": true, "heading": true, "list": true, "tasklist": true, "table": true}

// ParseDocument reads a whole document for the editor.
func ParseDocument(text string, units []Unit) *Node {
	doc := &Node{Type: "doc", Attrs: map[string]any{}}
	// A document whose every line ends in \r\n is read with \n and written
	// back with \r\n. One with mixed line ends is read as it is, since
	// writing it back with one kind would change the lines the person did
	// not touch.
	if n := strings.Count(text, "\n"); n > 0 && strings.Count(text, "\r\n") == n {
		text = strings.ReplaceAll(text, "\r\n", "\n")
		doc.Attrs["crlf"] = true
	}
	front := text[:frontmatter.End(text)]
	doc.Attrs["front"] = front
	b := builder{text: text, starts: lineStarts(text)}
	content, tail := b.sequence(units, len(front), len(text))
	doc.Attrs["tail"] = tail
	if len(content) == 0 {
		// The editor needs one block to type into.
		content = []*Node{{Type: "paragraph"}}
	}
	doc.Content = content
	return doc
}

func lineStarts(text string) []int {
	starts := []int{0, 0} // 1-based
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			starts = append(starts, i+1)
		}
	}
	return starts
}

type builder struct {
	text   string
	starts []int
	uid    int
}

func (b *builder) lineEnd(line int) int {
	if line+1 < len(b.starts) {
		return b.starts[line+1] - 1
	}
	return len(b.text)
}

// sequence reads the parts between from and to as blocks, each with the text
// before it, and returns what follows the last one.
func (b *builder) sequence(units []Unit, from, to int) ([]*Node, string) {
	var out []*Node
	cursor := from
	for _, u := range units {
		if u.Start < 1 || u.End >= len(b.starts) || u.End < u.Start {
			continue
		}
		start, end := b.starts[u.Start], b.lineEnd(u.End)
		if start < cursor || end > to {
			continue
		}
		gap := b.looseText(b.text[cursor:start], &out)
		n := b.node(u, b.text[start:end])
		n.Attrs["gap"] = gap
		out = append(out, n)
		cursor = end
	}
	return out, b.looseText(b.text[cursor:to], &out)
}

// looseText keeps text between parts that the preview did not mark as a part
// (it is rare) as a source block of its own, so nothing is hidden, and
// returns the blank text after it.
func (b *builder) looseText(gap string, out *[]*Node) string {
	if strings.TrimSpace(gap) == "" {
		return gap
	}
	lead := len(gap) - len(strings.TrimLeft(gap, " \t\n"))
	trail := len(strings.TrimRight(gap, " \t\n"))
	src := gap[lead:trail]
	n := b.source("text", src, "<pre>"+html.EscapeString(src)+"</pre>", nil)
	n.Attrs["gap"] = gap[:lead]
	*out = append(*out, n)
	return gap[trail:]
}

func (b *builder) next() int { b.uid++; return b.uid }

func (b *builder) node(u Unit, src string) *Node {
	if richKinds[u.Kind] {
		if d, err := Parse(src); err == nil && len(d.Content) == 1 {
			n := d.Content[0]
			if n.Attrs == nil {
				n.Attrs = map[string]any{}
			}
			n.Attrs["uid"] = b.next()
			n.Attrs["src"] = src
			return n
		}
	}
	if u.Kind == "shortcode" {
		if n := b.container(src); n != nil {
			return n
		}
	}
	return b.source(u.Kind, src, u.HTML, u.Diagrams)
}

// A container shortcode's text is its opening line, its body and its
// closing line (docs/page-view-design.md). The body is read as a document
// of its own, so its blocks are edited as the page's are, and written back
// between the two lines as they were.
func containerParts(src string) (open, body, close string, info shortcodes.Container, ok bool) {
	nl := strings.IndexByte(src, '\n')
	if nl < 0 {
		return
	}
	open = src[:nl]
	info, ok = shortcodes.ContainerOf(open)
	if !ok {
		return
	}
	last := strings.LastIndexByte(src, '\n')
	close = src[last+1:]
	if !shortcodes.ClosesContainer(close, info.Name) {
		ok = false
		return
	}
	if last > nl {
		body = src[nl+1 : last]
	}
	return
}

func (b *builder) container(src string) *Node {
	open, body, close, info, ok := containerParts(src)
	if !ok {
		return nil
	}
	attrs := map[string]any{"uid": b.next(), "src": src, "name": info.Name, "args": info.Args, "open": open, "close": close, "before": info.Before, "after": info.After}
	// A body of one empty line, between the opening and the closing line,
	// is told apart from no body at all, so each comes back as it was.
	if body == "" && strings.Count(src, "\n") > 1 {
		attrs["blank"] = true
	}
	if info.Separator != "" {
		parts, none, seps := splitBody(body, info.Separator)
		cols := &Node{Type: "columns", Attrs: attrs}
		attrs["sep"] = info.Separator
		attrs["seps"] = seps
		for i, part := range parts {
			content, tail := b.body(part)
			col := &Node{Type: "column", Attrs: map[string]any{"tail": tail}, Content: content}
			if none[i] {
				col.Attrs["none"] = true
			}
			cols.Content = append(cols.Content, col)
		}
		return cols
	}
	content, tail := b.body(body)
	attrs["tail"] = tail
	return &Node{Type: "container", Attrs: attrs, Content: content}
}

// splitBody divides a container's body at each line that is its separator
// shortcode alone, keeping those lines as they were. none says, for each
// part, that it had no lines at all, which an empty line also joins to "",
// so a separator with nothing between it and the next comes back as it was.
func splitBody(body, sep string) (parts []string, none []bool, seps []string) {
	var part []string
	for _, line := range strings.Split(body, "\n") {
		if strings.TrimSpace(line) == "{{"+sep+"}}" {
			parts = append(parts, strings.Join(part, "\n"))
			none = append(none, part == nil)
			seps = append(seps, line)
			part = nil
			continue
		}
		part = append(part, line)
	}
	parts = append(parts, strings.Join(part, "\n"))
	none = append(none, part == nil)
	return parts, none, seps
}

// body reads a container's body as blocks, with the blank text after the
// last one. An empty body gives one empty paragraph to type into.
func (b *builder) body(text string) ([]*Node, string) {
	blocks, _ := preview.Render(text)
	inner := builder{text: text, starts: lineStarts(text), uid: b.uid}
	content, tail := inner.sequence(Units(blocks), 0, len(text))
	b.uid = inner.uid
	if len(content) == 0 {
		content = []*Node{{Type: "paragraph"}}
	}
	return content, tail
}

func (b *builder) source(kind, src, html string, diagrams any) *Node {
	attrs := map[string]any{"uid": b.next(), "src": src, "kind": kind, "html": html}
	if diagrams != nil {
		attrs["diagrams"] = diagrams
	}
	return &Node{Type: "source_block", Attrs: attrs}
}

// Fresh makes blocks read from other text new to a document: they lose the
// place they were read from, so they are written as the editor has them,
// after a blank line. A source block keeps its Markdown, which is all it has.
func Fresh(nodes []*Node) []*Node {
	for _, n := range nodes {
		if n == nil {
			continue
		}
		delete(n.Attrs, "uid")
		delete(n.Attrs, "gap")
		if n.Type != "source_block" {
			delete(n.Attrs, "src")
		}
		if n.Type == "container" || n.Type == "columns" || n.Type == "column" {
			Fresh(n.Content)
		}
	}
	return nodes
}

// SerializeDocument writes the editor's document as the document's text.
func SerializeDocument(doc *Node) (string, error) {
	if doc == nil || doc.Type != "doc" {
		return "", errors.New("not an editor's document")
	}
	front := stringAttr(doc, "front")
	first := ""
	if front != "" {
		first = "\n"
	}
	body, err := sequenceText(doc.Content, first)
	if err != nil {
		return "", err
	}
	tail, ok := doc.Attrs["tail"].(string)
	if !ok {
		tail = "\n"
	}
	out := front + body + tail
	if crlf, _ := doc.Attrs["crlf"].(bool); crlf {
		out = strings.ReplaceAll(out, "\n", "\r\n")
	}
	return out, nil
}

// sequenceText writes blocks one after another, each after the text that
// was before it, or, for a new block, a blank line (first, for the first).
// A block left empty writes nothing.
func sequenceText(nodes []*Node, first string) (string, error) {
	var b strings.Builder
	started := false
	for _, n := range nodes {
		if n == nil {
			continue
		}
		text, err := blockText(n)
		if err != nil {
			return "", err
		}
		if text == "" {
			continue
		}
		gap, ok := n.Attrs["gap"].(string)
		if !ok {
			gap = "\n\n"
			if !started {
				gap = first
			}
		}
		b.WriteString(gap)
		b.WriteString(text)
		started = true
	}
	return b.String(), nil
}

func blockText(n *Node) (string, error) {
	if n.Type == "source_block" {
		return stringAttr(n, "src"), nil
	}
	var s string
	var err error
	switch n.Type {
	case "container", "columns":
		s, err = containerText(n)
	default:
		s, err = serializeBlock(n, "")
	}
	if err != nil {
		return "", err
	}
	// A block whose content writes back as the text it was read from keeps
	// that text, byte for byte.
	if src, ok := n.Attrs["src"].(string); ok && layout(s) == layout(src) {
		return src, nil
	}
	return s, nil
}

// containerText writes a container: its opening line, the body's blocks
// (each column's, divided by the separator lines), the blank text after
// them, and the closing line. The lines are as they were read, or made for
// a container new to the document.
func containerText(n *Node) (string, error) {
	name := stringAttr(n, "name")
	open := stringAttr(n, "open")
	if open == "" {
		open = shortcodes.OpenLine(name, stringAttr(n, "args"))
	}
	close := stringAttr(n, "close")
	if close == "" {
		close = "{{/" + name + "}}"
	}
	var body string
	if n.Type == "columns" {
		sep := stringAttr(n, "sep")
		if sep == "" {
			sep = "column"
		}
		seps := stringList(n.Attrs["seps"])
		// The body is its lines: each column's text, which may run over
		// several, and the separator line before every column but the
		// first. A column that had no lines adds none.
		var pieces []string
		i := 0
		for _, col := range n.Content {
			if col == nil {
				continue
			}
			text, err := sequenceText(col.Content, "")
			if err != nil {
				return "", err
			}
			if i > 0 {
				line := "{{" + sep + "}}"
				if i-1 < len(seps) && seps[i-1] != "" {
					line = seps[i-1]
				}
				pieces = append(pieces, line)
			}
			text += stringAttr(col, "tail")
			if none, _ := col.Attrs["none"].(bool); text != "" || !none {
				pieces = append(pieces, text)
			}
			i++
		}
		body = strings.Join(pieces, "\n")
	} else {
		text, err := sequenceText(n.Content, "")
		if err != nil {
			return "", err
		}
		body = text + stringAttr(n, "tail")
	}
	if blank, _ := n.Attrs["blank"].(bool); body == "" && !blank {
		return open + "\n" + close, nil
	}
	return open + "\n" + body + "\n" + close, nil
}

// stringList reads a list of strings from an attribute, as the editor's
// JSON gives it ([]any) or as this package builds it ([]string).
func stringList(v any) []string {
	switch l := v.(type) {
	case []string:
		return l
	case []any:
		out := make([]string, len(l))
		for i, x := range l {
			out[i], _ = x.(string)
		}
		return out
	}
	return nil
}

func stringAttr(n *Node, key string) string {
	s, _ := n.Attrs[key].(string)
	return s
}
