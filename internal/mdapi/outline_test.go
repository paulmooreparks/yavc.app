// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package mdapi

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestOutlineUsesMarkdownStructureAndUTF16(t *testing.T) {
	source := "---\nexample: '# Hidden'\n---\n\n# 😀 **One**\n\n> ## Quoted\n\n```\n# Code\n```\n\n{{define:card}}\n## Template\n{{/define}}\n\n## Child\n\nSecond &amp; final\n==================\n"
	entries := outline(source)
	if len(entries) != 3 || entries[0].Title != "😀 One" || entries[1].Parent != 0 || entries[2].Title != "Second & final" {
		t.Fatalf("%+v", entries)
	}
	if entries[1].From != utf16Length(source[:strings.Index(source, "## Child")]) || entries[0].End != entries[2].From || entries[0].Next != 2 || entries[2].Previous != 0 {
		t.Fatalf("ranges: %+v", entries)
	}
}

func TestSectionMovesPreserveNestedContentAndUndoInput(t *testing.T) {
	source := "---\ntitle: Test\n---\n\n# Parent\n\n## First\nOne.\n\n### Nested\nKeep me.\n\n## Second\nTwo."
	entries := outline(source)
	input, _ := json.Marshal(map[string]any{"text": source, "from": entries[1].From, "direction": "down"})
	result, err := moveSection(string(input))
	if err != nil {
		t.Fatal(err)
	}
	output := result.(map[string]any)["text"].(string)
	if !strings.HasPrefix(output, "---\ntitle: Test\n---\n\n# Parent\n\n## Second\nTwo.\n\n## First") || !strings.Contains(output, "### Nested\nKeep me.") {
		t.Fatal(output)
	}
	input, _ = json.Marshal(map[string]any{"text": source, "from": entries[2].From, "before": entries[3].From})
	if _, err := moveSection(string(input)); err == nil {
		t.Fatal("allowed a child to move into another parent")
	}
	crlf := strings.ReplaceAll(source, "\n", "\r\n")
	entries = outline(crlf)
	input, _ = json.Marshal(map[string]any{"text": crlf, "from": entries[3].From, "direction": "up"})
	result, err = moveSection(string(input))
	if err != nil {
		t.Fatal(err, entries)
	}
	output = result.(map[string]any)["text"].(string)
	if strings.Contains(strings.ReplaceAll(output, "\r\n", ""), "\n") {
		t.Fatal("mixed line endings")
	}
}

func TestSectionMoveRevisionAndAfterTarget(t *testing.T) {
	source := "# One\n\nBody.\n\n# Two\n\nBody two.\n\n# Three\n\nLast.\n"
	entries := outline(source)
	input, _ := json.Marshal(map[string]any{"text": source, "from": entries[0].From, "after": entries[2].From, "expected": sourceRevision(source)})
	result, err := moveSection(string(input))
	if err != nil {
		t.Fatal(err)
	}
	output := result.(map[string]any)["text"].(string)
	if !strings.HasPrefix(output, "# Two") || !strings.HasSuffix(output, "# One\n\nBody.\n\n") {
		t.Fatal(output)
	}
	input, _ = json.Marshal(map[string]any{"text": source + "changed", "from": entries[0].From, "direction": "down", "expected": sourceRevision(source)})
	if _, err := moveSection(string(input)); err == nil {
		t.Fatal("stale source revision accepted")
	}
}
