package frontmatter

import (
	"strings"
	"testing"
)

// Front matter holding a line break other than \n is a problem, reported,
// and never a panic or a wrong line range.
func TestOtherLineBreaksAreProblems(t *testing.T) {
	for _, brk := range []string{"\r", "\u0085", " ", " "} {
		for _, text := range []string{
			"---\ntitle: a" + brk + "b\n---\nBody.\n",
			"---\ntitle: a\nnote: x" + brk + "\nother: y\n---\n",
			"---\n" + brk + "title: a\n---\n",
			"---\ntitle: a\r\n---\n",
		} {
			f := Read(text)
			if !strings.Contains(f.Problem, "line break") {
				t.Errorf("%q: problem %q", text, f.Problem)
			}
			if _, err := Set(text, map[string]*string{"title": s("x")}, nil); err == nil {
				t.Errorf("%q: Set made a change", text)
			}
		}
	}
	// The problem gives the document's line.
	if f := Read("---\na: 1\nb: 2 \n---\n"); !strings.Contains(f.Problem, "Line 3") {
		t.Fatalf("problem %q", f.Problem)
	}
}

// A list property stays a list: it is written back as a block sequence of
// the items its value holds.
func TestSetKeepsAList(t *testing.T) {
	text := "---\ntitle: T\ntags:\n  - one\n  - two\nauthor: Me\n---\nBody.\n"
	out, err := Set(text, map[string]*string{"tags": s("one, two: three, true")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := "---\ntitle: T\ntags:\n  - one\n  - 'two: three'\n  - \"true\"\nauthor: Me\n---\nBody.\n"
	if out != want {
		t.Fatalf("got\n%s\nwant\n%s", out, want)
	}
	f := Read(out)
	if f.Entries[1].Kind != "list" || f.Entries[1].Value != "one, two: three, true" {
		t.Fatalf("read back as %+v", f.Entries[1])
	}
	// A flow list is a list too, written back as a block sequence.
	out, err = Set("---\nkeywords: [a, b]\n---\n", map[string]*string{"keywords": s("c")}, nil)
	if err != nil || out != "---\nkeywords:\n  - c\n---\n" {
		t.Fatalf("flow list: %q %v", out, err)
	}
	// An empty value is an empty list.
	out, err = Set("---\nkeywords: [a]\n---\n", map[string]*string{"keywords": s("")}, nil)
	if err != nil || out != "---\nkeywords: []\n---\n" {
		t.Fatalf("empty list: %q %v", out, err)
	}
	if f := Read(out); f.Entries[0].Kind != "list" || !f.Entries[0].Editable {
		t.Fatalf("empty list read as %+v", f.Entries[0])
	}
	if _, err := Set(text, map[string]*string{"tags": s("a, , b")}, nil); err == nil {
		t.Fatal("a list with an empty item was written")
	}
}

// A list whose items cannot be told apart again once joined is shown and
// not edited.
func TestListWithCommaItemsNotEditable(t *testing.T) {
	for _, text := range []string{
		"---\ntags:\n  - \"a, b\"\n  - c\n---\n",
		"---\ntags: ['']\n---\n",
	} {
		f := Read(text)
		if len(f.Entries) != 1 || f.Entries[0].Kind != "list" || f.Entries[0].Editable {
			t.Fatalf("%q: %+v", text, f.Entries)
		}
		if _, err := Set(text, map[string]*string{"tags": s("x")}, nil); err == nil {
			t.Fatalf("%q: an uneditable list was changed", text)
		}
	}
}

// verify refuses a change that would turn an entry into another kind.
func TestVerifyKeepsKind(t *testing.T) {
	before := Read("---\ntags:\n  - a\n---\n")
	after := Read("---\ntags: a\n---\n")
	if err := verify(before, after, map[string]*string{"tags": s("a")}); err == nil {
		t.Fatal("a list read back as text was accepted")
	}
	before = Read("---\ntitle: a\n---\n")
	after = Read("---\ntitle:\n  - b\n---\n")
	if err := verify(before, after, map[string]*string{"title": s("b")}); err == nil {
		t.Fatal("text read back as a list was accepted")
	}
}
