// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes

import (
	"strings"
	"testing"
)

const expandSource = "---\ntitle: Expanding\n---\n" +
	"{{define:greet}}\n{{param:who default=\"you\"}}\nHello, **{{arg:who}}**.\n{{/define}}\n\n" +
	"{{define:callout}}\n{{param:title default=\"Note\"}}\n{{warning:{{arg:title}}}}\n{{content}}\n{{/warning}}\n{{/define}}\n\n" +
	"{{define:twice}}\n{{greet:who=A}} {{greet:who=B}}\n{{/define}}\n\n" +
	"# Heading\n\n" +
	"First {{greet:who=Sam}} and {{greet}} here.\n\n" +
	"{{callout:title=Careful}}\nMind the {{kbd:Ctrl+S}} key.\n{{/callout}}\n\n" +
	"{{twice}}\n\n" +
	"```\n{{greet:who=Code}}\n```\n\n" +
	"{{status:green Done}} stays, and so does {{unknown:thing}}.\n"

func TestExpandDocumentReplacesADocumentsOwnShortcodes(t *testing.T) {
	got, problems := ExpandDocument(strings.ReplaceAll(expandSource, "\n", "\r\n"), "", nil)
	if len(problems) != 0 {
		t.Fatalf("problems: %+v", problems)
	}
	want := "---\ntitle: Expanding\n---\n" +
		"\n\n\n" +
		"# Heading\n\n" +
		"First Hello, **Sam**. and Hello, **you**. here.\n\n" +
		"{{warning:Careful}}\nMind the {{kbd:Ctrl+S}} key.\n\n{{/warning}}\n\n" +
		"Hello, **A**. Hello, **B**.\n\n" +
		"```\n{{greet:who=Code}}\n```\n\n" +
		"{{status:green Done}} stays, and so does {{unknown:thing}}.\n"
	if got != want {
		t.Fatalf("got:\n%q\nwant:\n%q", got, want)
	}
	// What is left has no use of a defined shortcode and no definition.
	again, _ := ExpandDocument(got, "", nil)
	if again != got {
		t.Fatalf("expanding twice changed the text:\n%q", again)
	}
}

func TestExpandDocumentUsesSharedDefinitionsAndReportsWhatItLeaves(t *testing.T) {
	shared := "{{define:brand}}\nACME\n{{/define}}\n\n{{define:loop}}\n{{loop}}\n{{/define}}\n"
	source := "Made by {{brand}}.\n\n{{define:needs}}\n{{param:x}}\n{{arg:x}}\n{{/define}}\n\n{{needs:y=1}} and {{loop}}.\n"
	got, problems := ExpandDocument(source, shared, nil)
	if !strings.HasPrefix(got, "Made by ACME.\n") {
		t.Fatalf("the shared definition was not used: %q", got)
	}
	if !strings.Contains(got, "{{needs:y=1}} and {{loop}}.") {
		t.Fatalf("a use that cannot be expanded must stay as written: %q", got)
	}
	if len(problems) != 2 || problems[0].Name != "needs" || problems[1].Name != "loop" || problems[0].At != strings.Index(source, "{{needs:y=1}}") {
		t.Fatalf("problems: %+v", problems)
	}
}

func TestExpandDocumentLeavesAHostsLiteralContainerAlone(t *testing.T) {
	source := "{{define:greet}}\nHello\n{{/define}}\n\n{{raw}}\n<p>{{greet}}</p>\n{{/raw}}\n\n{{greet}}\n"
	got, problems := ExpandDocument(source, "", []HostShortcode{{Name: "raw", Kind: "container", Literal: true}})
	if len(problems) != 0 || !strings.Contains(got, "<p>{{greet}}</p>") || !strings.HasSuffix(got, "{{/raw}}\n\nHello\n") {
		t.Fatalf("got %q, problems %+v", got, problems)
	}
}
