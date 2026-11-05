// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package mdapi

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf16"

	"yavc.app/internal/pageview"
	"yavc.app/internal/shortcodes"
)

func macroCall(op, text, definitions, shared string) string {
	data, _ := json.Marshal(map[string]string{"op": op, "text": text, "definitions": definitions, "shared": shared})
	return Call("macro-context", string(data))
}

func TestMacroCatalogUnicodePositions(t *testing.T) {
	source := "# 😀 中文\n\n{{define:card}}\n{{param:title default=\"😀\"}}\n**{{arg:title}}**\n{{/define}}\n"
	shared := "# 😀\n\n{{define:shared}}\nShared.\n{{/define}}"
	var registry shortcodes.MacroRegistry
	if err := json.Unmarshal([]byte(macroCall("catalog", "", source, shared)), &registry); err != nil {
		t.Fatal(err)
	}
	if len(registry.Entries) != 2 {
		t.Fatalf("%+v", registry)
	}
	for _, entry := range registry.Entries {
		input := source
		if entry.Shared {
			input = shared
		}
		units := utf16.Encode([]rune(input))
		if string(utf16.Decode(units[entry.From:entry.To])) != entry.Body {
			t.Fatalf("wrong UTF16 span: %+v", entry)
		}
	}
}

func TestMacroRichDocumentPreservesInvocations(t *testing.T) {
	source := "{{define:card}}\n{{param:title default=\"Heading\"}}\n## {{arg:title}}\n\n{{content}}\n{{/define}}\n\n{{define:badge}}\n{{param:text default=\"Badge\"}}\n**{{arg:text}}**\n{{/define}}\n\nBefore {{badge:text=\"😀 tag\"}} after.\n\n{{card:title=\"Hello\"}}\nAn **editable** body.\n{{/card}}\n"
	var doc pageview.Node
	raw := macroCall("doc", source, source, "")
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		t.Fatal(err, raw)
	}
	foundAtom, foundBody := false, false
	for _, node := range doc.Content {
		if node.Type == "paragraph" {
			for _, child := range node.Content {
				if child.Type == "shortcode" {
					foundAtom = true
				}
			}
		}
		if node.Type == "container" {
			foundBody = true
			if !strings.Contains(node.Attrs["before"].(string), "Hello") {
				t.Fatal(node.Attrs)
			}
		}
	}
	if !foundAtom || !foundBody {
		t.Fatal(raw)
	}
	back, err := pageview.SerializeDocument(&doc)
	if err != nil || back != source {
		t.Fatalf("source changed: %v\n%s", err, back)
	}
}

func TestMacroBudgetRefusalSurvivesRichParsing(t *testing.T) {
	definition := "{{define:a}}\n" + strings.Repeat("text ", 1000) + "\n{{/define}}\n\n"
	source := definition + strings.Repeat("Before {{a}} after.\n\n", 60)
	var doc pageview.Node
	if err := json.Unmarshal([]byte(macroCall("doc", source, source, "")), &doc); err != nil {
		t.Fatal(err)
	}
	refused := false
	for _, node := range doc.Content {
		if node.Type == "source_block" && strings.Contains(node.Attrs["html"].(string), "expansions exceed") {
			refused = true
		}
	}
	if !refused {
		t.Fatal("rich parsing bypassed the cumulative rendering budget")
	}
}
