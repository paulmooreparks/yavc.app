package pageview

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
	"unicode"
	"unicode/utf8"

	"yavc.app/internal/preview"
)

var documentSeeds = []string{
	"",
	"# Top\n\n{{tip:For instance}}\nThis is a *tip*.\n\n- one\n- two\n{{/tip}}\n\nAfter.\n",
	"---\ntitle: A\n---\n\n# H\n\nText with {{kbd:Ctrl+S}}.\n",
	"{{columns}}\nA.\n{{column}}\n{{column}}\nC.\n{{/columns}}\n",
	"{{note}}\n\n{{/note}}\n",
	"{{tip}}\n{{tip}}\ninner\n{{/tip}}\nouter\n{{/tip}}\n",
	"| a | b |\n| --- | --- |\n| 1 | 2 |\n",
	"# A\r\n\nB.\r\n",
	"a\r\r\n",
	"```mermaid\ngraph TD\n```\n",
	"- [ ] task\n- [x] done\n",
	"![cat](cat.png) and <img src=\"x.png\">\n",
	"---\nk: v w\n---\nBody\n",
	"> quote\n\n    code\n",
	"A &copy; B\n",
}

func FuzzDocumentRoundTrip(f *testing.F) {
	for _, s := range documentSeeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, text string) {
		// The editor's text comes from the browser as valid text.
		if !utf8.ValidString(text) {
			return
		}
		blocks, _ := preview.Render(text)
		doc := ParseDocument(text, Units(blocks))
		b, err := json.Marshal(doc)
		if err != nil {
			t.Fatal(err)
		}
		var n Node
		if err := json.Unmarshal(b, &n); err != nil {
			t.Fatal(err)
		}
		out, err := SerializeDocument(&n)
		if err != nil {
			t.Fatalf("%q: %v", text, err)
		}
		// A document the person did not touch comes back byte for byte,
		// with the one exception of a document ending in no line end,
		// which is given one.
		if out != text && out != text+"\n" {
			t.Fatalf("%q came back as %q", text, out)
		}
	})
}

func FuzzParse(f *testing.F) {
	for _, s := range []string{"Press {{kbd:Ctrl+S}} to save.", "# {{color:accent}}x{{/color}}", "- a\n- b", "| a |\n| --- |\n| b |", "a \\# b", "A &copy; B", "x\n===", "\\{{tip}}"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, part string) {
		doc, err := Parse(part)
		if err != nil {
			return
		}
		out, err := Serialize(doc)
		if err != nil {
			t.Fatalf("%q read but does not write: %v", part, err)
		}
		if layout(out) != layout(strings.TrimRight(part, "\n")) {
			t.Fatalf("%q read and written as %q", part, out)
		}
		again, err := Parse(out)
		if err != nil {
			t.Fatalf("%q written as %q does not read again: %v", part, out, err)
		}
		if out2, _ := Serialize(again); out2 != out {
			t.Fatalf("%q written as %q, then as %q", part, out, out2)
		}
	})
}

// typeable says whether text could be typed into a paragraph, a line at a
// time: valid text with no control characters but tabs, and no line that
// is blank, since an empty line ends a paragraph.
func typeable(s string) ([]string, bool) {
	if !utf8.ValidString(s) {
		return nil, false
	}
	for _, r := range s {
		if r != '\n' && r != '\t' && (unicode.IsControl(r) || r == utf8.RuneError) {
			return nil, false
		}
	}
	lines := strings.Split(s, "\n")
	for _, l := range lines {
		if strings.TrimSpace(l) == "" {
			return nil, false
		}
	}
	return lines, true
}

var autolinks = regexp.MustCompile(`<a href="[^"]*">|</a>`)

func FuzzSerializeTyped(f *testing.F) {
	for _, s := range []string{"# not a heading", "a\n---", "a\n===", "-", "1.", "~", "[foo]: /url", "    indented", "trailing  ", "Title #", "{{tip}}", "{{kbd:x}}", "&copy;", "<div>", "a\\", "a|b\n-|-", "* * *", "+++", "[x]", "a [b] c [d", "x _y_ z", "\\ a"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, s string) {
		lines, ok := typeable(s)
		if !ok {
			return
		}
		md, err := Serialize(typed(lines...))
		if err != nil {
			t.Fatal(err)
		}
		want := paragraphOf(append([]string(nil), lines...)...)
		// GitHub's Markdown makes a bare address a link, with the same
		// text, so the links are taken out before the text is compared.
		if got := autolinks.ReplaceAllString(shown(t, md), ""); got != want {
			t.Fatalf("%q written as %q is shown as %q, want %q", s, md, got, want)
		}
		doc, err := Parse(md)
		if err != nil {
			t.Fatalf("%q written as %q does not read back: %v", s, md, err)
		}
		if back, _ := Serialize(doc); back != md {
			t.Fatalf("%q written as %q reads back as %q", s, md, back)
		}
	})
}

func FuzzSerializeJSON(f *testing.F) {
	for _, s := range []string{
		`{"type":"doc","content":[null,{"type":"paragraph","content":[null,{"type":"text","text":"a"}]}]}`,
		`{"type":"doc","content":[{"type":"columns","attrs":{"seps":[1,null,"x"]},"content":[null,{"type":"column"}]}]}`,
		`{"type":"doc","content":[{"type":"table","content":[{"type":"table_row","content":[null]}]}]}`,
		`{"type":"doc","content":[{"type":"bullet_list","content":[{"type":"list_item","content":[null]}]}]}`,
		`{"type":"doc","attrs":{"front":3,"tail":null,"crlf":"yes"},"content":[{"type":"heading","attrs":{"level":9e99}}]}`,
		`{"type":"doc","content":[{"type":"container","content":[{"type":"container","content":[null]}]}]}`,
	} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, s string) {
		var n Node
		if json.Unmarshal([]byte(s), &n) != nil {
			return
		}
		_, _ = SerializeDocument(&n)
		_, _ = Serialize(&n)
		Fresh(n.Content)
	})
}
