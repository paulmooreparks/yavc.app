package pageview

import "testing"

// The colour spelling is an alias of color, and a part written with it
// comes back with it, so the page view can edit it as rich text.
func TestColourAlias(t *testing.T) {
	src := "# {{colour:accent}}yavc.app{{/colour}}"
	doc, err := Parse(src)
	if err != nil {
		t.Fatalf("colour alias: %v", err)
	}
	out, err := Serialize(doc)
	if err != nil {
		t.Fatal(err)
	}
	if out != src+"\n" && out != src {
		t.Fatalf("the alias came back as %q", out)
	}
}
