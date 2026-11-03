// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes_test

import (
	"strings"
	"testing"

	"yavc.app/internal/preview"
)

func render(t *testing.T, md string) string {
	t.Helper()
	blocks, _ := preview.Render(md)
	var b strings.Builder
	for _, bl := range blocks {
		b.WriteString(bl.HTML)
	}
	return b.String()
}

func TestShortcodes(t *testing.T) {
	cases := []struct{ md, want string }{
		{"A {{kbd:Ctrl+Shift+P}} chord.", `<span class="sc-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd></span>`},
		{"Done: {{status:green Done}}", `<span class="badge positive">Done</span>`},
		{"{{glyph:check}} ok", `--glyph: var(--glyph-check)`},
		{"{{glyph:nothing}} no", `sc-problem`},
		{"{{tip:Try this}}\nSome *text*.\n{{/tip}}\n", `<div class="notice positive sc-notice" role="note"><div class="notice-content"><p class="notice-title">Try this</p><div class="notice-body">`},
		{"{{tip:Try this}}\nSome *text*.\n{{/tip}}\n", `<em>text</em>`},
		{"{{expand:More here}}\nHidden.\n{{/expand}}", `<details class="sc-expand"><summary class="btn disclosure">More here</summary>`},
		{"{{columns}}\nOne.\n\n{{column}}\n\nTwo.\n{{/columns}}", `<div class="sc-columns"><div class="sc-column">`},
		{"{{columns}}\nOne.\n\n{{column}}\n\nTwo.\n{{/columns}}", `</div><div class="sc-column">`},
		{"{{figure:/images/x.png alt=\"A thing\" width=80% caption=\"The *cap*\"}}", `<figure class="sc-figure"><img src="/images/x.png" alt="A thing" style="max-width:80%" loading="lazy"><figcaption>The <em>cap</em></figcaption></figure>`},
		{"{{figure:cat.png alt=\"A cat\"}}", `<figure class="sc-figure"><img class="dinah-attachment-image" data-attachment="cat.png" alt="A cat" loading="lazy"></figure>`},
		{"{{figure:~/Pictures/cat.png alt=\"\" width=50%}}", `<img class="dinah-attachment-image" data-attachment="~/Pictures/cat.png" alt="" style="max-width:50%" loading="lazy">`},
		{"{{figure:javascript:alert(1) alt=\"\"}}", `sc-problem`},
		{"{{applet:conway fit=flow state=init=1,1}}", `<div data-applet="conway" data-applet-fit="flow" data-applet-initial="init=1,1"></div>`},
		{"{{video:youtube dQw4w9WgXcQ title=\"Never\"}}", `youtube-nocookie.com/embed/dQw4w9WgXcQ`},
		{"{{video:https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5}}", `youtube-nocookie.com/embed/dQw4w9WgXcQ`},
		{"{{video:https://youtu.be/dQw4w9WgXcQ}}", `youtube-nocookie.com/embed/dQw4w9WgXcQ`},
		{"{{video:https://vimeo.com/76979871}}", `player.vimeo.com/video/76979871?dnt=1`},
		{"{{video:vimeo 76979871}}", `player.vimeo.com/video/76979871?dnt=1`},
		{"Some {{color:accent}}bright **bold** words{{/color}} here.", `Some <span class="sc-colour" style="color:var(--deck-accent, var(--accent))">bright <strong>bold</strong> words</span> here.`},
		{"A {{colour:#c0392b}}red{{/colour}} word.", `<span class="sc-colour" style="color:#c0392b">red</span>`},
		{"Nested {{colour:tomato}}outer {{colour:navy}}inner{{/colour}} more{{/colour}}.", `<span class="sc-colour" style="color:tomato">outer <span class="sc-colour" style="color:navy">inner</span> more</span>`},
		{"Unclosed {{colour:red}}words.", `needs {{/colour}}`},
		{"A {{class:callout}}boxed **thing**{{/class}} here.", `<span class="callout" data-class="callout">boxed <strong>thing</strong></span>`},
		{"{{class:aside}}\nA paragraph.\n{{/class}}", `<div class="aside" data-class="aside">`},
		{"{{style}}\n.deck-body h2 { color: red; }\n{{/style}}", `<div class="sc-style" hidden>`},
		{"A {{class:9bad}}x{{/class}}.", `needs a name`},
		{"Unclosed {{color:red}}words.", `needs {{/color}}`},
		{"# {{colour:accent}}yavc.app{{/colour}}", `<h1 id="colouraccentyavcappcolour"><span class="sc-colour" style="color:var(--deck-accent, var(--accent))">yavc.app</span></h1>`},
		{"- {{colour:navy}}an item{{/colour}}", `<li><span class="sc-colour" style="color:navy">an item</span></li>`},
		{"Bad {{colour:url(x)}}words{{/colour}}.", `is not a colour`},
		{"{{code:~/bin/hello}}", `<pre><code data-code-src="~/bin/hello"></code></pre>`},
		{"{{code:/applets/dice/dice.js}}", `class="language-javascript" data-code-src="/applets/dice/dice.js"`},
		{"{{page:author Paul}}", `<a href="/author">Paul</a>`},
		{"See {{anchor:here}} now", `<a id="here"></a>`},
		{"# One\n\n{{toc:min=1}}\n\n## Two\n", `<nav class="sc-toc" aria-label="Contents"><ul><li><a href="#one">One</a><ul><li><a href="#two">Two</a></li></ul></li></ul></nav>`},
		{"{{draft-note}}\nCheck.\n{{/draft-note}}", `<aside class="sc-draft-note">`},
		{"{{note}}\nNo close", `runs to the end of the page`},
		{"{{/tip}}", `which is not open`},
		{"{{column}}", `means nothing outside one`},
		{"{{slide:layout=title background=#123 reveal=steps}}", `<div class="sc-slide" hidden data-layout="title" data-background="#123" data-reveal="steps"></div>`},
		{"{{notes}}\nSay this.\n{{/notes}}", `<aside class="sc-notes"><p class="sc-notes-label">Speaker Notes</p>`},
		// The marks a document needs: each closes with its own element, and
		// Markdown works inside them.
		{"A {{mark}}key **idea**{{/mark}} here.", `A <mark class="sc-mark">key <strong>idea</strong></mark> here.`},
		{"10{{sup}}3{{/sup}} and H{{sub}}2{{/sub}}O", `10<sup>3</sup> and H<sub>2</sub>O`},
		{"{{mark}}outer {{sup}}inner{{/sup}} more{{/mark}}", `<mark class="sc-mark">outer <sup>inner</sup> more</mark>`},
		{"- {{sub}}an item{{/sub}}", `<li><sub>an item</sub></li>`},
		{"Unclosed {{mark}}words.", `needs {{/mark}}`},
		{"Stray {{/sup}} closer.", `which is not open`},
		{"{{page-break}}", `<div class="sc-page-break" role="separator" aria-label="Page break"></div>`},
		{"{{caption}}\nSales by *quarter*.\n{{/caption}}", `<div class="sc-caption">`},
		{"{{caption}}\nSales by *quarter*.\n{{/caption}}", `<em>quarter</em>`},
		// The closer of a colour or a class is still a span.
		{"{{colour:tomato}}x{{/colour}} {{mark}}y{{/mark}}", `<span class="sc-colour" style="color:tomato">x</span> <mark class="sc-mark">y</mark>`},
	}
	for _, c := range cases {
		got := render(t, c.md)
		if !strings.Contains(got, c.want) {
			t.Errorf("%q\n  want %q\n  got  %s", c.md, c.want, got)
		}
	}
}

func TestShortcodeKind(t *testing.T) {
	blocks, _ := preview.Render("Press {{kbd:F1}} now.\n\n{{tip}}\nx\n{{/tip}}\n\nPlain.\n")
	kinds := []string{}
	for _, b := range blocks {
		i := strings.Index(b.HTML, `data-kind="`)
		rest := b.HTML[i+len(`data-kind="`):]
		kinds = append(kinds, rest[:strings.Index(rest, `"`)])
	}
	// Keys in a line of text leave the paragraph a paragraph, edited as rich
	// text with the keys as one piece of it; a container is a shortcode.
	want := "paragraph shortcode paragraph"
	if strings.Join(kinds, " ") != want {
		t.Errorf("kinds %v, want %s", kinds, want)
	}
}
