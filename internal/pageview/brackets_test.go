// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package pageview

import (
	"strings"
	"testing"
)

// A paragraph with text in brackets is rich text in a document that
// defines no references, comes back byte for byte when untouched, and is
// written with its brackets plain when it is changed.
func TestBracketedTextIsRich(t *testing.T) {
	text := "# Title\n\nDeferred in that design. [S2]\n\nA stable signal only. [S3, S4]\n\n- An item [S5] here.\n\n| A | B |\n| --- | --- |\n| one [S6] | two |\n"
	doc := docOf(t, text)
	for i, want := range []string{"heading", "paragraph", "paragraph", "bullet_list", "table"} {
		if doc.Content[i].Type != want {
			t.Fatalf("block %d is %s, wanted %s", i, doc.Content[i].Type, want)
		}
	}
	if got := back(t, doc); got != text {
		t.Fatalf("untouched: %q", got)
	}
	p := doc.Content[1]
	p.Content = append([]*Node{{Type: "text", Text: "Now "}}, p.Content...)
	got := back(t, doc)
	want := strings.Replace(text, "Deferred in", "Now Deferred in", 1)
	if got != want {
		t.Fatalf("changed paragraph came back as\n%q\nwanted\n%q", got, want)
	}
}

// Where the document defines a reference, text in brackets may be a link,
// so the part stays source and nothing is written without its escape.
func TestBracketedTextWithReferences(t *testing.T) {
	text := "See [S2] here.\n\n[S2]: https://example.com/s2\n"
	doc := docOf(t, text)
	if doc.Content[0].Type != "source_block" {
		t.Fatalf("a paragraph that may hold a reference link is %s", doc.Content[0].Type)
	}
	if got := back(t, doc); got != text {
		t.Fatalf("untouched: %q", got)
	}
}

// A bracket whose escape changes the reading keeps it: typed text that
// would otherwise become a link, a picture, a task's box or a definition.
func TestBracketEscapesThatMatterStay(t *testing.T) {
	for typed, want := range map[string]string{
		"A [word](https://example.com) typed.": `\[word\](`,
		"![alt](https://example.com/x.png)":    `\[alt\](`,
		"[S2]: https://example.com":            `\[S2]:`,
		"plain [S2] citation":                  "plain [S2] citation",
	} {
		doc := docOf(t, "Start.\n")
		doc.Content[0].Content = []*Node{{Type: "text", Text: typed}}
		doc.Content[0].Attrs["src"] = nil
		delete(doc.Content[0].Attrs, "src")
		got := back(t, doc)
		if !strings.Contains(got, want) {
			t.Errorf("%q was written %q, wanted it to hold %q", typed, got, want)
		}
		// What was written reads back as the text that was typed.
		again := docOf(t, got)
		var b strings.Builder
		for _, n := range again.Content {
			if n.Type == "source_block" {
				b.WriteString(stringAttr(n, "src"))
				continue
			}
			for _, c := range n.Content {
				b.WriteString(c.Text)
			}
		}
		if n := again.Content[0]; n.Type != "source_block" && b.String() != typed {
			t.Errorf("%q read back as %q", typed, b.String())
		}
	}
	// An escaped box keeps its escape whatever the tree says.
	if got := plainBrackets(`- \[ ] not a task and \[S2]`); got != `- \[ ] not a task and [S2]` {
		t.Errorf("a box's escape: %q", got)
	}
}
