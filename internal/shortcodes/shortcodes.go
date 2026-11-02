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
	// For a span shortcode, set as its paragraph is drawn: an opener that
	// found its {{/name}} in the paragraph, and a closer that matched.
	Matched bool
}

var KindInline = ast.NewNodeKind("ShortcodeInline")

func (n *Inline) Kind() ast.NodeKind { return KindInline }
func (n *Inline) Dump(src []byte, level int) {
	ast.DumpHelper(n, src, level, map[string]string{"call": n.Call.Source()}, nil)
}

// Block is a container shortcode and the Markdown inside it.
type Block struct {
	ast.BaseBlock
	Call   Call
	Closed bool
}

var KindBlock = ast.NewNodeKind("ShortcodeBlock")

func (n *Block) Kind() ast.NodeKind { return KindBlock }
func (n *Block) Dump(src []byte, level int) {
	ast.DumpHelper(n, src, level, map[string]string{"call": n.Call.Source()}, nil)
}

// IsShortcodeParagraph reports whether a paragraph holds a shortcode, so a
// page editor keeps it as its Markdown rather than as rich text.
func IsShortcodeParagraph(n ast.Node) bool {
	for ch := n.FirstChild(); ch != nil; ch = ch.NextSibling() {
		if ch.Kind() == KindInline {
			return true
		}
	}
	return false
}

type inlineParser struct{}

func (p *inlineParser) Trigger() []byte { return []byte{'{'} }

func (p *inlineParser) Parse(parent ast.Node, block text.Reader, pc parser.Context) ast.Node {
	line, seg := block.PeekLine()
	m := tagRe.FindSubmatch(line)
	if m == nil {
		return nil
	}
	node := &Inline{Call: NewCall(string(m[2]), string(m[3])), Closing: len(m[1]) > 0}
	block.Advance(len(m[0]))
	_ = seg
	return node
}

type blockParser struct{}

func (p *blockParser) Trigger() []byte { return []byte{'{'} }

func (p *blockParser) Open(parent ast.Node, reader text.Reader, pc parser.Context) (ast.Node, parser.State) {
	line, _ := reader.PeekLine()
	m := lineRe.FindSubmatch(line)
	if m == nil {
		return nil, parser.NoChildren
	}
	def := table[string(m[1])]
	if def == nil || def.kind != container {
		return nil, parser.NoChildren
	}
	reader.Advance(len(line))
	return &Block{Call: NewCall(string(m[1]), string(m[2]))}, parser.HasChildren
}

func (p *blockParser) Continue(node ast.Node, reader text.Reader, pc parser.Context) parser.State {
	line, _ := reader.PeekLine()
	if m := closeLineRe.FindSubmatch(line); m != nil && string(m[1]) == node.(*Block).Call.Name {
		reader.Advance(len(line))
		node.(*Block).Closed = true
		return parser.Close
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
	// separator is the block shortcode that divides a container's body,
	// and separatorHTML what it becomes ({{column}} in {{columns}}).
	separator, separatorHTML string
}

var table = map[string]*def{}

func add(d *def) { table[d.name] = d }

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
					open += `<span class="visually-hidden">` + esc(label) + `: </span>`
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
			text := ""
			if len(c.Args) > len(colour) {
				text = strings.TrimSpace(c.Args[len(colour):])
			}
			if text == "" {
				return "", problem{"status needs a label after its colour."}
			}
			return `<span class="badge` + sp(cls) + `">` + esc(text) + `</span>`, nil
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
				b.WriteString(`<li><a href="#` + esc(h.id) + `">` + esc(h.text) + `</a>`)
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
			return `<a id="` + esc(name) + `"></a>`, nil
		}})
	add(&def{name: "page", kind: inline, title: "Page link", what: "A link to one of the site's pages, by its slug, with text of its own or the slug.",
		example: "{{page:about}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			slug, ok := c.Get("slug", 0)
			if !ok || slug == "" {
				return "", problem{"page needs a page's slug."}
			}
			if !slugRe.MatchString(slug) {
				return "", problem{"A page's slug is lower-case letters, digits and dashes."}
			}
			text := slug
			if t, ok := c.Get("text", -1); ok {
				text = t
			} else if len(c.Positional) > 1 {
				text = strings.TrimSpace(strings.TrimPrefix(c.Args, slug))
			}
			return `<a href="/` + esc(slug) + `">` + esc(text) + `</a>`, nil
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
				style = ` style="max-width:` + esc(w) + `"`
			}
			out := `<figure class="sc-figure"><img src="` + esc(s) + `" alt="` + esc(alt) + `"` + style + ` loading="lazy">`
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
			out := `<div data-applet="` + esc(name) + `" data-applet-fit="` + esc(fit) + `"`
			if state, ok := c.Get("state", -1); ok && state != "" {
				out += ` data-applet-initial="` + esc(state) + `"`
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
			player := "https://www.youtube-nocookie.com/embed/" + esc(id)
			if service == "vimeo" {
				player = "https://player.vimeo.com/video/" + esc(id) + "?dnt=1"
			}
			return `<div class="sc-video" data-service="` + service + `"><iframe src="` + player + `" title="` + esc(title) +
				`" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`, nil
		}})
	add(&def{name: "code", kind: block, title: "Code listing", what: "A file, shown as a listing with Copy and Download, fetched as the page loads: a path on the site from /, or one of your own files under ~.",
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
				cls = ` class="language-` + esc(lang) + `"`
			}
			return `<pre><code` + cls + ` data-code-src="` + esc(s) + `"></code></pre>`, nil
		}})
	add(&def{name: "colour", kind: span, title: "Colour", what: "Words in a colour: one of the site's (ink, muted, accent, danger, warn, positive), or any CSS colour such as #c0392b or tomato. Markdown works inside it.",
		example: "{{colour:accent}}these words{{/colour}}",
		wrap: func(c Call) (string, string, error) {
			v, ok := c.Get("colour", 0)
			if !ok || v == "" {
				return "", "", problem{"colour needs a colour, such as accent or #c0392b."}
			}
			css, ok := cssColour(v)
			if !ok {
				return "", "", problem{v + " is not a colour: give one of ink, muted, accent, danger, warn, positive, a #hex, or a CSS colour name."}
			}
			return `<span class="sc-colour" style="color:` + css + `">`, `</span>`, nil
		}})
	add(&def{name: "color", kind: span, title: "Colour", what: "The same as colour.", example: "{{color:tomato}}these words{{/color}}",
		wrap: func(c Call) (string, string, error) { return table["colour"].wrap(c) }})
	add(&def{name: "kbd", kind: inline, title: "Keys", what: "Keys to press, each drawn as a key, joined by +.",
		example: "{{kbd:Ctrl+Shift+P}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			if c.Args == "" {
				return "", problem{"kbd needs keys, such as Ctrl+C."}
			}
			var keys []string
			for _, k := range splitKeys(c.Args) {
				keys = append(keys, "<kbd>"+esc(strings.TrimSpace(k))+"</kbd>")
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
			return `<span class="glyph sc-glyph" style="--glyph: var(--glyph-` + esc(name) + `)" aria-hidden="true"></span>`, nil
		}})
	add(&def{name: "columns", kind: container, title: "Columns", what: "Content side by side, divided by {{column}} lines; the columns stack on a narrow screen.",
		example: "{{columns}}\nThe first column.\n\n{{column}}\n\nThe second.\n{{/columns}}",
		wrap: func(c Call) (string, string, error) {
			return `<div class="sc-columns"><div class="sc-column">`, `</div></div>`, nil
		}, separator: "column", separatorHTML: `</div><div class="sc-column">`})
	add(&def{name: "column", kind: block, title: "Next column", what: "Inside {{columns}}, starts the next column.",
		example: "{{column}}",
		render: func(c Call, doc ast.Node, src []byte) (string, error) {
			return "", problem{"column divides {{columns}} … {{/columns}}; it means nothing outside one."}
		}})
	add(&def{name: "draft-note", kind: container, title: "Note to self", what: "A note while writing, shown in the editor and never on a published page.",
		example: "{{draft-note}}\nCheck this date.\n{{/draft-note}}",
		wrap: func(c Call) (string, string, error) {
			return `<aside class="sc-draft-note"><p class="sc-draft-note-label">Note to self, not published</p>`, `</aside>`, nil
		}})
	// A slide deck's own (docs/slides-design.md): a slide's settings, which
	// render as a marker the Slides application reads and nothing on a
	// page, and speaker notes, drawn as an aside a page may hide.
	add(&def{name: "slide", kind: block, title: "Slide settings", what: "A slide's layout, background and reveal, on the first line of the slide in a deck.",
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
					out += ` data-` + key + `="` + esc(v) + `"`
				}
			}
			return out + `></div>`, nil
		}})
	add(&def{name: "notes", kind: container, title: "Speaker notes", what: "Notes for the presenter, shown in the presenter view and not on the slide.",
		example: "{{notes}}\nWhat to say.\n{{/notes}}",
		wrap: func(c Call) (string, string, error) {
			return `<aside class="sc-notes"><p class="sc-notes-label">Speaker notes</p>`, `</aside>`, nil
		}})
	for _, name := range []string{"expand", "status", "toc", "anchor", "page", "figure", "applet", "video", "code", "colour", "kbd", "glyph", "columns", "column", "draft-note", "slide", "notes"} {
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

// safeURL is a path on the site or an http or https address, never a script.
func safeURL(u, what string) (string, error) {
	u = strings.TrimSpace(u)
	if strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "//") {
		return u, nil
	}
	l := strings.ToLower(u)
	if strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "https://") {
		return u, nil
	}
	return "", problem{what + " must be a path on this site, such as /images/x.png, or an http or https address."}
}

var escaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")

func esc(s string) string { return escaper.Replace(s) }

// inlineHTML draws a title or a caption written in Markdown, without the
// paragraph around it.
var inlineMD = goldmark.New(goldmark.WithExtensions(extension.GFM))

func inlineHTML(md string) string {
	var b bytes.Buffer
	if err := inlineMD.Convert([]byte(md), &b); err != nil {
		return esc(md)
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

func problemHTML(c Call, why string) string {
	return `<code class="sc-problem" title="` + esc(why) + `">` + esc(c.Source()) + `</code>`
}

// === Rendering ============================================================

type htmlRenderer struct{}

func (r *htmlRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(KindInline, r.inline)
	reg.Register(KindBlock, r.block)
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
				} else if d != nil && d.kind == span {
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
	d := table[n.Call.Name]
	if (d != nil && d.kind == span) || n.Closing {
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
		if n.Matched && d != nil && d.kind == span {
			_, _ = w.WriteString("</span>")
			return ast.WalkContinue, nil
		}
		_, _ = w.WriteString(problemHTML(n.Call, "This closes "+n.Call.Name+", which is not open."))
		return ast.WalkContinue, nil
	}
	switch {
	case d == nil:
		_, _ = w.WriteString(problemHTML(n.Call, "There is no shortcode called "+n.Call.Name+"."))
	case d.kind == span:
		if !n.Matched {
			_, _ = w.WriteString(problemHTML(n.Call, n.Call.Name+" needs {{/"+n.Call.Name+"}} after the words it colours, in the same paragraph."))
			return ast.WalkContinue, nil
		}
		open, _, err := d.wrap(n.Call)
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

type ext struct{}

// Extension adds the shortcodes to a goldmark.
var Extension goldmark.Extender = &ext{}

func (e *ext) Extend(m goldmark.Markdown) {
	m.Parser().AddOptions(
		parser.WithBlockParsers(util.Prioritized(&blockParser{}, 50)),
		parser.WithInlineParsers(util.Prioritized(&inlineParser{}, 50)),
	)
	m.Renderer().AddOptions(renderer.WithNodeRenderers(util.Prioritized(&htmlRenderer{}, 50)))
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
