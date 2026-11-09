// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package pageview

import (
	"strings"
	"testing"
	"yavc.app/internal/preview"
)

func TestInlineReviewAtomsRoundTripAndRemainWithEditedParagraphs(t *testing.T) {
	for _, source := range []string{"Before {++**new**++} after.", "{--old--} {~~before~>after~~} {>>a comment<<} {==marked==}.", "[A {++label++}](https://example.invalid)."} {
		doc, err := Parse(source)
		if err != nil {
			t.Fatalf("%q: %v", source, err)
		}
		got, err := Serialize(doc)
		if err != nil || got != source {
			t.Fatalf("%q != %q: %v", got, source, err)
		}
	}
	source := "Before {++**new**++} after.\n"
	blocks, _ := preview.Render(source)
	doc := ParseDocument(source, Units(blocks))
	found := false
	var walk func(*Node)
	walk = func(node *Node) {
		if node.Type == "critic" {
			found = true
			if !strings.Contains(stringAttr(node, "html"), "<strong>new</strong>") {
				t.Fatal(node)
			}
		}
		if node.Type == "text" && node.Text == " after." {
			node.Text = " changed."
		}
		for _, child := range node.Content {
			walk(child)
		}
	}
	walk(doc)
	if !found {
		t.Fatal("no rich review atom")
	}
	got, err := SerializeDocument(doc)
	if err != nil || got != "Before {++**new**++} changed.\n" {
		t.Fatalf("%q %v", got, err)
	}
}
func TestMultilineReviewGroupingPreservesEveryOriginalSourceByte(t *testing.T) {
	for _, source := range []string{
		"Prefix {++first\n\nsecond++} suffix.\n\nAfter.\n",
		"Prefix {>>comment\n\nprivate paragraph\n\nlast<<} suffix.\n\nAfter.\n",
		"{--First\n\n- One\n- Two\n\nLast--}\n\nAfter.\n",
		"{{note}}\nBefore {~~old\n\nparagraph~>new\n\nparagraph~~}.\n{{/note}}\n",
	} {
		blocks, _ := preview.Render(source)
		doc := ParseDocument(source, Units(blocks))
		got, err := SerializeDocument(doc)
		if err != nil || got != source {
			t.Fatalf("%q != %q: %v", got, source, err)
		}
	}
}

func TestTableReviewAtomsCannotIntroduceColumnSeparators(t *testing.T) {
	source := "| A | B |\n| --- | --- |\n| {++a\\|b++} | next |"
	doc, err := Parse(source)
	if err != nil {
		t.Fatal(err)
	}
	var atom *Node
	var walk func(*Node)
	walk = func(node *Node) {
		if node.Type == "critic" {
			atom = node
		}
		for _, child := range node.Content {
			walk(child)
		}
	}
	walk(doc)
	if atom == nil || !strings.Contains(stringAttr(atom, "html"), "<ins>a|b</ins>") {
		t.Fatal(atom)
	}
	if got, err := Serialize(doc); err != nil || got != source {
		t.Fatalf("%q %v", got, err)
	}
	atom.Attrs["src"] = "{++a|b++}"
	if got, err := Serialize(doc); err == nil {
		t.Fatalf("emitted broken table %q", got)
	}
}
