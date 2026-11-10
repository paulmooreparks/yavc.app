// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package pageview

import (
	"strings"
	"testing"

	"yavc.app/internal/preview"
	"yavc.app/internal/shortcodes"
)

// A wiki's table, as a page brought in from one has it: a heading spanning
// the row, coloured cells, inline formatting, an entity.
const wikiTable = `<table><tbody>
<tr><th colspan="4">Test Scenario</th></tr>
<tr><td colspan="4"><strong>Identifier:</strong> TS-01; RRP-MWP-FR001 to FR008</td></tr>
<tr><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Number</strong></td><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Actions</strong></td><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Expected results</strong></td><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Comment</strong></td></tr>
<tr><td>1</td><td>Press the <code>&quot;GCash&quot;</code> button, and send <code>registerTenderLineItem</code>.</td><td>POS prints <code>Tender Name</code> on the receipt.</td><td>Repeat for Alipay.</td></tr>
<tr><td>2</td><td><p>Verify the <a href="https://example.com/gap">exported transaction</a>.</p></td><td>The JSON contains <ac:link><ri:page ri:content-title="Exports" /></ac:link> items.<br />Second line.</td><td></td></tr>
</tbody></table>`

// hostRegistry is a registry with one literal container, raw, as a wiki's
// host lists it.
func hostRegistry(text string) *shortcodes.MacroRegistry {
	return shortcodes.DiscoverMacros(text, "").WithHosts([]shortcodes.HostShortcode{{Name: "raw", Kind: "container", Literal: true}, {Name: "panel", Kind: "container"}})
}

func hostedDoc(t *testing.T, text string) *Node {
	t.Helper()
	registry := hostRegistry(text)
	blocks, _ := preview.RenderWithMacros(text, registry)
	return ParseDocumentWithMacros(text, Units(blocks), registry)
}

func findTable(doc *Node) *Node {
	for _, n := range doc.Content {
		if n.Type == "table" {
			return n
		}
		if n.Type == "container" {
			if t := findTable(n); t != nil {
				return t
			}
		}
	}
	return nil
}

// An HTML block that is one table is read as a table, untouched it comes
// back byte for byte, and a changed cell is written back as HTML with
// everything else as it was.
func TestHTMLTableRoundTrip(t *testing.T) {
	text := "Before.\n\n" + wikiTable + "\n\nAfter.\n"
	doc := docOf(t, text)
	table := findTable(doc)
	if table == nil {
		t.Fatalf("no table: %+v", doc.Content[1].Type)
	}
	if got := back(t, doc); got != text {
		t.Fatalf("untouched table came back as %q", got)
	}
	rows := table.Content
	if len(rows) != 5 || rows[0].Content[0].Type != "table_header" || intAttr(rows[0].Content[0], "colspan", 1) != 4 {
		t.Fatalf("rows read wrongly: %d rows, first %+v", len(rows), rows[0].Content[0].Attrs)
	}
	// Formatting is marks, a paragraph is noted, a break is a break, and
	// a wiki's own element is one piece, kept as written.
	last := rows[4].Content
	if last[1].Attrs["para"] != true || last[1].Content[1].Marks[0].Type != "link" {
		t.Fatalf("the paragraph cell: %+v", last[1])
	}
	third := last[2].Content
	if third[1].Type != "raw_inline" || third[1].Attrs["xml"] != `<ac:link><ri:page ri:content-title="Exports" /></ac:link>` || third[3].Type != "hard_break" {
		t.Fatalf("the wiki element and the break: %+v", third)
	}
	// Change the first number.
	rows[3].Content[0].Content = []*Node{{Type: "text", Text: "1a & <b>"}}
	got := back(t, doc)
	// A changed table is written afresh: text escaped as &amp; &lt; &gt;,
	// so a quotation mark that was an entity is written as itself.
	want := strings.Replace(strings.ReplaceAll(text, "&quot;", `"`), "<tr><td>1</td>", "<tr><td>1a &amp; &lt;b&gt;</td>", 1)
	if got != want {
		t.Fatalf("changed table came back as\n%s\nwanted\n%s", got, want)
	}
	// The coloured cells kept their attributes in order, the paragraph
	// cell its paragraph, the link its address.
	for _, piece := range []string{`<td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Number</strong></td>`, `<td><p>Verify the <a href="https://example.com/gap">exported transaction</a>.</p></td>`, `<ac:link><ri:page ri:content-title="Exports" /></ac:link> items.<br />Second line.`} {
		if !strings.Contains(got, piece) {
			t.Errorf("lost %q in\n%s", piece, got)
		}
	}
}

// A new cell's span is written, a span of one that was written stays, and
// a span taken back to one is dropped unless it was written as 1.
func TestHTMLTableSpans(t *testing.T) {
	text := `<table>
<tr><td colspan="2">A</td><td rowspan="1">B</td></tr>
<tr><td>C</td><td>D</td><td>E</td></tr>
</table>
`
	doc := docOf(t, text)
	table := findTable(doc)
	if table == nil {
		t.Fatal("no table")
	}
	if got := back(t, doc); got != text {
		t.Fatalf("untouched: %q", got)
	}
	cells := table.Content[0].Content
	cells[0].Attrs["colspan"] = 1
	cells[1].Attrs["rowspan"] = 2
	table.Content[1].Content[0].Attrs["colspan"] = 2
	got := back(t, doc)
	want := "<table>\n<tr><td>A</td><td rowspan=\"2\">B</td></tr>\n<tr><td colspan=\"2\">C</td><td>D</td><td>E</td></tr>\n</table>\n"
	if got != want {
		t.Fatalf("spans came back as\n%s\nwanted\n%s", got, want)
	}
}

// Markup that is not one strict table stays a source block: a block in a
// cell, two tables, text beside the table, a comment, bad markup.
func TestHTMLTableRefusals(t *testing.T) {
	for _, body := range []string{
		"<table><tr><td><p>One</p><p>Two</p></td></tr></table>",
		"<table><tr><td><ul><li>x</li></ul></td></tr></table>",
		"<table><tr><td>a</td></tr></table><table><tr><td>b</td></tr></table>",
		"<table><tr><td>a</td></tr></table> text",
		"<table><!-- c --><tr><td>a</td></tr></table>",
		"<table><tr><td>a</td></tr>",
		"<table><tr><td colspan=\"0\">a</td></tr></table>",
		"<table><tr><td onclick=\"x\">a</td></tr></table>",
		"<div><table><tr><td>a</td></tr></table></div>",
		"<table><tr></tr></table>",
	} {
		text := body + "\n"
		doc := docOf(t, text)
		if findTable(doc) != nil && body != "<table><tr><td onclick=\"x\">a</td></tr></table>" {
			t.Errorf("read as a table: %q", body)
		}
		if got := back(t, doc); got != text {
			t.Errorf("%q came back as %q", text, got)
		}
	}
}

// A cell's attribute whose name could write markup is not written, and a
// mark or a piece a cell cannot hold refuses rather than writes.
func TestHTMLTableWriteGuards(t *testing.T) {
	doc := docOf(t, "<table><tr><td>a</td></tr></table>\n")
	table := findTable(doc)
	if table == nil {
		t.Fatal("no table")
	}
	cell := table.Content[0].Content[0]
	cell.Attrs["xattrs"] = [][]string{{`x"><script>`, "y"}, {"class", `a"b`}}
	cell.Content = []*Node{{Type: "text", Text: "b"}}
	if got := back(t, doc); got != "<table>\n<tr><td class=\"a&quot;b\">b</td></tr>\n</table>\n" {
		t.Fatalf("attributes: %q", got)
	}
	cell.Content = []*Node{{Type: "raw_inline", Attrs: map[string]any{"xml": "<b>x</b><i>y</i>"}}}
	if _, err := SerializeDocument(doc); err == nil {
		t.Fatal("two elements in one piece were written")
	}
	cell.Content = []*Node{{Type: "text", Text: "b", Marks: []Mark{{Type: "color", Attrs: map[string]any{"value": "red"}}}}}
	if _, err := SerializeDocument(doc); err == nil {
		t.Fatal("a colour was written into an HTML cell")
	}
	cell.Content = []*Node{{Type: "shortcode", Attrs: map[string]any{"src": "{{kbd:x}}"}}}
	if _, err := SerializeDocument(doc); err == nil {
		t.Fatal("a shortcode was written into an HTML cell")
	}
}

// A host container whose body is literal markup is read whole, blank lines
// and all; one table in it is edited as a table between the container's
// lines, and any other body is one source block in the box.
func TestLiteralHostContainer(t *testing.T) {
	text := "# Title\n\n{{raw}}\n" + wikiTable + "\n{{/raw}}\n\nAfter.\n"
	doc := hostedDoc(t, text)
	table := findTable(doc)
	if table == nil || doc.Content[1].Type != "table" {
		t.Fatalf("the literal body was not read as a table: %s", doc.Content[1].Type)
	}
	if got := back(t, doc); got != text {
		t.Fatalf("untouched: %q", got)
	}
	table.Content[3].Content[0].Content = []*Node{{Type: "text", Text: "one"}}
	got := back(t, doc)
	if !strings.HasPrefix(got, "# Title\n\n{{raw}}\n<table><tbody>\n") || !strings.Contains(got, "<tr><td>one</td>") || !strings.HasSuffix(got, "</tbody></table>\n{{/raw}}\n\nAfter.\n") {
		t.Fatalf("changed table in its container:\n%s", got)
	}

	// A body with a blank line, which Markdown would split, and no table.
	text = "{{raw}}\n<div>\n\n<p>Two</p>\n</div>\n{{/raw}}\n"
	doc = hostedDoc(t, text)
	box := doc.Content[0]
	if box.Type != "container" || box.Attrs["literal"] != true || len(box.Content) != 1 || box.Content[0].Type != "source_block" || box.Content[0].Attrs["src"] != "<div>\n\n<p>Two</p>\n</div>" {
		t.Fatalf("the literal body: %+v", box)
	}
	if got := back(t, doc); got != text {
		t.Fatalf("untouched literal body: %q", got)
	}
	// The preview draws the body as it is, whole.
	blocks, _ := preview.RenderWithMacros(text, hostRegistry(text))
	html := ""
	for _, b := range blocks {
		html += b.HTML
	}
	if !strings.Contains(html, "<div>\n\n<p>Two</p>\n</div>") || strings.Contains(html, "<p><div>") {
		t.Fatalf("the preview of a literal body: %s", html)
	}
	// A host container that is not literal still reads its body as Markdown.
	text = "{{panel}}\nSome *words*.\n{{/panel}}\n"
	doc = hostedDoc(t, text)
	if doc.Content[0].Type != "container" || doc.Content[0].Content[0].Type != "paragraph" {
		t.Fatalf("a rich host container: %+v", doc.Content[0])
	}
}

// A contents list inside a container lists the whole document's headings,
// and it reads a wiki's spellings of its bounds and ignores arguments it
// does not know.
func TestContentsListInContainer(t *testing.T) {
	text := "# One\n\n{{note}}\n\n{{toc:maxLevel=3 outline=true}}\n\n{{/note}}\n\n## Two\n\n### Three\n\n#### Four\n"
	doc := docOf(t, text)
	box := doc.Content[1]
	if box.Type != "container" {
		t.Fatalf("not a container: %s", box.Type)
	}
	var list *Node
	for _, n := range box.Content {
		if n.Type == "source_block" && strings.Contains(stringAttr(n, "src"), "toc") {
			list = n
		}
	}
	if list == nil {
		t.Fatalf("no contents list in %+v", box.Content)
	}
	html := stringAttr(list, "html")
	for _, h := range []string{">One<", ">Two<", ">Three<"} {
		if !strings.Contains(html, h) {
			t.Errorf("the list lacks %s: %s", h, html)
		}
	}
	if strings.Contains(html, ">Four<") || strings.Contains(html, "sc-problem") {
		t.Errorf("the list has what it should not: %s", html)
	}
	if got := back(t, doc); got != text {
		t.Fatalf("untouched: %q", got)
	}
	// The site's spellings keep their defaults, 2 and 3.
	blocks, _ := preview.Render("# One\n\n{{toc}}\n\n## Two\n\n#### Four\n")
	html = blocks[1].HTML
	if strings.Contains(html, ">One<") || !strings.Contains(html, ">Two<") || strings.Contains(html, ">Four<") {
		t.Errorf("the default bounds: %s", html)
	}
}
