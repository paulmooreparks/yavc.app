// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes_test

import (
	"strings"
	"testing"

	"yavc.app/internal/preview"
	"yavc.app/internal/shortcodes"
)

// A container inside one of the same name pairs its closing line by depth.
func TestNestedSameNameContainer(t *testing.T) {
	got := render(t, "{{tip:Outer}}\n{{tip:Inner}}\ninner\n{{/tip}}\nouter\n{{/tip}}\n\nAfter.\n")
	if strings.Contains(got, "sc-problem") {
		t.Fatalf("a problem drawn: %s", got)
	}
	inner := strings.Index(got, "Inner")
	innerText := strings.Index(got, "<p>inner</p>")
	outerText := strings.Index(got, "<p>outer</p>")
	after := strings.Index(got, "<p>After.</p>")
	if inner < 0 || innerText < inner || outerText < innerText || after < outerText {
		t.Fatalf("out of order: %s", got)
	}
	// The outer box closes after "outer": two notices close before After.
	between := got[innerText:after]
	if strings.Count(between, "</div></div></div>") != 2 || strings.Count(got[innerText:outerText], "</div></div></div>") != 1 {
		t.Fatalf("closed at the wrong depth: %s", got)
	}
	blocks, _ := preview.Render("{{tip}}\n{{tip}}\ninner\n{{/tip}}\nouter\n{{/tip}}\n\nAfter.\n")
	if len(blocks) != 2 {
		t.Fatalf("%d top-level blocks, want 2", len(blocks))
	}
}

// A stray closer is shown as itself, {{/name}}.
func TestStrayCloserShowsItself(t *testing.T) {
	got := render(t, "Text {{/color}} here.")
	if !strings.Contains(got, ">{{/color}}</code>") {
		t.Fatalf("got %s", got)
	}
}

// status and page take their labels from the arguments as read, so a
// first argument in quotes works.
func TestLabelsFromArguments(t *testing.T) {
	for md, want := range map[string]string{
		`{{status:"green" Done}}`:        `<span class="badge positive">Done</span>`,
		`{{status:green "In progress"}}`: `<span class="badge positive">In progress</span>`,
		`{{status:Green  Done  now}}`:    `<span class="badge positive">Done now</span>`,
		`{{page:"about" The author}}`:    `<a href="/about">The author</a>`,
		`{{page:slug=about The author}}`: `<a href="/about">The author</a>`,
		`{{page:about}}`:                 `<a href="/about">about</a>`,
		`{{page:about text="Who I am"}}`: `<a href="/about">Who I am</a>`,
		`{{status:green}}`:               `needs a label`,
		"{{status:\u0130 x}}":            `sc-problem`,
	} {
		if got := render(t, md); !strings.Contains(got, want) {
			t.Errorf("%s\n  want %s\n  got  %s", md, want, got)
		}
	}
}

// A Markdown image and a figure treat the same address the same way.
func TestImageRuleShared(t *testing.T) {
	for _, addr := range []string{"cat.png", "~/Pictures/cat.png", "/static/a.png", "https://example.com/a.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "//evil.example/a.png", "vbscript:x", "C:\\x.png"} {
		_, ok := shortcodes.SafeImage(addr)
		image := render(t, "![x]("+addr+")")
		figure := render(t, `{{figure:`+addr+` alt="x"}}`)
		if ok == strings.Contains(image, "sc-problem") || ok == strings.Contains(figure, "sc-problem") {
			t.Errorf("%s: SafeImage %v, image %s, figure %s", addr, ok, image, figure)
		}
		if ok {
			tag := shortcodes.ImageTag(addr, "x", "")
			if !strings.Contains(image, tag) || !strings.Contains(figure, strings.TrimSuffix(tag, ">")) {
				t.Errorf("%s: drawn differently:\n  %s\n  %s\n  %s", addr, tag, image, figure)
			}
		}
	}
}
