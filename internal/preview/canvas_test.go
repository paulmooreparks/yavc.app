// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package preview

import (
	"strings"
	"testing"
)

func TestCanvasFenceRetainsSource(t *testing.T) {
	source := "{\"nodes\":[{\"text\":\"<script>unsafe()</script>\"}],\"edges\":[]}\n"
	blocks, problems := Render("```canvas\n" + source + "```\n")
	if len(problems) != 0 || len(blocks) != 1 || len(blocks[0].Diagrams) != 1 {
		t.Fatalf("blocks=%+v problems=%+v", blocks, problems)
	}
	diagram := blocks[0].Diagrams[0]
	if diagram.Language != "canvas" || diagram.Source != source || strings.Contains(blocks[0].HTML, "<script>") {
		t.Fatalf("diagram=%+v html=%s", diagram, blocks[0].HTML)
	}
}
