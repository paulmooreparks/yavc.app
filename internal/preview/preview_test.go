package preview

import (
	"strings"
	"testing"
	"time"
)

func kinds(blocks []Block) []string {
	var out []string
	for _, b := range blocks {
		i := strings.Index(b.HTML, `data-kind="`)
		rest := b.HTML[i+len(`data-kind="`):]
		out = append(out, rest[:strings.Index(rest, `"`)])
	}
	return out
}

// Every block has its kind and the source line it starts on, front matter
// counted.
func TestRenderBlocks(t *testing.T) {
	text := "---\ntitle: T\n---\n# Head\n\nA paragraph\nover two lines.\n\n- a\n- b\n\n* [ ] task\n\n| a |\n| --- |\n| b |\n\n```go\nx\n```\n\n> q\n\n---\n\n<div>h</div>\n\n{{tip}}\nx\n{{/tip}}\n"
	blocks, problems := Render(text)
	if len(problems) != 0 {
		t.Fatalf("problems %+v", problems)
	}
	want := "heading paragraph list tasklist table code quote rule html shortcode"
	if got := strings.Join(kinds(blocks), " "); got != want {
		t.Fatalf("kinds %s, want %s", got, want)
	}
	lines := []int{4, 6, 9, 12, 14, 18, 22, 24, 26, 28}
	for i, b := range blocks {
		if b.Line != lines[i] {
			t.Errorf("block %d (%s) at line %d, want %d", i, kinds(blocks)[i], b.Line, lines[i])
		}
	}
	if !strings.Contains(blocks[1].HTML, `data-start="6" data-end="7"`) {
		t.Fatalf("paragraph lines: %s", blocks[1].HTML)
	}
	if strings.Contains(blocks[0].HTML, "title") {
		t.Fatal("front matter drawn")
	}
}

func TestRenderCRLF(t *testing.T) {
	blocks, _ := Render("# A\r\n\r\nB.\r\n")
	if len(blocks) != 2 || blocks[1].Line != 3 {
		t.Fatalf("%+v", blocks)
	}
}

func TestDiagrams(t *testing.T) {
	blocks, _ := Render("Text.\n\n```mermaid\ngraph TD\n```\n")
	if len(blocks) != 2 || len(blocks[1].Diagrams) != 1 {
		t.Fatalf("%+v", blocks)
	}
	d := blocks[1].Diagrams[0]
	if d.Language != "mermaid" || d.Source != "graph TD\n" || d.Line != 3 || !strings.Contains(blocks[1].HTML, `data-preview-diagram="`+d.ID+`"`) {
		t.Fatalf("%+v", d)
	}
}

// A Markdown image and a figure read an address by the same rule
// (shortcodes.SafeImage).
func TestImages(t *testing.T) {
	for md, want := range map[string]string{
		"![A cat](cat.png)":                `<img class="dinah-attachment-image" data-attachment="cat.png" alt="A cat">`,
		"![](./pics/cat.png)":              `data-attachment="pics/cat.png" alt="cat.png"`,
		"![x](~/Pictures/cat.png)":         `data-attachment="~/Pictures/cat.png"`,
		"![x](/static/shots/d.jpg)":        `<img src="/static/shots/d.jpg" alt="x">`,
		"![x](https://example.com/a.png)":  `<img src="https://example.com/a.png" alt="x">`,
		"![x](data:image/png;base64,AAAA)": `<img src="data:image/png;base64,AAAA" alt="x">`,
		"![x](javascript:alert(1))":        `sc-problem`,
		"![x](//evil.example/a.png)":       `sc-problem`,
		`<img src="cat.png" width="40">`:   `<img class="dinah-attachment-image" data-attachment="cat.png" alt="cat.png" width="40">`,
		`<img src="/a.png" width="40">`:    `<img src="/a.png" width="40">`,
	} {
		blocks, _ := Render(md)
		if len(blocks) == 0 || !strings.Contains(blocks[0].HTML, want) {
			t.Errorf("%s\n  want %s\n  got  %+v", md, want, blocks)
		}
	}
}

func TestDroppedCells(t *testing.T) {
	_, problems := Render("Intro.\n\n| a |\n| --- |\n| b | extra |\n")
	if len(problems) != 1 || problems[0].Line != 5 || !strings.Contains(problems[0].Message, "extra") {
		t.Fatalf("%+v", problems)
	}
}

func TestLineOf(t *testing.T) {
	starts := lineStarts([]byte("a\nbc\n\nd"))
	for off, want := range map[int]int{0: 1, 1: 1, 2: 2, 4: 2, 5: 3, 6: 4, 7: 4, 100: 4} {
		if got := lineOf(starts, off); got != want {
			t.Errorf("offset %d: line %d, want %d", off, got, want)
		}
	}
}

func sections(n int) string {
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteString("## Section\n\nSome *text* in a paragraph\nover two lines.\n\n- one\n- two\n\n")
	}
	return b.String()
}

func BenchmarkRender400(b *testing.B) {
	text := sections(400)
	for b.Loop() {
		Render(text)
	}
}

func BenchmarkRender1600(b *testing.B) {
	text := sections(1600)
	for b.Loop() {
		Render(text)
	}
}

// Drawing a document takes time in proportion to its length: four times
// the sections take well under five times as long, as BenchmarkRender400
// and BenchmarkRender1600 measure at length. Each size is drawn five times
// and the fastest kept, so a busy machine does not decide it.
func TestRenderIsLinear(t *testing.T) {
	if testing.Short() {
		t.Skip("measures time")
	}
	fastest := func(n int) float64 {
		text := sections(n)
		best := 0.0
		for range 5 {
			start := time.Now()
			Render(text)
			if ns := float64(time.Since(start)); best == 0 || ns < best {
				best = ns
			}
		}
		return best
	}
	small, large := fastest(400), fastest(1600)
	t.Logf("400 sections %.1f ms, 1600 sections %.1f ms, ratio %.2f", small/1e6, large/1e6, large/small)
	if large >= 5*small {
		t.Fatalf("1600 sections took %.2f times as long as 400", large/small)
	}
}
