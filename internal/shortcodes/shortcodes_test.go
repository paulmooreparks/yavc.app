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
		{"{{applet:conway fit=flow state=init=1,1}}", `<div data-applet="conway" data-applet-fit="flow" data-applet-initial="init=1,1"></div>`},
		{"{{video:youtube dQw4w9WgXcQ title=\"Never\"}}", `youtube-nocookie.com/embed/dQw4w9WgXcQ`},
		{"{{video:https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5}}", `youtube-nocookie.com/embed/dQw4w9WgXcQ`},
		{"{{video:https://youtu.be/dQw4w9WgXcQ}}", `youtube-nocookie.com/embed/dQw4w9WgXcQ`},
		{"{{video:https://vimeo.com/76979871}}", `player.vimeo.com/video/76979871?dnt=1`},
		{"{{video:vimeo 76979871}}", `player.vimeo.com/video/76979871?dnt=1`},
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
		{"{{notes}}\nSay this.\n{{/notes}}", `<aside class="sc-notes"><p class="sc-notes-label">Speaker notes</p>`},
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
	want := "shortcode shortcode paragraph"
	if strings.Join(kinds, " ") != want {
		t.Errorf("kinds %v, want %s", kinds, want)
	}
}
