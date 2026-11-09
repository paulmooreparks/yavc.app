// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package review

import (
	"bytes"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
	"html"
	"sort"
	"strings"
)

// Inline retains a complete single-line proposal as an editable source atom.
type Inline struct {
	ast.BaseInline
	Mark Mark
	HTML string
}

var KindInline = ast.NewNodeKind("ReviewInline")

func (n *Inline) Kind() ast.NodeKind { return KindInline }
func (n *Inline) Dump(source []byte, level int) {
	ast.DumpHelper(n, source, level, map[string]string{"kind": string(n.Mark.Kind)}, nil)
}

type token struct {
	ast.BaseInline
	mark Mark
	role string
	raw  string
}

var kindToken = ast.NewNodeKind("ReviewToken")

func (n *token) Kind() ast.NodeKind { return kindToken }
func (n *token) Dump(source []byte, level int) {
	ast.DumpHelper(n, source, level, map[string]string{"role": n.role}, nil)
}

type span struct {
	ast.BaseInline
	kind Kind
}

var kindSpan = ast.NewNodeKind("ReviewSpan")

func (n *span) Kind() ast.NodeKind            { return kindSpan }
func (n *span) Dump(source []byte, level int) { ast.DumpHelper(n, source, level, nil, nil) }

type blockSpan struct {
	ast.BaseBlock
	kind Kind
}

var kindBlockSpan = ast.NewNodeKind("ReviewBlockSpan")

func (n *blockSpan) Kind() ast.NodeKind            { return kindBlockSpan }
func (n *blockSpan) Dump(source []byte, level int) { ast.DumpHelper(n, source, level, nil, nil) }

type renderState struct {
	catalog                Catalog
	err                    error
	open, close, separator map[int]Mark
}

var renderingKey = parser.NewContextKey()

const catalogAttribute = "yavc-review-catalog"

type rendering struct {
	syntax    []goldmark.Extender
	inline    func(string) string
	exporting bool
}

// Rendering adds display nodes without giving rendered identifiers authority.
// The caller supplies its own non-review inline renderer and syntax extensions.
func Rendering(inline func(string) string, syntax ...goldmark.Extender) goldmark.Extender {
	return &rendering{syntax: syntax, inline: inline}
}

// ExportRendering leaves the parsed tree unwrapped until exclusions are pruned.
func ExportRendering(inline func(string) string, syntax ...goldmark.Extender) goldmark.Extender {
	return &rendering{syntax: syntax, inline: inline, exporting: true}
}
func (e *rendering) Extend(markdown goldmark.Markdown) {
	markdown.Parser().AddOptions(parser.WithInlineParsers(util.Prioritized(e, 30)), parser.WithASTTransformers(util.Prioritized(e, 700)))
	markdown.Renderer().AddOptions(renderer.WithNodeRenderers(util.Prioritized(e, 30)))
}
func (e *rendering) state(source []byte, context parser.Context) *renderState {
	if state, ok := context.Get(renderingKey).(*renderState); ok {
		return state
	}
	catalog, err := Scan(string(source), 0, e.syntax...)
	state := &renderState{catalog: catalog, err: err, open: map[int]Mark{}, close: map[int]Mark{}, separator: map[int]Mark{}}
	for _, mark := range catalog.Marks {
		state.open[mark.From] = mark
		state.close[mark.BodyTo] = mark
		if mark.Separator >= 0 {
			state.separator[mark.Separator] = mark
		}
	}
	context.Set(renderingKey, state)
	return state
}
func (*rendering) Trigger() []byte { return []byte{'{', '+', '-', '~', '<', '='} }
func (e *rendering) Parse(parent ast.Node, reader text.Reader, context parser.Context) ast.Node {
	for node := parent; node != nil; node = node.Parent() {
		if opaque, ok := node.(interface{ ReviewOpaque() bool }); ok && opaque.ReviewOpaque() {
			return nil
		}
	}
	line, segment := reader.PeekLine()
	state := e.state(reader.Source(), context)
	if state.err != nil {
		return nil
	}
	if mark, ok := state.open[segment.Start]; ok {
		if !strings.ContainsAny(mark.Raw, "\r\n") && len(mark.Raw) <= len(line) {
			cell := false
			for node := parent; node != nil; node = node.Parent() {
				if node.Kind() == extast.KindTableCell {
					cell = true
					break
				}
			}
			display := mark
			if cell {
				display.Before = strings.ReplaceAll(display.Before, `\|`, `|`)
				display.After = strings.ReplaceAll(display.After, `\|`, `|`)
			}
			node := &Inline{Mark: mark, HTML: e.html(display)}
			node.SetPos(mark.From)
			reader.Advance(len(mark.Raw))
			return node
		}
		node := &token{mark: mark, role: "start", raw: mark.Raw[:3]}
		node.SetPos(segment.Start)
		reader.Advance(3)
		return node
	}
	if mark, ok := state.close[segment.Start]; ok {
		node := &token{mark: mark, role: "end", raw: mark.Raw[len(mark.Raw)-3:]}
		node.SetPos(segment.Start)
		reader.Advance(3)
		return node
	}
	if mark, ok := state.separator[segment.Start]; ok {
		node := &token{mark: mark, role: "separator", raw: "~>"}
		node.SetPos(segment.Start)
		reader.Advance(2)
		return node
	}
	return nil
}
func (e *rendering) html(mark Mark) string {
	draw := e.inline
	if draw == nil {
		draw = html.EscapeString
	}
	var body string
	switch mark.Kind {
	case Addition:
		body = "<ins>" + draw(mark.After) + "</ins>"
	case Deletion:
		body = "<del>" + draw(mark.Before) + "</del>"
	case Replacement:
		body = "<del>" + draw(mark.Before) + "</del><ins>" + draw(mark.After) + "</ins>"
	case Highlight:
		body = "<mark>" + draw(mark.Before) + "</mark>"
	case Comment:
		body = `<span class="critic-comment" role="note"><span class="glyph" style="--glyph:var(--glyph-comments)" aria-hidden="true"></span>` + html.EscapeString(mark.Before) + `</span>`
	}
	return `<span class="critic critic-` + string(mark.Kind) + `" data-critic-raw="` + html.EscapeString(mark.Raw) + `">` + body + `</span>`
}

// InlineHTML accepts parser-owned mark data. Callers exposing raw source must
// validate it through Scan before generating a rich atom.
func InlineHTML(mark Mark, inline func(string) string) string {
	return (&rendering{inline: inline}).html(mark)
}
func tag(kind Kind) string {
	switch kind {
	case Addition:
		return "ins"
	case Deletion:
		return "del"
	case Highlight:
		return "mark"
	}
	return "span"
}

// Bounds use documented AST positions and source segments. Generated strings
// have no source range and are left with their enclosing source-bearing node.
func bounds(node ast.Node, cache map[ast.Node][2]int) (int, int) {
	if span, ok := cache[node]; ok {
		return span[0], span[1]
	}
	from, to := node.Pos(), node.Pos()
	switch n := node.(type) {
	case *ast.Text:
		return n.Segment.Start, n.Segment.Stop
	case *ast.RawHTML:
		if n.Segments.Len() > 0 {
			return n.Segments.At(0).Start, n.Segments.At(n.Segments.Len() - 1).Stop
		}
	case *token:
		return n.Pos(), n.Pos() + len(n.raw)
	case *Inline:
		return n.Pos(), n.Pos() + len(n.Mark.Raw)
	}
	if node.Type() == ast.TypeBlock && node.Lines().Len() > 0 {
		if from < 0 {
			from = node.Lines().At(0).Start
		}
		to = max(to, node.Lines().At(node.Lines().Len()-1).Stop)
	}
	for child := node.FirstChild(); child != nil; child = child.NextSibling() {
		start, end := bounds(child, cache)
		if start >= 0 && (from < 0 || start < from) {
			from = start
		}
		to = max(to, end)
	}
	cache[node] = [2]int{from, to}
	return from, to
}
func canWrapBlock(node ast.Node) bool {
	switch node.(type) {
	case *ast.Paragraph, *ast.TextBlock, *ast.Heading, *ast.FencedCodeBlock, *ast.CodeBlock, *ast.HTMLBlock, *ast.ThematicBreak:
		return true
	}
	return false
}
func (e *rendering) Transform(doc *ast.Document, reader text.Reader, context parser.Context) {
	state := e.state(reader.Source(), context)
	if e.exporting {
		doc.SetAttributeString(catalogAttribute, &renderState{})
		return
	}
	doc.SetAttributeString(catalogAttribute, state)
	cache := map[ast.Node][2]int{}
	bounds(doc, cache)
	var visit func(ast.Node)
	visit = func(parent ast.Node) {
		for node := parent.FirstChild(); node != nil; {
			next := node.NextSibling()
			if _, ok := node.(*Inline); ok {
				node = next
				continue
			}
			if _, ok := node.(*token); ok {
				node = next
				continue
			}
			from, to := bounds(node, cache)
			wrapped := false
			index := sort.Search(len(state.catalog.Marks), func(i int) bool { return state.catalog.Marks[i].To > from })
			if index < len(state.catalog.Marks) {
				mark := state.catalog.Marks[index]
				if !strings.ContainsAny(mark.Raw, "\r\n") {
					visit(node)
					node = next
					continue
				}
				if from < mark.BodyFrom || to > mark.BodyTo || from < 0 {
					visit(node)
					node = next
					continue
				}
				if mark.Kind == Comment {
					parent.RemoveChild(parent, node)
					node = next
					continue
				}
				kind := mark.Kind
				if kind == Replacement {
					if to <= mark.Separator {
						kind = Deletion
					} else if from >= mark.Separator+2 {
						kind = Addition
					} else {
						visit(node)
						node = next
						continue
					}
				}
				if node.Type() == ast.TypeBlock {
					if !canWrapBlock(node) {
						visit(node)
						node = next
						continue
					}
					wrapper := &blockSpan{kind: kind}
					wrapper.SetPos(from)
					parent.ReplaceChild(parent, node, wrapper)
					wrapper.AppendChild(wrapper, node)
				} else {
					wrapper := &span{kind: kind}
					wrapper.SetPos(from)
					parent.ReplaceChild(parent, node, wrapper)
					wrapper.AppendChild(wrapper, node)
				}
				wrapped = true
			}
			if !wrapped {
				visit(node)
			}
			node = next
		}
	}
	visit(doc)
}

// DisplayCatalog carries only parser-owned data for source-unit grouping.
func DisplayCatalog(doc ast.Node) (Catalog, error) {
	value, ok := doc.AttributeString(catalogAttribute)
	if !ok {
		return Catalog{}, nil
	}
	state, ok := value.(*renderState)
	if !ok {
		return Catalog{}, nil
	}
	return state.catalog, state.err
}

// Unresolved considers only the surviving export tree. Excluded annotations
// and malformed examples cannot veto an otherwise clean output.
func Unresolved(doc ast.Node, source []byte) bool {
	found := false
	sourceText := string(source)
	_ = ast.Walk(doc, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if found {
			return ast.WalkStop, nil
		}
		if opaque, ok := node.(interface{ ReviewOpaque() bool }); ok && opaque.ReviewOpaque() {
			return ast.WalkSkipChildren, nil
		}
		switch node.(type) {
		case *Inline, *token:
			found = true
			return ast.WalkStop, nil
		case *ast.CodeSpan, *ast.CodeBlock, *ast.FencedCodeBlock, *ast.HTMLBlock, *ast.RawHTML:
			return ast.WalkSkipChildren, nil
		}
		if node, ok := node.(*ast.Text); ok {
			from, to := node.Segment.Start, node.Segment.Stop
			for from < to {
				offset := bytes.IndexByte(source[from:to], '{')
				if offset < 0 {
					break
				}
				at := from + offset
				for _, form := range forms {
					if bytes.HasPrefix(source[at:], []byte(form.open)) && !escaped(sourceText, at) {
						found = true
						return ast.WalkStop, nil
					}
				}
				from = at + 1
			}
		}
		return ast.WalkContinue, nil
	})
	return found
}

func (e *rendering) RegisterFuncs(register renderer.NodeRendererFuncRegisterer) {
	register.Register(KindInline, func(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering {
			_, _ = w.WriteString(node.(*Inline).HTML)
		}
		return ast.WalkSkipChildren, nil
	})
	register.Register(kindToken, func(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
		n := node.(*token)
		if entering && n.role == "start" {
			if n.mark.Kind == Comment {
				_, _ = w.WriteString(e.html(n.mark))
			} else {
				_, _ = w.WriteString(`<span class="critic-marker" data-critic-raw="` + html.EscapeString(n.mark.Raw) + `" role="note">` + html.EscapeString(string(n.mark.Kind)) + `</span>`)
			}
		}
		return ast.WalkSkipChildren, nil
	})
	register.Register(kindSpan, func(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
		name := tag(node.(*span).kind)
		if entering {
			_, _ = w.WriteString("<" + name + ` class="critic-body">`)
		} else {
			_, _ = w.WriteString("</" + name + ">")
		}
		return ast.WalkContinue, nil
	})
	register.Register(kindBlockSpan, func(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
		name := tag(node.(*blockSpan).kind)
		if entering {
			_, _ = w.WriteString("<" + name + ` class="critic-body critic-block">`)
		} else {
			_, _ = w.WriteString("</" + name + ">\n")
		}
		return ast.WalkContinue, nil
	})
}
