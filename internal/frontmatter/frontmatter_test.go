package frontmatter

import (
	"strings"
	"testing"
)

func s(v string) *string { return &v }

func TestReadKinds(t *testing.T) {
	text := "---\ntitle: \"Plans: 2027\"\n# a comment\ntags:\n  - one\n  - two\nnested:\n  a: 1\nnote: |\n  two\n  lines\n---\nBody.\n"
	f := Read(text)
	if f.Problem != "" {
		t.Fatal(f.Problem)
	}
	got := map[string]Entry{}
	for _, e := range f.Entries {
		got[e.Key] = e
	}
	if got["title"].Value != "Plans: 2027" || !got["title"].Editable {
		t.Fatalf("title: %+v", got["title"])
	}
	if got["tags"].Kind != "list" || got["tags"].Value != "one, two" {
		t.Fatalf("tags: %+v", got["tags"])
	}
	if got["nested"].Editable || got["note"].Editable {
		t.Fatalf("complex entries editable: %+v %+v", got["nested"], got["note"])
	}
	if text[f.End:] != "Body.\n" {
		t.Fatalf("end at %d", f.End)
	}
}

func TestReadProblems(t *testing.T) {
	for text, want := range map[string]string{
		"---\ntitle: a\ntitle: b\n---\n":    "given twice",
		"---\ntitle: \"open\n---\n":         "not valid YAML",
		"---\n- a\n- b\n---\n":              "not a list of properties",
		"---\ntitle: a\n":                   "no closing line",
		"---\n\ttitle: a\n---\n":            "tabs",
		"---\nbase: &x 1\nother: *x\n---\n": "",
	} {
		f := Read(text)
		if want == "" {
			if f.Problem != "" {
				t.Fatalf("%q: %s", text, f.Problem)
			}
			for _, e := range f.Entries {
				if e.Editable {
					t.Fatalf("%q: anchored %s editable", text, e.Key)
				}
			}
			continue
		}
		if !strings.Contains(f.Problem, want) {
			t.Fatalf("%q: problem %q, want %q", text, f.Problem, want)
		}
	}
}

// A change rewrites only the lines it changes.
func TestSetKeepsTheRest(t *testing.T) {
	text := "---\n# Deck\ntitle: Old   # kept comment goes with the line\ntags:\n  - one\nauthor: 'Me'\n---\n\nBody.\n"
	out, err := Set(text, map[string]*string{"title": s("New: title"), "subject": s("true"), "date": s("2026-11-03")}, []string{"title", "subject", "date"})
	if err != nil {
		t.Fatal(err)
	}
	want := "---\n# Deck\ntitle: 'New: title'\ntags:\n  - one\nauthor: 'Me'\nsubject: \"true\"\ndate: 2026-11-03\n---\n\nBody.\n"
	if out != want {
		t.Fatalf("got\n%s\nwant\n%s", out, want)
	}
	// Nothing changed: the text comes back byte for byte.
	same, err := Set(text, map[string]*string{"title": s("Old")}, nil)
	if err != nil || same != text {
		t.Fatalf("unchanged came back as %q (%v)", same, err)
	}
}

func TestSetRemoveAndCreate(t *testing.T) {
	out, err := Set("Body.\n", map[string]*string{"title": s("T")}, nil)
	if err != nil || out != "---\ntitle: T\n---\n\nBody.\n" {
		t.Fatalf("create: %q %v", out, err)
	}
	out, err = Set("---\ntitle: T\n---\n\nBody.\n", map[string]*string{"title": nil}, nil)
	if err != nil || out != "Body.\n" {
		t.Fatalf("remove last: %q %v", out, err)
	}
	out, err = Set("---\ntags:\n  - a\n  - b\ntitle: T\n---\nB\n", map[string]*string{"tags": nil}, nil)
	if err != nil || out != "---\ntitle: T\n---\nB\n" {
		t.Fatalf("remove list: %q %v", out, err)
	}
}

func TestSetRefuses(t *testing.T) {
	if _, err := Set("---\nnested:\n  a: 1\n---\n", map[string]*string{"nested": s("x")}, nil); err == nil {
		t.Fatal("changed a nested mapping")
	}
	if _, err := Set("---\na: 1\na: 2\n---\n", map[string]*string{"b": s("x")}, nil); err == nil {
		t.Fatal("changed invalid front matter")
	}
	for _, k := range []string{"1abc", "has space", "a:b", strings.Repeat("x", 65)} {
		if _, err := Set("", map[string]*string{k: s("v")}, nil); err == nil {
			t.Fatalf("took name %q", k)
		}
	}
	for _, v := range []string{"two\nlines", "bell\a", strings.Repeat("x", MaxValue+1)} {
		if _, err := Set("", map[string]*string{"k": s(v)}, nil); err == nil {
			t.Fatalf("took value %q", v)
		}
	}
	// YAML 1.1's booleans are quoted, for readers that still use it.
	for _, v := range []string{"yes", "No", "on", "OFF", "y"} {
		out, err := Set("", map[string]*string{"k": new(v)}, nil)
		if err != nil || !strings.Contains(out, `k: "`+v+`"`) {
			t.Fatalf("%q written as %q (%v)", v, out, err)
		}
	}
	// Values that YAML would read as something else are quoted and read back as text.
	for _, v := range []string{"yes", "null", "123", "- dash", "a #b", "[x]", "{y}", "*ref", "&anchor", "'q'", `"dq"`, "  lead", "trail  ", "%x", "@x", "`x"} {
		out, err := Set("", map[string]*string{"k": s(v)}, nil)
		if err != nil {
			t.Fatalf("%q: %v", v, err)
		}
		f := Read(out)
		if f.Problem != "" || len(f.Entries) != 1 || f.Entries[0].Value != v {
			t.Fatalf("%q came back as %+v (%s)", v, f.Entries, out)
		}
	}
}
