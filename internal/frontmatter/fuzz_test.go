package frontmatter

import (
	"strings"
	"testing"
)

var seeds = []string{
	"",
	"Body.\n",
	"---\ntitle: \"Plans: 2027\"\n# a comment\ntags:\n  - one\n  - two\nnested:\n  a: 1\nnote: |\n  two\n  lines\n---\nBody.\n",
	"---\ntitle: a\ntitle: b\n---\n",
	"---\nbase: &x 1\nother: *x\n---\n",
	"---\ntitle: a b\n---\n",
	"---\ntitle: a\rb\n---\n",
	"---\nk: v\u0085\n---\n",
	"---\n\ttitle: a\n---\n",
	"---\ntags: [a, b]\n---\n",
	"---\ntags:\n  - \"a, b\"\n---\n",
	"---\n--- x\nk: v\n---\n",
	"---\nk: v\n...\nj: w\n---\n",
	"---\ntitle: A\n---",
}

// Read never panics, and what it reports is within the text: the end of
// the front matter, and each entry's lines.
func FuzzRead(f *testing.F) {
	for _, s := range seeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, text string) {
		fm := Read(text)
		if fm.End < 0 || fm.End > len(text) || fm.Has != (End(text) > 0) || (fm.Has && fm.End != End(text)) {
			t.Fatalf("%q: has %v end %d", text, fm.Has, fm.End)
		}
		if fm.Problem != "" {
			return
		}
		for _, e := range fm.Entries {
			if e.line < 1 || e.end < e.line || e.end > len(fm.lines) {
				t.Fatalf("%q: %s has lines %d to %d of %d", text, e.Key, e.line, e.end, len(fm.lines))
			}
			if e.Kind == "list" && e.Editable {
				for _, item := range strings.Split(e.Value, ", ") {
					if item == "" && e.Value != "" {
						t.Fatalf("%q: editable list %s has an empty item", text, e.Key)
					}
				}
			}
		}
	})
}

// Set never panics, and a change it makes says what was asked, keeps
// every other property and the body, and is made again as nothing.
func FuzzSet(f *testing.F) {
	for _, s := range seeds {
		f.Add(s, "title", "New: value")
		f.Add(s, "tags", "one, two")
		f.Add(s, "date", "2026-11-03")
	}
	f.Fuzz(func(t *testing.T, text, key, value string) {
		before := Read(text)
		out, err := Set(text, map[string]*string{key: &value}, nil)
		if err != nil {
			return
		}
		after := Read(out)
		if after.Problem != "" {
			t.Fatalf("%q set %s=%q gives front matter with a problem: %s\n%q", text, key, value, after.Problem, out)
		}
		got := map[string]Entry{}
		for _, e := range after.Entries {
			got[e.Key] = e
		}
		if got[key].Value != value {
			t.Fatalf("%q set %s=%q reads back %q", text, key, value, got[key].Value)
		}
		for _, e := range before.Entries {
			if e.Key == key {
				if got[key].Kind != e.Kind {
					t.Fatalf("%q set %s changed its kind from %s to %s", text, key, e.Kind, got[key].Kind)
				}
				continue
			}
			if n, ok := got[e.Key]; !ok || n.Value != e.Value || n.Kind != e.Kind {
				t.Fatalf("%q set %s changed %s", text, key, e.Key)
			}
		}
		body := text
		if before.Has {
			body = text[before.End:]
		}
		if !strings.HasSuffix(out, body) && !strings.HasSuffix(out, strings.TrimLeft(body, "\n")) {
			t.Fatalf("%q set %s lost the body: %q", text, key, out)
		}
		again, err := Set(out, map[string]*string{key: &value}, nil)
		if err != nil || again != out {
			t.Fatalf("%q set %s twice: %q then %q (%v)", text, key, out, again, err)
		}
	})
}
