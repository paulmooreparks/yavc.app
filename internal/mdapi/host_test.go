// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package mdapi

import (
	"encoding/json"
	"strings"
	"testing"
)

// hostList is a host's shortcodes of each kind, with one that shares a
// built-in's name and one written with a prefix.
const hostList = `[
	{"name":"ticket","kind":"inline"},
	{"name":"person","kind":"inline","prefix":"@"},
	{"name":"children","kind":"block"},
	{"name":"panel","kind":"container"},
	{"name":"thread","kind":"container","managed":true},
	{"name":"target","kind":"span"},
	{"name":"page","kind":"inline"},
	{"name":"info","kind":"container"},
	{"name":"define","kind":"inline"},
	{"name":"Bad Name","kind":"inline"},
	{"name":"odd","kind":"sideways"}
]`

func hosted(t *testing.T, op, text string) string {
	t.Helper()
	request, err := json.Marshal(map[string]any{"op": op, "text": text, "hosts": json.RawMessage(hostList)})
	if err != nil {
		t.Fatal(err)
	}
	out := Call("macro-context", string(request))
	if strings.HasPrefix(out, `{"error"`) {
		t.Fatalf("%s of %q: %s", op, text, out)
	}
	return out
}

func previewHTML(t *testing.T, text string) string {
	t.Helper()
	var got struct {
		Blocks []struct{ HTML string }
	}
	if err := json.Unmarshal([]byte(hosted(t, "preview", text)), &got); err != nil {
		t.Fatal(err)
	}
	var all strings.Builder
	for _, b := range got.Blocks {
		all.WriteString(b.HTML)
	}
	return all.String()
}

func TestHostShortcodesDrawAsPlaceholders(t *testing.T) {
	cases := []struct {
		name, text string
		want       []string
		not        []string
	}{
		{"inline", "See {{ticket:AB-12}} today.",
			[]string{`<span class="sc-host" data-host-shortcode="ticket" data-host-kind="inline" data-host-args="AB-12" data-host-source="{{ticket:AB-12}}"><code class="sc-host-source">{{ticket:AB-12}}</code></span>`}, []string{"sc-problem"}},
		{"prefix", "Ask {{@jdoe}} about it.",
			[]string{`data-host-shortcode="person" data-host-kind="inline" data-host-args="jdoe" data-host-source="{{@jdoe}}"`}, []string{"sc-problem"}},
		{"block", "{{children}}\n",
			[]string{`<div class="sc-host" data-host-shortcode="children" data-host-kind="block" data-host-args="" data-host-source="{{children}}">`}, []string{"sc-problem", "<p>"}},
		{"block in a line", "Here {{children}} it is.",
			[]string{`sc-problem`, `children goes on a line of its own.`}, nil},
		{"container", "{{panel:Title}}\n\nBody *text*.\n\n{{/panel}}\n",
			[]string{`<div class="sc-host" data-host-shortcode="panel" data-host-kind="container" data-host-args="Title" data-host-source="{{panel:Title}}"><div class="sc-host-body">`, `<em>text</em>`, `</div></div>`}, []string{"sc-problem"}},
		{"unclosed container", "{{panel}}\n\nBody.\n",
			[]string{`data-host-shortcode="panel"`, `sc-problem`, `needs {{/panel}}`}, nil},
		{"managed container", "{{thread:id=1}}\n\nBody.\n\n{{/thread}}\n",
			[]string{`data-host-shortcode="thread"`, `data-host-managed="true"`}, []string{"sc-problem"}},
		{"span", "Some {{target:ref=C-1}}marked **words**{{/target}} here.",
			[]string{`<span class="sc-host" data-host-shortcode="target" data-host-kind="span" data-host-args="ref=C-1" data-host-source="{{target:ref=C-1}}"><span class="sc-host-body">marked <strong>words</strong></span></span>`}, []string{"sc-problem"}},
		{"container in a line", "Some {{panel}}words{{/panel}} here.",
			[]string{`data-host-shortcode="panel" data-host-kind="span"`, `<span class="sc-host-body">words</span></span>`}, []string{"sc-problem"}},
		{"unmatched span", "Some {{target:ref=C-1}}words here.",
			[]string{`sc-problem`, `needs {{/target}}`}, []string{"data-host-shortcode"}},
		{"stray closer", "Some words{{/target}} here.",
			[]string{`sc-problem`, `which is not open`}, []string{"data-host-shortcode"}},
		{"a built-in keeps what it can draw", "{{info:Heads up}}\n\nBody.\n\n{{/info}}\n\nSee {{page:other-page}}.",
			nil, []string{"data-host-shortcode", "sc-problem"}},
		{"the host takes what a built-in refuses", "See {{page:AOY:Concept Index}}.",
			[]string{`data-host-shortcode="page" data-host-kind="inline" data-host-args="AOY:Concept Index"`}, []string{"sc-problem"}},
		{"a reserved name is not the host's", "A {{define:x}} here.",
			nil, []string{"data-host-shortcode"}},
		{"a kind the engine does not know", "A {{odd:x}} here.",
			[]string{"There is no shortcode called odd."}, []string{"data-host-shortcode"}},
	}
	for _, c := range cases {
		got := previewHTML(t, c.text)
		for _, w := range c.want {
			if !strings.Contains(got, w) {
				t.Errorf("%s: %q drew\n%s\nwithout\n%s", c.name, c.text, got, w)
			}
		}
		for _, n := range c.not {
			if strings.Contains(got, n) {
				t.Errorf("%s: %q drew\n%s\nwith %s", c.name, c.text, got, n)
			}
		}
	}
}

func TestHostShortcodesAreNothingWithoutAHost(t *testing.T) {
	out := Call("preview", "Ask {{@jdoe}} about {{ticket:AB-12}}.")
	if strings.Contains(out, "data-host-shortcode") || !strings.Contains(out, "{{@jdoe}}") {
		t.Errorf("without a host: %s", out)
	}
}

func TestHostShortcodesInThePageView(t *testing.T) {
	text := "Ask {{@jdoe}} about {{ticket:AB-12}} and {{target:ref=C-1}}these **words**{{/target}}.\n\n" +
		"{{children}}\n\n" +
		"{{panel:Title}}\n\nBody *text* with {{ticket:AB-13}}.\n\n{{/panel}}\n\n" +
		"{{thread:id=1}}\n\nA comment.\n\n{{/thread}}\n"
	doc := hosted(t, "doc", text)
	for _, want := range []string{
		`"type":"shortcode"`, `"src":"{{@jdoe}}"`, `"src":"{{ticket:AB-12}}"`,
		`"type":"host_span"`, `"open":"{{target:ref=C-1}}"`,
		`"type":"container"`, `"name":"panel"`, `"src":"{{ticket:AB-13}}"`,
	} {
		if !strings.Contains(doc, want) {
			t.Errorf("the page view's document lacks %s:\n%s", want, doc)
		}
	}
	var parsed struct {
		Content []struct {
			Type  string
			Attrs map[string]any
		}
	}
	if err := json.Unmarshal([]byte(doc), &parsed); err != nil {
		t.Fatal(err)
	}
	kinds := []string{}
	for _, n := range parsed.Content {
		kinds = append(kinds, n.Type)
	}
	if got := strings.Join(kinds, " "); got != "paragraph source_block container source_block" {
		t.Errorf("the page view's blocks are %s", got)
	}
	back := Call("markdown", doc)
	var written string
	if err := json.Unmarshal([]byte(back), &written); err != nil {
		t.Fatalf("markdown: %s", back)
	}
	if strings.TrimSpace(written) != strings.TrimSpace(text) {
		t.Errorf("the document writes back as\n%s\nand was\n%s", written, text)
	}
}

func TestHostContainerFrame(t *testing.T) {
	var c struct{ Name, Args, Before, After, Open string }
	if err := json.Unmarshal([]byte(hosted(t, "container", "{{panel:Title}}")), &c); err != nil {
		t.Fatal(err)
	}
	if c.Name != "panel" || c.Args != "Title" || !strings.Contains(c.Before, `data-host-shortcode="panel"`) || c.After != "</div></div>" || c.Open != "{{panel:Title}}" {
		t.Errorf("the frame of a host container is %+v", c)
	}
	if err := json.Unmarshal([]byte(hosted(t, "container", "{{info:Heads up}}")), &c); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(c.Before, "data-host-shortcode") {
		t.Errorf("a built-in container was given the host's frame: %+v", c)
	}
	request, _ := json.Marshal(map[string]any{"op": "container", "text": "{{thread:id=1}}", "hosts": json.RawMessage(hostList)})
	if out := Call("macro-context", string(request)); !strings.HasPrefix(out, `{"error"`) {
		t.Errorf("a managed container has a frame to edit: %s", out)
	}
}

func TestHostInlineAtom(t *testing.T) {
	for raw, want := range map[string]string{
		"{{ticket:AB-12}}":           `data-host-shortcode="ticket"`,
		"{{@jdoe}}":                  `data-host-shortcode="person"`,
		"{{page:AOY:Concept Index}}": `data-host-shortcode="page"`,
		"{{children}}":               `sc-problem`,
		"{{kbd:Ctrl+C}}":             `<kbd`,
	} {
		var got struct{ HTML string }
		if err := json.Unmarshal([]byte(hosted(t, "inline", raw)), &got); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(got.HTML, want) {
			t.Errorf("%s drew %s, without %s", raw, got.HTML, want)
		}
	}
}

func TestManagedHostSpanStaysOpaque(t *testing.T) {
	source := "Before {{locked:id=1}}host-owned **body**{{/locked}} after.\n"
	request, _ := json.Marshal(map[string]any{"op": "doc", "text": source, "hosts": []map[string]any{{"name": "locked", "kind": "span", "managed": true}}})
	out := Call("macro-context", string(request))
	if strings.Contains(out, `"type":"host_span"`) || !strings.Contains(out, `"type":"source_block"`) {
		t.Fatalf("managed span became editable rich content: %s", out)
	}
}
