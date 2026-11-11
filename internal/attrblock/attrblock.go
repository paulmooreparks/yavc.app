// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package attrblock reads an attribute block, the braces some Markdown
// writers put after a heading, a link or a picture:
//
//	# Techniques {#techniques .wide}
//	[the repository](https://example.com){target="_blank" rel="noopener"}
//
// A block holds an anchor (#name), classes (.name) and pairs (name=value,
// with or without quotes). It is read at the end of a heading and directly
// after a link or a picture, and nowhere else; braces anywhere else, and
// braces that do not hold a block, stay the text they are. A document is
// untrusted, so only attributes on a short list are given to the page. The
// block's own text is kept on the node, so that an editor writes back what
// was written (DESIGN.md, decision 123).
package attrblock

import (
	"html"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// MaxLength bounds the text between a block's braces.
const MaxLength = 1024

// Block is what an attribute block says.
type Block struct {
	ID      string
	Classes []string
	Pairs   []Pair
}

// Pair is one name and value of a block, in the order written.
type Pair struct{ Name, Value string }

var (
	token = regexp.MustCompile(`^(?:#([A-Za-z0-9_:.-]+)|\.([A-Za-z0-9_-]+)|([A-Za-z_:][A-Za-z0-9_:.-]*)=(?:"([^"{}\r\n]*)"|'([^'{}\r\n]*)'|([^\s"'{}=<>` + "`" + `]+)))(?:[ \t]+|$)`)
	// trailing finds a block at the end of a heading's text, after a space
	// or alone on the line.
	trailing = regexp.MustCompile(`(?:^|[ \t]+)\{([^{}\r\n]*)\}[ \t]*$`)
	// leading finds a block at the very start of the text after a link.
	leading = regexp.MustCompile(`^\{([^{}\r\n]*)\}`)
)

// Parse reads the text between a block's braces. It reports false for text
// that is not a block: an empty one, one over MaxLength, or one with a part
// that is not an anchor, a class or a pair.
func Parse(raw string) (Block, bool) {
	var b Block
	rest := strings.Trim(raw, " \t")
	if rest == "" || len(raw) > MaxLength {
		return b, false
	}
	for rest != "" {
		m := token.FindStringSubmatch(rest)
		if m == nil {
			return Block{}, false
		}
		switch {
		case m[1] != "":
			b.ID = m[1]
		case m[2] != "":
			b.Classes = append(b.Classes, m[2])
		default:
			value := m[6]
			if strings.HasPrefix(rest[len(m[3])+1:], `"`) {
				value = m[4]
			} else if strings.HasPrefix(rest[len(m[3])+1:], `'`) {
				value = m[5]
			}
			b.Pairs = append(b.Pairs, Pair{Name: m[3], Value: value})
		}
		rest = rest[len(m[0]):]
	}
	return b, true
}

// Trailing finds a block at the end of a line of text. It returns where the
// block starts, counting the spaces before it, and the text between its
// braces.
func Trailing(line string) (start int, raw string, ok bool) {
	loc := trailing.FindStringSubmatchIndex(line)
	if loc == nil {
		return 0, "", false
	}
	raw = line[loc[2]:loc[3]]
	if _, valid := Parse(raw); !valid {
		return 0, "", false
	}
	return loc[0], raw, true
}

// Leading finds a block at the start of text. It returns the length of the
// block with its braces and the text between them.
func Leading(s string) (length int, raw string, ok bool) {
	loc := leading.FindStringSubmatchIndex(s)
	if loc == nil {
		return 0, "", false
	}
	raw = s[loc[2]:loc[3]]
	if _, valid := Parse(raw); !valid {
		return 0, "", false
	}
	return loc[1], raw, true
}

// rawName is the node attribute that keeps a block's own text. No renderer
// writes it, since it is on no element's list of attributes.
const rawName = "yavc-attrblock"

// Raw returns the text between the braces of the block a node was given.
func Raw(n ast.Node) (string, bool) {
	v, ok := n.AttributeString(rawName)
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

// allowed says which pairs each kind of node may give its element. An
// anchor and classes are always given.
var allowed = map[ast.NodeKind]map[string]bool{
	ast.KindHeading: {"title": true, "lang": true, "dir": true},
	ast.KindLink:    {"title": true, "lang": true, "dir": true, "target": true, "rel": true, "hreflang": true},
	ast.KindImage:   {"title": true, "lang": true, "dir": true, "width": true, "height": true, "loading": true},
}

// apply gives a node its block.
func apply(n ast.Node, raw string, b Block, pc parser.Context, plain func() []byte) {
	n.SetAttributeString(rawName, raw)
	if b.ID != "" {
		n.SetAttributeString("id", []byte(b.ID))
	} else if _, had := n.AttributeString("id"); had && plain != nil {
		// The automatic anchor was made from the heading with its block
		// still in it.
		n.SetAttributeString("id", pc.IDs().Generate(plain(), n.Kind()))
	}
	if len(b.Classes) > 0 {
		classes := strings.Join(b.Classes, " ")
		if old, ok := n.AttributeString("class"); ok {
			if s, isBytes := old.([]byte); isBytes && len(s) > 0 {
				classes = string(s) + " " + classes
			}
		}
		n.SetAttributeString("class", []byte(classes))
	}
	for _, p := range b.Pairs {
		if allowed[n.Kind()][strings.ToLower(p.Name)] {
			n.SetAttributeString(strings.ToLower(p.Name), []byte(p.Value))
		}
	}
}

// Written returns the attributes a block gave a node as they are written in
// a tag, each with a space before it, for a renderer that writes its own
// tag. The names in skip are left out.
func Written(n ast.Node, skip ...string) string {
	if _, ok := Raw(n); !ok {
		return ""
	}
	var b strings.Builder
	for _, a := range n.Attributes() {
		name := string(a.Name)
		value, isBytes := a.Value.([]byte)
		if !isBytes || name != "id" && name != "class" && !allowed[n.Kind()][name] {
			continue
		}
		skipped := false
		for _, s := range skip {
			skipped = skipped || s == name
		}
		if !skipped {
			b.WriteString(" " + name + `="` + html.EscapeString(string(value)) + `"`)
		}
	}
	return b.String()
}

type transformer struct{}

// escaped reports whether the byte at i has an odd number of backslashes
// before it, and so is not a brace that opens a block.
func escaped(src []byte, i int) bool {
	n := 0
	for i-n-1 >= 0 && src[i-n-1] == '\\' {
		n++
	}
	return n%2 == 1
}

func (transformer) Transform(doc *ast.Document, reader text.Reader, pc parser.Context) {
	src := reader.Source()
	var headings []*ast.Heading
	var followed []ast.Node
	ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch node := n.(type) {
		case *ast.Heading:
			headings = append(headings, node)
		case *ast.Link, *ast.Image:
			followed = append(followed, n)
		}
		return ast.WalkContinue, nil
	})
	for _, n := range followed {
		after(n, src, pc)
	}
	for _, h := range headings {
		heading(h, src, pc)
	}
}

// after reads a block written directly after a link or a picture, and takes
// its text out of the words that follow.
func after(n ast.Node, src []byte, pc parser.Context) {
	first, ok := n.NextSibling().(*ast.Text)
	if !ok || first.Segment.Start >= len(src) || src[first.Segment.Start] != '{' {
		return
	}
	start := first.Segment.Start
	end := start
	for end < len(src) && src[end] != '\n' {
		end++
	}
	length, raw, ok := Leading(string(src[start:end]))
	if !ok {
		return
	}
	stop := start + length
	// Every node the block covers must be plain text, or it is not one.
	var covered []*ast.Text
	for s := ast.Node(first); s != nil; s = s.NextSibling() {
		t, isText := s.(*ast.Text)
		if !isText || len(covered) > 0 && t.Segment.Start != covered[len(covered)-1].Segment.Stop {
			return
		}
		covered = append(covered, t)
		if t.Segment.Stop >= stop {
			break
		}
		if t.SoftLineBreak() || t.HardLineBreak() {
			return
		}
	}
	if len(covered) == 0 || covered[len(covered)-1].Segment.Stop < stop {
		return
	}
	block, _ := Parse(raw)
	parent := n.Parent()
	for _, t := range covered {
		if t.Segment.Stop <= stop && !t.SoftLineBreak() && !t.HardLineBreak() {
			parent.RemoveChild(parent, t)
		} else {
			t.Segment = text.NewSegment(stop, t.Segment.Stop)
		}
	}
	apply(n, raw, block, pc, nil)
}

// heading reads a block at the end of a heading, and takes its text out of
// the heading's words.
func heading(h *ast.Heading, src []byte, pc parser.Context) {
	lines := h.Lines()
	if lines.Len() == 0 {
		return
	}
	line := lines.At(lines.Len() - 1)
	at, raw, ok := Trailing(string(src[line.Start:line.Stop]))
	if !ok {
		return
	}
	start := line.Start + at
	brace := start
	for brace < line.Stop && src[brace] != '{' {
		brace++
	}
	if escaped(src, brace) {
		return
	}
	closing := line.Stop
	for closing > brace && src[closing-1] != '}' {
		closing--
	}
	// The block must be plain text from its brace to its end: text nodes
	// that follow one another with nothing else among them.
	var covered []*ast.Text
	for c := h.LastChild(); c != nil; c = c.PreviousSibling() {
		t, isText := c.(*ast.Text)
		if !isText {
			return
		}
		if len(covered) == 0 {
			if t.Segment.Stop < closing {
				return
			}
		} else if t.Segment.Stop != covered[len(covered)-1].Segment.Start {
			return
		}
		covered = append(covered, t)
		if t.Segment.Start <= start {
			break
		}
	}
	if len(covered) == 0 || covered[len(covered)-1].Segment.Start > start {
		return
	}
	block, _ := Parse(raw)
	for _, t := range covered {
		if t.Segment.Start >= start {
			h.RemoveChild(h, t)
		} else {
			t.Segment = text.NewSegment(t.Segment.Start, start)
		}
	}
	apply(h, raw, block, pc, func() []byte {
		var plain []byte
		ast.Walk(h, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
			if t, isText := n.(*ast.Text); isText && entering {
				plain = append(plain, t.Segment.Value(src)...)
			}
			return ast.WalkContinue, nil
		})
		return plain
	})
}

type extender struct{}

// Extension reads attribute blocks in a goldmark engine.
var Extension goldmark.Extender = extender{}

func (extender) Extend(m goldmark.Markdown) {
	// Before the transformers that read a heading's or a link's words.
	m.Parser().AddOptions(parser.WithASTTransformers(util.Prioritized(transformer{}, 100)))
}
