package mdapi

import (
	"encoding/json"
	"strings"
	"testing"
)

func call(t testing.TB, name, arg string) map[string]any {
	t.Helper()
	out := Call(name, arg)
	var v any
	if err := json.Unmarshal([]byte(out), &v); err != nil {
		t.Fatalf("%s(%q) is not JSON: %s", name, arg, out)
	}
	m, _ := v.(map[string]any)
	return m
}

func TestFunctions(t *testing.T) {
	if got := call(t, "preview", "# A\n\nB.\n"); len(got["blocks"].([]any)) != 2 {
		t.Fatalf("preview: %v", got)
	}
	doc := Call("doc", "# A\n\nB.\n")
	if !strings.Contains(doc, `"type":"doc"`) {
		t.Fatalf("doc: %s", doc)
	}
	var text string
	if err := json.Unmarshal([]byte(Call("markdown", doc)), &text); err != nil || text != "# A\n\nB.\n" {
		t.Fatalf("markdown: %q %v", text, err)
	}
	if out := Call("blocks", "New.\n"); !strings.Contains(out, `"paragraph"`) || strings.Contains(out, `"uid"`) {
		t.Fatalf("blocks: %s", out)
	}
	if got := call(t, "container", "{{tip:T}}"); got["name"] != "tip" || got["open"] != "{{tip:T}}" {
		t.Fatalf("container: %v", got)
	}
	if got := call(t, "container", "plain"); got["error"] == nil {
		t.Fatalf("container of a plain line: %v", got)
	}
	if got := call(t, "inline", "{{kbd:F1}}"); !strings.Contains(got["html"].(string), "<kbd>F1</kbd>") {
		t.Fatalf("inline: %v", got)
	}
	if out := Call("glyphs", ""); !strings.Contains(out, `"check"`) {
		t.Fatalf("glyphs: %s", out)
	}
	if got := call(t, "front", "---\r\ntitle: A\r\n---\r\n"); got["has"] != true {
		t.Fatalf("front: %v", got)
	}
	if got := call(t, "frontset", `{"text":"Body.\n","set":{"title":"T"}}`); got["text"] != "---\ntitle: T\n---\n\nBody.\n" {
		t.Fatalf("frontset: %v", got)
	}
	if got := call(t, "frontset", `{"text":"---\na: 1\na: 2\n---\n","set":{"b":"x"}}`); got["error"] == nil {
		t.Fatalf("frontset refused nothing: %v", got)
	}
	if got := call(t, "source", "```mermaid\ng\n```\n"); len(got["diagrams"].([]any)) != 1 {
		t.Fatalf("source: %v", got)
	}
	if got := call(t, "nothing", ""); !strings.Contains(got["error"].(string), "no function") {
		t.Fatalf("unknown: %v", got)
	}
}

// A panic in a function is returned as an error, not passed to the page.
func TestCallRecovers(t *testing.T) {
	functions["boom"] = func(string) (any, error) { panic("over") }
	defer delete(functions, "boom")
	got := call(t, "boom", "")
	if e, _ := got["error"].(string); !strings.HasPrefix(e, Failed) || !strings.Contains(e, "over") {
		t.Fatalf("got %v", got)
	}
}

// No function panics or answers with anything but JSON, whatever it is
// given.
func FuzzWasmAPI(f *testing.F) {
	for _, name := range Names() {
		f.Add(name, "")
		f.Add(name, "# A\n\n{{tip}}\nx\n{{/tip}}\n")
	}
	f.Add("markdown", `{"type":"doc","content":[null,{"type":"columns","attrs":{"seps":[1]},"content":[null]}]}`)
	f.Add("markdown", `{"type":"doc","content":[{"type":"table","content":[{"type":"table_row","content":[null]}]}]}`)
	f.Add("frontset", `{"text":"---\nk: a b\n---\n","set":{"k":"x"}}`)
	f.Add("frontset", `{"text":"---\ntags: [a]\n---\n","set":{"tags":"b, c"}}`)
	f.Add("front", "---\nk: v\r\n---\n")
	f.Add("container", "{{columns}}")
	f.Add("inline", "{{/color}}")
	f.Fuzz(func(t *testing.T, name, arg string) {
		out := Call(name, arg)
		if !json.Valid([]byte(out)) {
			t.Fatalf("%s(%q) is not JSON: %s", name, arg, out)
		}
		if strings.Contains(out, Failed) {
			t.Fatalf("%s(%q) panicked: %s", name, arg, out)
		}
	})
}
