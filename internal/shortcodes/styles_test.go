// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package shortcodes_test

import (
	"strings"
	"testing"
	"yavc.app/internal/shortcodes"
)

func TestStyleBlocksFollowMarkdownAndPreserveSource(t *testing.T) {
	source := "---\nexample: |\n  {{style}}\n  .ignored {}\n  {{/style}}\n---\n\n```md\n{{style}}\n.fenced {}\n{{/style}}\n```\n\n> {{style}}\n> .quoted {}\n> {{/style}}\n\n    {{style}}\n    .indented {}\n    {{/style}}\n\n# 😀\r\n\r\n{{style:slide}}\r\n.valid { color: red; }\r\n{{/style}}\r\n\n{{style}}\n.unclosed {}"
	blocks := shortcodes.StyleBlocks(source)
	if len(blocks) != 1 {
		t.Fatalf("styles: %#v", blocks)
	}
	block := blocks[0]
	if !block.Slide || block.CSS != ".valid { color: red; }\r\n" || source[block.From:block.To] != block.CSS {
		t.Fatalf("source span: %#v", block)
	}
}

func TestStyleClassAllowsCSSUnderscores(t *testing.T) {
	got := render(t, "{{class:my_style}}Words{{/class}}")
	if !strings.Contains(got, `class="my_style"`) {
		t.Fatal(got)
	}
}
