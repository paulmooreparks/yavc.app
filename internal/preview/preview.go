// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Lifted from Dinah Desktop (internal/preview and internal/pageview, Apache-2.0).

// Package preview draws a Markdown document as HTML for the window's
// previews and for the Editor's Page view. It parses with goldmark (GitHub
// Flavored Markdown) and returns the document's top-level blocks one by one,
// each with the source lines it came from, so a preview can scroll with the
// text and Page view can edit each block by its lines.
//
// Nothing here reads the filesystem or the network. A local image is left as
// declarative markup (data-attachment, the file's name) for the page to load,
// and a diagram's source is handed to the page to draw.
package preview

import (
	"bytes"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"

	"yavc.app/internal/attrblock"
	"yavc.app/internal/footnotes"
	"yavc.app/internal/frontmatter"
	"yavc.app/internal/review"
	"yavc.app/internal/shortcodes"
)

// Block is one top-level block of a document: its HTML and the 1-based
// source line it starts on, front matter counted.
//
// The HTML is wrapped twice. The outer element is the block, which the page
// reads for scroll sync:
//
//	<div class="dinah-block" data-line="L">...</div>
//
// The inner element marks the block's source lines and its kind, for Page
// view (pageview.Units):
//
//	<div class="dinah-src" data-start="S" data-end="E" data-kind="K">...</div>
//
// The kind is one of paragraph, heading, list, tasklist, table, code, quote,
// rule, html or other.
type Block struct {
	Line      int            `json:"line"`
	HTML      string         `json:"html"`
	Diagrams  []Diagram      `json:"diagrams,omitempty"`
	Footnotes map[string]int `json:"footnotes,omitempty"`
}

// Diagram is a diagram the page draws from its source. Line is the line of
// the block that holds it. ID is unique within one document's preview and
// is the value of the data-preview-diagram attribute on its placeholder.
type Diagram struct {
	ID       string `json:"id"`
	Language string `json:"language"`
	Source   string `json:"source"`
	Line     int    `json:"line"`
}

// Problem is something in the document the preview cannot show as written.
type Problem struct {
	Line    int
	Message string
}

// diagramLanguages are the fenced-code languages the page draws as diagrams.
var diagramLanguages = map[string]bool{"mermaid": true, "d2": true, "canvas": true}

// frontMatterLines is the number of leading lines a document's front
// matter takes, its opening line, its body and its closing line, or 0 when
// it has none. Where the front matter ends is frontmatter.End's rule, the
// one the page view and the Properties dialog keep to as well.
func frontMatterLines(text string) int {
	end := frontmatter.End(text)
	if end == 0 {
		return 0
	}
	n := strings.Count(text[:end], "\n")
	if !strings.HasSuffix(text[:end], "\n") {
		n++
	}
	return n
}

// Render draws a Markdown document as its top-level blocks. Front matter is
// not drawn, but its lines are counted, so every block's lines are lines of
// the document as the person sees it.
func Render(markdown string) ([]Block, []Problem) {
	return RenderWithMacros(markdown, shortcodes.DiscoverMacros(markdown, ""))
}

// RenderWithMacros keeps source line mapping while rendering invocations
// against the caller's document registry, including shared definitions.
func RenderWithMacros(markdown string, registry *shortcodes.MacroRegistry) ([]Block, []Problem) {
	blocks, problems, _ := renderDocument(markdown, registry, false)
	return blocks, problems
}

// RenderExport excludes private working content before the document is drawn.
func RenderExport(markdown string, registry *shortcodes.MacroRegistry) ([]Block, []Problem, error) {
	return renderDocument(markdown, registry, true)
}

// Whole parses a document as the preview reads it, for rendering a part of
// it on its own (a container's body, for the page view) with the whole in
// reach of the shortcodes that read the document, such as the contents
// list (shortcodes.MacroRegistry.Within).
func Whole(markdown string, registry *shortcodes.MacroRegistry) *shortcodes.Outer {
	src, _ := sourceOf(markdown)
	md, _ := markdownOf(registry, false)
	return &shortcodes.Outer{Doc: md.Parser().Parse(text.NewReader(src)), Src: src}
}

// sourceOf is a document's text as Markdown reads it: with \n line ends,
// and its front matter as blank lines, which Markdown ignores, so the
// lines of everything after it keep their numbers.
func sourceOf(markdown string) ([]byte, []int) {
	markdown = strings.ReplaceAll(markdown, "\r\n", "\n")
	lines := strings.Split(markdown, "\n")
	front := frontMatterLines(markdown)
	for i := 0; i < front; i++ {
		lines[i] = ""
	}
	src := []byte(strings.Join(lines, "\n"))
	return src, lineStarts(src)
}

func renderDocument(markdown string, registry *shortcodes.MacroRegistry, exporting bool) ([]Block, []Problem, error) {
	src, starts := sourceOf(markdown)
	md, d := markdownOf(registry, exporting)
	doc := md.Parser().Parse(text.NewReader(src))
	if exporting {
		if err := shortcodes.PruneExport(doc); err != nil {
			return nil, nil, err
		}
		if review.Unresolved(doc, src) {
			return nil, nil, fmt.Errorf("choose an accepted or original review projection, or resolve the review marks, before exporting")
		}
		footnotes.PrepareExport(doc)
	}
	return renderParsed(md, d, doc, src, starts, exporting)
}

// markdownOf is the Markdown reader and renderer for a document's registry.
func markdownOf(registry *shortcodes.MacroRegistry, exporting bool) (goldmark.Markdown, *drawer) {
	d := &drawer{}
	shortcodeExtension := shortcodes.WithMacros(registry)
	if exporting {
		shortcodeExtension = shortcodes.WithExportMacros(registry)
	}
	display := review.Rendering(func(body string) string { return reviewInline(body, shortcodeExtension) }, shortcodeExtension, footnotes.Extension)
	if exporting {
		display = review.ExportRendering(func(body string) string { return reviewInline(body, shortcodeExtension) }, shortcodeExtension, footnotes.Extension)
	}
	md := goldmark.New(
		goldmark.WithExtensions(extension.GFM, shortcodeExtension, footnotes.Extension, display, attrblock.Extension),
		goldmark.WithParserOptions(parser.WithAutoHeadingID()),
		goldmark.WithRendererOptions(
			// The document is the person's own, and inline HTML (<u>, a
			// sized <img>) is part of how it is written.
			html.WithUnsafe(),
			renderer.WithNodeRenderers(util.Prioritized(d, 100)),
		),
	)
	return md, d
}

// renderParsed draws a parsed document as its top-level blocks.
func renderParsed(md goldmark.Markdown, d *drawer, doc ast.Node, src []byte, starts []int, exporting bool) ([]Block, []Problem, error) {
	var problems []Problem
	if catalog, err := review.DisplayCatalog(doc); err != nil && !exporting {
		problems = append(problems, Problem{Line: 1, Message: err.Error()})
	} else if !exporting {
		for _, problem := range catalog.Problems {
			problems = append(problems, Problem{Line: lineOf(starts, problem.From), Message: problem.Message})
		}
	}
	for _, message := range footnotes.Problems(doc) {
		problems = append(problems, Problem{Line: 1, Message: message})
	}
	var blocks []Block
	for _, u := range units(doc, src, starts) {
		d.line = u.start
		first := len(d.diagrams)
		var b bytes.Buffer
		for _, n := range u.nodes {
			if t, ok := n.(*extast.Table); ok {
				problems = append(problems, droppedCells(t, src, starts)...)
			}
			if err := md.Renderer().Render(&b, src, n); err != nil {
				b.WriteString(`<p>` + shortcodes.Esc(err.Error()) + `</p>`)
			}
		}
		inner := `<div class="dinah-src" data-start="` + strconv.Itoa(u.start) + `" data-end="` + strconv.Itoa(u.end) +
			`" data-kind="` + u.kind + `">` + b.String() + `</div>`
		blocks = append(blocks, Block{
			Line:     u.start,
			HTML:     `<div class="dinah-block" data-line="` + strconv.Itoa(u.start) + `">` + inner + `</div>`,
			Diagrams: append([]Diagram(nil), d.diagrams[first:]...),
		})
	}
	if len(blocks) > 0 {
		blocks[0].Footnotes = footnotes.Context(doc)
	}
	return blocks, problems, nil
}

// unit is one top-level block with its first and last source line (1-based)
// and its kind. A block whose place in the source cannot be found (it has no
// text of its own) joins the block before it.
type unit struct {
	nodes      []ast.Node
	start, end int
	kind       string
}

// units finds the document's top-level blocks and their lines: from the
// line a block's first character is on to the line before the next block's,
// less blank lines.
func units(doc ast.Node, src []byte, starts []int) []unit {
	var out []unit
	for n := doc.FirstChild(); n != nil; n = n.NextSibling() {
		// A container's closing line is part of the container's block.
		if n.Kind() == shortcodes.KindCloser {
			continue
		}
		off, ok := firstOffset(n, src)
		if !ok && len(out) > 0 {
			out[len(out)-1].nodes = append(out[len(out)-1].nodes, n)
			continue
		}
		out = append(out, unit{nodes: []ast.Node{n}, start: lineOf(starts, off), kind: kindOf(n)})
	}
	lines := bytes.Split(src, []byte("\n"))
	for i := range out {
		end := len(lines)
		if i+1 < len(out) {
			end = out[i+1].start - 1
		}
		for end > out[i].start && len(bytes.TrimSpace(lines[end-1])) == 0 {
			end--
		}
		out[i].end = end
	}
	return reviewUnits(out, doc, starts)
}

// ReviewInlineHTML renders a proposal body with ordinary inline syntax only.
// Review parsing is omitted so examples in a proposal cannot nest annotations.
func ReviewInlineHTML(body string, registry *shortcodes.MacroRegistry) string {
	return reviewInline(body, shortcodes.WithMacros(registry))
}

func reviewInline(body string, syntax goldmark.Extender) string {
	source := []byte("x " + body)
	markdown := goldmark.New(goldmark.WithExtensions(extension.GFM, syntax, attrblock.Extension), goldmark.WithRendererOptions(html.WithUnsafe()))
	doc := markdown.Parser().Parse(text.NewReader(source))
	paragraph := doc.FirstChild()
	if paragraph == nil || paragraph.Kind() != ast.KindParagraph || paragraph.NextSibling() != nil {
		return shortcodes.Esc(body)
	}
	first, ok := paragraph.FirstChild().(*ast.Text)
	if !ok || first.Segment.Start != 0 || first.Segment.Stop < 2 {
		return shortcodes.Esc(body)
	}
	first.Segment.Start += 2
	var out bytes.Buffer
	for child := paragraph.FirstChild(); child != nil; child = child.NextSibling() {
		if err := markdown.Renderer().Render(&out, source, child); err != nil {
			return shortcodes.Esc(body)
		}
	}
	return out.String()
}

// Multiline annotations share one source unit. Removed comment paragraphs
// must not reappear as loose source gaps when the rich tree is reconstructed.
func reviewUnits(units []unit, doc ast.Node, starts []int) []unit {
	catalog, err := review.DisplayCatalog(doc)
	if err != nil || len(catalog.Marks) == 0 || len(units) == 0 {
		return units
	}
	type group struct{ left, right, end int }
	groups := []group{}
	for _, mark := range catalog.Marks {
		if !strings.ContainsAny(mark.Raw, "\r\n") {
			continue
		}
		from, to := lineOf(starts, mark.From), lineOf(starts, mark.To-1)
		left := sort.Search(len(units), func(i int) bool { return units[i].end >= from })
		right := sort.Search(len(units), func(i int) bool { return units[i].start > to }) - 1
		if left >= len(units) || right < left {
			continue
		}
		if len(groups) > 0 && left <= groups[len(groups)-1].right {
			last := &groups[len(groups)-1]
			last.right = max(last.right, right)
			last.end = max(last.end, to)
		} else {
			groups = append(groups, group{left, right, to})
		}
	}
	if len(groups) == 0 {
		return units
	}
	result := []unit{}
	cursor := 0
	for _, group := range groups {
		result = append(result, units[cursor:group.left]...)
		merged := unit{start: units[group.left].start, end: max(units[group.right].end, group.end), kind: "review"}
		for i := group.left; i <= group.right; i++ {
			merged.nodes = append(merged.nodes, units[i].nodes...)
		}
		result = append(result, merged)
		cursor = group.right + 1
	}
	return append(result, units[cursor:]...)
}

// lineStarts is the byte offset each line of src starts at, in order, so
// that a block's line is found by a binary search rather than by counting
// the lines before it, which made a long document quadratic to draw.
func lineStarts(src []byte) []int {
	starts := []int{0}
	for i, c := range src {
		if c == '\n' {
			starts = append(starts, i+1)
		}
	}
	return starts
}

// lineOf is the 1-based line of a byte offset, from the line starts.
func lineOf(starts []int, off int) int {
	// The line is the last one starting at or before the offset.
	return sort.Search(len(starts), func(i int) bool { return starts[i] > off })
}

// firstOffset is the offset of a block's first source character: where the
// parser opened it, or, for a block it made from another (a table from a
// paragraph), the opening fence of a fenced code block, or else the first
// character of its first line or of its first inline text, found depth
// first.
func firstOffset(n ast.Node, src []byte) (int, bool) {
	if p := n.Pos(); p >= 0 && p <= len(src) {
		return p, true
	}
	switch node := n.(type) {
	case *ast.FencedCodeBlock:
		start := -1
		if node.Info != nil {
			start = node.Info.Segment.Start
		} else if node.Lines().Len() > 0 {
			// The fence is on the line before the first line of code.
			start = node.Lines().At(0).Start
			if start > 0 {
				start--
			}
		} else {
			return 0, false
		}
		return bytes.LastIndexByte(src[:start], '\n') + 1, true
	case *ast.Text:
		return node.Segment.Start, true
	}
	if n.Type() == ast.TypeBlock && n.Lines().Len() > 0 {
		return n.Lines().At(0).Start, true
	}
	for ch := n.FirstChild(); ch != nil; ch = ch.NextSibling() {
		if off, ok := firstOffset(ch, src); ok {
			return off, true
		}
	}
	return 0, false
}

// kindOf is the kind of a top-level block.
func kindOf(n ast.Node) string {
	if block, ok := n.(*shortcodes.Block); ok && block.Call.Name == "define" {
		return "definition"
	}
	if n.Kind() == shortcodes.KindBlock || shortcodes.IsShortcodeParagraph(n) {
		return "shortcode"
	}
	switch node := n.(type) {
	case *ast.Paragraph, *ast.TextBlock:
		return "paragraph"
	case *ast.Heading:
		return "heading"
	case *ast.List:
		if isTaskList(node) {
			return "tasklist"
		}
		return "list"
	case *extast.Table:
		return "table"
	case *extast.Footnote:
		return "footnote"
	case *ast.FencedCodeBlock, *ast.CodeBlock:
		return "code"
	case *ast.Blockquote:
		return "quote"
	case *ast.ThematicBreak:
		return "rule"
	case *ast.HTMLBlock:
		return "html"
	}
	return "other"
}

// isTaskList reports whether any item of a list starts with a checkbox.
func isTaskList(list *ast.List) bool {
	for item := list.FirstChild(); item != nil; item = item.NextSibling() {
		if block := item.FirstChild(); block != nil {
			if _, ok := block.FirstChild().(*extast.TaskCheckBox); ok {
				return true
			}
		}
	}
	return false
}

// droppedCells reports the body rows of a table that have more cells than
// its header row. GFM fixes a table's width at its delimiter row, and
// goldmark drops a longer row's extra cells without a word, so the source
// line is read to find them: whatever follows the last parsed cell, after
// its pipe, was dropped.
func droppedCells(t *extast.Table, src []byte, starts []int) []Problem {
	var out []Problem
	for row := t.FirstChild(); row != nil; row = row.NextSibling() {
		if _, header := row.(*extast.TableHeader); header {
			continue
		}
		stop := -1
		for cell := row.FirstChild(); cell != nil; cell = cell.NextSibling() {
			// Cells goldmark adds to pad a short row have no source.
			if cell.Lines().Len() > 0 {
				stop = cell.Lines().At(0).Stop
			}
		}
		if stop < 0 || stop > len(src) {
			continue
		}
		eol := stop
		for eol < len(src) && src[eol] != '\n' {
			eol++
		}
		rest := strings.TrimSpace(string(src[stop:eol]))
		rest = strings.TrimSpace(strings.TrimPrefix(rest, "|"))
		rest = strings.TrimSpace(strings.TrimSuffix(rest, "|"))
		if rest != "" {
			out = append(out, Problem{Line: lineOf(starts, stop), Message: "This table row has more cells than its header row, and the extra cells are not shown: " + strconv.Quote(abbreviate(rest, 60)) + ". Make the header and delimiter rows as wide as the widest row."})
		}
	}
	return out
}

// abbreviate shortens s to at most n runes for quoting in a message.
func abbreviate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}

// drawer draws the nodes the preview draws differently from goldmark's own
// HTML: diagrams, local images, and the <img> tags of inline HTML. It keeps
// the diagrams it has drawn, and the line of the block being drawn.
type drawer struct {
	line     int
	diagrams []Diagram
}

func (d *drawer) RegisterFuncs(r renderer.NodeRendererFuncRegisterer) {
	r.Register(ast.KindFencedCodeBlock, d.fencedCode)
	r.Register(ast.KindImage, d.image)
	r.Register(ast.KindRawHTML, d.rawHTML)
	r.Register(ast.KindHTMLBlock, d.htmlBlock)
}

// fencedCode draws a diagram as a placeholder for the page to draw into, and
// any other fenced block as code.
func (d *drawer) fencedCode(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*ast.FencedCodeBlock)
	language := string(n.Language(src))
	var code strings.Builder
	for i := 0; i < n.Lines().Len(); i++ {
		seg := n.Lines().At(i)
		code.Write(seg.Value(src))
	}
	if diagramLanguages[language] {
		id := "preview-diagram-" + strconv.Itoa(len(d.diagrams)+1)
		d.diagrams = append(d.diagrams, Diagram{ID: id, Language: language, Source: code.String(), Line: d.line})
		_, _ = w.WriteString(`<div class="dinah-diagram-placeholder" data-preview-diagram="` + id + `"><pre><code class="language-` + language + `">` + shortcodes.Esc(code.String()) + "</code></pre></div>\n")
		return ast.WalkSkipChildren, nil
	}
	_, _ = w.WriteString("<pre><code")
	if language != "" {
		_, _ = w.WriteString(` class="language-` + shortcodes.Esc(language) + `"`)
	}
	_, _ = w.WriteString(">" + shortcodes.Esc(code.String()) + "</code></pre>\n")
	return ast.WalkSkipChildren, nil
}

// image draws an image on the web or the site as it is, and one of the home
// folder by its path for the page to load (data-attachment), by the rule a
// figure keeps to (shortcodes.SafeImage). An address that rule refuses is
// shown as written, marked, as a shortcode written wrongly is.
func (d *drawer) image(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*ast.Image)
	alt := plainText(n, src)
	dest, ok := shortcodes.SafeImage(string(n.Destination))
	if !ok {
		_, _ = w.WriteString(`<code class="sc-problem" title="A picture is a file beside the document or in your home folder, a path on this site, or an http or https address.">` +
			shortcodes.Esc("!["+alt+"]("+string(n.Destination)+")") + `</code>`)
		return ast.WalkSkipChildren, nil
	}
	// An attribute block after the picture gives it a size, a title and an anchor.
	sized := func(name string) string {
		if _, ok := attrblock.Raw(n); !ok {
			return ""
		}
		v, _ := n.AttributeString(name)
		b, _ := v.([]byte)
		return string(b)
	}
	tag := imageTag(dest, alt, sized("width"), sized("height"), "")
	_, _ = w.WriteString(strings.TrimSuffix(tag, ">") + attrblock.Written(n, "class", "width", "height") + ">")
	return ast.WalkSkipChildren, nil
}

func (d *drawer) rawHTML(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkSkipChildren, nil
	}
	n := node.(*ast.RawHTML)
	var b strings.Builder
	for i := 0; i < n.Segments.Len(); i++ {
		seg := n.Segments.At(i)
		b.Write(seg.Value(src))
	}
	_, _ = w.WriteString(localImages(b.String()))
	return ast.WalkSkipChildren, nil
}

func (d *drawer) htmlBlock(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*ast.HTMLBlock)
	var b strings.Builder
	for i := 0; i < n.Lines().Len(); i++ {
		seg := n.Lines().At(i)
		b.Write(seg.Value(src))
	}
	if n.HasClosure() {
		b.Write(n.ClosureLine.Value(src))
	}
	_, _ = w.WriteString(localImages(b.String()))
	return ast.WalkContinue, nil
}

// imageTag is the <img> for an image at an address shortcodes.SafeImage
// admitted, drawn as a figure draws its picture (shortcodes.ImageTag). A
// file of the home folder with no description of its own is described by
// its file's name.
func imageTag(dest, alt, width, height, align string) string {
	size := ""
	if width != "" {
		size += ` width="` + shortcodes.Esc(width) + `"`
	}
	if height != "" {
		size += ` height="` + shortcodes.Esc(height) + `"`
	}
	if align == "right" || align == "left" {
		size += ` align="` + align + `"`
	}
	if alt == "" && shortcodes.IsLocal(dest) {
		name := strings.ReplaceAll(dest, `\`, "/")
		alt = name[strings.LastIndex(name, "/")+1:]
	}
	return shortcodes.ImageTag(dest, alt, size)
}

var (
	imgTagRe  = regexp.MustCompile(`(?is)<img\b[^>]*?/?>`)
	imgAttrRe = regexp.MustCompile(`(?is)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')`)
)

// localImages draws each <img> in inline HTML whose source is a file of
// the home folder as such an image, keeping its size and recognized alignment; other HTML, and an
// <img> from the site or the web, is left as it is.
func localImages(s string) string {
	return imgTagRe.ReplaceAllStringFunc(s, func(tag string) string {
		var src, alt, width, height, align string
		for _, m := range imgAttrRe.FindAllStringSubmatch(tag, -1) {
			val := m[2] + m[3]
			switch strings.ToLower(m[1]) {
			case "src":
				src = val
			case "alt":
				alt = val
			case "width":
				width = val
			case "height":
				height = val
			case "align":
				align = strings.ToLower(val)
			}
		}
		if !shortcodes.IsLocal(src) {
			return tag
		}
		return imageTag(src, alt, width, height, align)
	})
}

// plainText is the text inside a node, without its markup.
func plainText(n ast.Node, src []byte) string {
	var b strings.Builder
	for ch := n.FirstChild(); ch != nil; ch = ch.NextSibling() {
		switch t := ch.(type) {
		case *ast.Text:
			b.Write(t.Segment.Value(src))
		case *ast.String:
			b.Write(t.Value)
		default:
			b.WriteString(plainText(ch, src))
		}
	}
	return b.String()
}
