// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package frontmatter

import (
	"strings"
	"testing"
)

func TestHeaderFooterMappingsPreserveSource(t *testing.T) {
	src := "---\n# Keep this.\ntitle: Hi\nheader: Old\nother:\n  deep: untouched\n---\n\nBody.\n"
	mapping := map[string]map[string]string{"header": {"left": "**{title}**", "right": "{page} / {pages}"}, "footer": {"center": "Text: # literal"}}
	got, err := SetWithMappings(src, nil, mapping, []string{"header", "footer"})
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{"# Keep this.", "other:\n  deep: untouched", "\n\nBody.\n"} {
		if !strings.Contains(got, s) {
			t.Fatalf("lost %q in %s", s, got)
		}
	}
	again, err := SetWithMappings(got, nil, mapping, []string{"header", "footer"})
	if err != nil || got != again {
		t.Fatalf("not stable: %v\n%s", err, again)
	}
	for _, source := range []string{"---\nheader: {bad: text}\n---\n", "---\nheader: &h {left: text}\n---\n", "---\nheader: {left: x, left: y}\n---\n"} {
		if _, err := SetWithMappings(source, nil, mapping, []string{"header", "footer"}); err == nil {
			t.Fatalf("rewrote unsupported mapping: %s", source)
		}
	}
	if _, err := SetWithMappings(src, nil, map[string]map[string]string{"other": {"left": "x"}}, nil); err == nil {
		t.Fatal("accepted arbitrary nested YAML")
	}
}
