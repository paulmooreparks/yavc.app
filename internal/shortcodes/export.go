// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package shortcodes

import (
	"fmt"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
	"strings"
	"yavc.app/internal/frontmatter"
)

// ExportCalls reads surviving document-level declarations, excluding code,
// quoted examples, definitions and private containers.
func ExportCalls(source string, registry *MacroRegistry, name string) ([]Call, error) {
	source = strings.ReplaceAll(source, "\r\n", "\n")
	source = source[frontmatter.End(source):]
	doc := goldmark.New(goldmark.WithExtensions(WithMacros(registry))).Parser().Parse(text.NewReader([]byte(source)))
	if err := PruneExport(doc); err != nil {
		return nil, err
	}
	var calls []Call
	for n := doc.FirstChild(); n != nil; n = n.NextSibling() {
		if n.Kind() != ast.KindParagraph {
			continue
		}
		for child := n.FirstChild(); child != nil; child = child.NextSibling() {
			if call, ok := child.(*Inline); ok && !call.Closing && call.Call.Name == name {
				calls = append(calls, call.Call)
			}
		}
	}
	return calls, nil
}

// PruneExport removes exclusions from the parsed tree before rendering,
// contents generation or asset discovery. Source and editing trees stay intact.
func PruneExport(doc ast.Node) error {
	var prune func(ast.Node) error
	prune = func(parent ast.Node) error {
		inline := parent.FirstChild() != nil && parent.FirstChild().Type() == ast.TypeInline
		if inline {
			matchSpans(parent)
		}
		depth := 0
		var walkInline func(ast.Node) error
		walkInline = func(container ast.Node) error {
			for child := container.FirstChild(); child != nil; {
				next := child.NextSibling()
				if token, ok := child.(*Inline); ok && token.Call.Name == "no-export" {
					if !token.Matched {
						return fmt.Errorf("no-export requires a matching opening and closing tag in the same block")
					}
					if token.Closing {
						depth--
					} else {
						depth++
					}
					container.RemoveChild(container, child)
				} else if child.HasChildren() {
					if err := walkInline(child); err != nil {
						return err
					}
					if !child.HasChildren() {
						container.RemoveChild(container, child)
					}
				} else if depth > 0 {
					container.RemoveChild(container, child)
				}
				child = next
			}
			return nil
		}
		if inline {
			return walkInline(parent)
		}
		for child := parent.FirstChild(); child != nil; {
			next := child.NextSibling()
			if block, ok := child.(*Block); ok && (block.Call.Name == "no-export" || block.Call.Name == "draft-note") {
				if !block.Closed {
					return fmt.Errorf("%s requires its closing tag before export", block.Call.Name)
				}
				parent.RemoveChild(parent, child)
			} else {
				hadChildren := child.HasChildren()
				if err := prune(child); err != nil {
					return err
				}
				if hadChildren && !child.HasChildren() {
					parent.RemoveChild(parent, child)
				}
			}
			child = next
		}
		return nil
	}
	return prune(doc)
}
