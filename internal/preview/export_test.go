// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package preview

import (
	"strings"
	"testing"
	"yavc.app/internal/shortcodes"
)

func exportHTML(t *testing.T, source string) string {
	t.Helper()
	blocks, _, err := RenderExport(source, shortcodes.DiscoverMacros(source, ""))
	if err != nil {
		t.Fatal(err)
	}
	var out strings.Builder
	for _, block := range blocks {
		out.WriteString(block.HTML)
	}
	return out.String()
}

func TestExportExclusionsPrecedeContentsAndAssetDiscovery(t *testing.T) {
	source := "{{toc:min=1 max=3}}\n\n# Visible\n\nBefore{{no-export}}SECRET_INLINE{{/no-export}}after.\n\n{{no-export}}\n## SECRET_HEADING\n\n![SECRET_IMAGE](secret.png)\n\n{{page-break}}\n{{/no-export}}\n\n{{draft-note}}\nSECRET_DRAFT\n{{/draft-note}}\n\nLast.\n"
	out := exportHTML(t, source)
	if strings.Contains(out, "SECRET_") || strings.Contains(out, "secret.png") || strings.Contains(out, "sc-page-break") || strings.Contains(out, "<p></p>") {
		t.Fatal(out)
	}
	if !strings.Contains(out, "Beforeafter.") || !strings.Contains(out, "Visible") || !strings.Contains(out, "Last.") {
		t.Fatal(out)
	}
	blocks, _ := Render(source)
	if !strings.Contains(blocks[2].HTML, "SECRET_INLINE") {
		t.Fatal("editing preview lost excluded content")
	}
}

func TestExportExclusionsInsideMacroExpansionAndInlineMarkup(t *testing.T) {
	source := "{{define:card}}\nVisible {{no-export}}SECRET_MACRO{{/no-export}} end.\n{{/define}}\n\n{{card}}\n\nA **bold {{no-export}}SECRET_BOLD{{/no-export}} kept**.\n\n{{no-export}}all removed{{/no-export}}\n"
	out := exportHTML(t, source)
	if strings.Contains(out, "SECRET_") || strings.Contains(out, "all removed") || strings.Contains(out, "<p></p>") || !strings.Contains(out, "<strong>bold  kept</strong>") {
		t.Fatal(out)
	}
	literal := exportHTML(t, "`{{no-export}}literal{{/no-export}}`\n\n```\n{{no-export}}example{{/no-export}}\n```\n")
	if !strings.Contains(literal, "literal") || !strings.Contains(literal, "example") {
		t.Fatal(literal)
	}
}

func TestMalformedExportExclusionsRefuseInsteadOfPublishing(t *testing.T) {
	for _, source := range []string{"Before {{no-export}}unfinished", "{{no-export}}\nunfinished\n", "{{/no-export}}"} {
		if _, _, err := RenderExport(source, shortcodes.DiscoverMacros(source, "")); err == nil {
			t.Fatalf("accepted %q", source)
		}
	}
}

func TestSlideExportDeclarationsExcludePrivateAndExampleSettings(t *testing.T) {
	source := "---\nexample: |\n  {{slide:layout=image image=SECRET_FRONT.png}}\n\n---\n\n{{no-export}}\n{{slide:layout=image image=SECRET.png}}\n{{/no-export}}\n\n> {{slide:layout=quote}}\n\n```\n{{slide:layout=blank}}\n```\n\n{{slide:layout=title}}\n# Public\n"
	calls, err := shortcodes.ExportCalls(source, shortcodes.DiscoverMacros(source, ""), "slide")
	if err != nil || len(calls) != 1 || calls[0].Named["layout"] != "title" {
		t.Fatal(calls, err)
	}
}
