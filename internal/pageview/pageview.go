// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Lifted from Dinah Desktop (internal/preview and internal/pageview, Apache-2.0).

// Package pageview turns a Markdown document into the document the
// Editor's Page view edits, and back. The editor is ProseMirror, and its document is JSON: a tree of
// nodes with marks. ParseDocument and SerializeDocument (document.go) work on
// a whole document, block by block; this file reads and writes one block, a
// paragraph, a heading, a list or a table, as the preview marks it (see
// preview.Block).
//
// Markdown stays the stored form. Parse reads a block with the same parser
// the preview uses, and Serialize writes the editor's block back as
// Markdown. A block is rich text only when writing back what Parse read gives
// the block's own text, byte for byte apart from spaces Markdown does not
// show (see layout), so editing never changes how text the person did not
// touch is drawn; any other block is edited as its source.
package pageview

import (
	"errors"
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"yavc.app/internal/shortcodes"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/text"
)

// Node is a ProseMirror node in its JSON form.
type Node struct {
	Type    string         `json:"type"`
	Attrs   map[string]any `json:"attrs,omitempty"`
	Content []*Node        `json:"content,omitempty"`
	Text    string         `json:"text,omitempty"`
	Marks   []Mark         `json:"marks,omitempty"`
}

// Mark is a ProseMirror mark in its JSON form.
type Mark struct {
	Type  string         `json:"type"`
	Attrs map[string]any `json:"attrs,omitempty"`
}

// ErrNotEditable means a part cannot be edited as rich text without risking
// its other text, so it is edited as source.
var ErrNotEditable = errors.New("this part is edited as source")

var md = goldmark.New(goldmark.WithExtensions(extension.GFM, shortcodes.Extension))

// Parse reads one part of a document as an editor's document. A part that
// would not be written back exactly as it is returns ErrNotEditable.
func Parse(part string) (*Node, error) {
	part = strings.TrimRight(part, "\n")
	if strings.TrimSpace(part) == "" || strings.Contains(part, "\r") {
		return nil, ErrNotEditable
	}
	src := []byte(part)
	root := md.Parser().Parse(text.NewReader(src))
	p := parser{src: src}
	doc := &Node{Type: "doc"}
	for n := root.FirstChild(); n != nil; n = n.NextSibling() {
		block, err := p.block(n)
		if err != nil {
			return nil, err
		}
		doc.Content = append(doc.Content, block)
	}
	if len(doc.Content) == 0 {
		return nil, ErrNotEditable
	}
	back, err := Serialize(doc)
	if err != nil || layout(back) != layout(part) {
		return nil, ErrNotEditable
	}
	return doc, nil
}

// layout is a part's text without the spaces Markdown does not show: those at
// the end of a line, and the padding around a table's pipes. Two parts with
// the same layout are drawn the same.
func layout(s string) string {
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		line = strings.TrimRight(line, " \t")
		if strings.HasPrefix(line, "|") {
			line = tableRow(line)
		}
		lines[i] = line
	}
	return strings.Join(lines, "\n")
}

// tableRow writes a table row's cells with one space either side, and a
// rule's cells as "---".
func tableRow(line string) string {
	var cells []string
	var cell strings.Builder
	for i := 1; i < len(line); i++ {
		switch {
		case line[i] == '\\' && i+1 < len(line):
			cell.WriteByte(line[i])
			i++
			cell.WriteByte(line[i])
		case line[i] == '|':
			cells = append(cells, strings.TrimSpace(cell.String()))
			cell.Reset()
		default:
			cell.WriteByte(line[i])
		}
	}
	if rest := strings.TrimSpace(cell.String()); rest != "" {
		cells = append(cells, rest)
	}
	for i, c := range cells {
		if c != "" && strings.Trim(c, "-") == "" {
			cells[i] = "---"
		}
	}
	return "| " + strings.Join(cells, " | ") + " |"
}

type parser struct {
	src []byte
}

func (p parser) block(n ast.Node) (*Node, error) {
	switch node := n.(type) {
	case *ast.Paragraph, *ast.TextBlock:
		inline, err := p.inline(n)
		if err != nil {
			return nil, err
		}
		return &Node{Type: "paragraph", Content: inline}, nil
	case *ast.Heading:
		if !p.atx(node) {
			return nil, ErrNotEditable
		}
		inline, err := p.inline(n)
		if err != nil {
			return nil, err
		}
		return &Node{Type: "heading", Attrs: map[string]any{"level": node.Level}, Content: inline}, nil
	case *ast.List:
		return p.list(node)
	case *extast.Table:
		return p.table(node)
	}
	return nil, ErrNotEditable
}

// atx reports whether a heading is written with leading #s, the only form
// written back.
func (p parser) atx(h *ast.Heading) bool {
	if h.Lines().Len() == 0 {
		return false
	}
	start := h.Lines().At(0).Start
	line := start
	for line > 0 && p.src[line-1] != '\n' {
		line--
	}
	return strings.HasPrefix(strings.TrimLeft(string(p.src[line:start]), " "), "#")
}

func (p parser) list(l *ast.List) (*Node, error) {
	if l.IsOrdered() {
		if l.Marker != '.' {
			return nil, ErrNotEditable
		}
	}
	out := &Node{Type: "bullet_list", Attrs: map[string]any{"tight": l.IsTight}}
	if l.IsOrdered() {
		out.Type = "ordered_list"
		out.Attrs["order"] = l.Start
	} else if l.Marker != '-' {
		// A list written with * or + is written back with it.
		out.Attrs["marker"] = string(l.Marker)
	}
	for item := l.FirstChild(); item != nil; item = item.NextSibling() {
		li := &Node{Type: "list_item"}
		// A task item's box is the first inline of its first block (goldmark's
		// task list extension); the item keeps whether it is ticked, and the
		// box is left out of the paragraph's text (walk).
		if first := item.FirstChild(); first != nil {
			if box, ok := first.FirstChild().(*extast.TaskCheckBox); ok {
				li.Attrs = map[string]any{"checked": box.IsChecked}
			}
		}
		for ch := item.FirstChild(); ch != nil; ch = ch.NextSibling() {
			b, err := p.block(ch)
			if err != nil {
				return nil, err
			}
			li.Content = append(li.Content, b)
		}
		if len(li.Content) == 0 || li.Content[0].Type != "paragraph" {
			return nil, ErrNotEditable
		}
		out.Content = append(out.Content, li)
	}
	return out, nil
}

func (p parser) table(t *extast.Table) (*Node, error) {
	for _, a := range t.Alignments {
		if a != extast.AlignNone {
			return nil, ErrNotEditable
		}
	}
	out := &Node{Type: "table"}
	for row := t.FirstChild(); row != nil; row = row.NextSibling() {
		_, header := row.(*extast.TableHeader)
		r := &Node{Type: "table_row"}
		for cell := row.FirstChild(); cell != nil; cell = cell.NextSibling() {
			inline, err := p.inline(cell)
			if err != nil {
				return nil, err
			}
			typ := "table_cell"
			if header {
				typ = "table_header"
			}
			r.Content = append(r.Content, &Node{Type: typ, Attrs: map[string]any{"colspan": 1, "rowspan": 1, "colwidth": nil}, Content: inline})
		}
		out.Content = append(out.Content, r)
	}
	return out, nil
}

// inline reads a block's inline content: text with its marks, and breaks.
func (p parser) inline(n ast.Node) ([]*Node, error) {
	var out []*Node
	shortcodes.MatchSpans(n)
	err := p.walk(n, nil, &out)
	return out, err
}

func (p parser) walk(n ast.Node, marks []Mark, out *[]*Node) error {
	// A mark opened inside this node by inline HTML (<u>) must close inside
	// it too, or it would not be written back where it was.
	depth := len(marks)
	var run strings.Builder
	flush := func() error {
		if run.Len() == 0 {
			return nil
		}
		nodes, err := p.textNodes(run.String(), &marks)
		if err != nil {
			return err
		}
		*out = append(*out, nodes...)
		run.Reset()
		return nil
	}
	for ch := n.FirstChild(); ch != nil; ch = ch.NextSibling() {
		switch node := ch.(type) {
		case *extast.TaskCheckBox:
			// Kept by its list item (list), not as text.
			if ch != n.FirstChild() {
				return ErrNotEditable
			}
		case *ast.Text:
			run.Write(node.Segment.Value(p.src))
			if node.HardLineBreak() {
				return ErrNotEditable
			}
			if node.SoftLineBreak() {
				if err := flush(); err != nil {
					return err
				}
				*out = append(*out, &Node{Type: "soft_break"})
			}
		case *ast.String:
			run.Write(node.Value)
		case *ast.Emphasis:
			if err := flush(); err != nil {
				return err
			}
			mark := Mark{Type: "em"}
			if node.Level == 2 {
				mark.Type = "strong"
			}
			if !p.starred(node) {
				return ErrNotEditable
			}
			if err := p.walk(node, withMark(marks, mark), out); err != nil {
				return err
			}
		case *extast.Strikethrough:
			if err := flush(); err != nil {
				return err
			}
			if err := p.walk(node, withMark(marks, Mark{Type: "strike"}), out); err != nil {
				return err
			}
		case *ast.CodeSpan:
			if err := flush(); err != nil {
				return err
			}
			var code strings.Builder
			for c := node.FirstChild(); c != nil; c = c.NextSibling() {
				if t, ok := c.(*ast.Text); ok {
					code.Write(t.Segment.Value(p.src))
				}
			}
			*out = append(*out, &Node{Type: "text", Text: code.String(), Marks: withMark(marks, Mark{Type: "code"})})
		case *ast.Link:
			if err := flush(); err != nil {
				return err
			}
			if len(node.Title) > 0 {
				return ErrNotEditable
			}
			link := Mark{Type: "link", Attrs: map[string]any{"href": string(node.Destination), "title": nil}}
			if err := p.walk(node, withMark(marks, link), out); err != nil {
				return err
			}
		case *ast.RawHTML:
			// Underlining is the one piece of inline HTML the documents use, as
			// <u> and </u> around a run of text.
			var tag strings.Builder
			for i := 0; i < node.Segments.Len(); i++ {
				seg := node.Segments.At(i)
				tag.Write(seg.Value(p.src))
			}
			if err := flush(); err != nil {
				return err
			}
			switch tag.String() {
			case "<u>":
				marks = withMark(marks, Mark{Type: "underline"})
			case "</u>":
				if len(marks) == 0 || marks[len(marks)-1].Type != "underline" {
					return ErrNotEditable
				}
				marks = marks[:len(marks)-1]
			default:
				return ErrNotEditable
			}
		case *shortcodes.Inline:
			// A colour span is the color mark; any other shortcode in the
			// text keeps the block as its Markdown.
			if err := flush(); err != nil {
				return err
			}
			name, value, ok := shortcodes.Span(node)
			if !ok {
				// A shortcode that stands in the line on its own, keys or a
				// status label, is one piece of the line, written back as it
				// was and changed through its form.
				if shortcodes.IsInlineAtom(node) {
					*out = append(*out, &Node{Type: "shortcode", Attrs: map[string]any{"src": node.Raw, "html": shortcodes.InlineHTML(node.Raw)}, Marks: append([]Mark(nil), marks...)})
					continue
				}
				return ErrNotEditable
			}
			markType := ""
			switch name {
			case "color", "colour":
				markType = "color"
			case "class":
				markType = "class"
			default:
				return ErrNotEditable
			}
			if node.Closing {
				if len(marks) == 0 || marks[len(marks)-1].Type != markType {
					return ErrNotEditable
				}
				marks = marks[:len(marks)-1]
			} else {
				// The spelling used is kept, so the text writes back as it was.
				marks = withMark(marks, Mark{Type: markType, Attrs: map[string]any{"value": value, "name": name}})
			}
		case *ast.AutoLink:
			if err := flush(); err != nil {
				return err
			}
			// A bare address, a www. one or an email address, which GitHub's
			// Markdown makes a link, is written back as its text; Parse's
			// check that the part writes back as it was turns away one
			// written between < and >.
			url := string(node.URL(p.src))
			label := string(node.Label(p.src))
			if node.AutoLinkType == ast.AutoLinkEmail && !strings.HasPrefix(url, "mailto:") {
				url = "mailto:" + url
			}
			link := Mark{Type: "link", Attrs: map[string]any{"href": url, "title": nil, "auto": true}}
			*out = append(*out, &Node{Type: "text", Text: label, Marks: withMark(marks, link)})
		default:
			return ErrNotEditable
		}
	}
	if err := flush(); err != nil {
		return err
	}
	if len(marks) != depth {
		return ErrNotEditable
	}
	return nil
}

// starred reports whether emphasis is written with asterisks, the only form
// written back.
func (p parser) starred(e *ast.Emphasis) bool {
	first := e.FirstChild()
	if first == nil {
		return false
	}
	t, ok := first.(*ast.Text)
	if !ok {
		off, ok2 := firstText(e)
		if !ok2 {
			// Emphasis around a shortcode alone has no text to find its
			// delimiter by; Parse's check that the part writes back as it
			// was read turns away anything not written with asterisks.
			return true
		}
		return off >= e.Level && p.src[off-1] == '*'
	}
	off := t.Segment.Start
	return off >= e.Level && p.src[off-1] == '*'
}

func firstText(n ast.Node) (int, bool) {
	for ch := n.FirstChild(); ch != nil; ch = ch.NextSibling() {
		if t, ok := ch.(*ast.Text); ok {
			return t.Segment.Start, true
		}
		if off, ok := firstText(ch); ok {
			return off, true
		}
	}
	return 0, false
}

func withMark(marks []Mark, m Mark) []Mark {
	out := append([]Mark(nil), marks...)
	return append(out, m)
}

// textNodes reads a run of source text as a text node. The text is shown
// as the page shows it, without its Markdown escapes and with its entity
// references read; Serialize puts back the escapes it needs.
func (p parser) textNodes(raw string, marks *[]Mark) ([]*Node, error) {
	return []*Node{{Type: "text", Text: unescape(raw), Marks: *marks}}, nil
}

// entityRe is an HTML entity or numeric character reference as CommonMark
// reads one in text: a name, or a decimal or hexadecimal number, between
// & and ;.
var entityRe = regexp.MustCompile(`^&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});`)

// unescape removes the backslash from a Markdown escape and reads each
// entity reference as the character it stands for. A name HTML does not
// know is left as written, as CommonMark leaves it.
func unescape(s string) string {
	if !strings.ContainsAny(s, `\&`) {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) && isEscapable(s[i+1]) {
			i++
		} else if s[i] == '&' {
			if ref := entityRe.FindString(s[i:]); ref != "" {
				if ch := html.UnescapeString(ref); ch != ref {
					b.WriteString(ch)
					i += len(ref) - 1
					continue
				}
			}
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

// isEscapable says whether a backslash before c is an escape: CommonMark
// lets any ASCII punctuation character be escaped.
func isEscapable(c byte) bool {
	return strings.IndexByte("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~", c) >= 0
}

// Serialize writes an editor's document as Markdown: ATX headings,
// "-" bullets, "1." numbering, ** and * emphasis, ~~ strikethrough, and
// tables with "| --- |" rules.
func Serialize(doc *Node) (string, error) {
	if doc == nil || doc.Type != "doc" {
		return "", errors.New("not an editor's document")
	}
	var parts []string
	for _, b := range doc.Content {
		if b == nil {
			continue
		}
		s, err := serializeBlock(b, "")
		if err != nil {
			return "", err
		}
		parts = append(parts, s)
	}
	return strings.Join(parts, "\n\n"), nil
}

func serializeBlock(n *Node, indent string) (string, error) {
	switch n.Type {
	case "paragraph":
		s, err := serializeInline(n.Content, false)
		if err != nil {
			return "", err
		}
		lines := strings.Split(s, "\n")
		for i, line := range lines {
			lines[i] = escapeLineStart(line)
		}
		// A paragraph that starts as a link reference definition, whose
		// label may run over several lines, would be taken out of the text.
		if s := strings.Join(lines, "\n"); definitionStart.MatchString(s) {
			lines[0] = `\` + lines[0]
		}
		return strings.Join(lines, "\n"+indent), nil
	case "heading":
		level := intAttr(n, "level", 1)
		if level < 1 || level > 6 {
			return "", fmt.Errorf("a heading's level is 1 to 6, not %d", level)
		}
		s, err := serializeInline(n.Content, false)
		if err != nil {
			return "", err
		}
		return strings.Repeat("#", level) + " " + escapeHeading(strings.ReplaceAll(s, "\n", " ")), nil
	case "bullet_list", "ordered_list":
		return serializeList(n, indent)
	case "table":
		return serializeTable(n)
	}
	return "", fmt.Errorf("a %s cannot be written as Markdown here", n.Type)
}

func serializeList(n *Node, indent string) (string, error) {
	tight, _ := n.Attrs["tight"].(bool)
	order := intAttr(n, "order", 1)
	var items []string
	bullet := "-"
	if m, _ := n.Attrs["marker"].(string); m == "*" || m == "+" {
		bullet = m
	}
	i := -1
	for _, item := range n.Content {
		if item == nil {
			continue
		}
		i++
		marker := bullet + " "
		if n.Type == "ordered_list" {
			marker = strconv.Itoa(order+i) + ". "
		}
		inner := indent + strings.Repeat(" ", len(marker))
		// A task item's box goes before its first block's text.
		box := ""
		if checked, ok := item.Attrs["checked"].(bool); ok {
			box = "[ ] "
			if checked {
				box = "[x] "
			}
		}
		var blocks []string
		for _, b := range item.Content {
			if b == nil {
				continue
			}
			s, err := serializeBlock(b, inner)
			if err != nil {
				return "", err
			}
			if len(blocks) == 0 {
				blocks = append(blocks, indent+marker+box+s)
			} else {
				blocks = append(blocks, inner+strings.TrimLeft(s, " "))
			}
		}
		sep := "\n"
		if !tight {
			sep = "\n\n"
		}
		items = append(items, strings.Join(blocks, sep))
	}
	if tight {
		return strings.Join(items, "\n"), nil
	}
	return strings.Join(items, "\n\n"), nil
}

func serializeTable(n *Node) (string, error) {
	var lines []string
	for _, row := range n.Content {
		if row == nil {
			continue
		}
		var line strings.Builder
		cells := 0
		for _, cell := range row.Content {
			if cell == nil {
				continue
			}
			cells++
			s, err := serializeInline(cell.Content, true)
			if err != nil {
				return "", err
			}
			// An empty cell is written "| |".
			line.WriteString("| ")
			if s != "" {
				line.WriteString(s)
				line.WriteString(" ")
			}
		}
		line.WriteString("|")
		first := len(lines) == 0
		lines = append(lines, line.String())
		if first {
			lines = append(lines, strings.Repeat("| --- ", cells)+"|")
		}
	}
	return strings.Join(lines, "\n"), nil
}

func intAttr(n *Node, key string, def int) int {
	switch v := n.Attrs[key].(type) {
	case int:
		return v
	case float64:
		return int(v)
	}
	return def
}

// markOrder is the order marks are opened in, outermost first.
var markOrder = []string{"class", "color", "link", "strong", "em", "underline", "strike", "code"}

func delimiters(m Mark) (string, string) {
	switch m.Type {
	case "strong":
		return "**", "**"
	case "em":
		return "*", "*"
	case "underline":
		return "<u>", "</u>"
	case "color":
		v, _ := m.Attrs["value"].(string)
		name, _ := m.Attrs["name"].(string)
		if name != "colour" {
			name = "color"
		}
		return "{{" + name + ":" + strings.ReplaceAll(strings.TrimSpace(v), "}", "") + "}}", "{{/" + name + "}}"
	case "class":
		v, _ := m.Attrs["value"].(string)
		return "{{class:" + strings.ReplaceAll(strings.TrimSpace(v), "}", "") + "}}", "{{/class}}"
	case "strike":
		return "~~", "~~"
	case "link":
		if isAuto(m) {
			return "", ""
		}
		href, _ := m.Attrs["href"].(string)
		return "[", "](" + href + ")"
	}
	return "", ""
}

// isAuto reports whether a link is a bare URL, written as the URL itself.
func isAuto(m Mark) bool {
	auto, _ := m.Attrs["auto"].(bool)
	return m.Type == "link" && auto
}

// serializeInline writes inline content, opening and closing marks around
// runs of nodes that share them.
func serializeInline(nodes []*Node, cell bool) (string, error) {
	var b strings.Builder
	var open []Mark
	has := func(marks []Mark, m Mark) bool {
		for _, x := range marks {
			if sameMark(x, m) {
				return true
			}
		}
		return false
	}
	closeTo := func(keep int) {
		for len(open) > keep {
			_, end := delimiters(open[len(open)-1])
			b.WriteString(end)
			open = open[:len(open)-1]
		}
	}
	for at, n := range nodes {
		// A text node with no text is not one ProseMirror makes, and would
		// write a pair of delimiters around nothing.
		if n == nil || (n.Type == "text" && n.Text == "") {
			continue
		}
		marks := sortedMarks(n.Marks)
		var code, auto bool
		var outer []Mark
		for _, m := range marks {
			if m.Type == "code" {
				code = true
			} else {
				auto = auto || isAuto(m)
				outer = append(outer, m)
			}
		}
		// Keep the open marks this node shares, from the outside in.
		keep := 0
		for keep < len(open) && keep < len(outer) && sameMark(open[keep], outer[keep]) {
			keep++
		}
		closeTo(keep)
		for _, m := range outer[keep:] {
			if has(open, m) {
				continue
			}
			start, _ := delimiters(m)
			b.WriteString(start)
			open = append(open, m)
		}
		switch n.Type {
		case "text":
			if code {
				b.WriteString(codeSpan(n.Text))
			} else if auto {
				b.WriteString(n.Text)
			} else {
				b.WriteString(escapeText(n.Text, cell, neighbour(nodes, at, at-1), neighbour(nodes, at, at+1)))
			}
		case "soft_break":
			if cell {
				b.WriteString(" ")
			} else {
				b.WriteString("\n")
			}
		case "hard_break":
			if cell {
				b.WriteString(" ")
			} else {
				b.WriteString("\\\n")
			}
		case "shortcode":
			b.WriteString(stringAttr(n, "src"))
		default:
			return "", fmt.Errorf("a %s cannot be written inline", n.Type)
		}
	}
	closeTo(0)
	return b.String(), nil
}

func sameMark(a, b Mark) bool {
	if a.Type != b.Type {
		return false
	}
	switch a.Type {
	case "link":
		return a.Attrs["href"] == b.Attrs["href"] && isAuto(a) == isAuto(b)
	case "color", "class":
		return a.Attrs["value"] == b.Attrs["value"] && a.Attrs["name"] == b.Attrs["name"]
	}
	return true
}

func sortedMarks(marks []Mark) []Mark {
	var out []Mark
	for _, t := range markOrder {
		for _, m := range marks {
			if m.Type == t {
				out = append(out, m)
			}
		}
	}
	return out
}

// codeSpan writes code in a fence of backticks longer than any run inside
// it. A line end in the code is written as a space, which is how Markdown
// draws one inside a code span. Markdown takes one space off each end of
// code that starts and ends with one, so such code, and code that starts
// or ends with a backtick, is padded with a space at each end.
func codeSpan(s string) string {
	s = strings.NewReplacer("\r\n", " ", "\n", " ", "\r", " ").Replace(s)
	fence := "`"
	for strings.Contains(s, fence) {
		fence += "`"
	}
	spaced := strings.HasPrefix(s, " ") && strings.HasSuffix(s, " ") && strings.Trim(s, " ") != ""
	if strings.HasPrefix(s, "`") || strings.HasSuffix(s, "`") || spaced {
		return fence + " " + s + " " + fence
	}
	return fence + s + fence
}

// escapeText escapes the characters in text that Markdown would otherwise
// read as markup, so what a person types in Page view is what the page
// shows: a backslash before punctuation or at the end of the text (where
// what follows it is not known), asterisks, backticks and tildes, an
// underscore at a word's edge, a bracket that would close a link, a < that
// would open a tag, an & that would start an entity reference, the first
// brace of {{ (shortcodes are inserted through the menus and forms, never
// by typing), and in a table cell the pipe. A line end inside the text is
// written as a space, since ProseMirror keeps line breaks as nodes of
// their own. before and after are the characters written next to the text
// with no markup between (neighbour), or 0.
func escapeText(s string, cell bool, before, after rune) string {
	var b strings.Builder
	rs := []rune(s)
	for i, r := range rs {
		switch r {
		case '\n', '\r':
			b.WriteRune(' ')
			continue
		case '\\':
			if i+1 == len(rs) || rs[i+1] < 128 && isEscapable(byte(rs[i+1])) {
				b.WriteString(`\\`)
				continue
			}
		case '*', '`', '~':
			b.WriteRune('\\')
		case '{':
			if i+1 < len(rs) && rs[i+1] == '{' || i+1 == len(rs) && after == '{' {
				b.WriteRune('\\')
			}
		case '&':
			if entityRe.MatchString(string(rs[i:min(len(rs), i+42)])) {
				b.WriteRune('\\')
			}
		case ']':
			// A bracket is plain text unless "](" or "][" would close a link.
			if i+1 < len(rs) && (rs[i+1] == '(' || rs[i+1] == '[') {
				b.WriteRune('\\')
			}
		case '_':
			wordBefore := i > 0 && isWord(rs[i-1]) || i == 0 && isWord(before)
			wordAfter := i+1 < len(rs) && isWord(rs[i+1]) || i+1 == len(rs) && isWord(after)
			if !(wordBefore && wordAfter) {
				b.WriteRune('\\')
			}
		case '<':
			if i+1 < len(rs) && (unicode.IsLetter(rs[i+1]) || rs[i+1] == '/' || rs[i+1] == '!' || rs[i+1] == '?') || autolinkAhead(rs[i+1:]) {
				b.WriteRune('\\')
			}
		case '|':
			if cell {
				b.WriteRune('\\')
			}
		}
		b.WriteRune(r)
	}
	return b.String()
}

// neighbour is the character of nodes[other] written beside nodes[at],
// its last before it or its first after it, when the two are text with the
// same marks but a bare address's link, which writes no delimiters, so
// nothing comes between them; otherwise 0.
func neighbour(nodes []*Node, at, other int) rune {
	if other < 0 || other >= len(nodes) || nodes[other] == nil || nodes[other].Type != "text" || nodes[other].Text == "" {
		return 0
	}
	plain := func(marks []Mark) []Mark {
		var out []Mark
		for _, m := range marks {
			if !isAuto(m) {
				out = append(out, m)
			}
		}
		return out
	}
	a, b := plain(nodes[at].Marks), plain(nodes[other].Marks)
	if len(a) != len(b) {
		return 0
	}
	for _, m := range a {
		found := false
		for _, n := range b {
			found = found || sameMark(m, n)
		}
		if !found || m.Type == "code" {
			return 0
		}
	}
	rs := []rune(nodes[other].Text)
	if other < at {
		return rs[len(rs)-1]
	}
	return rs[0]
}

// autolinkAhead says whether the text after a < could close an autolink:
// a > comes before any space, line end or other <.
func autolinkAhead(rs []rune) bool {
	for _, r := range rs {
		switch {
		case r == '>':
			return true
		case r == '<' || unicode.IsSpace(r):
			return false
		}
	}
	return false
}

func isWord(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }

var (
	// atxStart is the start of a line Markdown reads as a heading.
	atxStart = regexp.MustCompile(`^#{1,6}(?:[ \t]|$)`)
	// listStart is the start of a line Markdown reads as a list item: a
	// bullet, or a number of up to nine digits with . or ), then a space, a
	// tab or the line's end.
	listStart = regexp.MustCompile(`^(?:[-+*]|[0-9]{1,9}[.)])(?:[ \t]|$)`)
	// ruleLine is a line of only the characters that make a thematic break,
	// a setext heading's underline or a table's delimiter row.
	ruleLine = regexp.MustCompile(`^[-=+*_:|\\ \t]+$`)
	// definitionStart is the start of a link reference definition, which
	// Markdown takes out of the text.
	definitionStart = regexp.MustCompile(`^\[(?:[^\]\\]|\\.)*\]:`)
)

// escapeLineStart escapes one line of a paragraph, its first or one after
// a break, where it would be read as structure: a heading, a list item, a
// quote, a thematic break, a setext underline or a table's delimiter row.
// (A link reference definition is found on the whole paragraph, since it
// may only start one.) Spaces or a tab at the start, which Markdown would
// drop or read as an indented code block, are kept by writing the first as
// a character reference; those at the end are taken off (trimEnd).
func escapeLineStart(s string) string {
	s = trimEnd(s)
	if s == "" {
		return s
	}
	if s[0] == ' ' || s[0] == '\t' {
		return whitespaceRef(s[0]) + s[1:]
	}
	switch {
	case atxStart.MatchString(s), s[0] == '>':
		return `\` + s
	case listStart.MatchString(s):
		if s[0] == '-' || s[0] == '+' || s[0] == '*' {
			return `\` + s
		}
		i := strings.IndexAny(s, ".)")
		return s[:i] + `\` + s[i:]
	case ruleLine.MatchString(s) && strings.IndexByte("-=+:|", s[0]) >= 0:
		return `\` + s
	}
	return s
}

// trimEnd takes the spaces and tabs off the end of a line, which Markdown
// does not show and of which two or more would make a hard break. They
// are not written as character references, because a bare web address
// before them would take the reference into the address. A literal
// backslash left at the end, which would make a hard break, is escaped.
func trimEnd(s string) string {
	trimmed := strings.TrimRight(s, " \t")
	if len(trimmed) == len(s) {
		return s
	}
	if slashes := len(trimmed) - len(strings.TrimRight(trimmed, `\`)); slashes%2 == 1 {
		trimmed += `\`
	}
	return trimmed
}

// whitespaceRef is a space or a tab as a numeric character reference.
func whitespaceRef(c byte) string {
	if c == '\t' {
		return "&#9;"
	}
	return "&#32;"
}

// escapeHeading escapes a heading's text: spaces at its start, which the
// heading would drop, as a paragraph's line has them (escapeLineStart),
// and a run of # at its end after a space, which Markdown reads as the
// heading's closing sequence. Spaces at its end are taken off (trimEnd).
func escapeHeading(s string) string {
	s = trimEnd(s)
	if s == "" {
		return s
	}
	if s[0] == ' ' || s[0] == '\t' {
		s = whitespaceRef(s[0]) + s[1:]
	}
	run := len(s) - len(strings.TrimRight(s, "#"))
	if run > 0 {
		at := len(s) - run
		if at == 0 || s[at-1] == ' ' || s[at-1] == '\t' {
			s = s[:at] + `\` + s[at:]
		}
	}
	return s
}
