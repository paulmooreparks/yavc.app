// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package footnotes keeps Markdown footnote definitions at their authored
// positions. Goldmark's public parsers supply the syntax and reference indices;
// the editing tree must also retain unused definitions and original ordering.
package footnotes

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

type location struct {
	note   *extast.Footnote
	parent ast.Node
	offset int
}

var locationsKey = parser.NewContextKey()

// ValidLabel accepts bounded, unambiguous labels that the rich serializer can
// reproduce. Other Markdown spellings remain source-editable.
func ValidLabel(label string) bool {
	return len(label) > 0 && len(label) <= 999 && strings.TrimSpace(label) == label && !strings.ContainsAny(label, "[]\\") && strings.IndexFunc(label, unicode.IsControl) < 0
}

// Context exposes parser-owned definitions, never attributes from authored HTML.
func Context(doc ast.Node) map[string]int {
	result := map[string]int{}
	_ = ast.Walk(doc, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if note, ok := node.(*extast.Footnote); ok && entering && ValidLabel(string(note.Ref)) {
			if _, exists := result[string(note.Ref)]; !exists {
				result[string(note.Ref)] = note.Index
			}
		}
		return ast.WalkContinue, nil
	})
	return result
}

// Renumber assigns reference numbers from the visible document before note
// bodies. Definitions retain their authored order and unused notes get -1.
func Renumber(doc ast.Node) {
	definitions := map[string]*extast.Footnote{}
	_ = ast.Walk(doc, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if note, ok := node.(*extast.Footnote); ok && entering {
			if _, found := definitions[string(note.Ref)]; !found {
				definitions[string(note.Ref)] = note
			}
			note.Index = -1
		}
		return ast.WalkContinue, nil
	})
	numbers := map[string]int{}
	var queue []string
	collect := func(root ast.Node) {
		_ = ast.Walk(root, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
			if !entering {
				return ast.WalkContinue, nil
			}
			if _, ok := node.(*extast.Footnote); ok && node != root {
				return ast.WalkSkipChildren, nil
			}
			if link, ok := node.(*extast.FootnoteLink); ok {
				value, _ := link.AttributeString("data-footnote-ref")
				label, _ := value.(string)
				if _, found := numbers[label]; !found && definitions[label] != nil {
					numbers[label] = len(numbers) + 1
					queue = append(queue, label)
				}
				link.Index = numbers[label]
			}
			return ast.WalkContinue, nil
		})
	}
	collect(doc)
	for i := 0; i < len(queue); i++ {
		note := definitions[queue[i]]
		note.Index = numbers[queue[i]]
		collect(note)
	}
}

// PrepareExport removes unused definitions after exclusion pruning. It never
// changes the editing tree, which is parsed separately for export.
func PrepareExport(doc ast.Node) {
	Renumber(doc)
	var unused []ast.Node
	_ = ast.Walk(doc, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if note, ok := node.(*extast.Footnote); ok && entering && note.Index < 1 {
			unused = append(unused, node)
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})
	for _, node := range unused {
		if parent := node.Parent(); parent != nil {
			parent.RemoveChild(parent, node)
		}
	}
}

// Problems reports source constructs which would be ambiguous or excessive
// in the editable and Office representations.
func Problems(doc ast.Node) []string {
	seen := map[string]bool{}
	var problems []string
	count := 0
	_ = ast.Walk(doc, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if note, ok := node.(*extast.Footnote); ok && entering {
			count++
			label := string(note.Ref)
			if seen[label] {
				problems = append(problems, "Footnote labels must be unique.")
			}
			seen[label] = true
			if !ValidLabel(label) {
				problems = append(problems, "This footnote label requires source editing. Use a label without brackets, backslashes or control characters.")
			}
		}
		return ast.WalkContinue, nil
	})
	if count > 256 {
		problems = append(problems, "A document supports at most 256 footnote definitions.")
	}
	return problems
}

type blockParser struct{ parser.BlockParser }

func (p blockParser) Open(parent ast.Node, reader text.Reader, context parser.Context) (ast.Node, parser.State) {
	_, segment := reader.PeekLine()
	offset := segment.Start + context.BlockOffset() - segment.Padding
	node, state := p.BlockParser.Open(parent, reader, context)
	if note, ok := node.(*extast.Footnote); ok {
		note.SetPos(offset)
		locations, _ := context.Get(locationsKey).([]location)
		context.Set(locationsKey, append(locations, location{note, parent, offset}))
	}
	return node, state
}

type transform struct{}

func (transform) Transform(doc *ast.Document, reader text.Reader, context parser.Context) {
	locations, _ := context.Get(locationsKey).([]location)
	labels := map[int]string{}
	for _, item := range locations {
		if item.note.Index >= 0 {
			labels[item.note.Index] = string(item.note.Ref)
		}
	}
	var lists []ast.Node
	_ = ast.Walk(doc, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if link, ok := node.(*extast.FootnoteLink); ok {
			link.SetAttributeString("data-footnote-ref", labels[link.Index])
		}
		if _, ok := node.(*extast.FootnoteList); ok {
			lists = append(lists, node)
		}
		return ast.WalkContinue, nil
	})
	sort.SliceStable(locations, func(i, j int) bool { return locations[i].offset < locations[j].offset })
	for _, item := range locations {
		// Backlinks belong to the rendered navigation, not editable note text.
		var backlinks []ast.Node
		_ = ast.Walk(item.note, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
			if _, ok := node.(*extast.FootnoteBacklink); ok && entering {
				backlinks = append(backlinks, node)
			}
			return ast.WalkContinue, nil
		})
		for _, node := range backlinks {
			node.Parent().RemoveChild(node.Parent(), node)
		}
		if parent := item.note.Parent(); parent != nil {
			parent.RemoveChild(parent, item.note)
		}
		var before ast.Node
		for sibling := item.parent.FirstChild(); sibling != nil; sibling = sibling.NextSibling() {
			if position(sibling, reader.Source()) > item.offset {
				before = sibling
				break
			}
		}
		if before == nil {
			item.parent.AppendChild(item.parent, item.note)
		} else {
			item.parent.InsertBefore(item.parent, before, item.note)
		}
	}
	for _, list := range lists {
		if parent := list.Parent(); parent != nil {
			parent.RemoveChild(parent, list)
		}
	}
	Renumber(doc)
}

func position(node ast.Node, source []byte) int {
	if node.Pos() >= 0 {
		return node.Pos()
	}
	if node.Type() == ast.TypeBlock && node.Lines().Len() > 0 {
		return node.Lines().At(0).Start
	}
	if node, ok := node.(*ast.Text); ok {
		return node.Segment.Start
	}
	for child := node.FirstChild(); child != nil; child = child.NextSibling() {
		if pos := position(child, source); pos >= 0 {
			return pos
		}
	}
	return -1
}

type htmlRenderer struct{}

func (htmlRenderer) RegisterFuncs(register renderer.NodeRendererFuncRegisterer) {
	register.Register(extast.KindFootnoteLink, renderLink)
	register.Register(extast.KindFootnote, renderNote)
}

func renderLink(writer util.BufWriter, _ []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if entering {
		link := node.(*extast.FootnoteLink)
		label, _ := link.AttributeString("data-footnote-ref")
		_, err := fmt.Fprintf(writer, `<sup class="doc-footnote-ref" data-footnote-ref="%s" data-footnote-number="%d"><a aria-label="Footnote %d">%d</a></sup>`, util.EscapeHTML([]byte(fmt.Sprint(label))), link.Index, link.Index, link.Index)
		return ast.WalkSkipChildren, err
	}
	return ast.WalkContinue, nil
}

func renderNote(writer util.BufWriter, _ []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	note := node.(*extast.Footnote)
	if entering {
		label := util.EscapeHTML(note.Ref)
		display := string(label)
		if note.Index > 0 {
			display = strconv.Itoa(note.Index)
		}
		_, err := fmt.Fprintf(writer, `<aside class="doc-footnote" data-footnote="%s" data-footnote-number="%d"><span class="doc-footnote-label">%s</span><div class="doc-footnote-body">`, label, note.Index, display)
		return ast.WalkContinue, err
	}
	_, err := writer.WriteString("</div></aside>\n")
	return ast.WalkContinue, err
}

type extensionType struct{}

// Extension uses Goldmark's documented parser and renderer extension APIs.
var Extension goldmark.Extender = extensionType{}

func (extensionType) Extend(markdown goldmark.Markdown) {
	// Register the public syntax parsers directly. The standard endnote
	// transformer moves definitions and drops unused ones, which would lose
	// editing provenance. Our transformer has no dependency on its priority.
	markdown.Parser().AddOptions(
		parser.WithBlockParsers(util.Prioritized(blockParser{extension.NewFootnoteBlockParser()}, 50)),
		parser.WithInlineParsers(util.Prioritized(extension.NewFootnoteParser(), 50)),
		parser.WithASTTransformers(util.Prioritized(transform{}, 1000)),
	)
	markdown.Renderer().AddOptions(renderer.WithNodeRenderers(util.Prioritized(htmlRenderer{}, 100)))
}
