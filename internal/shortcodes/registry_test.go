// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package shortcodes

import (
	"bytes"
	"strings"
	"testing"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/renderer/html"
)

func drawMacros(t *testing.T, source, shared string) (string, *MacroRegistry) {
	t.Helper()
	r := DiscoverMacros(source, shared)
	var out bytes.Buffer
	err := goldmark.New(goldmark.WithExtensions(WithMacros(r)), goldmark.WithRendererOptions(html.WithUnsafe())).Convert([]byte(source), &out)
	if err != nil {
		t.Fatal(err)
	}
	return out.String(), r
}

func TestMacroDiscoveryAndRendering(t *testing.T) {
	source := "{{define:card}}\n{{param:title default=\"A title\" help=\"Card heading\"}}\n## {{arg:title}}\n\n{{content}}\n{{/define}}\n\n{{card:title=\"My card\"}}\n**Rich body**\n{{/card}}\n"
	out, r := drawMacros(t, source, "")
	if len(r.Entries) != 1 || r.Entries[0].Body != source[r.Entries[0].From:r.Entries[0].To] || !strings.Contains(out, "My card") || !strings.Contains(out, "<strong>Rich body</strong>") || strings.Contains(out, "sc-problem") || strings.Contains(out, "param:") {
		t.Fatalf("%s\n%+v", out, r)
	}
}

func TestMacroInlineAndBlockCalls(t *testing.T) {
	source := "{{define:badge}}\n{{param:text default=\"Hello\"}}\n**{{arg:text}}**\n{{/define}}\n\nBefore {{badge:text=\"A < B\"}} after.\n\n{{badge}}\n"
	out, _ := drawMacros(t, source, "")
	if !strings.Contains(out, "Before <strong>A &lt; B</strong> after.") || !strings.Contains(out, "<p><strong>Hello</strong></p>") || strings.Contains(out, "sc-problem") {
		t.Fatal(out)
	}
}

func TestMacroDiscoveryExcludesExamples(t *testing.T) {
	source := "---\nexample: |\n  {{define:yaml}}\n  value\n  {{/define}}\n---\n\n```md\n{{define:fenced}}\nvalue\n{{/define}}\n```\n\n    {{define:indented}}\n    value\n    {{/define}}\n\n> {{define:quoted}}\n> value\n> {{/define}}\n\n- {{define:listed}}\n  value\n  {{/define}}\n\n{{define:real}}\n{{kbd:Ctrl+S}}\n{{/define}}\n"
	r := DiscoverMacros(source, "")
	if len(r.Entries) != 1 || r.Entries[0].Name != "real" {
		t.Fatalf("%+v", r.Entries)
	}
}

func TestMacroCyclesLimitsAndDuplicates(t *testing.T) {
	cases := []struct{ source, why string }{
		{"{{define:a}}\n{{b}}\n{{/define}}\n{{define:b}}\n{{a}}\n{{/define}}\n\n{{a}}", "cycle"},
		{"{{define:a}}\none\n{{/define}}\n{{define:a}}\ntwo\n{{/define}}\n\n{{a}}", "duplicate"},
		{"{{define:a}}\nno closing line", "needs"},
		{"{{define:warning}}\nreserved\n{{/define}}", "reserved"},
	}
	for _, c := range cases {
		out, _ := drawMacros(t, c.source, "")
		if !strings.Contains(out, c.why) || !strings.Contains(out, "sc-problem") {
			t.Fatalf("wanted %s: %s", c.why, out)
		}
	}
	chain := ""
	for c := byte('a'); c <= 'i'; c++ {
		body := "done"
		if c < 'i' {
			body = "{{" + string(c+1) + "}}"
		}
		chain += "{{define:" + string(c) + "}}\n" + body + "\n{{/define}}\n"
	}
	out, _ := drawMacros(t, chain+"\n{{a}}", "")
	if !strings.Contains(out, "eight levels") {
		t.Fatal(out)
	}
	body := strings.Repeat("x", 1024)
	source := "{{define:a}}\n" + body + "\n{{/define}}\n\n" + strings.Repeat("{{a}}\n\n", 257)
	out, _ = drawMacros(t, source, "")
	if !strings.Contains(out, "expansions exceed") {
		t.Fatal("cumulative output budget was not enforced")
	}
}

func TestMacroSharedOverridesAndIsolation(t *testing.T) {
	shared := "{{define:badge}}\nshared\n{{/define}}"
	out, _ := drawMacros(t, "{{badge}}", shared)
	if !strings.Contains(out, "shared") {
		t.Fatal(out)
	}
	source := "{{define:badge}}\nlocal\n{{/define}}\n\n{{badge}}"
	out, _ = drawMacros(t, source, shared)
	if !strings.Contains(out, "local") || strings.Contains(out, "shared") {
		t.Fatal(out)
	}
	out, _ = drawMacros(t, "{{badge}}", "")
	if !strings.Contains(out, "sc-problem") {
		t.Fatal("definition leaked to another document")
	}
}

func TestMacroLiteralArgumentsAndCodeExamples(t *testing.T) {
	source := "{{define:a}}\n{{param:text}}\n{{arg:text}}\n{{/define}}\n\n{{a:text=\"<script>evil()</script> **bold**\"}}\n\n`{{a:text=untouched}}`\n\n```\n{{a:text=untouched}}\n```\n"
	out, _ := drawMacros(t, source, "")
	if strings.Contains(out, "<script>") || strings.Contains(out, "<strong>") || strings.Count(out, "{{a:text=untouched}}") != 2 {
		t.Fatal(out)
	}
	for _, args := range []string{`text="unclosed`, `text="value"junk`, `text=a text=b`, `unknown=value`, `a b`} {
		r := DiscoverMacros(source, "")
		if _, err := r.expand(NewCall("a", args), "", 0, &MacroBudget{}); err == nil {
			t.Errorf("accepted invalid arguments %q", args)
		}
	}
}

func TestMacroRichContentSlotMustBeAnElement(t *testing.T) {
	for _, template := range []string{"<!--\n{{content}}\n-->\n", "```html\n{{content}}\n```\n", "Inline {{content}} here.\n"} {
		r := DiscoverMacros("{{define:card}}\n"+template+"{{/define}}", "")
		if _, ok := r.ContainerOf("{{card}}"); ok {
			t.Fatalf("accepted a non-element content slot: %q", template)
		}
	}
	definition := "{{define:card}}\n{{note:Card}}\n{{content}}\n{{/note}}\n{{/define}}"
	if _, ok := DiscoverMacros(definition, "").ContainerOf("{{card}}"); !ok {
		t.Fatal("refused a real rich content slot")
	}
}
