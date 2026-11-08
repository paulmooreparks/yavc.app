// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package pageview

import (
	"strings"
	"testing"

	"yavc.app/internal/preview"
)

func TestInlineExclusionRichEditing(t *testing.T) {
	for _, source := range []string{
		"before{{no-export}} secret {{/no-export}}after",
		"before{{no-export}} **secret** {{/no-export}}after",
		"before{{no-export}}   {{/no-export}}after",
		"before{{no-export}}{{color:red}}secret{{/color}}{{/no-export}}after",
		"before{{no-export}}secret [link](https://example.com){{/no-export}}after",
	} {
		doc, err := Parse(source)
		if err != nil {
			t.Fatalf("%q: %v", source, err)
		}
		marked := false
		for _, node := range doc.Content[0].Content {
			for _, mark := range node.Marks {
				if mark.Type == "no_export" {
					marked = true
				}
			}
		}
		if !marked {
			t.Fatalf("%q has no editable exclusion", source)
		}
		out, err := Serialize(doc)
		if err != nil {
			t.Fatal(err)
		}
		blocks, problems, err := preview.RenderExport(out, nil)
		if err != nil || len(problems) > 0 || len(blocks) != 1 || !strings.Contains(blocks[0].HTML, "beforeafter") {
			t.Fatalf("%q exported incorrectly after rich serialization %q: %v %v %v", source, out, blocks, problems, err)
		}
	}
}

func TestInlineExclusionRequiresMatchingTags(t *testing.T) {
	for _, source := range []string{"before{{no-export}}secret", "before{{/no-export}}after", "{{no-export}}{{mark}}secret{{/no-export}}{{/mark}}"} {
		if _, err := Parse(source); err == nil {
			t.Fatalf("unsafe rich edit accepted %q", source)
		}
	}
}
