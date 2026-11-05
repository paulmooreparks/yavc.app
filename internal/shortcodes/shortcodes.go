// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package shortcodes is parkscomputing.com's shortcodes for goldmark,
// ported from its SiteShortcodes.cs and Shortcodes.cs (Markdig, C#): a
// small set of things a page says in its Markdown that render to PUDL's
// components where PUDL has one and otherwise to plain HTML with sc-*
// classes. A shortcode is written {{name}} or {{name:args}}; a container
// opens on a line of its own and closes on a line holding {{/name}}; an
// inline one sits in a line of text; a block one stands alone in its
// paragraph. One written wrongly renders as itself, marked, with the
// reason as its title, so a mistake shows on the page instead of
// vanishing.
//
// The shortcodes that need the site's pages or files (include, children,
// tagged, latest, score) are not here, since this engine runs in the
// browser with the document's text alone.
package shortcodes

import (
	"bytes"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// === The call =============================================================

// Call is a shortcode as written: its name, its arguments as text, and the
// arguments read as words, with key=value ones apart. A value in double
// quotes may hold spaces, with \" for a quote.
type Call struct {
	Name, Args string
	Positional []string
	Named      map[string]string
}

var keyRe = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9-]*)=`)

func NewCall(name, args string) Call {
	c := Call{Name: name, Args: strings.TrimSpace(args), Named: map[string]string{}}
	s := c.Args
	i := 0
	for i < len(s) {
		for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
			i++
		}
		if i >= len(s) {
			break
		}
		key := ""
		if m := keyRe.FindStringSubmatch(s[i:]); m != nil {
			key = m[1]
			i += len(m[0])
		}
		var value string
		if i < len(s) && s[i] == '"' {
			var b strings.Builder
			i++
			for i < len(s) && s[i] != '"' {
				if s[i] == '\\' && i+1 < len(s) {
					i++
				}
				b.WriteByte(s[i])
				i++
			}
			i++
			value = b.String()
		} else {
			start := i
			for i < len(s) && s[i] != ' ' && s[i] != '\t' {
				i++
			}
			value = s[start:i]
		}
		if key == "" {
			c.Positional = append(c.Positional, value)
		} else {
			c.Named[strings.ToLower(key)] = value
		}
	}
	return c
}

// Get is a named argument, or the positional one at position (-1 for none).
func (c Call) Get(key string, position int) (string, bool) {
	if v, ok := c.Named[strings.ToLower(key)]; ok {
		return v, true
	}
	if position >= 0 && position < len(c.Positional) {
		return c.Positional[position], true
	}
	return "", false
}

// Source is the shortcode as written, for a problem to show.
func (c Call) Source() string {
	if c.Args != "" {
		return "{{" + c.Name + ":" + c.Args + "}}"
	}
	return "{{" + c.Name + "}}"
}

// === The syntax ===========================================================

var (
	tagRe       = regexp.MustCompile(`^\{\{(/?)([a-z][a-z0-9-]*)(?::((?:[^}]|\}[^}])*))?\}\}`)
	lineRe      = regexp.MustCompile(`^ {0,3}\{\{([a-z][a-z0-9-]*)(?::((?:[^}]|\}[^}])*))?\}\}[ \t]*\r?\n?$`)
	closeLineRe = regexp.MustCompile(`^ {0,3}\{\{/([a-z][a-z0-9-]*)\}\}[ \t]*\r?\n?$`)
)

// Inline is a shortcode in a line of text, or a {{/name}} with no container
// open, which is a problem.
type Inline struct {
	ast.BaseInline
	Call    Call
	Closing bool
	// Raw is the shortcode as written, for an editor to write back.
	Raw string
	// For a span shortcode, set as its paragraph is drawn: an opener that
	// found its {{/name}} in the paragraph, and a closer that matched.
	Matched  bool
	registry *MacroRegistry
}

var KindInline = ast.NewNodeKind("ShortcodeInline")

func (n *Inline) Kind() ast.NodeKind { return KindInline }
func (n *Inline) Dump(src []byte, level int) {
	ast.DumpHelper(n, src, level, map[string]string{"call": n.Call.Source()}, nil)
}

// Block is a container shortcode and the Markdown inside it.
type Block struct {
	ast.BaseBlock
	Call               Call
	Closed             bool
	BodyStart, BodyEnd int
}

var KindBlock = ast.NewNodeKind("ShortcodeBlock")

// Closer is the {{/name}} line that ends a container. It stands in the
// tree as a leaf of its own so that goldmark closes the container's open
// blocks at that line (blockParser.Open), rather than reading the line
// after it as a lazy continuation of a paragraph inside the container, as
// it does when Continue consumes the line itself. It draws nothing.
type Closer struct {
	ast.BaseBlock
}

var KindCloser = ast.NewNodeKind("ShortcodeCloser")

func (n *Closer) Kind() ast.NodeKind { return KindCloser }
func (n *Closer) Dump(src []byte, level int) {
	ast.DumpHelper(n, src, level, nil, nil)
}

func (n *Block) Kind() ast.NodeKind { return KindBlock }
func (n *Block) Dump(src []byte, level int) {
	ast.DumpHelper(n, src, level, map[string]string{"call": n.Call.Source()}, nil)
}

// IsShortcodeParagraph reports whether a paragraph holds a shortcode, so a
// page editor keeps it as its Markdown rather than as rich text. A span
// paired with its closer is rich text (a mark), not a shortcode here.
func IsShortcodeParagraph(n ast.Node) bool {
	MatchSpans(n)
	for ch := n.FirstChild(); ch != nil; ch = ch.NextSibling() {
		if in, ok := ch.(*Inline); ok {
			if _, _, isSpan := Span(in); isSpan {
				continue
			}
			if IsInlineAtom(in) {
				continue
			}
			return true
		}
	}
	return false
}

// IsInlineAtom says whether an inline shortcode stands in a line of text on
// its own, such as {{kbd:Ctrl+C}} or {{status:green Done}}, so an editor
// keeps it as one piece of the line with a form of its own.
func IsInlineAtom(n *Inline) bool {
	if d, ok := n.registry.definition(n.Call.Name); ok {
		return d.Inline && !n.Closing
	}
	d := table[n.Call.Name]
	return d != nil && d.kind == inline && !n.Closing && n.Raw != ""
}

// InlineHTML draws one inline shortcode, as written, as the page draws it;
// a shortcode it cannot draw is the page's marked problem.
func InlineHTML(raw string) string {
	return InlineHTMLWithMacros(raw, nil)
}

// InlineHTMLWithMacros draws a custom atom using its document's registry.
func InlineHTMLWithMacros(raw string, registry *MacroRegistry) string {
	m := tagRe.FindStringSubmatch(raw)
	if m == nil || m[0] != raw || m[1] != "" {
		return `<code class="sc-problem">` + Esc(raw) + `</code>`
	}
	c := NewCall(m[2], m[3])
	if _, ok := registry.definition(c.Name); ok {
		out, err := registry.render(c, "", true, &MacroBudget{})
		if err != nil {
			return problemHTML(c, err.Error())
		}
		return out
	}
	d := table[c.Name]
	if d == nil || d.kind != inline {
		return problemHTML(c, "There is no shortcode called "+c.Name+" that goes in a line of text.")
	}
	out, err := d.render(c, nil, nil)
	if err != nil {
		return problemHTML(c, err.Error())
	}
	return out
}

// GlyphNames lists PUDL's glyphs, for an editor's glyph choice.
func GlyphNames() []string {
	var out []string
	for g := range glyphs {
		out = append(out, g)
	}
	sort.Strings(out)
	return out
}

// Span says whether an inline shortcode is a paired span with its match
// found, and gives its name and its value (the first argument).
func Span(n *Inline) (name, value string, ok bool) {
	d := table[n.Call.Name]
	if !isSpan(d) || !n.Matched {
		return "", "", false
	}
	v, _ := n.Call.Get(n.Call.Name, 0)
	return n.Call.Name, v, true
}

// MatchSpans pairs the span shortcodes in a block with their closers.
func MatchSpans(block ast.Node) { matchSpans(block) }

type inlineParser struct{ registry *MacroRegistry }

func (p *inlineParser) Trigger() []byte { return []byte{'{'} }

func (p *inlineParser) Parse(parent ast.Node, block text.Reader, pc parser.Context) ast.Node {
	line, seg := block.PeekLine()
	m := tagRe.FindSubmatch(line)
	if m == nil {
		return nil
	}
	node := &Inline{Call: NewCall(string(m[2]), string(m[3])), Closing: len(m[1]) > 0, Raw: string(m[0]), registry: p.registry}
	node.SetPos(seg.Start)
	block.Advance(len(m[0]))
	_ = seg
	return node
}

type blockParser struct{ registry *MacroRegistry }

// takeLine consumes a line a block parser has read, up to its newline:
// goldmark moves past the newline itself, and a parser that takes it too
// makes goldmark skip the line after.
func takeLine(reader text.Reader, line []byte) {
	n := len(line)
	if n > 0 && line[n-1] == '\n' {
		n--
	}
	reader.Advance(n)
}

func (p *blockParser) Trigger() []byte { return []byte{'{'} }

// closing is the key, in the parser's context, of the container whose
// Continue has just said that this line closes it. Open takes the line in
// the parent, where it finds the container here.
var closing = parser.NewContextKey()

func (p *blockParser) Open(parent ast.Node, reader text.Reader, pc parser.Context) (ast.Node, parser.State) {
	line, seg := reader.PeekLine()
	ending, _ := pc.Get(closing).(*Block)
	pc.Set(closing, nil)
	// The closing line of an open container: goldmark asks the open
	// blocks' parent for a new block here, after Continue said the
	// container ends (see Closer).
	if m := closeLineRe.FindSubmatch(line); m != nil {
		if ending == nil || ending.Call.Name != string(m[1]) {
			return nil, parser.NoChildren
		}
		takeLine(reader, line)
		return &Closer{}, parser.NoChildren
	}
	m := lineRe.FindSubmatch(line)
	if m == nil {
		return nil, parser.NoChildren
	}
	def := table[string(m[1])]
	macro, custom := p.registry.definition(string(m[1]))
	declaration := string(m[1]) == "define"
	if !declaration && (!custom || !macro.Container) && (def == nil || def.kind != container) {
		return nil, parser.NoChildren
	}
	takeLine(reader, line)
	node := &Block{Call: NewCall(string(m[1]), string(m[2])), BodyStart: seg.Stop, BodyEnd: len(reader.Source())}
	node.SetPos(seg.Start)
	if declaration {
		return node, parser.NoChildren
	}
	return node, parser.HasChildren
}

func (p *blockParser) Continue(node ast.Node, reader text.Reader, pc parser.Context) parser.State {
	// A closer ends at once, so the line after it is the parent's.
	if _, ok := node.(*Closer); ok {
		return parser.Close
	}
	line, seg := reader.PeekLine()
	// The container's own closing line ends it; the line itself is left
	// for Open to take, in the parent, which closes the blocks open inside.
	// A container of the same name open inside this one is closed first,
	// so the closing lines pair with the opening lines by depth, as
	// brackets do.
	blk := node.(*Block)
	if m := closeLineRe.FindSubmatch(line); m != nil && string(m[1]) == blk.Call.Name {
		inside := false
		for _, b := range pc.OpenedBlocks() {
			if b.Node == node {
				inside = true
				continue
			}
			if other, ok := b.Node.(*Block); ok && inside && other.Call.Name == blk.Call.Name && !other.Closed {
				return parser.Continue | parser.HasChildren
			}
		}
		blk.Closed = true
		blk.BodyEnd = seg.Start
		pc.Set(closing, blk)
		return parser.Close
	}
	if blk.Call.Name == "define" {
		return parser.Continue | parser.NoChildren
	}
	return parser.Continue | parser.HasChildren
}

func (p *blockParser) Close(node ast.Node, reader text.Reader, pc parser.Context) {}
func (p *blockParser) CanInterruptParagraph() bool                                { return true }
func (p *blockParser) CanAcceptIndentedLine() bool                                { return false }

// === The definitions ======================================================

type kind int

const (
	inline    kind = iota // written in a line of text, rendered in it
	block                 // written alone in its paragraph, rendered as a block
	container             // {{name}} ... {{/name}} around Markdown of its own
	span                  // {{name}} ... {{/name}} around words in a line, Markdown inside
)

type problem struct{ why string }

func (p problem) Error() string { return p.why }

type def struct {
	name, title, what, example string
	kind                       kind
	// render draws an inline or block shortcode; wrap gives a container's
	// HTML before and after its body.
	render func(c Call, doc ast.Node, src []byte) (string, error)
	wrap   func(c Call) (string, string, error)
	// spanWrap lets a container also be written around words in a line,
	// {{name:args}}words{{/name}}, as a span shortcode is.
	spanWrap func(c Call) (string, string, error)
	// separator is the block shortcode that divides a container's body,
	// and separatorHTML what it becomes ({{column}} in {{columns}}).
	separator, separatorHTML string
}

var table = map[string]*def{}

// isSpan says whether a definition is written around words in a line.
func isSpan(d *def) bool { return d != nil && (d.kind == span || d.spanWrap != nil) }
func spanOf(d *def) func(c Call) (string, string, error) {
	if d.spanWrap != nil {
		return d.spanWrap
	}
	return d.wrap
}

func add(d *def) { table[d.name] = d }

// Container is what an editor needs to edit a container shortcode's body
// as rich text (internal/pageview, docs/page-view-design.md): its HTML
// before and after the body, and the block shortcode that divides the body
// into parts, if it has one.
type Container struct {
	Name, Args    string
	Before, After string
	Separator     string
}

// sourceOnly are the containers whose body is not rich text.
var sourceOnly = map[string]bool{"style": true}

// ContainerOf reads a container's opening line, {{name}} or {{name:args}}
// on a line of its own, and gives its parts; ok is false for any other
// line, and for a container whose body is edited as source.
func ContainerOf(line string) (Container, bool) {
	m := lineRe.FindStringSubmatch(line)
	if m == nil {
		return Container{}, false
	}
	d := table[m[1]]
	if d == nil || d.kind != container || d.wrap == nil || sourceOnly[d.name] {
		return Container{}, false
	}
	c := NewCall(m[1], m[2])
	before, after, err := d.wrap(c)
	if err != nil {
		return Container{}, false
	}
	return Container{Name: d.name, Args: c.Args, Before: before, After: after, Separator: d.separator}, true
}

// ClosesContainer says whether a line is {{/name}} on its own.
func ClosesContainer(line, name string) bool {
	m := closeLineRe.FindStringSubmatch(line)
	return m != nil && m[1] == name
}

// OpenLine writes a container's opening line for its arguments.
func OpenLine(name, args string) string {
	args = strings.TrimSpace(args)
	if args == "" {
		return "{{" + name + "}}"
	}
	return "{{" + name + ":" + args + "}}"
}

// Definitions lists the shortcodes, for an editor's Insert menu.
type Definition struct {
	Name, Title, Description, Example string
	Kind                              string
}

func Definitions() []Definition {
	var out []Definition
	for _, name := range order {
		d := table[name]
		k := "inline"
		if d.kind == block {
			k = "block"
		} else if d.kind == container {
			k = "container"
		} else if d.kind == span {
			k = "span"
		}
		out = append(out, Definition{Name: d.name, Title: d.title, Description: d.what, Example: d.example, Kind: k})
	}
	return out
}

var order []string

func init() {
	notice := func(name, cls, label, what string) {
		add(&def{name: name, kind: container, title: label, what: what,
			example: "{{" + name + ":An optional title}}\nText of the notice.\n{{/" + name + "}}",
			wrap: func(c Call) (string, string, error) {
				open := `<div class="notice` + sp(cls) + ` sc-notice" role="note"><div class="notice-content">`
				if c.Args == "" {
					open += `<span class="visually-hidden">` + Esc(label) + `: </span>`
				} else {
					open += `<p class="notice-title">` + inlineHTML(c.Args) + `</p>`
				}
				return open + `<div class="notice-body">`, `</div></div></div>`, nil
			}})
		order = append(order, name)
	}
	notice("info", "", "Information", "A notice of information, blue, with an i.")
	notice("note", "warn", "Note", "A notice to take note of, amber, with a warning sign.")
	notice("tip", "positive", "Tip", "A helpful tip, green, with a tick.")
	notice("warning", "danger", "Warning", "A warning, red, with a stop sign.")

	add(&def{name: "expand", kind: container, title: "Expand", what: "A section the reader opens and closes, with its title showing while closed.",
		example: "{{expand:The title}}\nWhat opens.\n{{/expand}}",
		wrap: func(c Call) (string, string, error) {
			title := c.Args
			if title == "" {
				title = "More"
			}
			// The summary is PUDL's disclosure button, raised, since it is pressed.
			return `<details class="sc-expand"><summary class="btn disclosure">` + inlineHTML(title) + `</summary>`, `</details>`, nil
		}})
	add(&def{name: "status", kind: inline, title: "Status", what: "A small coloured status label, with a glyph so colour isn't the only sign.",
		example: "{{status:green Done}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			colour := ""
			if len(c.Positional) > 0 {
				colour = strings.ToLower(c.Positional[0])
			}
			cls, ok := map[string]string{"green": "positive", "yellow": "warn", "amber": "warn", "red": "danger", "blue": "accent", "grey": "", "gray": ""}[colour]
			if !ok {
				return "", problem{"status's colour is grey, blue, green, yellow or red."}
			}
			// The label is the words after the colour, as the call read
			// them, so a colour written in quotes counts as one word.
			text := ""
			if len(c.Positional) > 1 {
				text = strings.TrimSpace(strings.Join(c.Positional[1:], " "))
			}
			if text == "" {
				return "", problem{"status needs a label after its colour."}
			}
			return `<span class="badge` + sp(cls) + `">` + Esc(text) + `</span>`, nil
		}})
	add(&def{name: "toc", kind: block, title: "Contents", what: "A list of the page's headings, linked, for a long page.",
		example: "{{toc}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			min, max := 2, 3
			if v, ok := c.Get("min", -1); ok {
				if n, err := strconv.Atoi(v); err == nil {
					min = clamp(n, 1, 6)
				}
			}
			if v, ok := c.Get("max", -1); ok {
				if n, err := strconv.Atoi(v); err == nil {
					max = clamp(n, min, 6)
				}
			} else if max < min {
				max = min
			}
			type head struct {
				level int
				id    string
				text  string
			}
			var heads []head
			if doc != nil {
				ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
					if h, ok := n.(*ast.Heading); ok && entering && h.Level >= min && h.Level <= max {
						if id, ok := h.AttributeString("id"); ok {
							heads = append(heads, head{h.Level, string(id.([]byte)), plainText(h, src)})
						}
					}
					return ast.WalkContinue, nil
				})
			}
			if len(heads) == 0 {
				return "", nil
			}
			var b strings.Builder
			b.WriteString(`<nav class="sc-toc" aria-label="Contents"><ul>`)
			depth, first := heads[0].level, true
			for _, h := range heads {
				level := h.level
				if level < heads[0].level {
					level = heads[0].level
				}
				if !first {
					if level > depth {
						for ; depth < level; depth++ {
							b.WriteString("<ul>")
						}
					} else {
						b.WriteString("</li>")
						for ; depth > level; depth-- {
							b.WriteString("</ul></li>")
						}
					}
				}
				first = false
				b.WriteString(`<li><a href="#` + Esc(h.id) + `">` + Esc(h.text) + `</a>`)
			}
			b.WriteString("</li>")
			for ; depth > heads[0].level; depth-- {
				b.WriteString("</ul></li>")
			}
			b.WriteString("</ul></nav>")
			return b.String(), nil
		}})
	add(&def{name: "anchor", kind: inline, title: "Anchor", what: "A place in the page a link can go to, as #name.",
		example: "{{anchor:name}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			name, ok := c.Get("name", 0)
			if !ok || name == "" {
				return "", problem{"anchor needs a name."}
			}
			if !anchorRe.MatchString(name) {
				return "", problem{"An anchor's name is letters, digits, - and _, starting with a letter."}
			}
			return `<a id="` + Esc(name) + `"></a>`, nil
		}})
	add(&def{name: "page", kind: inline, title: "Page Link", what: "A link to one of the site's pages, by its slug, with text of its own or the slug.",
		example: "{{page:about}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			slug, ok := c.Get("slug", 0)
			if !ok || slug == "" {
				return "", problem{"page needs a page's slug."}
			}
			if !slugRe.MatchString(slug) {
				return "", problem{"A page's slug is lower-case letters, digits and dashes."}
			}
			// The text is the words after the slug, as the call read them,
			// so a slug written in quotes or as slug= still leaves the rest.
			words := c.Positional
			if _, named := c.Named["slug"]; !named && len(words) > 0 {
				words = words[1:]
			}
			text := slug
			if t, ok := c.Get("text", -1); ok {
				text = t
			} else if w := strings.TrimSpace(strings.Join(words, " ")); w != "" {
				text = w
			}
			return `<a href="/` + Esc(slug) + `">` + Esc(text) + `</a>`, nil
		}})
	add(&def{name: "figure", kind: block, title: "Figure", what: "A picture with an optional caption, centred.",
		example: `{{figure:/images/picture.png alt="What it shows" width=80% caption="The caption, in Markdown."}}`,
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			s, ok := c.Get("src", 0)
			if !ok || s == "" {
				return "", problem{"figure needs the picture's address."}
			}
			s, err := safeURL(s, "src")
			if err != nil {
				return "", err
			}
			alt, ok := c.Get("alt", -1)
			if !ok {
				return "", problem{`figure needs alt, what the picture shows; alt="" for a picture that only decorates.`}
			}
			style := ""
			if w, ok := c.Get("width", -1); ok {
				if !sizeRe.MatchString(w) {
					return "", problem{"width is a number with %, px, rem, em or ch, such as 80%."}
				}
				style = ` style="max-width:` + Esc(w) + `"`
			}
			out := `<figure class="sc-figure">` + ImageTag(s, alt, style+` loading="lazy"`)
			if cap, ok := c.Get("caption", -1); ok && strings.TrimSpace(cap) != "" {
				out += `<figcaption>` + inlineHTML(cap) + `</figcaption>`
			}
			return out + `</figure>`, nil
		}})
	add(&def{name: "applet", kind: block, title: "Applet", what: "One of the site's applications, running in the page.",
		example: "{{applet:conway fit=flow}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			name, ok := c.Get("name", 0)
			if !ok || !appletRe.MatchString(name) {
				return "", problem{"That isn't an applet's name."}
			}
			fit, _ := c.Get("fit", -1)
			if fit == "" {
				fit = "flow"
			}
			if fit != "flow" && fit != "fill" {
				return "", problem{"fit is flow or fill."}
			}
			out := `<div data-applet="` + Esc(name) + `" data-applet-fit="` + Esc(fit) + `"`
			if state, ok := c.Get("state", -1); ok && state != "" {
				out += ` data-applet-initial="` + Esc(state) + `"`
			}
			return out + `></div>`, nil
		}})
	add(&def{name: "video", kind: block, title: "Video", what: "A hosted video, by its link or by its service and id: YouTube (played without tracking until it is played, in its privacy-enhanced mode) or Vimeo (with do-not-track). A video of your own, uploaded to this site, is a feature to come.",
		example: `{{video:https://youtu.be/dQw4w9WgXcQ title="What it is"}}`,
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			first, _ := c.Get("src", 0)
			second, _ := c.Get("id", 1)
			service, id := videoOf(first, second)
			if service == "" {
				return "", problem{"video plays a hosted video by its link, such as {{video:https://youtu.be/ID}} or {{video:https://vimeo.com/ID}}, or by its service and id, {{video:youtube ID}}."}
			}
			title, ok := c.Get("title", -1)
			if !ok {
				title = "Video"
			}
			player := "https://www.youtube-nocookie.com/embed/" + Esc(id)
			if service == "vimeo" {
				player = "https://player.vimeo.com/video/" + Esc(id) + "?dnt=1"
			}
			return `<div class="sc-video" data-service="` + service + `"><iframe src="` + player + `" title="` + Esc(title) +
				`" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`, nil
		}})
	add(&def{name: "code", kind: block, title: "Code Listing", what: "A file, shown as a listing with Copy and Download, fetched as the page loads: a path on the site from /, or one of your own files under ~.",
		example: "{{code:~/bin/hello}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			s, ok := c.Get("src", 0)
			if !ok || s == "" {
				return "", problem{"code needs a file's path."}
			}
			if !(strings.HasPrefix(s, "/") || strings.HasPrefix(s, "~/")) || strings.HasPrefix(s, "//") || strings.Contains(s, "..") {
				return "", problem{"code shows a file by its path from /, such as /applets/dice/dice.js, or under ~, such as ~/bin/hello."}
			}
			lang, ok := c.Get("lang", -1)
			if !ok {
				ext := ""
				if i := strings.LastIndex(s, "."); i > strings.LastIndex(s, "/") {
					ext = s[i+1:]
				}
				lang = map[string]string{"js": "javascript", "cs": "csharp", "ts": "typescript", "py": "python", "sh": "bash", "ps1": "powershell", "md": "markdown"}[ext]
				if lang == "" {
					lang = ext
				}
			}
			cls := ""
			if lang != "" {
				cls = ` class="language-` + Esc(lang) + `"`
			}
			return `<pre><code` + cls + ` data-code-src="` + Esc(s) + `"></code></pre>`, nil
		}})
	add(&def{name: "color", kind: span, title: "Colour", what: "Words in a colour: one of the site's (ink, muted, accent, danger, warn, positive), or any CSS colour such as #c0392b or tomato. Markdown works inside it.",
		example: "{{color:accent}}these words{{/color}}",
		wrap: func(c Call) (string, string, error) {
			v, ok := c.Get("colour", 0)
			if !ok || v == "" {
				return "", "", problem{"color needs a colour, such as accent or #c0392b."}
			}
			css, ok := cssColour(v)
			if !ok {
				return "", "", problem{v + " is not a colour: give one of ink, muted, accent, danger, warn, positive, a #hex, or a CSS colour name."}
			}
			return `<span class="sc-colour" style="color:` + css + `">`, `</span>`, nil
		}})
	add(&def{name: "colour", kind: span, title: "Colour", what: "The same as color, spelt the other way.", example: "{{colour:tomato}}these words{{/colour}}",
		wrap: func(c Call) (string, string, error) { return table["color"].wrap(c) }})
	add(&def{name: "kbd", kind: inline, title: "Keys", what: "Keys to press, each drawn as a key, joined by +.",
		example: "{{kbd:Ctrl+Shift+P}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			if c.Args == "" {
				return "", problem{"kbd needs keys, such as Ctrl+C."}
			}
			var keys []string
			for _, k := range splitKeys(c.Args) {
				keys = append(keys, "<kbd>"+Esc(strings.TrimSpace(k))+"</kbd>")
			}
			return `<span class="sc-keys">` + strings.Join(keys, "+") + `</span>`, nil
		}})
	add(&def{name: "glyph", kind: inline, title: "Glyph", what: "One of PUDL's glyphs, the small symbols the site's controls use.",
		example: "{{glyph:check}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			name, ok := c.Get("name", 0)
			if !ok || !glyphs[name] {
				return "", problem{"PUDL has no glyph called " + name + "."}
			}
			return `<span class="glyph sc-glyph" style="--glyph: var(--glyph-` + Esc(name) + `)" aria-hidden="true"></span>`, nil
		}})
	add(&def{name: "columns", kind: container, title: "Columns", what: "Content side by side, divided by {{column}} lines; the columns stack on a narrow screen.",
		example: "{{columns}}\nThe first column.\n\n{{column}}\n\nThe second.\n{{/columns}}",
		wrap: func(c Call) (string, string, error) {
			return `<div class="sc-columns"><div class="sc-column">`, `</div></div>`, nil
		}, separator: "column", separatorHTML: `</div><div class="sc-column">`})
	add(&def{name: "column", kind: block, title: "Next Column", what: "Inside {{columns}}, starts the next column.",
		example: "{{column}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			return "", problem{"column divides {{columns}} … {{/columns}}; it means nothing outside one."}
		}})
	add(&def{name: "no-export", kind: container, title: "Not Exported", what: "Private working text retained in the Markdown source and removed before export layout. It can wrap words or whole blocks.",
		example: "{{no-export}}Working note{{/no-export}}",
		wrap: func(c Call) (string, string, error) {
			return `<div class="sc-no-export" data-export="omit" title="Not exported" role="note" aria-label="Not exported"><div class="sc-no-export-label"><span class="glyph" style="--glyph:var(--glyph-eye-off)" aria-hidden="true"></span>Not exported</div>`, `</div>`, nil
		},
		spanWrap: func(c Call) (string, string, error) {
			return `<span class="sc-no-export" data-export="omit" title="Not exported" role="note" aria-label="Not exported">`, `</span>`, nil
		},
	})
	add(&def{name: "draft-note", kind: container, title: "Note to Self", what: "A note while writing, shown in the editor and never on a published page.",
		example: "{{draft-note}}\nCheck this date.\n{{/draft-note}}",
		wrap: func(c Call) (string, string, error) {
			return `<aside class="sc-draft-note"><p class="sc-draft-note-label">Note to self, not published</p>`, `</aside>`, nil
		}})
	// A slide deck's own (docs/slides-design.md): a slide's settings, which
	// render as a marker the Slides application reads and nothing on a
	// page, and speaker notes, drawn as an aside a page may hide.
	add(&def{name: "slide", kind: block, title: "Slide Settings", what: "A slide's layout, background and reveal, on the first line of the slide in a deck.",
		example: "{{slide:layout=title}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			out := `<div class="sc-slide" hidden`
			for _, key := range []string{"layout", "background", "image", "reveal", "transition", "class"} {
				if v, ok := c.Get(key, -1); ok && v != "" {
					if key == "image" {
						u, err := safeURL(v, "image")
						if err != nil {
							return "", err
						}
						v = u
					}
					out += ` data-` + key + `="` + Esc(v) + `"`
				}
			}
			return out + `></div>`, nil
		}})
	add(&def{name: "style", kind: container, title: "Stylesheet", what: "CSS for a deck or a page, kept with it: in Slides it styles every slide, or with {{style:slide}} the slide it is in. It is never shown.",
		example: "{{style}}\n.deck-body h2 { letter-spacing: 0.02em; }\n{{/style}}",
		wrap:    func(c Call) (string, string, error) { return `<div class="sc-style" hidden>`, `</div>`, nil }})
	add(&def{name: "class", kind: container, title: "Style Class", what: "A class of the deck's or the page's stylesheet, on words in a line ({{class:name}}words{{/class}}) or around blocks on lines of their own, given as the class itself in the HTML.",
		example: "{{class:callout}}these words{{/class}}",
		wrap: func(c Call) (string, string, error) {
			name, ok := className(c)
			if !ok {
				return "", "", problem{"class needs a name: letters, digits and dashes, starting with a letter."}
			}
			return `<div class="` + name + `" data-class="` + name + `">`, `</div>`, nil
		},
		spanWrap: func(c Call) (string, string, error) {
			name, ok := className(c)
			if !ok {
				return "", "", problem{"class needs a name: letters, digits and dashes, starting with a letter."}
			}
			return `<span class="` + name + `" data-class="` + name + `">`, `</span>`, nil
		}})
	add(&def{name: "notes", kind: container, title: "Speaker Notes", what: "Notes for the presenter, shown in the presenter view and not on the slide.",
		example: "{{notes}}\nWhat to say.\n{{/notes}}",
		wrap: func(c Call) (string, string, error) {
			return `<aside class="sc-notes"><p class="sc-notes-label">Speaker Notes</p>`, `</aside>`, nil
		}})
	// What a document needs and Markdown cannot say (docs/docs-design.md,
	// decision 3). Underline is not here: the page view already reads and
	// writes <u>, so a second spelling would only split documents in two.
	// Each span is the HTML element of its name, so an export can map it.
	markup := func(name, title, what, open, close string) {
		add(&def{name: name, kind: span, title: title, what: what,
			example: "{{" + name + "}}these words{{/" + name + "}}",
			wrap:    func(c Call) (string, string, error) { return open, close, nil }})
	}
	markup("mark", "Highlight", "Words highlighted, as with a marker. Markdown works inside it.", `<mark class="sc-mark">`, `</mark>`)
	markup("sup", "Superscript", "Words raised above the line, as in a footnote number or a power. Markdown works inside it.", `<sup>`, `</sup>`)
	markup("sub", "Subscript", "Words lowered below the line, as in a chemical formula. Markdown works inside it.", `<sub>`, `</sub>`)
	add(&def{name: "page-break", kind: block, title: "Page Break", what: "Ends the page here: what follows starts on a new page when the document is printed or shown as pages.",
		example: "{{page-break}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			return `<div class="sc-page-break" role="separator" aria-label="Page break"></div>`, nil
		}})
	add(&def{name: "caption", kind: container, title: "Caption", what: "The words under a figure or a table, on lines of their own after it. A document may number them.",
		example: "{{caption}}\nWhat the figure shows.\n{{/caption}}",
		wrap: func(c Call) (string, string, error) {
			return `<div class="sc-caption">`, `</div>`, nil
		}})
	for _, name := range []string{"expand", "status", "toc", "anchor", "page", "figure", "applet", "video", "code", "color", "class", "style", "kbd", "glyph", "columns", "column", "no-export", "draft-note", "slide", "notes", "mark", "sup", "sub", "page-break", "caption"} {
		order = append(order, name)
	}
}

var (
	anchorRe  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]*$`)
	slugRe    = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*(/[a-z0-9][a-z0-9-]*)*$`)
	sizeRe    = regexp.MustCompile(`^\d+(\.\d+)?(%|px|rem|em|ch)$`)
	appletRe  = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
	youTubeRe = regexp.MustCompile(`^[A-Za-z0-9_-]{6,20}$`)
	vimeoRe   = regexp.MustCompile(`^[0-9]{5,16}$`)
	// A hosted video's link, as a person copies it from the service.
	youTubeLink = regexp.MustCompile(`^(?:https?://)?(?:www\.|m\.)?(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/|v/)|youtu\.be/|youtube-nocookie\.com/embed/)([A-Za-z0-9_-]{6,20})`)
	vimeoLink   = regexp.MustCompile(`^(?:https?://)?(?:www\.|player\.)?vimeo\.com/(?:video/)?([0-9]{5,16})`)
	glyphs      = map[string]bool{}
)

func init() {
	for _, g := range strings.Fields("account app arrow-down arrow-up back board bold branch caret check chevron circle clip close close-all code colour comments commit compare copy diamond dock document download empty eye eye-off file flag folder fork forward gear grip history home image inbox info italic link list list-numbered maximize menu merge minimize minimize-all minus more move new-window open panel paragraph pause pencil pencil-off pin play plus quote reload restore restore-all ribbon ring script search shield size slash sort sort-down sort-up square stash stop strike table tag terminal theme tick ticket triangle underline undock upload warning window working") {
		glyphs[g] = true
	}
}

func clamp(n, lo, hi int) int {
	if n < lo {
		return lo
	}
	if n > hi {
		return hi
	}
	return n
}

func sp(cls string) string {
	if cls == "" {
		return ""
	}
	return " " + cls
}

// splitKeys divides Ctrl+Shift+P at each + that has a key on both sides, so
// a key that is + itself (Ctrl++) survives.
func splitKeys(s string) []string {
	var out []string
	start := 0
	for i := 1; i < len(s)-1; i++ {
		if s[i] == '+' && s[i-1] != '+' && s[i+1] != '+' {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return append(out, s[start:])
}

// SafeImage says whether a picture's address may be drawn, and gives it
// without the spaces around it. A picture may be a file of the home folder
// (cat.png beside the document, or ~/Pictures/cat.png), a path on the site
// (/images/x.png), an http or https address, or a data: address of an image,
// never a script. A Markdown image and a figure both ask here, so the two
// treat the same address the same way. A data: image is kept because the
// page's HTML cleaner (apps/md-engine/safe-html.js) and the site's content
// security policy already admit it, and a reader's documents, which live in
// their browser, may hold one.
func SafeImage(u string) (string, bool) {
	u = strings.TrimSpace(u)
	if strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "//") {
		return u, true
	}
	l := strings.ToLower(u)
	if strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "https://") || strings.HasPrefix(l, "data:image/") {
		return u, true
	}
	if IsLocal(u) {
		return u, true
	}
	return "", false
}

// safeURL is SafeImage with the problem a shortcode shows when it refuses.
func safeURL(u, what string) (string, error) {
	if u, ok := SafeImage(u); ok {
		return u, nil
	}
	return "", problem{what + " must be a picture beside the document or in your home folder (cat.png, ~/Pictures/cat.png), a path on this site (/images/x.png), or an http or https address."}
}

// IsLocal says whether an address is a file of the home folder: a path with
// no scheme that does not start with / (a page of the site) or // (another
// host).
func IsLocal(u string) bool {
	if u == "" || strings.HasPrefix(u, "/") || strings.HasPrefix(u, "\\") {
		return false
	}
	// A scheme is letters before the first colon, with no slash before it.
	if i := strings.IndexAny(u, ":/"); i >= 0 && u[i] == ':' {
		return false
	}
	return true
}

// ImageTag is the <img> for a picture whose address SafeImage admitted:
// one of the home folder is marked with its path for the page to read
// (data-attachment), and the rest load as they are. extra is further
// attributes, already escaped, each with a space before it.
func ImageTag(src, alt, extra string) string {
	if IsLocal(src) {
		name := strings.ReplaceAll(src, `\`, "/")
		for strings.HasPrefix(name, "./") {
			name = name[2:]
		}
		return `<img class="dinah-attachment-image" data-attachment="` + Esc(name) + `" alt="` + Esc(alt) + `"` + extra + `>`
	}
	return `<img src="` + Esc(src) + `" alt="` + Esc(alt) + `"` + extra + `>`
}

var escaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")

// Esc escapes text for HTML, in an element or in a double-quoted attribute.
func Esc(s string) string { return escaper.Replace(s) }

// inlineHTML draws a title or a caption written in Markdown, without the
// paragraph around it.
var inlineMD = goldmark.New(goldmark.WithExtensions(extension.GFM))

func inlineHTML(md string) string {
	var b bytes.Buffer
	if err := inlineMD.Convert([]byte(md), &b); err != nil {
		return Esc(md)
	}
	s := strings.TrimSpace(b.String())
	s = strings.TrimPrefix(s, "<p>")
	s = strings.TrimSuffix(s, "</p>")
	return s
}

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

func problemHTML(c Call, why string) string { return problemSource(c.Source(), why) }

// problemSource marks text as written that the page cannot draw, with the
// reason as its title.
func problemSource(source, why string) string {
	return `<code class="sc-problem" title="` + Esc(why) + `">` + Esc(source) + `</code>`
}

// === Rendering ============================================================

type htmlRenderer struct {
	exporting bool
	registry  *MacroRegistry
	budget    MacroBudget
}

func (r *htmlRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(KindInline, r.inline)
	reg.Register(KindBlock, r.block)
	reg.Register(KindCloser, func(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
		return ast.WalkContinue, nil
	})
	reg.Register(ast.KindParagraph, r.paragraph)
}

// alone is the shortcode a paragraph holds alone, with nothing but space
// around it, or nil.
func alone(p ast.Node, src []byte) *Inline {
	var found *Inline
	for ch := p.FirstChild(); ch != nil; ch = ch.NextSibling() {
		switch t := ch.(type) {
		case *Inline:
			if found != nil {
				return nil
			}
			found = t
		case *ast.Text:
			if strings.TrimSpace(string(t.Segment.Value(src))) != "" {
				return nil
			}
		default:
			return nil
		}
	}
	return found
}

// matchSpans pairs each span shortcode in a paragraph with the {{/name}}
// that closes it, in order and nesting as brackets do, so the renderer
// needs no state of its own and the paragraph can be drawn from any
// goroutine.
func matchSpans(p ast.Node) {
	var open []*Inline
	var walk func(n ast.Node)
	walk = func(n ast.Node) {
		for ch := n.FirstChild(); ch != nil; ch = ch.NextSibling() {
			if in, ok := ch.(*Inline); ok {
				in.Matched = false
				d := table[in.Call.Name]
				if in.Closing {
					if len(open) > 0 && open[len(open)-1].Call.Name == in.Call.Name {
						open[len(open)-1].Matched = true
						in.Matched = true
						open = open[:len(open)-1]
					}
				} else if isSpan(d) {
					open = append(open, in)
				}
				continue
			}
			walk(ch)
		}
	}
	walk(p)
}

func (r *htmlRenderer) inline(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*Inline)
	if r.registry != nil && !n.Closing {
		if _, ok := r.registry.definition(n.Call.Name); ok {
			out, err := r.registry.render(n.Call, "", true, &r.budget, r.exporting)
			if err != nil {
				out = problemHTML(n.Call, err.Error())
			}
			_, _ = w.WriteString(out)
			return ast.WalkContinue, nil
		}
	}
	d := table[n.Call.Name]
	if isSpan(d) || n.Closing {
		// Spans pair within the block they sit in, whatever it is: a
		// paragraph, a heading, a table cell, a list item.
		for b := node.Parent(); b != nil; b = b.Parent() {
			if b.Type() == ast.TypeBlock {
				matchSpans(b)
				break
			}
		}
	}
	if n.Closing {
		if n.Matched && isSpan(d) {
			// A closer has no arguments, so a span whose opening needs
			// them (a colour, a class) gives an error here and closes a
			// span; one that needs none (mark, sup, sub) says its own tag.
			_, closeTag, err := spanOf(d)(NewCall(n.Call.Name, ""))
			if err != nil || closeTag == "" {
				closeTag = "</span>"
			}
			_, _ = w.WriteString(closeTag)
			return ast.WalkContinue, nil
		}
		_, _ = w.WriteString(problemSource(n.Raw, "This closes "+n.Call.Name+", which is not open."))
		return ast.WalkContinue, nil
	}
	switch {
	case d == nil:
		_, _ = w.WriteString(problemHTML(n.Call, "There is no shortcode called "+n.Call.Name+"."))
	case isSpan(d):
		if !n.Matched {
			_, _ = w.WriteString(problemHTML(n.Call, n.Call.Name+" needs {{/"+n.Call.Name+"}} after the words it wraps, in the same paragraph."))
			return ast.WalkContinue, nil
		}
		open, _, err := spanOf(d)(n.Call)
		if err != nil {
			open = problemHTML(n.Call, err.Error()) + "<span>"
		}
		_, _ = w.WriteString(open)
	case d.kind == container:
		_, _ = w.WriteString(problemHTML(n.Call, n.Call.Name+" opens on a line of its own and closes with {{/"+n.Call.Name+"}}."))
	default:
		out, err := d.render(n.Call, node.OwnerDocument(), src)
		if err != nil {
			out = problemHTML(n.Call, err.Error())
		}
		_, _ = w.WriteString(out)
	}
	return ast.WalkContinue, nil
}

func (r *htmlRenderer) block(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	n := node.(*Block)
	if n.Call.Name == "define" {
		if entering {
			name := strings.TrimSpace(n.Call.Args)
			if r.registry != nil && r.registry.problems[name] != "" {
				_, _ = w.WriteString(problemHTML(n.Call, r.registry.problems[name]))
			}
		}
		return ast.WalkSkipChildren, nil
	}
	if r.registry != nil {
		if _, ok := r.registry.definition(n.Call.Name); ok {
			if entering {
				out := ""
				var err error
				if !n.Closed {
					err = problem{"This shortcode needs {{/" + n.Call.Name + "}} on its own line."}
				} else {
					out, err = r.registry.render(n.Call, string(src[n.BodyStart:n.BodyEnd]), false, &r.budget, r.exporting)
				}
				if err != nil {
					out = problemHTML(n.Call, err.Error())
				}
				_, _ = w.WriteString(out)
			}
			return ast.WalkSkipChildren, nil
		}
	}
	d := table[n.Call.Name]
	if d == nil || d.wrap == nil {
		if entering {
			_, _ = w.WriteString(`<p>` + problemHTML(n.Call, "There is no shortcode called "+n.Call.Name+".") + `</p>` + "\n")
		}
		return ast.WalkContinue, nil
	}
	open, close, err := d.wrap(n.Call)
	if err != nil {
		if entering {
			_, _ = w.WriteString(`<p>` + problemHTML(n.Call, err.Error()) + `</p>` + "\n")
		}
		return ast.WalkSkipChildren, nil
	}
	if entering {
		_, _ = w.WriteString(open + "\n")
		if !n.Closed {
			_, _ = w.WriteString(`<p>` + problemHTML(n.Call, n.Call.Name+" runs to the end of the page: it needs {{/"+n.Call.Name+"}} on a line of its own.") + `</p>` + "\n")
		}
	} else {
		_, _ = w.WriteString(close + "\n")
	}
	return ast.WalkContinue, nil
}

// paragraph draws a paragraph that holds a block shortcode alone as that
// block, a {{column}} inside {{columns}} as the column break, and any
// other paragraph as goldmark does.
func (r *htmlRenderer) paragraph(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if sc := alone(node, src); sc != nil && !sc.Closing {
		if r.registry != nil {
			if d, ok := r.registry.definition(sc.Call.Name); ok && !d.Container {
				if entering {
					out, err := r.registry.render(sc.Call, "", false, &r.budget, r.exporting)
					if err != nil {
						out = problemHTML(sc.Call, err.Error())
					}
					_, _ = w.WriteString(out)
				}
				return ast.WalkSkipChildren, nil
			}
		}
		if d := table[sc.Call.Name]; d != nil && d.kind == block {
			if entering {
				if parent, ok := node.Parent().(*Block); ok {
					if pd := table[parent.Call.Name]; pd != nil && pd.separator == sc.Call.Name {
						_, _ = w.WriteString(pd.separatorHTML + "\n")
						return ast.WalkSkipChildren, nil
					}
				}
				out, err := d.render(sc.Call, node.OwnerDocument(), src)
				if err != nil {
					out = `<p>` + problemHTML(sc.Call, err.Error()) + `</p>`
				}
				_, _ = w.WriteString(out + "\n")
			}
			return ast.WalkSkipChildren, nil
		}
	}
	if entering {
		if node.Attributes() != nil {
			_, _ = w.WriteString("<p")
			html.RenderAttributes(w, node, html.ParagraphAttributeFilter)
			_, _ = w.WriteString(">")
		} else {
			_, _ = w.WriteString("<p>")
		}
	} else {
		_, _ = w.WriteString("</p>\n")
	}
	return ast.WalkContinue, nil
}

// === The extension ========================================================

type ext struct {
	registry  *MacroRegistry
	exporting bool
}

// WithMacros installs a document's registry without changing the built-ins.
func WithMacros(registry *MacroRegistry) goldmark.Extender { return &ext{registry: registry} }

// WithExportMacros also removes exclusions inside generated macro content.
func WithExportMacros(registry *MacroRegistry) goldmark.Extender {
	return &ext{registry: registry, exporting: true}
}

// Extension adds the shortcodes to a goldmark.
var Extension goldmark.Extender = &ext{}

func (e *ext) Extend(m goldmark.Markdown) {
	m.Parser().AddOptions(
		parser.WithBlockParsers(util.Prioritized(&blockParser{registry: e.registry}, 50)),
		parser.WithInlineParsers(util.Prioritized(&inlineParser{registry: e.registry}, 50)),
	)
	m.Renderer().AddOptions(renderer.WithNodeRenderers(util.Prioritized(&htmlRenderer{registry: e.registry, exporting: e.exporting}, 50)))
}

// videoOf reads a video shortcode's arguments as a service and an id: a
// link to the video, or the service's name and the id after it.
func videoOf(first, second string) (service, id string) {
	if m := youTubeLink.FindStringSubmatch(first); m != nil {
		return "youtube", m[1]
	}
	if m := vimeoLink.FindStringSubmatch(first); m != nil {
		return "vimeo", m[1]
	}
	switch strings.ToLower(first) {
	case "youtube":
		if m := youTubeLink.FindStringSubmatch(second); m != nil {
			return "youtube", m[1]
		}
		if youTubeRe.MatchString(second) {
			return "youtube", second
		}
	case "vimeo":
		if m := vimeoLink.FindStringSubmatch(second); m != nil {
			return "vimeo", m[1]
		}
		if vimeoRe.MatchString(second) {
			return "vimeo", second
		}
	}
	return "", ""
}

// cssColour reads a colour as a person writes it: one of the site's
// named colours, a #hex, rgb()/hsl(), or a CSS colour name, as a CSS
// value safe to put in a style attribute.
func cssColour(v string) (string, bool) {
	v = strings.TrimSpace(v)
	switch strings.ToLower(v) {
	case "ink", "text":
		return "var(--deck-ink, var(--dinah-ink, var(--text)))", true
	case "muted":
		return "var(--deck-muted, var(--dinah-muted-ink, var(--text-muted)))", true
	case "accent":
		return "var(--deck-accent, var(--accent))", true
	case "danger":
		return "var(--danger)", true
	case "warn", "warning":
		return "var(--warn)", true
	case "positive", "ok":
		return "var(--positive)", true
	}
	if hexColour.MatchString(v) || colourName.MatchString(v) || colourFunc.MatchString(v) {
		return v, true
	}
	return "", false
}

var (
	hexColour  = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`)
	colourName = regexp.MustCompile(`^[a-zA-Z]{3,24}$`)
	colourFunc = regexp.MustCompile(`^(?:rgb|rgba|hsl|hsla|oklch|oklab)\([0-9a-zA-Z%.,/ -]{1,60}\)$`)
)

var classRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_-]{0,63}$`)

// className reads a class shortcode's name, which must be safe in a class
// attribute and in a selector.
func className(c Call) (string, bool) {
	v, _ := c.Get("name", 0)
	v = strings.TrimSpace(v)
	if !classRe.MatchString(v) {
		return "", false
	}
	return v, true
}
