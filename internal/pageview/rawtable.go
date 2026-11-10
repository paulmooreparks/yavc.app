// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Lifted from Dinah Desktop's pageview/rawtable.go (Apache-2.0).

package pageview

import (
	"encoding/xml"
	"errors"
	"io"
	"strconv"
	"strings"
)

// An HTML block that is one table, as a page brought in from a wiki often
// has (merged cells, coloured cells, a heading row below the first), is
// edited on the page as a table (DESIGN.md, decision 112). parseHTMLTable
// reads it into the editor's table, keeping everything that is not text
// (the table's and each cell's attributes, its column group, an element in
// a cell that is not simple formatting) to be written back as it was;
// writeRawTable writes the table back as HTML. A block is read this way
// only when writing back what was read gives the same markup, token for
// token, so editing never changes a cell the person did not touch. The same
// reading serves a host container whose body is literal HTML: open and
// close are then the container's two lines, and empty for a bare block.

// rawElement is one element of the markup, with the text it was read from.
type rawElement struct {
	name  string     // with its prefix, as written: "td", "ac:link"
	attrs [][]string // in order, prefixed names
	kids  []any      // *rawElement or string (text, entities decoded)
	src   string     // the element as written, start tag to end tag
}

// rawMaxLen bounds what is read as a table; a larger block stays source.
const rawMaxLen = 1 << 20

// readRaw reads markup into a tree, keeping each element's own text.
func readRaw(body string) ([]any, error) {
	d := xml.NewDecoder(strings.NewReader(body))
	d.Strict = true
	d.Entity = xml.HTMLEntity
	var (
		roots []any
		stack []*rawElement
		start []int64
	)
	add := func(x any) {
		if len(stack) == 0 {
			roots = append(roots, x)
		} else {
			top := stack[len(stack)-1]
			top.kids = append(top.kids, x)
		}
	}
	for {
		at := d.InputOffset()
		tok, err := d.RawToken()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			e := &rawElement{name: rawName(t.Name)}
			for _, a := range t.Attr {
				e.attrs = append(e.attrs, []string{rawName(a.Name), a.Value})
			}
			add(e)
			stack = append(stack, e)
			start = append(start, at)
		case xml.EndElement:
			if len(stack) == 0 || stack[len(stack)-1].name != rawName(t.Name) {
				return nil, errors.New("the markup is not well formed")
			}
			e := stack[len(stack)-1]
			e.src = body[start[len(start)-1]:d.InputOffset()]
			stack, start = stack[:len(stack)-1], start[:len(start)-1]
		case xml.CharData:
			add(string(t))
		case xml.Comment, xml.ProcInst, xml.Directive:
			return nil, errors.New("the markup holds a comment or a directive")
		}
	}
	if len(stack) != 0 {
		return nil, errors.New("the markup is not well formed")
	}
	return roots, nil
}

func rawName(n xml.Name) string {
	if n.Space != "" {
		return n.Space + ":" + n.Local
	}
	return n.Local
}

// canonicalRaw is markup as a sequence of tokens, entities decoded and space
// between table parts dropped, for telling whether two writings are the same.
func canonicalRaw(body string) (string, bool) {
	d := xml.NewDecoder(strings.NewReader(body))
	d.Strict = true
	d.Entity = xml.HTMLEntity
	var b strings.Builder
	var open []string
	structural := map[string]bool{"table": true, "tbody": true, "thead": true, "tr": true, "colgroup": true}
	for {
		tok, err := d.RawToken()
		if err == io.EOF {
			return b.String(), len(open) == 0
		}
		if err != nil {
			return "", false
		}
		switch t := tok.(type) {
		case xml.StartElement:
			b.WriteString("<" + rawName(t.Name))
			for _, a := range t.Attr {
				b.WriteString(" " + rawName(a.Name) + "=" + strconv.Quote(a.Value))
			}
			b.WriteString(">")
			open = append(open, rawName(t.Name))
		case xml.EndElement:
			b.WriteString("</" + rawName(t.Name) + ">")
			if len(open) > 0 {
				open = open[:len(open)-1]
			}
		case xml.CharData:
			s := string(t)
			if strings.TrimSpace(s) == "" && (len(open) == 0 || structural[open[len(open)-1]]) {
				continue
			}
			b.WriteString(strconv.Quote(s))
		}
	}
}

// parseHTMLTable reads markup holding one table as the editor's table, or
// is false for any other markup. open and close are the lines written
// around the markup (a literal container's), or empty for a bare block.
func parseHTMLTable(open, body, close string) (*Node, bool) {
	if len(body) > rawMaxLen || strings.TrimSpace(body) == "" {
		return nil, false
	}
	roots, err := readRaw(body)
	if err != nil {
		return nil, false
	}
	var table *rawElement
	for _, r := range roots {
		switch x := r.(type) {
		case string:
			if strings.TrimSpace(x) != "" {
				return nil, false
			}
		case *rawElement:
			if table != nil || x.name != "table" {
				return nil, false
			}
			table = x
		}
	}
	if table == nil {
		return nil, false
	}
	raw := map[string]any{"open": open, "close": close, "attrs": append([][]string{}, table.attrs...), "colgroup": "", "thead": false, "tbody": false}
	type rawRow struct {
		part string // "thead", "tbody" or "" for a row of the table itself
		el   *rawElement
	}
	var rows []rawRow
	for _, k := range table.kids {
		e, isElement := k.(*rawElement)
		if !isElement {
			if strings.TrimSpace(k.(string)) != "" {
				return nil, false
			}
			continue
		}
		switch e.name {
		case "colgroup":
			if raw["colgroup"] != "" {
				return nil, false
			}
			raw["colgroup"] = e.src
		case "thead", "tbody":
			// A head and a body, each once, each read for its rows; the
			// head's rows are written back as the head's.
			if raw[e.name] == true {
				return nil, false
			}
			raw[e.name] = true
			for _, kk := range e.kids {
				if s, isText := kk.(string); isText {
					if strings.TrimSpace(s) != "" {
						return nil, false
					}
					continue
				}
				el, _ := kk.(*rawElement)
				rows = append(rows, rawRow{e.name, el})
			}
		case "tr":
			rows = append(rows, rawRow{"", e})
		default:
			return nil, false
		}
	}
	out := &Node{Type: "table", Attrs: map[string]any{"raw": raw}}
	for _, pair := range rows {
		row := pair.el
		if row == nil || row.name != "tr" {
			return nil, false
		}
		// A raw table's row has its attributes, an empty list when it has
		// none, which tells the page it is drawn as written: the preview
		// hides an empty heading row only in a Markdown table.
		r := &Node{Type: "table_row", Attrs: map[string]any{"xattrs": append([][]string{}, row.attrs...)}}
		if pair.part == "thead" {
			r.Attrs["head"] = true
		}
		for _, c := range row.kids {
			cell, isElement := c.(*rawElement)
			if !isElement {
				if strings.TrimSpace(c.(string)) != "" {
					return nil, false
				}
				continue
			}
			n, ok := rawCell(cell)
			if !ok {
				return nil, false
			}
			r.Content = append(r.Content, n)
		}
		if len(r.Content) == 0 {
			return nil, false
		}
		out.Content = append(out.Content, r)
	}
	if len(out.Content) == 0 {
		return nil, false
	}
	written, err := writeRawTable(out)
	if err != nil {
		return nil, false
	}
	a, okA := canonicalRaw(body)
	w, okW := canonicalRaw(rawBodyOf(written, open, close))
	if !okA || !okW || a != w {
		return nil, false
	}
	return out, true
}

// rawBodyOf is the markup of a written table, between its open and close
// lines where it has them.
func rawBodyOf(written, open, close string) string {
	if open != "" {
		written = strings.TrimPrefix(written, open+"\n")
	}
	if close != "" {
		written = strings.TrimSuffix(written, "\n"+close)
	}
	return written
}

// rawCell reads a th or td: its spans, its other attributes, and its
// content, which is text with simple formatting, line breaks and elements
// kept as they were. A cell holding one paragraph is read as that
// paragraph's content and written back inside a paragraph.
func rawCell(cell *rawElement) (*Node, bool) {
	typ := "table_cell"
	switch cell.name {
	case "th":
		typ = "table_header"
	case "td":
	default:
		return nil, false
	}
	attrs := map[string]any{"colspan": 1, "rowspan": 1, "colwidth": nil, "align": "", "xattrs": append([][]string{}, cell.attrs...), "para": false}
	for _, a := range cell.attrs {
		switch a[0] {
		case "colspan", "rowspan":
			n, err := strconv.Atoi(a[1])
			if err != nil || n < 1 || n > 1000 {
				return nil, false
			}
			attrs[a[0]] = n
		}
	}
	kids := cell.kids
	var elems []*rawElement
	for _, k := range kids {
		if e, ok := k.(*rawElement); ok {
			elems = append(elems, e)
		} else if strings.TrimSpace(k.(string)) != "" {
			elems = nil
			break
		}
	}
	if len(elems) == 1 && elems[0].name == "p" && len(elems[0].attrs) == 0 {
		attrs["para"] = true
		kids = elems[0].kids
	}
	var content []*Node
	if !rawInline(kids, nil, &content) {
		return nil, false
	}
	return &Node{Type: typ, Attrs: attrs, Content: content}, true
}

// rawMarks are the elements read as the page's marks, and rawTags the same
// the other way, for writing.
var rawMarks = map[string]string{"strong": "strong", "em": "em", "u": "underline", "s": "strike", "code": "code", "mark": "mark", "sup": "sup", "sub": "sub"}
var rawTags = map[string]string{"strong": "strong", "em": "em", "underline": "u", "strike": "s", "code": "code", "mark": "mark", "sup": "sup", "sub": "sub"}

func rawInline(kids []any, marks []Mark, out *[]*Node) bool {
	for _, k := range kids {
		switch x := k.(type) {
		case string:
			if x != "" {
				*out = append(*out, &Node{Type: "text", Text: x, Marks: marks})
			}
		case *rawElement:
			if mark, ok := rawMarks[x.name]; ok && len(x.attrs) == 0 {
				if !rawInline(x.kids, withMark(marks, Mark{Type: mark}), out) {
					return false
				}
				continue
			}
			if x.name == "a" && len(x.attrs) == 1 && x.attrs[0][0] == "href" {
				if !rawInline(x.kids, withMark(marks, Mark{Type: "link", Attrs: map[string]any{"href": x.attrs[0][1], "title": nil}}), out) {
					return false
				}
				continue
			}
			if x.name == "br" && len(x.attrs) == 0 && len(x.kids) == 0 {
				*out = append(*out, &Node{Type: "hard_break", Marks: marks})
				continue
			}
			// A block element in a cell is not edited here.
			switch x.name {
			case "p", "div", "table", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote":
				return false
			}
			// Any other element is one piece, drawn as the page draws its
			// markup (made safe there) and written back as it was.
			*out = append(*out, &Node{Type: "raw_inline", Attrs: map[string]any{"xml": x.src}, Marks: marks})
		}
	}
	return true
}

// rawTableOf says whether a table was read from markup.
func rawTableOf(n *Node) map[string]any {
	if n == nil || n.Type != "table" {
		return nil
	}
	raw, _ := n.Attrs["raw"].(map[string]any)
	return raw
}

// writeRawTable writes the editor's table back as its markup, a row to a
// line, between its open and close lines where it has them.
func writeRawTable(n *Node) (string, error) {
	raw := rawTableOf(n)
	if raw == nil {
		return "", errors.New("not a table read from markup")
	}
	var b strings.Builder
	open, _ := raw["open"].(string)
	close, _ := raw["close"].(string)
	if open != "" {
		b.WriteString(open + "\n")
	}
	b.WriteString("<table")
	writeRawAttrs(&b, attrList(raw["attrs"]), nil)
	b.WriteString(">")
	if cg, _ := raw["colgroup"].(string); cg != "" {
		if !rawColgroupWhole(cg) {
			return "", errors.New("the table's column group is not one well formed colgroup element")
		}
		b.WriteString(cg)
	}
	thead, _ := raw["thead"].(bool)
	tbody, _ := raw["tbody"].(bool)
	// The head's rows are those marked as the head's while they lead the
	// table; a head row moved below a body row is written as a body row,
	// and the body's rows go in a body where the markup had one, or where
	// it had a head, since rows outside both would not be a table's.
	part := ""
	for i, row := range n.Content {
		if row == nil {
			continue
		}
		head, _ := row.Attrs["head"].(bool)
		want := ""
		if thead && head && (i == 0 || part == "thead") {
			want = "thead"
		} else if tbody || thead {
			want = "tbody"
		}
		if want != part {
			if part != "" {
				b.WriteString("\n</" + part + ">")
			}
			if want != "" {
				b.WriteString("<" + want + ">")
			}
			part = want
		}
		b.WriteString("\n<tr")
		writeRawAttrs(&b, attrList(row.Attrs["xattrs"]), nil)
		b.WriteString(">")
		for _, cell := range row.Content {
			if cell == nil {
				continue
			}
			name := "td"
			if cell.Type == "table_header" {
				name = "th"
			}
			b.WriteString("<" + name)
			spans := map[string]int{"colspan": intAttr(cell, "colspan", 1), "rowspan": intAttr(cell, "rowspan", 1)}
			writeRawAttrs(&b, attrList(cell.Attrs["xattrs"]), spans)
			b.WriteString(">")
			para, _ := cell.Attrs["para"].(bool)
			if para {
				b.WriteString("<p>")
			}
			if err := writeRawInline(&b, cell.Content); err != nil {
				return "", err
			}
			if para {
				b.WriteString("</p>")
			}
			b.WriteString("</" + name + ">")
		}
		b.WriteString("</tr>")
	}
	b.WriteString("\n")
	if part != "" {
		b.WriteString("</" + part + ">")
	}
	b.WriteString("</table>")
	if close != "" {
		b.WriteString("\n" + close)
	}
	return b.String(), nil
}

// attrList reads attributes as JSON gives them back: a list of [name, value].
func attrList(v any) [][]string {
	switch x := v.(type) {
	case [][]string:
		return x
	case []any:
		var out [][]string
		for _, p := range x {
			pair, ok := p.([]any)
			if !ok || len(pair) != 2 {
				continue
			}
			k, _ := pair[0].(string)
			val, _ := pair[1].(string)
			if k == "" {
				continue
			}
			out = append(out, []string{k, val})
		}
		return out
	}
	return nil
}

// writeRawAttrs writes attributes in the order they were read, with a cell's
// spans as the editor has them now: a span that was written keeps its place,
// and one that is new is added after the others. An attribute the editor
// added (a colour) is written as given, except that a name a cell may have
// only once is written once.
func writeRawAttrs(b *strings.Builder, attrs [][]string, spans map[string]int) {
	done := map[string]bool{}
	seen := map[string]bool{}
	for _, a := range attrs {
		if len(a) != 2 || seen[a[0]] || !rawAttrName(a[0]) {
			continue
		}
		seen[a[0]] = true
		v := a[1]
		if n, ok := spans[a[0]]; ok {
			done[a[0]] = true
			if n == 1 {
				// A span of one was written by someone; it stays as written.
				if a[1] != "1" {
					continue
				}
			} else {
				v = strconv.Itoa(n)
			}
		}
		b.WriteString(" " + a[0] + `="` + escapeRawAttr(v) + `"`)
	}
	for _, k := range []string{"colspan", "rowspan"} {
		if n, ok := spans[k]; ok && !done[k] && n != 1 {
			b.WriteString(" " + k + `="` + strconv.Itoa(n) + `"`)
		}
	}
}

// rawAttrName says whether a name can be written as an attribute's: the
// page could otherwise be made to write markup through an attribute's name.
func rawAttrName(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c <= ' ' || c == '"' || c == '\'' || c == '>' || c == '/' || c == '=' || c == '<' || c == '&' || c >= 0x7f {
			return false
		}
	}
	return true
}

func writeRawInline(b *strings.Builder, nodes []*Node) error {
	var open []Mark
	closeTo := func(keep int) {
		for len(open) > keep {
			b.WriteString(rawClose(open[len(open)-1]))
			open = open[:len(open)-1]
		}
	}
	for _, n := range nodes {
		if n == nil {
			continue
		}
		marks := sortedMarks(n.Marks)
		for _, m := range marks {
			if _, ok := rawTags[m.Type]; !ok && m.Type != "link" {
				return errors.New("a " + m.Type + " mark cannot be written in an HTML table's cell")
			}
		}
		keep := 0
		for keep < len(open) && keep < len(marks) && sameMark(open[keep], marks[keep]) {
			keep++
		}
		closeTo(keep)
		for _, m := range marks[keep:] {
			b.WriteString(rawOpen(m))
			open = append(open, m)
		}
		switch n.Type {
		case "text":
			b.WriteString(escapeRawText(n.Text))
		case "hard_break":
			b.WriteString("<br />")
		case "raw_inline":
			x, _ := n.Attrs["xml"].(string)
			if !rawInlineWhole(x) {
				return errors.New("a piece of markup in an HTML table's cell is not one element")
			}
			b.WriteString(x)
		case "soft_break":
			b.WriteString(" ")
		default:
			// A shortcode, a review mark or a footnote reference is Markdown,
			// which an HTML block is not read for.
			return errors.New("a " + n.Type + " cannot be written in an HTML table's cell")
		}
	}
	closeTo(0)
	return nil
}

// rawInlineWhole says whether a piece kept from the markup is one well
// formed element, as it was when it was read; the page could otherwise put
// anything into a cell's markup through a raw_inline node.
func rawInlineWhole(x string) bool {
	roots, err := readRaw(x)
	if err != nil || len(roots) != 1 {
		return false
	}
	_, ok := roots[0].(*rawElement)
	return ok
}

// rawColgroupWhole says whether a column group kept from the markup is one
// well formed colgroup element holding only col elements, as it was when
// it was read; the page could otherwise put anything into the markup
// through a table's raw attributes.
func rawColgroupWhole(x string) bool {
	roots, err := readRaw(x)
	if err != nil || len(roots) != 1 {
		return false
	}
	cg, ok := roots[0].(*rawElement)
	if !ok || cg.name != "colgroup" {
		return false
	}
	for _, k := range cg.kids {
		if e, isElement := k.(*rawElement); isElement {
			if e.name != "col" || len(e.kids) != 0 {
				return false
			}
			for _, a := range e.attrs {
				if !rawAttrName(a[0]) {
					return false
				}
			}
		} else if strings.TrimSpace(k.(string)) != "" {
			return false
		}
	}
	for _, a := range cg.attrs {
		if !rawAttrName(a[0]) {
			return false
		}
	}
	return true
}

func rawOpen(m Mark) string {
	if m.Type == "link" {
		href, _ := m.Attrs["href"].(string)
		return `<a href="` + escapeRawAttr(href) + `">`
	}
	if t, ok := rawTags[m.Type]; ok {
		return "<" + t + ">"
	}
	return ""
}

func rawClose(m Mark) string {
	if m.Type == "link" {
		return "</a>"
	}
	if t, ok := rawTags[m.Type]; ok {
		return "</" + t + ">"
	}
	return ""
}

func escapeRawText(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}

func escapeRawAttr(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", `"`, "&quot;").Replace(s)
}

// rawTableText writes a table read from markup, or keeps the block it was
// read from when its markup is the same, byte for byte.
func rawTableText(n *Node) (string, error) {
	s, err := writeRawTable(n)
	if err != nil {
		return "", err
	}
	if src, ok := n.Attrs["src"].(string); ok {
		raw := rawTableOf(n)
		open, _ := raw["open"].(string)
		close, _ := raw["close"].(string)
		a, okA := canonicalRaw(rawBodyOf(src, open, close))
		w, okW := canonicalRaw(rawBodyOf(s, open, close))
		if okA && okW && a == w {
			return src, nil
		}
	}
	return s, nil
}
