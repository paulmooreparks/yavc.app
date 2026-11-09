// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package footnotes

import (
	"bytes"
	"strings"
	"testing"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/text"
)

func TestDefinitionsRetainTheirSourcePositionsAndUnusedText(t *testing.T) {
	source := []byte("Before[^later] and again[^later].\n\n[^unused]: Keep this text.\n\nMiddle.\n\n[^later]: The **rich** note.\n\nAfter.\n")
	markdown := goldmark.New(goldmark.WithExtensions(Extension))
	doc := markdown.Parser().Parse(text.NewReader(source))
	var kinds []string
	for node := doc.FirstChild(); node != nil; node = node.NextSibling() {
		kinds = append(kinds, node.Kind().String())
		if note, ok := node.(*extast.Footnote); ok {
			if note.Pos() != bytes.Index(source, append(append([]byte("[^"), note.Ref...), []byte("]:")...)) {
				t.Fatalf("Wrong source position for %s: %d", note.Ref, note.Pos())
			}
		}
	}
	if strings.Join(kinds, ",") != "Paragraph,Footnote,Paragraph,Footnote,Paragraph" {
		t.Fatalf("Definition ordering changed: %v", kinds)
	}
	var out bytes.Buffer
	if err := markdown.Renderer().Render(&out, source, doc); err != nil {
		t.Fatal(err)
	}
	if strings.Count(out.String(), `data-footnote-ref="later"`) != 2 || !strings.Contains(out.String(), "Keep this text.") || !strings.Contains(out.String(), "<strong>rich</strong>") {
		t.Fatal(out.String())
	}
}

func TestCodeExamplesAndUndefinedReferencesStayLiteral(t *testing.T) {
	source := []byte("`[^not-a-note]` and [^undefined].\n\n```md\n[^example]: Not a definition.\n```\n")
	markdown := goldmark.New(goldmark.WithExtensions(Extension))
	doc := markdown.Parser().Parse(text.NewReader(source))
	_ = ast.Walk(doc, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering {
			switch node.(type) {
			case *extast.Footnote, *extast.FootnoteLink:
				t.Fatalf("Code or undefined reference became a footnote: %s", node.Kind())
			}
		}
		return ast.WalkContinue, nil
	})
}
