package pageview

import (
	"strings"
	"testing"

	"yavc.app/internal/frontmatter"
	"yavc.app/internal/preview"
)

// A container with an empty body, or with empty columns, comes back byte
// for byte, however many lines its body had.
func TestEmptyContainersRoundTrip(t *testing.T) {
	for _, text := range []string{
		"{{note}}\n{{/note}}\n",
		"{{note}}\n\n{{/note}}\n",
		"{{note}}\n\n\n{{/note}}\n",
		"{{note}}\n   \n{{/note}}\n",
		"{{columns}}\n{{/columns}}\n",
		"{{columns}}\n\n{{/columns}}\n",
		"{{columns}}\n{{column}}\n{{/columns}}\n",
		"{{columns}}\n\n{{column}}\n{{/columns}}\n",
		"{{columns}}\n{{column}}\n\n{{/columns}}\n",
		"{{columns}}\n{{column}}\n{{column}}\n{{/columns}}\n",
		"{{columns}}\nA.\n{{column}}\n{{column}}\nC.\n{{/columns}}\n",
		"Before.\n\n{{note}}\n\n{{/note}}\n\nAfter.\n",
	} {
		if got := back(t, docOf(t, text)); got != text {
			t.Errorf("%q came back as %q", text, got)
		}
	}
}

// The separators of a column set are read whether the document came
// through JSON ([]any) or straight from ParseDocument ([]string).
func TestColumnSeparatorsEitherForm(t *testing.T) {
	text := "{{columns}}\nA.\n  {{column}}\nB.\n{{/columns}}\n"
	doc := docOf(t, text)
	cols := doc.Content[0]
	if _, ok := cols.Attrs["seps"].([]string); !ok {
		t.Fatalf("seps is %T", cols.Attrs["seps"])
	}
	// Change a column so the container is written afresh, not from src.
	cols.Content[1].Content = append(cols.Content[1].Content, &Node{Type: "paragraph", Content: []*Node{{Type: "text", Text: "More."}}})
	out, err := SerializeDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "\n  {{column}}\n") {
		t.Fatalf("the separator as written was lost: %q", out)
	}
	if got := back(t, doc); got != out {
		t.Fatalf("through JSON %q, straight %q", got, out)
	}
}

// Line ends: a document whose every line ends in CRLF is written back with
// CRLF; one with mixed line ends is written back as it was.
func TestLineEnds(t *testing.T) {
	for text, crlf := range map[string]bool{
		"# A\r\n\r\nB.\r\n":        true,
		"# A\r\n\r\nB.":            true,
		"# A\r\n\nB.\n":            false,
		"# A\n\nB.\r\n":            false,
		"# A\n\nB.\n":              false,
		"a\r\r\n":                  true,
		"{{note}}\r\nx\n{{/note}}": false,
	} {
		doc := docOf(t, text)
		if got, _ := doc.Attrs["crlf"].(bool); got != crlf {
			t.Errorf("%q: crlf %v, want %v", text, got, crlf)
		}
		if got := back(t, doc); got != text {
			t.Errorf("%q came back as %q", text, got)
		}
	}
	// A new paragraph in a CRLF document is written with CRLF too.
	doc := docOf(t, "A.\r\n")
	doc.Content = append(doc.Content, &Node{Type: "paragraph", Content: []*Node{{Type: "text", Text: "B."}}})
	if got := back(t, doc); got != "A.\r\n\r\nB.\r\n" {
		t.Fatalf("got %q", got)
	}
}

// The preview, the page view and the Properties dialog agree on where a
// document's front matter ends (frontmatter.End).
func TestFrontMatterAgrees(t *testing.T) {
	for _, c := range []struct {
		text string
		end  int // bytes
	}{
		{"---\ntitle: A\n---\nBody.\n", 17},
		{"---\ntitle: A\n---   \nBody.\n", 20},
		{"---\ntitle: A\n---\t\nBody.\n", 18},
		{"---\n---\nBody.\n", 8},
		{"---\ntitle: A\n---", 16},
		{"---\ntitle: A\n----\nBody.\n", 0},
		{"---\ntitle: A\n--- x\nBody.\n", 0},
		{"---\ntitle: A\n", 0},
		{"--- \ntitle: A\n---\nBody.\n", 0},
		{"Body.\n---\nx\n---\n", 0},
		{"---", 0},
		{"", 0},
	} {
		if got := frontmatter.End(c.text); got != c.end {
			t.Errorf("%q: End %d, want %d", c.text, got, c.end)
			continue
		}
		f := frontmatter.Read(c.text)
		if f.Has != (c.end > 0) || (f.Has && f.End != c.end) {
			t.Errorf("%q: Read gives has %v end %d, want %d", c.text, f.Has, f.End, c.end)
		}
		doc := docOf(t, c.text)
		if front, _ := doc.Attrs["front"].(string); len(front) != c.end {
			t.Errorf("%q: the page view's front matter is %q", c.text, front)
		}
		// The preview draws nothing of the front matter and numbers the
		// first block after it from the line after its closing line.
		blocks, _ := preview.Render(c.text)
		frontLines := strings.Count(c.text[:c.end], "\n")
		for _, b := range blocks {
			if b.Line <= frontLines || strings.Contains(b.HTML, "title: A") && c.end > 0 {
				t.Errorf("%q: the preview drew a block at line %d inside the front matter: %s", c.text, b.Line, b.HTML)
			}
		}
	}
}
