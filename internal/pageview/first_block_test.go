package pageview

import "testing"

// A paragraph typed before a document's first block is separated from it by a blank line. The first block was read with nothing before it, so
// its gap is empty, and it was written straight after the new paragraph ("Y| A | B |"), which Markdown reads as one paragraph.
func TestABlockBeforeTheFirstBlockIsSeparatedFromIt(t *testing.T) {
	text := "| A | B |\n| --- | --- |\n| one | two |\n\nAfter\n"
	doc := ParseDocument(text, nil)
	if len(doc.Content) == 0 {
		t.Fatal("the document has no blocks")
	}
	typed := &Node{Type: "paragraph", Content: []*Node{{Type: "text", Text: "Y"}}}
	doc.Content = append([]*Node{typed}, doc.Content...)
	got, err := SerializeDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	if want := "Y\n\n" + text; got != want {
		t.Errorf("written as %q, want %q", got, want)
	}
}
