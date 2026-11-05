// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package shortcodes

import (
	"bytes"
	"strings"
	"testing"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/renderer/html"
)

func TestMacroDeclarationAndLiteralSubstitution(t *testing.T) {
	body := "{{param:title default=\"A title\" help=\"Shown above the body\"}}\r\n## {{arg:title}}\r\n\r\n{{content}}\r\n"
	d, err := ParseMacroDefinition("card", body)
	if err != nil || !d.Container || len(d.Parameters) != 1 || d.Parameters[0].Help != "Shown above the body" {
		t.Fatalf("definition: %#v, %v", d, err)
	}
	if d.Template != "## {{arg:title}}\r\n\r\n{{content}}\r\n" {
		t.Fatalf("template bytes changed: %q", d.Template)
	}
	text, err := d.Substitute(nil, "**Rich body**")
	if err != nil || text != "## A&#32;title\r\n\r\n**Rich body**\r\n" {
		t.Fatalf("default/body: %q, %v", text, err)
	}
	payload := "{{content}}<img src=x onerror=evil()>\n# [link](javascript:evil) &copy; `code`"
	text, err = d.Substitute(map[string]string{"title": payload}, "**Rich body**")
	if err != nil || strings.Contains(text, `<img`) || strings.Contains(text, "\n# [") || strings.Count(text, "**Rich body**") != 1 || strings.Contains(text, "{{content}}") {
		t.Fatalf("argument entered Markdown syntax: %q, %v", text, err)
	}
	var rendered bytes.Buffer
	md := goldmark.New(goldmark.WithExtensions(Extension), goldmark.WithRendererOptions(html.WithUnsafe()))
	if err := md.Convert([]byte(text), &rendered); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(rendered.String(), "<img") || strings.Contains(rendered.String(), "<a ") || strings.Contains(rendered.String(), "sc-problem") || !strings.Contains(rendered.String(), "<strong>Rich body</strong>") {
		t.Fatalf("argument became markup: %s", rendered.String())
	}
}

func TestMacroArgumentsCannotCloseHTMLAttributes(t *testing.T) {
	d, err := ParseMacroDefinition("card", "{{param:title}}\n<span title=\"{{arg:title}}\">{{arg:title}}</span>")
	if err != nil {
		t.Fatal(err)
	}
	text, err := d.Substitute(map[string]string{"title": `"><img src=x onerror=evil()>`}, "")
	if err != nil || strings.Contains(text, "<img") || strings.Count(text, `"`) != 2 || !strings.Contains(text, "&#34;&#62;&#60;img") {
		t.Fatalf("argument changed HTML structure: %q, %v", text, err)
	}
}

func TestMacroRefusals(t *testing.T) {
	for _, tc := range []struct{ name, body string }{
		{"warning", "body"}, {"define", "body"}, {"Bad", "body"},
		{"card", "{{param:title}}\n{{param:title}}\nbody"},
		{"card", "{{param:title extra=bad}}\nbody"},
		{"card", "{{param:title default=\"oops}}\nbody"},
		{"card", "{{arg:missing}}"}, {"card", "{{content}}{{content}}"},
		{"card", "{{card:title=oops}}"}, {"card", strings.Repeat("a", MacroLimit+1)},
	} {
		if _, err := ParseMacroDefinition(tc.name, tc.body); err == nil {
			t.Errorf("accepted invalid definition %q: %.100q", tc.name, tc.body)
		}
	}
	d, err := ParseMacroDefinition("card", "{{param:title}}\n{{arg:title}}{{arg:title}}")
	if err != nil {
		t.Fatal(err)
	}
	for _, args := range []map[string]string{{"unknown": "x"}, {"title": strings.Repeat("x", MacroLimit)}} {
		if _, err := d.Substitute(args, ""); err == nil {
			t.Error("accepted unknown argument or excessive expansion")
		}
	}
	if _, err := d.Substitute(nil, "body"); err == nil {
		t.Error("accepted content on a non-container")
	}
}
