package preview

import (
	"strings"
	"testing"
)

// Render never panics, and its blocks are in order, each within the
// document's lines and marked once.
func FuzzPreview(f *testing.F) {
	for _, s := range []string{
		"",
		"---\ntitle: T\n---\n# H\n",
		"{{tip}}\n{{tip}}\ninner\n{{/tip}}\nouter\n{{/tip}}\n",
		"| a |\n| --- |\n| b | c |\n",
		"![x](javascript:alert(1)) <img src=\"a.png\">",
		"```mermaid\ngraph\n```\n",
		"a\rb\r\nc\n",
		"{{/tip}}\n{{columns}}\n{{column}}\n",
	} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, text string) {
		blocks, problems := Render(text)
		lines := strings.Count(strings.ReplaceAll(text, "\r\n", "\n"), "\n") + 1
		last := 0
		for _, b := range blocks {
			if b.Line < last || b.Line < 1 || b.Line > lines {
				t.Fatalf("%q: block at line %d after %d, of %d lines", text, b.Line, last, lines)
			}
			last = b.Line
			if strings.Count(b.HTML, `class="dinah-block"`) != 1 {
				t.Fatalf("%q: block not marked once: %s", text, b.HTML)
			}
		}
		for _, p := range problems {
			if p.Line < 1 || p.Line > lines {
				t.Fatalf("%q: problem at line %d of %d", text, p.Line, lines)
			}
		}
	})
}
