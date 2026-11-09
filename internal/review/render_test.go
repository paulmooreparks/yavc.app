// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package review

import (
	"bytes"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"strings"
	"testing"
)

func render(t *testing.T, source string) string {
	t.Helper()
	var out bytes.Buffer
	err := goldmark.New(goldmark.WithExtensions(extension.GFM, Rendering(nil))).Convert([]byte(source), &out)
	if err != nil {
		t.Fatal(err)
	}
	return out.String()
}
func TestInlineReviewSemanticDisplay(t *testing.T) {
	got := render(t, "A {++new++} {--old--} {~~before~>after~~} {>>A <comment><<} {==marked==}.")
	for _, want := range []string{"<ins>new</ins>", "<del>old</del>", "<del>before</del><ins>after</ins>", "A &lt;comment&gt;", "<mark>marked</mark>", "data-critic-raw="} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q: %s", want, got)
		}
	}
}
func TestMultiblockReviewDoesNotBreakListOrTableStructure(t *testing.T) {
	source := "{++First paragraph.\n\n- One\n- Two\n\n| A | B |\n| --- | --- |\n| C | D |\n\nLast paragraph.++}\n\nAfter."
	got := render(t, source)
	if strings.Contains(got, "<ul>\n<ins") || strings.Contains(got, "<tr>\n<ins") || !strings.Contains(got, "<li>") || !strings.Contains(got, "After.") {
		t.Fatal(got)
	}
	if !strings.Contains(got, "<ins class=\"critic-body") || strings.Count(got, "++}") != 1 {
		t.Fatal(got)
	}
}
func TestMultilineCommentHasOneAnnotationAndRetainsFollowingSiblings(t *testing.T) {
	got := render(t, "Prefix {>>Comment\n\nsecret body\n\nlast part<<} suffix.\n\nFollowing paragraph.\n")
	if strings.Count(got, "secret body") != 2 { // Raw source attribute and the one annotation body.
		t.Fatal(got)
	}
	if !strings.Contains(got, "Following paragraph.") || !strings.Contains(got, "suffix.") {
		t.Fatal(got)
	}
}
