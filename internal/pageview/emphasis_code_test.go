// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package pageview

import (
	"strings"
	"testing"

	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

func TestCodeEmphasisDelimiter(t *testing.T) {
	for _, src := range []string{"**`x`**", "*`x`*", "***`x`***", "**`` `x` ``**", "**` x `**", "__`x`__", "_`x`_", "___`x`___"} {
		root := md.Parser().Parse(text.NewReader([]byte(src)))
		p := parser{src: []byte(src)}
		count := 0
		_ = ast.Walk(root, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
			if e, ok := n.(*ast.Emphasis); ok && entering {
				count++
				if got, want := p.starred(e), src[0] == '*'; got != want {
					t.Errorf("%q level %d: starred = %v, want %v", src, e.Level, got, want)
				}
			}
			return ast.WalkContinue, nil
		})
		if count == 0 {
			t.Fatalf("%q contains no emphasis", src)
		}
	}
}

func TestEmphasisStartingWithCode(t *testing.T) {
	for _, src := range []string{
		"- **`alpha@1`** checks a file.\n",
		"- **`notes.md`.** Section one.\n",
		"Before **`x`** after.\n",
		"*`x`*\n",
		"***`x`***\n",
		"**plain**\n",
		"`alone`\n",
		"**a `b`** c\n",
		"[`a`](u)\n",
		"~~`a`~~\n",
		"**`` `x` ``**\n",
	} {
		t.Run(strings.TrimSpace(src), func(t *testing.T) {
			doc := docOf(t, src)
			if doc.Content[0].Type == "source_block" {
				t.Fatal("opened as source instead of rich text")
			}
			if got := back(t, doc); got != src {
				t.Fatalf("untouched source changed: %q", got)
			}
		})
	}
}

func TestUnderscoreCodeEmphasisStaysSource(t *testing.T) {
	src := "__`x`__\n"
	doc := docOf(t, src)
	if doc.Content[0].Type != "source_block" {
		t.Fatal("underscore emphasis must stay source")
	}
	if got := back(t, doc); got != src {
		t.Fatalf("underscore source changed: %q", got)
	}
}

func TestEditedEmphasisCodeItem(t *testing.T) {
	doc := docOf(t, "- **`alpha@1`** checks a file.\n\nUntouched __words__.\n")
	var edit func(*Node)
	changed := false
	edit = func(n *Node) {
		if n.Type == "text" && n.Text == "alpha@1" {
			n.Text = "x"
			changed = true
		}
		for _, child := range n.Content {
			edit(child)
		}
	}
	edit(doc)
	if !changed {
		t.Fatal("code was not editable")
	}
	want := "- **`x`** checks a file.\n\nUntouched __words__.\n"
	if got := back(t, doc); got != want {
		t.Fatalf("edited item: got %q, want %q", got, want)
	}
}
