// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package pageview

import (
	"strings"
	"testing"

	"yavc.app/internal/preview"
)

func noteDocument(t *testing.T, source string) *Node {
	t.Helper()
	blocks, problems := preview.Render(source)
	if len(problems) != 0 {
		t.Fatal(problems)
	}
	return ParseDocument(source, Units(blocks))
}

func TestFootnotesAreRichAndPreserveUntouchedSource(t *testing.T) {
	source := "The **sentence** has a note[^proof] and another reference[^proof].\n\n[^unused]: Keep this unused definition.\n\nBetween.\n\n[^proof]: The *original* note.\n\n    A second paragraph.\n\nAfter.\n"
	doc := noteDocument(t, source)
	if doc.Content[0].Type != "paragraph" {
		t.Fatalf("Reference paragraph is not rich: %+v", doc.Content[0])
	}
	refs := 0
	for _, node := range doc.Content[0].Content {
		if node.Type == "footnote_ref" {
			refs++
			if node.Attrs["label"] != "proof" {
				t.Fatal(node)
			}
		}
	}
	if refs != 2 {
		t.Fatalf("Want two rich references, got %d", refs)
	}
	if doc.Content[1].Type != "footnote" || doc.Content[3].Type != "footnote" {
		t.Fatalf("Definitions are not rich: %+v", doc.Content)
	}
	back, err := SerializeDocument(doc)
	if err != nil || back != source {
		t.Fatalf("No-op changed source: %v\n%s", err, back)
	}
	definition := doc.Content[3]
	definition.Content[1].Content[0].Text = "An edited second paragraph."
	back, err = SerializeDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(back, "    An edited second paragraph.") || !strings.Contains(back, "[^unused]: Keep this unused definition.") || !strings.HasPrefix(back, strings.Split(source, "\n")[0]) {
		t.Fatal(back)
	}
	reparsed := noteDocument(t, back)
	if reparsed.Content[3].Type != "footnote" {
		t.Fatal("Edited definition is no longer rich")
	}
}

func TestFootnoteSerializationRejectsInjectedLabels(t *testing.T) {
	for _, label := range []string{"", "x]\n\n# Injected", "x\\]", strings.Repeat("x", 1000)} {
		_, err := SerializeDocument(&Node{Type: "doc", Content: []*Node{{Type: "paragraph", Content: []*Node{{Type: "footnote_ref", Attrs: map[string]any{"label": label}}}}}})
		if err == nil {
			t.Fatalf("Accepted invalid label %q", label)
		}
	}
}

func TestNestedFootnoteDefinitionRemainsRichAndRoundTrips(t *testing.T) {
	source := "Reference[^one].\n\n> [^one]: A **nested** note.\n"
	doc := noteDocument(t, source)
	if len(doc.Content) != 2 || doc.Content[1].Type != "blockquote" || doc.Content[1].Content[0].Type != "footnote" {
		t.Fatalf("%+v", doc.Content)
	}
	back, err := SerializeDocument(doc)
	if err != nil || back != source {
		t.Fatalf("%v %q", err, back)
	}
	note := doc.Content[1].Content[0]
	note.Content[0].Content = append(note.Content[0].Content, &Node{Type: "text", Text: " Edited."})
	back, err = SerializeDocument(doc)
	if err != nil || !strings.Contains(back, "> [^one]: A **nested** note. Edited.") {
		t.Fatalf("%v %q", err, back)
	}
	again := noteDocument(t, back)
	if again.Content[1].Type != "blockquote" || again.Content[1].Content[0].Type != "footnote" {
		t.Fatal("edited nested note lost its rich representation")
	}
}
