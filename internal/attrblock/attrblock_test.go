// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package attrblock

import (
	"bytes"
	"strings"
	"testing"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
)

func TestParse(t *testing.T) {
	b, ok := Parse(`#top .wide .tall target="_blank" rel='noopener' lang=en`)
	if !ok || b.ID != "top" || strings.Join(b.Classes, ",") != "wide,tall" || len(b.Pairs) != 3 || b.Pairs[0] != (Pair{"target", "_blank"}) || b.Pairs[1] != (Pair{"rel", "noopener"}) || b.Pairs[2] != (Pair{"lang", "en"}) {
		t.Fatalf("a block was misread: %+v %v", b, ok)
	}
	for _, raw := range []string{"", "  ", "braces", "#", ".", "x=", `x="a`, "#a b", `x="a{b}"`, "x=<b>", strings.Repeat("a", MaxLength) + "=1"} {
		if _, ok := Parse(raw); ok {
			t.Fatalf("%q is not a block", raw)
		}
	}
}

func draw(t *testing.T, source string) string {
	t.Helper()
	md := goldmark.New(goldmark.WithExtensions(extension.GFM, Extension), goldmark.WithParserOptions(parser.WithAutoHeadingID()), goldmark.WithRendererOptions(html.WithUnsafe()))
	var out bytes.Buffer
	if err := md.Convert([]byte(source), &out); err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(out.String())
}

func TestHeadings(t *testing.T) {
	for source, want := range map[string]string{
		"# Excel Employee Capacity Spreadsheet {#top}": `<h1 id="top">Excel Employee Capacity Spreadsheet</h1>`,
		"## At a *Glance* {#at_a_glance .wide}":        `<h2 id="at_a_glance" class="wide">At a <em>Glance</em></h2>`,
		"## Styled {.wide}":                            `<h2 id="styled" class="wide">Styled</h2>`,
		"# {#only}":                                    `<h1 id="only"></h1>`,
		"Setext {#under}\n======":                      `<h1 id="under">Setext</h1>`,
		// A handler or a style is kept in the file and never given to the page.
		`# Sly {#x onclick="alert(1)" style="color:red"}`: `<h1 id="x">Sly</h1>`,
		// These are words, not blocks.
		"# Use {braces} here":      `<h1 id="use-braces-here">Use {braces} here</h1>`,
		"# Ends in {braces}":       `<h1 id="ends-in-braces">Ends in {braces}</h1>`,
		`# Escaped \{#top}`:        `<h1 id="escaped-top">Escaped {#top}</h1>`,
		"# No space{#top}":         `<h1 id="no-spacetop">No space{#top}</h1>`,
		"# Code `x` {#a} trailing": `<h1 id="code-x-a-trailing">Code <code>x</code> {#a} trailing</h1>`,
		"# Shortcode braces {{x}}": `<h1 id="shortcode-braces-x">Shortcode braces {{x}}</h1>`,
		// Markup inside the braces means they are not one run of plain text.
		"# Mixed {title=\"<b>\"}":    `<h1 id="mixed-titleb">Mixed {title=&quot;<b>&quot;}</h1>`,
		"A paragraph {#not-a-block}": `<p>A paragraph {#not-a-block}</p>`,
	} {
		if got := draw(t, source); got != want {
			t.Errorf("%q drew\n%s\nwant\n%s", source, got, want)
		}
	}
}

func TestLinksAndPictures(t *testing.T) {
	for source, want := range map[string]string{
		`See ["kung fu"](https://example.com/a){target="_blank" rel="noopener"} to do it.`: `<p>See <a href="https://example.com/a" target="_blank" rel="noopener">&quot;kung fu&quot;</a> to do it.</p>`,
		`[a](b){#here .ext}`:              `<p><a href="b" id="here" class="ext">a</a></p>`,
		"[a](b){.one}\nnext line":         "<p><a href=\"b\" class=\"one\">a</a>\nnext line</p>",
		`![chart](c.png){width=300 #fig}`: `<p><img src="c.png" alt="chart" id="fig" width="300"></p>`,
		// A handler is kept in the file and never given to the page.
		`[a](b){onclick="x()" target=_self}`: `<p><a href="b" target="_self">a</a></p>`,
		// These are words, not blocks.
		`[a](b) {target="_blank"}`: `<p><a href="b">a</a> {target=&quot;_blank&quot;}</p>`,
		`[a](b)\{.one}`:            `<p><a href="b">a</a>{.one}</p>`,
		`[a](b){one}`:              `<p><a href="b">a</a>{one}</p>`,
		"[a](b){.one `code`}":      `<p><a href="b">a</a>{.one <code>code</code>}</p>`,
		`text (b){.one}`:           `<p>text (b){.one}</p>`,
	} {
		if got := draw(t, source); got != want {
			t.Errorf("%q drew\n%s\nwant\n%s", source, got, want)
		}
	}
}
