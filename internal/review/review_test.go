// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package review

import (
	"strings"
	"testing"
)

func TestCatalogAndMinimalResolution(t *testing.T) {
	source := "😀 Before {++new\r\n\r\nparagraph++} {--old--} {~~old~>new~~} {>>A comment<<} {==marked==}.\n"
	catalog, err := Scan(source, 0)
	if err != nil || len(catalog.Marks) != 5 || len(catalog.Problems) != 0 {
		t.Fatalf("%+v %v", catalog, err)
	}
	for _, accept := range []bool{false, true} {
		var edits []Edit
		for _, mark := range catalog.Marks {
			if source[mark.From:mark.To] != mark.Raw {
				t.Fatal("wrong source range")
			}
			edits = append(edits, Resolve(mark, accept)...)
		}
		result, err := Apply(source, edits)
		if err != nil {
			t.Fatal(err)
		}
		want := "😀 Before  old old  marked.\n"
		if accept {
			want = "😀 Before new\r\n\r\nparagraph  new  marked.\n"
		}
		if result != want {
			t.Fatalf("%q != %q", result, want)
		}
	}
}
func TestMarkdownContextsAreNotReviewAuthority(t *testing.T) {
	source := "---\nauthor: '{++metadata++}'\n---\n\n`{++inline code++}`\n\n```md\n{++fence++}\n```\n\n    {++indented code++}\n\n\\{++escaped++}\n\n<a title='{++attribute++}'>literal</a>\n\n[link](https://example.invalid/{++destination++})\n\nReal {++change++}."
	skip := strings.Index(source, "\n\n")
	catalog, err := Scan(source, skip)
	if err != nil || len(catalog.Marks) != 1 || catalog.Marks[0].After != "change" {
		t.Fatalf("%+v %v", catalog, err)
	}
}
func TestMalformedAndNestedMarksStayLiteral(t *testing.T) {
	for _, source := range []string{"{++missing", "{~~no separator~~}", "{++outer {--inner--} rest++}"} {
		catalog, err := Scan(source, 0)
		if err != nil || len(catalog.Marks) != 0 || len(catalog.Problems) == 0 {
			t.Fatalf("%q %+v %v", source, catalog, err)
		}
	}
}

func TestDelimitersInsideCodeAndLinkDestinationsStayInTheBody(t *testing.T) {
	source := "{++Retain `++}` and [link](https://example.invalid/++}) here.++} {~~Keep `~>` old~>new~~}"
	catalog, err := Scan(source, 0)
	if err != nil || len(catalog.Marks) != 2 || len(catalog.Problems) != 0 {
		t.Fatalf("%+v %v", catalog, err)
	}
	if catalog.Marks[0].After != "Retain `++}` and [link](https://example.invalid/++}) here." || catalog.Marks[1].Before != "Keep `~>` old" {
		t.Fatalf("%+v", catalog)
	}
	if _, err := Propose(Addition, "", "Example `++}` and `{++literal++}`"); err != nil {
		t.Fatal(err)
	}
}
func TestProposalGrammarAndSourceBounds(t *testing.T) {
	for _, kind := range []Kind{Addition, Deletion, Replacement, Comment, Highlight} {
		raw, err := Propose(kind, "old", "new")
		if err != nil {
			t.Fatal(err)
		}
		catalog, err := Scan(raw, 0)
		if err != nil || len(catalog.Marks) != 1 || catalog.Marks[0].Kind != kind {
			t.Fatalf("%q %+v %v", raw, catalog, err)
		}
	}
	for _, body := range []string{"unescaped ++}", "{++nested++}", "trailing\\", strings.Repeat("x", MaxBody+1)} {
		if _, err := Propose(Addition, "", body); err == nil {
			t.Fatalf("accepted %q", body[:min(len(body), 30)])
		}
	}
	if _, err := Scan(strings.Repeat("x", MaxSource+1), 0); err == nil {
		t.Fatal("source bound")
	}
	if _, err := Apply("😀", []Edit{{From: 1, To: 2}}); err == nil {
		t.Fatal("split code point")
	}
}
