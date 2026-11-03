// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package pageview

import "testing"

// The highlight, superscript and subscript spans are marks in the page
// view, as a colour is, and write back as they were written.
func TestDocumentMarksRoundTrip(t *testing.T) {
	for _, src := range []string{
		"A {{mark}}key **idea**{{/mark}} here.",
		"10{{sup}}3{{/sup}} and H{{sub}}2{{/sub}}O",
		"# A {{mark}}marked{{/mark}} heading",
		"- {{sub}}an item{{/sub}}",
		"{{color:accent}}{{mark}}both{{/mark}}{{/color}} spans",
		"{{mark}}outer {{sup}}inner{{/sup}} more{{/mark}}",
	} {
		doc, err := Parse(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		var found = map[string]bool{}
		var walk func(n *Node)
		walk = func(n *Node) {
			for _, m := range n.Marks {
				found[m.Type] = true
			}
			for _, c := range n.Content {
				walk(c)
			}
		}
		walk(doc)
		if !found["mark"] && !found["sup"] && !found["sub"] {
			t.Fatalf("%q: no mark, sup or sub mark in %v", src, found)
		}
		out, err := Serialize(doc)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		if out != src+"\n" && out != src {
			t.Fatalf("%q came back as %q", src, out)
		}
	}
}

// A span that is not closed in its paragraph, or closed out of order, is
// not edited as rich text, so nothing is rewritten.
func TestDocumentMarksNeedPairs(t *testing.T) {
	for _, src := range []string{
		"An {{mark}}unclosed span.",
		"Crossed {{mark}}one {{sup}}two{{/mark}} three{{/sup}}.",
		"A stray {{/sub}} closer.",
	} {
		if _, err := Parse(src); err == nil {
			t.Errorf("%q should be edited as source", src)
		}
	}
}

// A caption is a box with a rich body, and a page break stays as the
// shortcode it was, and both come back byte for byte.
func TestCaptionAndBreakRoundTrip(t *testing.T) {
	for _, text := range []string{
		"{{figure:/static/icon.svg alt=\"x\"}}\n\n{{caption}}\nSales by *quarter*.\n{{/caption}}\n",
		"One page.\n\n{{page-break}}\n\nThe next.\n",
	} {
		doc := docOf(t, text)
		if got := back(t, doc); got != text {
			t.Fatalf("%q came back as %q", text, got)
		}
	}
}
