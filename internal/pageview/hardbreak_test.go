package pageview

import (
	"strings"
	"testing"
)

// A hard break is read as a break and written in the form it had: a backslash before the newline (the form a person's typing
// writes, since it is visible and survives an editor that trims whitespace) or two spaces (the form a file may already use).
func TestHardBreakKeepsItsForm(t *testing.T) {
	for _, c := range []struct{ name, src, form string }{
		{"backslash", "Line one\\\nLine two", ""},
		{"two spaces", "Line one  \nLine two", "spaces"},
		{"three spaces", "Line one   \nLine two", "spaces"},
	} {
		doc, err := Parse(c.src)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		var kinds []string
		for _, n := range doc.Content[0].Content {
			kinds = append(kinds, n.Type)
		}
		if len(kinds) != 3 || kinds[1] != "hard_break" {
			t.Fatalf("%s: the paragraph is %v", c.name, kinds)
		}
		if got := stringAttr(doc.Content[0].Content[1], "form"); got != c.form {
			t.Errorf("%s: form %q, want %q", c.name, got, c.form)
		}
		// Written back, the break has the form it had, with two or more spaces as two.
		want := c.src
		if c.form == "spaces" {
			want = "Line one  \nLine two"
		}
		if got, err := Serialize(doc); err != nil || got != want {
			t.Errorf("%s: written as %q (%v), want %q", c.name, got, err, want)
		}
		if got := shown(t, want); got != "<p>Line one<br>\nLine two</p>\n" {
			t.Errorf("%s: %q is shown as %q", c.name, want, got)
		}
	}
}

// A break a person types, which has no form, is a backslash.
func TestTypedHardBreakIsABackslash(t *testing.T) {
	doc := &Node{Type: "doc", Content: []*Node{{Type: "paragraph", Content: []*Node{
		{Type: "text", Text: "Street"}, {Type: "hard_break"}, {Type: "text", Text: "Town"}}}}}
	got, err := Serialize(doc)
	if err != nil || got != "Street\\\nTown" {
		t.Errorf("written as %q (%v)", got, err)
	}
}

// A NUL in a file is neither a break nor part of one. The reader keeps it as text, and the number of breaks and their forms do not
// change beside it. Nothing marks a break inside the text, so no character can be taken for one.
func TestNULBesideBreaks(t *testing.T) {
	src := "one\x00 two  \nthree\x00\nfour"
	doc, err := Parse(src)
	if err != nil {
		t.Fatal(err)
	}
	var breaks, soft int
	var words string
	for _, n := range doc.Content[0].Content {
		switch n.Type {
		case "hard_break":
			breaks++
		case "soft_break":
			soft++
		case "text":
			words += n.Text
		}
	}
	if breaks != 1 || soft != 1 {
		t.Errorf("%d hard breaks and %d soft breaks, want 1 and 1", breaks, soft)
	}
	// The reader does not replace a NUL (goldmark keeps it as it is), so it stays in the words, and nothing here depends on it being
	// replaced: no character stands in for a break.
	if strings.Count(words, "\x00") != 2 {
		t.Errorf("the reader changed the NULs: %q", words)
	}
	got, err := Serialize(doc)
	if err != nil {
		t.Fatal(err)
	}
	if want := src; got != want {
		t.Errorf("written as %q, want %q", got, want)
	}
	// A NUL that reaches the writer in a text node, as a paste might put it, stays text and makes no break.
	typed := &Node{Type: "doc", Content: []*Node{{Type: "paragraph", Content: []*Node{{Type: "text", Text: "a\x00"}, {Type: "soft_break"}, {Type: "text", Text: "b"}}}}}
	if got, err := Serialize(typed); err != nil || strings.Contains(strings.SplitN(got, "\n", 2)[0], "  ") {
		t.Errorf("a NUL in a text node changed a line end: %q (%v)", got, err)
	}
}

// A break inside emphasis or a link, which session notes have, is read, kept and written back in the form it had.
func TestBreakInsideEmphasisAndLink(t *testing.T) {
	for _, src := range []string{
		"*one\\ntwo*",
		"**one  \ntwo**",
		"[one\\ntwo](https://example.org/)",
		"[one  \ntwo](https://example.org/)",
		"say *one\\ntwo* then [three  \nfour](https://example.org/) end",
	} {
		doc, err := Parse(src)
		if err != nil {
			t.Errorf("%q: %v", src, err)
			continue
		}
		if got, err := Serialize(doc); err != nil || got != src {
			t.Errorf("%q written as %q (%v)", src, got, err)
		}
	}
}
