// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes_test

import (
	"bytes"
	"regexp"
	"strings"
	"testing"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"

	"yavc.app/internal/shortcodes"
)

// safe is goldmark with the shortcodes and without raw HTML, so anything
// that could run in the page could only have come from a shortcode.
var safe = goldmark.New(goldmark.WithExtensions(extension.GFM, shortcodes.Extension))

var scriptURL = regexp.MustCompile(`(?i)(?:src|href|style)="[^"]*(?:javascript|vbscript|data:text)`)

// The shortcodes never panic, and never write an element or an address
// that runs script, whatever they are given.
func FuzzShortcodes(f *testing.F) {
	for _, s := range []string{
		"{{tip:Try *this*}}\nBody.\n{{/tip}}",
		"{{tip}}\n{{tip}}\ninner\n{{/tip}}\nouter\n{{/tip}}",
		"{{figure:javascript:alert(1) alt=\"x\"}}",
		"{{figure:\"cat.png\" alt=\"\\\"><script>\" caption=\"<b>x</b>\"}}",
		"{{video:youtube \"><script>}}",
		"{{applet:x\" onload=\"alert(1) state=\"a\\\"b\"}}",
		"A {{color:red;background:url(javascript:x)}}x{{/color}}",
		"{{class:a\"b}}x{{/class}}",
		"{{slide:image=javascript:x background=\"x\\\" y\"}}",
		"{{status:\"green\" <b>x</b>}} {{page:\"about\" <i>}}",
		"{{kbd:<script>+x}} {{glyph:\"><}} {{anchor:a\"b}}",
		"{{toc:min=9 max=-1}}\n# <script>\n",
		"{{code:~/x\".js lang=\"><\"}}",
		"{{/tip}} {{/color}}",
		"{{columns}}\n{{column}}\n{{/columns}}",
	} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, s string) {
		var b bytes.Buffer
		if err := safe.Convert([]byte(s), &b); err != nil {
			return
		}
		out := b.String()
		for _, check := range []string{out, shortcodes.InlineHTML(s)} {
			if strings.Contains(strings.ToLower(check), "<script") || strings.Contains(strings.ToLower(check), "<iframe src=\"j") || scriptURL.MatchString(check) {
				t.Fatalf("%q drawn as %s", s, check)
			}
		}
		if c, ok := shortcodes.ContainerOf(s); ok {
			if c.Name == "" || !strings.HasPrefix(shortcodes.OpenLine(c.Name, c.Args), "{{"+c.Name) {
				t.Fatalf("%q: container %+v", s, c)
			}
		}
		call := shortcodes.NewCall("x", s)
		_ = call.Source()
	})
}
