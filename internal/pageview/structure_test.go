// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package pageview

import (
	"strings"
	"testing"
)

func TestRichQuotesPreserveOriginalAndEditCanonically(t *testing.T) {
	for _, source := range []string{"> First **line**.\nlazy continuation\n", "> ## Heading\n>\n> - One\n> - Two\n", "> Outer\n>\n>> Nested\n", "> Quote\n>\n> | Left | Right |\n> | :--- | ---: |\n> | A | B |\n"} {
		doc := docOf(t, source)
		if doc.Content[0].Type != "blockquote" {
			t.Fatalf("quote stayed source: %q %+v", source, doc.Content[0])
		}
		if got := back(t, doc); got != source {
			t.Fatalf("changed original quote: %q", got)
		}
	}
	source := "Before.\n\n> First **line**.\nlazy continuation\n\nAfter.\n"
	doc := docOf(t, source)
	quote := doc.Content[1]
	quote.Content[0].Content[0].Text = "Changed "
	result := back(t, doc)
	if !strings.HasPrefix(result, "Before.\n\n> Changed ") || !strings.Contains(result, "\n> lazy continuation\n\nAfter.\n") {
		t.Fatal(result)
	}
	unsupported := docOf(t, "> ```js\n> x()\n> ```\n")
	if unsupported.Content[0].Type != "source_block" {
		t.Fatal("unsupported quote content was lost")
	}
}

func TestAlignedTablesRoundTripAndChangeWholeColumns(t *testing.T) {
	source := "Before.\n\n| Left  | Center | Right | Plain |\n| :----- | :----: | ----: | ---- |\n| 😀 | B | C | D |\n\nAfter.\n"
	doc := docOf(t, source)
	table := doc.Content[1]
	if table.Type != "table" {
		t.Fatal("aligned table remained source")
	}
	if got := back(t, doc); got != source {
		t.Fatalf("table source changed: %s", got)
	}
	for _, row := range table.Content {
		row.Content[0].Attrs["align"] = "right"
	}
	got := back(t, doc)
	if !strings.Contains(got, "| ---: | :---: | ---: | --- |") || !strings.HasPrefix(got, "Before.\n\n") || !strings.HasSuffix(got, "\n\nAfter.\n") {
		t.Fatal(got)
	}
	table.Content[1].Content[0].Attrs["align"] = "left"
	if _, err := SerializeDocument(doc); err == nil {
		t.Fatal("accepted conflicting cell alignment in one GFM column")
	}
}
