// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package mdapi

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf16"
)

func TestStylesUseUTF16EditorPositions(t *testing.T) {
	prefix := "# 😀\n\n{{style}}\n"
	var blocks []struct {
		CSS      string
		From, To int
	}
	if err := json.Unmarshal([]byte(Call("styles", prefix+".x {}\n{{/style}}")), &blocks); err != nil {
		t.Fatal(err)
	}
	if len(blocks) != 1 || blocks[0].From != len(prefix)-2 || blocks[0].To-blocks[0].From != len(".x {}\n") {
		t.Fatalf("UTF16 spans: %#v", blocks)
	}
}

func TestStylesRangesAcrossMultipleUnicodeBlocks(t *testing.T) {
	source := strings.Repeat("# 😀 中文\n\n{{style}}\n.x { font-family: '😀'; }\n{{/style}}\n\n", 30)
	var blocks []struct {
		CSS      string
		From, To int
	}
	if err := json.Unmarshal([]byte(Call("styles", source)), &blocks); err != nil {
		t.Fatal(err)
	}
	all := utf16.Encode([]rune(source))
	if len(blocks) != 30 {
		t.Fatal(len(blocks))
	}
	for _, block := range blocks {
		if string(utf16.Decode(all[block.From:block.To])) != block.CSS {
			t.Fatalf("range: %#v", block)
		}
	}
}
