// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes

import (
	"fmt"
	"sort"
)

// The portable table says, for every built-in shortcode, what it means and
// what a destination that has no form of its own for it can put in its
// place (docs/shortcode-destinations.md, DESIGN.md decision 127). It is
// built from the same definitions the engine reads, so a shortcode cannot
// exist without an entry: Portable fails when one has no facts here.

// PortableArgument is one argument of a shortcode. Position is 1 for the
// first unnamed value and 0 for an argument that is only ever named. Rest
// says the argument takes every unnamed value from its position on.
type PortableArgument struct {
	Name        string `json:"name"`
	Position    int    `json:"position"`
	Rest        bool   `json:"rest,omitempty"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
}

// PortablePlain says how a shortcode reads as plain words. From is one of:
//
//	body      the shortcode's body, a container's or a span's
//	argument  the value of Argument, or of Otherwise when that is absent
//	file      the text of the file the Argument gives, as a listing
//	word      the fixed Word
//	nothing   no words at all
//
// Lead is an argument whose value, when given, goes before the body as its
// title.
type PortablePlain struct {
	From      string `json:"from"`
	Argument  string `json:"argument,omitempty"`
	Otherwise string `json:"otherwise,omitempty"`
	Word      string `json:"word,omitempty"`
	Lead      string `json:"lead,omitempty"`
}

// PortableShortcode is one row of the table.
type PortableShortcode struct {
	Name string `json:"name"`
	// Kind is inline, block, span (around words in a line) or container
	// (around blocks, with a closing line).
	Kind  string `json:"kind"`
	Title string `json:"title"`
	// AliasOf is the shortcode this one is another spelling of.
	AliasOf   string             `json:"aliasOf,omitempty"`
	Meaning   string             `json:"meaning"`
	Arguments []PortableArgument `json:"arguments"`
	Plain     PortablePlain      `json:"plain"`
	// Picture says whether a picture of the shortcode as drawn is a
	// faithful stand-in for it.
	Picture bool `json:"picture"`
	// Published is false for a shortcode that is working material or an
	// instruction to one application. Nothing of it, its body included,
	// belongs in a published copy of the document.
	Published bool `json:"published"`
	// SpanToo says a container may also be written around words in a line.
	SpanToo bool `json:"spanToo,omitempty"`
}

// PortableTable is the file a release carries.
type PortableTable struct {
	Version    int                 `json:"version"`
	Shortcodes []PortableShortcode `json:"shortcodes"`
}

type portableFacts struct {
	meaning   string
	arguments []PortableArgument
	plain     PortablePlain
	picture   bool
	private   bool
	aliasOf   string
}

func arg(name string, position int, required bool, description string) PortableArgument {
	return PortableArgument{Name: name, Position: position, Required: required, Description: description}
}

func rest(name string, position int, required bool, description string) PortableArgument {
	return PortableArgument{Name: name, Position: position, Rest: true, Required: required, Description: description}
}

var (
	plainBody    = PortablePlain{From: "body"}
	plainNothing = PortablePlain{From: "nothing"}
	titledBody   = PortablePlain{From: "body", Lead: "title"}
	noticeTitle  = []PortableArgument{rest("title", 1, false, "The notice's title, in inline Markdown. It is the whole argument.")}
	figureLike   = func(src string) []PortableArgument {
		return []PortableArgument{arg("src", 1, true, src), arg("alt", 0, false, "A description for someone who cannot see it."), arg("width", 0, false, "The largest width it is drawn at."), arg("caption", 0, false, "The caption, in inline Markdown.")}
	}
)

var portable = map[string]portableFacts{
	"info":    {meaning: "A notice that gives the reader information, set apart from the text around it.", arguments: noticeTitle, plain: titledBody},
	"note":    {meaning: "A notice of something the reader should take note of, set apart from the text around it.", arguments: noticeTitle, plain: titledBody},
	"tip":     {meaning: "A notice that gives the reader a helpful tip, set apart from the text around it.", arguments: noticeTitle, plain: titledBody},
	"warning": {meaning: "A notice that warns the reader of a risk, set apart from the text around it.", arguments: noticeTitle, plain: titledBody},
	"expand": {meaning: "A section the reader opens and closes, with its title showing while it is closed.",
		arguments: []PortableArgument{rest("title", 1, false, "The title shown while the section is closed, in inline Markdown. It is the whole argument, and More when absent.")}, plain: titledBody},
	"status": {meaning: "A short status label with a colour that says how things stand.",
		arguments: []PortableArgument{arg("colour", 1, true, "One of grey, blue, green, yellow or red. gray and amber are also read."), rest("label", 2, true, "The words of the label.")},
		plain:     PortablePlain{From: "argument", Argument: "label"}},
	"toc": {meaning: "A linked list of the document's headings.",
		arguments: []PortableArgument{arg("min", 0, false, "The first heading level listed, from 1 to 6."), arg("max", 0, false, "The last heading level listed, from 1 to 6.")}, plain: plainNothing},
	"anchor": {meaning: "A named place in the document that a link can go to.",
		arguments: []PortableArgument{arg("name", 1, true, "The anchor's name, a letter and then letters, digits, hyphens or underscores.")}, plain: plainNothing},
	"page": {meaning: "A link to another page of the same site, by the page's address on it.",
		arguments: []PortableArgument{arg("slug", 1, true, "The page's address on the site."), rest("text", 2, false, "The words of the link. The slug is shown when absent.")},
		plain:     PortablePlain{From: "argument", Argument: "text", Otherwise: "slug"}},
	"figure": {meaning: "A picture from a file or an address, with an optional caption.", arguments: figureLike("The picture's path or address."),
		plain: PortablePlain{From: "argument", Argument: "alt", Otherwise: "caption"}, picture: true},
	"diagram": {meaning: "A diagram drawn from a saved D2, Mermaid or Canvas file, with an optional caption. The file stays the diagram's source.", arguments: figureLike("The diagram file's path, ending in .d2, .mmd, .mermaid or .canvas."),
		plain: PortablePlain{From: "argument", Argument: "alt", Otherwise: "src"}, picture: true},
	"applet": {meaning: "An application of the hosting site running inside the page.",
		arguments: []PortableArgument{arg("name", 1, true, "The application's name."), arg("fit", 0, false, "flow or fill."), arg("state", 0, false, "The state the application starts in.")},
		plain:     PortablePlain{From: "argument", Argument: "name"}},
	"video": {meaning: "A video played in the page from YouTube or Vimeo.",
		arguments: []PortableArgument{arg("src", 1, true, "The video's link, or the service's name (youtube or vimeo)."), arg("id", 2, false, "The video's id, when the first argument is a service's name."), arg("title", 0, false, "A description of the video.")},
		plain:     PortablePlain{From: "argument", Argument: "title", Otherwise: "src"}},
	"code": {meaning: "The text of a file shown as a code listing.",
		arguments: []PortableArgument{arg("src", 1, true, "The file's path."), arg("lang", 0, false, "The listing's language, when the file's name does not say.")},
		plain:     PortablePlain{From: "file", Argument: "src"}},
	"color": {meaning: "Words drawn in a colour.",
		arguments: []PortableArgument{arg("colour", 1, true, "One of ink, muted, accent, danger, warn or positive, or a CSS colour.")}, plain: plainBody},
	"colour": {meaning: "Words drawn in a colour.", aliasOf: "color",
		arguments: []PortableArgument{arg("colour", 1, true, "One of ink, muted, accent, danger, warn or positive, or a CSS colour.")}, plain: plainBody},
	"kbd": {meaning: "Keys to press, each shown as a key.",
		arguments: []PortableArgument{rest("keys", 1, true, "The keys, joined by +, such as Ctrl+Shift+P. It is the whole argument.")}, plain: PortablePlain{From: "argument", Argument: "keys"}},
	"glyph": {meaning: "One small symbol from the PUDL design language's set, in the line of text.",
		arguments: []PortableArgument{arg("name", 1, true, "The glyph's name.")}, plain: PortablePlain{From: "argument", Argument: "name"}, picture: true},
	"columns":    {meaning: "Content set side by side in columns. A column line inside it starts the next column.", plain: plainBody},
	"column":     {meaning: "The divider between two columns, inside columns. It means nothing anywhere else.", plain: plainNothing},
	"no-export":  {meaning: "Private working text that stays in the source and is left out of every export.", plain: plainNothing, private: true},
	"draft-note": {meaning: "A note the author wrote to themselves, shown while editing and never published.", plain: plainNothing, private: true},
	"slide": {meaning: "Settings for one slide of a deck. It draws nothing itself.", plain: plainNothing, private: true,
		arguments: []PortableArgument{arg("layout", 0, false, "The slide's layout."), arg("background", 0, false, "The background colour."), arg("image", 0, false, "The background picture's address."), arg("reveal", 0, false, "How the slide's parts are revealed."), arg("transition", 0, false, "The transition to the slide."), arg("class", 0, false, "The slide's style class.")}},
	"style": {meaning: "A stylesheet kept with the document. It is never shown.", plain: plainNothing, private: true,
		arguments: []PortableArgument{arg("scope", 1, false, "slide, for a stylesheet of the one slide it is in.")}},
	"class": {meaning: "Words or blocks given a class of the document's stylesheet, which decides how they look.",
		arguments: []PortableArgument{arg("name", 1, true, "The class's name.")}, plain: plainBody},
	"notes":      {meaning: "Notes for the person presenting a deck, shown to them and not on the slide.", plain: plainNothing, private: true},
	"mark":       {meaning: "Words highlighted, as with a marker.", plain: plainBody},
	"sup":        {meaning: "Words set as superscript.", plain: plainBody},
	"sub":        {meaning: "Words set as subscript.", plain: plainBody},
	"page-break": {meaning: "The end of a page. What follows starts on a new page where the document has pages.", plain: plainNothing},
	"caption":    {meaning: "The caption of the figure or table just before it.", plain: plainBody},
}

// Portable is the table of every built-in shortcode, in the order of the
// Insert menu with the other spellings after it.
func Portable() (PortableTable, error) {
	names := append([]string{}, order...)
	listed := map[string]bool{}
	for _, name := range names {
		listed[name] = true
	}
	extra := []string{}
	for name := range table {
		if !listed[name] {
			extra = append(extra, name)
		}
	}
	sort.Strings(extra)
	names = append(names, extra...)
	out := PortableTable{Version: 1, Shortcodes: make([]PortableShortcode, 0, len(names))}
	for _, name := range names {
		d := table[name]
		facts, ok := portable[name]
		if !ok {
			return PortableTable{}, fmt.Errorf("shortcode %s has no entry in the portable table", name)
		}
		if facts.meaning == "" || facts.plain.From == "" {
			return PortableTable{}, fmt.Errorf("shortcode %s needs a meaning and a plain form", name)
		}
		kind := "inline"
		switch d.kind {
		case block:
			kind = "block"
		case container:
			kind = "container"
		case span:
			kind = "span"
		}
		arguments := facts.arguments
		if arguments == nil {
			arguments = []PortableArgument{}
		}
		out.Shortcodes = append(out.Shortcodes, PortableShortcode{Name: name, Kind: kind, Title: d.title, AliasOf: facts.aliasOf, Meaning: facts.meaning,
			Arguments: arguments, Plain: facts.plain, Picture: facts.picture, Published: !facts.private, SpanToo: d.kind == container && d.spanWrap != nil})
	}
	// define is read by the macro registry and has no definition in the
	// table of drawn shortcodes, so its row is written here.
	out.Shortcodes = append(out.Shortcodes, PortableShortcode{Name: "define", Kind: "container", Title: "Define a Shortcode",
		Meaning:   "The definition of a shortcode of the document's own. A use of that shortcode stands for the definition's body, so a destination works from the expanded text.",
		Arguments: []PortableArgument{arg("name", 1, true, "The new shortcode's name.")}, Plain: plainNothing, Published: false})
	for name := range portable {
		if table[name] == nil {
			return PortableTable{}, fmt.Errorf("the portable table has %s, which is not a shortcode", name)
		}
	}
	return out, nil
}
