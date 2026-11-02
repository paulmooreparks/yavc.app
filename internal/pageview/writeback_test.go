package pageview

import (
	"strings"
	"testing"
)

func para(nodes ...*Node) *Node {
	return &Node{Type: "doc", Content: []*Node{{Type: "paragraph", Content: nodes}}}
}

func txt(s string, marks ...string) *Node {
	n := &Node{Type: "text", Text: s}
	for _, m := range marks {
		n.Marks = append(n.Marks, Mark{Type: m})
	}
	return n
}

// Emphasis whose text has a space just inside a marker is written with the
// space outside, where Markdown still reads the markers as emphasis.
func TestEmphasisSpacesOutside(t *testing.T) {
	for _, c := range []struct {
		doc  *Node
		want string
		html string
	}{
		{para(txt("a"), txt(" bold ", "strong"), txt("b")), "a **bold** b", "<p>a <strong>bold</strong> b</p>\n"},
		{para(txt("x "), txt("it ", "em"), txt("y")), "x *it* y", "<p>x <em>it</em> y</p>\n"},
		{para(txt("a"), txt(" both", "strong", "em"), txt(".")), "a ***both***.", "<p>a <em><strong>both</strong></em>.</p>\n"},
		{para(txt("a"), txt("   ", "strong"), txt("b")), "a   b", "<p>a   b</p>\n"},
		{para(txt("s "), txt("gone ", "strike"), txt("t")), "s ~~gone~~ t", "<p>s <del>gone</del> t</p>\n"},
	} {
		got, err := Serialize(c.doc)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Errorf("written as %q, want %q", got, c.want)
		}
		if h := shown(t, got); h != c.html {
			t.Errorf("%q is shown as %q, want %q", got, h, c.html)
		}
	}
}

// Typed brackets stay text even when the document defines a link
// reference of the same name elsewhere.
func TestTypedBracketsAreNotReferences(t *testing.T) {
	got, err := Serialize(typed("see [x] and [docs]"))
	if err != nil {
		t.Fatal(err)
	}
	src := got + "\n\n[x]: https://example.com\n[docs]: https://example.com/docs\n"
	if h := shown(t, src); strings.Contains(h, "<a ") {
		t.Errorf("%q beside definitions is shown as %q, with a link", got, h)
	}
	if h := shown(t, got); h != "<p>see [x] and [docs]</p>\n" {
		t.Errorf("%q is shown as %q", got, h)
	}
}

// A list item whose text starts as a checklist box is a checklist item.
func TestListItemBoxIsChecklist(t *testing.T) {
	for _, c := range []struct{ text, want string }{
		{"[x] Blah", "- [x] Blah"},
		{"[ ] Todo", "- [ ] Todo"},
		{"[X] Done", "- [X] Done"},
		{"[y] Not a box", `- \[y] Not a box`},
	} {
		doc := &Node{Type: "doc", Content: []*Node{{Type: "bullet_list", Attrs: map[string]any{"tight": true}, Content: []*Node{
			{Type: "list_item", Content: []*Node{{Type: "paragraph", Content: []*Node{txt(c.text)}}}},
		}}}}
		got, err := Serialize(doc)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Errorf("%q written as %q, want %q", c.text, got, c.want)
		}
	}
	back, err := Parse("- [x] Blah")
	if err != nil {
		t.Fatal(err)
	}
	if checked, ok := back.Content[0].Content[0].Attrs["checked"].(bool); !ok || !checked {
		t.Errorf("- [x] Blah reads back as %+v, want a ticked checklist item", back.Content[0].Content[0])
	}
}
