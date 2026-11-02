package pageview

import "testing"

// A shortcode in a line of text is one piece of a rich paragraph, and the
// paragraph writes back as it was.
func TestInlineShortcodeRoundTrip(t *testing.T) {
	for _, src := range []string{
		"Press {{kbd:Ctrl+S}} to save.",
		"Status: {{status:green Done}} and **{{kbd:F1}}** here.",
		"See {{page:about}} and {{glyph:check}}.",
		"# A heading with {{kbd:Ctrl+1}}",
		"- an item {{anchor:here}}",
	} {
		doc, err := Parse(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		found := 0
		var walk func(n *Node)
		walk = func(n *Node) {
			if n.Type == "shortcode" {
				found++
				if n.Attrs["html"] == "" {
					t.Fatalf("%q: no HTML for %v", src, n.Attrs["src"])
				}
			}
			for _, c := range n.Content {
				walk(c)
			}
		}
		walk(doc)
		if found == 0 {
			t.Fatalf("%q: no shortcode node", src)
		}
		out, err := Serialize(doc)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		if out != src {
			t.Fatalf("%q came back as %q", src, out)
		}
	}
	// A block shortcode on its own line is still not rich text.
	if _, err := Parse("{{toc}}"); err == nil {
		t.Fatal("a block shortcode should stay Markdown")
	}
}
