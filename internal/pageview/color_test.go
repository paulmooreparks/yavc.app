package pageview

import "testing"

// A colour span is a mark in the page view, and writes back as it was.
func TestColorMarkRoundTrip(t *testing.T) {
	for _, src := range []string{
		"# {{color:accent}}yavc.app{{/color}}",
		"A {{color:#c0392b}}red **and bold**{{/color}} word.",
		"- {{color:navy}}an item{{/color}}",
		"A {{class:callout}}boxed **thing**{{/class}} here.",
	} {
		doc, err := Parse(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		var marks int
		var walk func(n *Node)
		walk = func(n *Node) {
			for _, m := range n.Marks {
				if m.Type == "color" || m.Type == "class" {
					marks++
				}
			}
			for _, c := range n.Content {
				walk(c)
			}
		}
		walk(doc)
		if marks == 0 {
			t.Fatalf("%q: no color mark", src)
		}
		out, err := Serialize(doc)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		if out != src+"\n" && out != src {
			t.Fatalf("%q came back as %q", src, out)
		}
	}
	if _, err := Parse("A {{color:red}}word with no end."); err == nil {
		t.Fatal("an unclosed span should keep the block as Markdown")
	}
}
