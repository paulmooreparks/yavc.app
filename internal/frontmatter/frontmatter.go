// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package frontmatter reads and changes a document's YAML front matter, the
// block between two lines of three dashes at its start, for the Properties
// dialog of the Editor and Slides (DESIGN.md, decision 17).
//
// Reading uses a real YAML parser, so the properties shown are what any YAML
// reader would see. Front matter that is not valid YAML, or that is not a
// mapping of names to values, or that repeats a name, is reported and not
// changed. A change rewrites only the lines of the properties it changes,
// keeping every other line (comments, blank lines, other properties, their
// quoting and order) as it was written, and the result is read again and
// compared with what was asked for before it is returned, so a change can
// never leave the front matter saying something else.
package frontmatter

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

// Entry is one top-level property.
type Entry struct {
	Key string `json:"key"`
	// Value is a scalar's text, or a list of scalars joined by ", ".
	Value string `json:"value"`
	// Kind is scalar, list or complex. Only a single-line scalar or a
	// list of scalars is edited in a dialog; anything else (a nested
	// mapping, a block of text over several lines, an anchor, an alias or
	// a tag) is shown and left as written.
	Kind     string `json:"kind"`
	Editable bool   `json:"editable"`
	line     int    // first line, 1-based, within the block's body
	end      int    // last line, 1-based
}

// Front is a document's front matter as read.
type Front struct {
	// Has says whether the document starts with front matter.
	Has bool `json:"has"`
	// End is the byte offset just after the closing line.
	End     int     `json:"end"`
	Entries []Entry `json:"entries"`
	// Problem is why the front matter cannot be changed here, with the
	// document's line number; empty when it can be.
	Problem string `json:"problem,omitempty"`
	body    string
	lines   []string
}

var keyRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_-]{0,63}$`)

// MaxValue is the longest value a dialog may write.
const MaxValue = 2000

// block finds the front matter: a first line "---" and the next line that
// is "---", ignoring spaces at its end. It is the same rule internal/pageview
// uses to keep front matter out of the page.
func block(text string) (body string, end int, ok bool) {
	if !strings.HasPrefix(text, "---\n") {
		return "", 0, false
	}
	at := 4
	for at <= len(text) {
		nl := strings.IndexByte(text[at:], '\n')
		line := text[at:]
		if nl >= 0 {
			line = text[at : at+nl]
		}
		if strings.TrimRight(line, " \t") == "---" {
			if nl < 0 {
				return text[4:at], len(text), true
			}
			return text[4:at], at + nl + 1, true
		}
		if nl < 0 {
			break
		}
		at += nl + 1
	}
	return "", 0, false
}

// Read reads a document's front matter. text uses \n line ends.
func Read(text string) Front {
	body, end, ok := block(text)
	f := Front{Has: ok, End: end, Entries: []Entry{}, body: body}
	if !ok {
		if strings.HasPrefix(text, "---\n") {
			f.Problem = "The front matter has no closing line of three dashes."
		}
		return f
	}
	f.lines = strings.Split(strings.TrimSuffix(body, "\n"), "\n")
	if strings.TrimSpace(body) == "" {
		return f
	}
	if strings.Contains(body, "\t") && tabIndented(f.lines) {
		f.Problem = "The front matter is indented with tabs, which YAML does not allow."
		return f
	}
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(body), &doc); err != nil {
		f.Problem = "The front matter is not valid YAML: " + shiftLine(err.Error())
		return f
	}
	if doc.Kind == 0 || len(doc.Content) == 0 {
		return f
	}
	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		f.Problem = fmt.Sprintf("The front matter on line %d is not a list of properties, each a name and a value.", root.Line+1)
		return f
	}
	seen := map[string]int{}
	for i := 0; i+1 < len(root.Content); i += 2 {
		k, v := root.Content[i], root.Content[i+1]
		if k.Kind != yaml.ScalarNode || k.Style&yaml.TaggedStyle != 0 || k.Value == "<<" {
			f.Problem = fmt.Sprintf("Line %d has a property name this dialog cannot keep safely.", k.Line+1)
			return f
		}
		if was, dup := seen[k.Value]; dup {
			f.Problem = fmt.Sprintf("The property %q is given twice, on lines %d and %d.", k.Value, was+1, k.Line+1)
			return f
		}
		seen[k.Value] = k.Line
		e := Entry{Key: k.Value, line: k.Line, Kind: "complex"}
		switch {
		case v.Kind == yaml.AliasNode || v.Anchor != "" || k.Anchor != "" || v.Style&yaml.TaggedStyle != 0:
			e.Value = strings.TrimSpace(raw(f.lines, k.Line, k.Line))
		case v.Kind == yaml.ScalarNode:
			e.Value, e.Kind = v.Value, "scalar"
			e.Editable = !strings.Contains(v.Value, "\n") && keyRe.MatchString(k.Value)
		case v.Kind == yaml.SequenceNode && scalars(v):
			var items []string
			for _, it := range v.Content {
				items = append(items, it.Value)
			}
			e.Value, e.Kind = strings.Join(items, ", "), "list"
			e.Editable = keyRe.MatchString(k.Value)
		default:
			e.Value = "(several lines)"
		}
		f.Entries = append(f.Entries, e)
	}
	// Each property runs to the line before the next, less the blank and
	// comment lines at its end, which belong to what follows.
	for i := range f.Entries {
		end := len(f.lines)
		if i+1 < len(f.Entries) {
			end = f.Entries[i+1].line - 1
		}
		for end > f.Entries[i].line {
			t := strings.TrimSpace(f.lines[end-1])
			if t != "" && !strings.HasPrefix(t, "#") {
				break
			}
			end--
		}
		f.Entries[i].end = end
	}
	return f
}

func tabIndented(lines []string) bool {
	for _, l := range lines {
		if strings.HasPrefix(l, "\t") {
			return true
		}
	}
	return false
}

func scalars(n *yaml.Node) bool {
	for _, it := range n.Content {
		if it.Kind != yaml.ScalarNode || it.Style&yaml.TaggedStyle != 0 || it.Anchor != "" || strings.Contains(it.Value, "\n") {
			return false
		}
	}
	return true
}

func raw(lines []string, from, to int) string {
	if from < 1 || to > len(lines) || from > to {
		return ""
	}
	return strings.Join(lines[from-1:to], "\n")
}

var lineNoRe = regexp.MustCompile(`line (\d+)`)

// shiftLine turns the parser's line within the block into the document's,
// one more for the opening line.
func shiftLine(msg string) string {
	msg = strings.TrimPrefix(msg, "yaml: ")
	return lineNoRe.ReplaceAllStringFunc(msg, func(s string) string {
		var n int
		fmt.Sscanf(s, "line %d", &n)
		return fmt.Sprintf("line %d", n+1)
	})
}

// Check says why a property's name or value cannot be written, or nil.
func Check(key, value string) error {
	if !keyRe.MatchString(key) {
		return fmt.Errorf("%q is not a property name: a name is letters, digits, - and _, starting with a letter or _, up to 64 of them", key)
	}
	if !utf8.ValidString(value) {
		return fmt.Errorf("the value of %s is not valid text", key)
	}
	if len(value) > MaxValue {
		return fmt.Errorf("the value of %s is longer than %d characters", key, MaxValue)
	}
	for _, r := range value {
		if r == '\n' || r == '\r' {
			return fmt.Errorf("the value of %s is more than one line", key)
		}
		if unicode.IsControl(r) && r != '\t' {
			return fmt.Errorf("the value of %s holds a control character", key)
		}
	}
	return nil
}

var isoDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

var yaml11Bool = map[string]bool{"y": true, "n": true, "yes": true, "no": true, "on": true, "off": true, "true": true, "false": true}

// scalar writes a value as YAML, quoted where it must be so that it reads
// back as the same text: a value that would read as a number, a boolean or
// null, or that holds ": " or " #", is quoted. A date is written as it is.
func scalar(key, v string) (string, error) {
	if key == "date" && isoDate.MatchString(v) {
		return v, nil
	}
	node := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: v}
	// YAML 1.1 readers, which many site generators still use, read these
	// as booleans where YAML 1.2 reads text, so they are quoted for both.
	if yaml11Bool[strings.ToLower(v)] {
		node.Style = yaml.DoubleQuotedStyle
	}
	out, err := yaml.Marshal(node)
	if err != nil {
		return "", err
	}
	s := strings.TrimSuffix(string(out), "\n")
	if strings.Contains(s, "\n") {
		return "", fmt.Errorf("the value of %s cannot be written on one line", key)
	}
	return s, nil
}

// Set changes properties: each key in set takes its value, and a nil value
// takes the property out. A property the dialog may not edit (Editable
// false) cannot be changed. It returns the document with its new front
// matter; the front matter is made if there was none, and taken out if no
// property is left and it held nothing else.
func Set(text string, set map[string]*string, order []string) (string, error) {
	f := Read(text)
	if f.Problem != "" {
		return "", errors.New(f.Problem)
	}
	byKey := map[string]Entry{}
	for _, e := range f.Entries {
		byKey[e.Key] = e
	}
	keys := order
	if len(keys) == 0 {
		for k := range set {
			keys = append(keys, k)
		}
	}
	type edit struct {
		from, to int
		lines    []string
	}
	var edits []edit
	var added []string
	for _, k := range keys {
		v, asked := set[k]
		if !asked {
			continue
		}
		e, has := byKey[k]
		if has && !e.Editable {
			return "", fmt.Errorf("%s is written in a form this dialog does not change; edit it in the text", k)
		}
		if v == nil {
			if has {
				edits = append(edits, edit{e.line, e.end, nil})
			}
			continue
		}
		if err := Check(k, *v); err != nil {
			return "", err
		}
		if has && e.Value == *v {
			continue
		}
		line, err := scalar(k, *v)
		if err != nil {
			return "", err
		}
		if has {
			edits = append(edits, edit{e.line, e.end, []string{k + ": " + line}})
		} else {
			added = append(added, k+": "+line)
		}
	}
	lines := append([]string(nil), f.lines...)
	if !f.Has {
		lines = nil
	}
	// From the bottom up, so the lines above keep their numbers.
	for i := 0; i < len(edits); i++ {
		for j := i + 1; j < len(edits); j++ {
			if edits[j].from > edits[i].from {
				edits[i], edits[j] = edits[j], edits[i]
			}
		}
	}
	for _, e := range edits {
		rest := append([]string(nil), lines[e.to:]...)
		lines = append(append(lines[:e.from-1], e.lines...), rest...)
	}
	// New properties go after the last line that says anything.
	last := len(lines)
	for last > 0 && strings.TrimSpace(lines[last-1]) == "" {
		last--
	}
	lines = append(append(append([]string(nil), lines[:last]...), added...), lines[last:]...)

	bodyText := text
	if f.Has {
		bodyText = text[f.End:]
	} else if strings.TrimSpace(strings.Join(lines, "")) != "" && !strings.HasPrefix(text, "\n") {
		bodyText = "\n" + text
	}
	empty := true
	for _, l := range lines {
		if strings.TrimSpace(l) != "" {
			empty = false
		}
	}
	var out string
	if empty {
		out = strings.TrimLeft(bodyText, "\n")
	} else {
		out = "---\n" + strings.Join(lines, "\n") + "\n---\n" + bodyText
	}
	if err := verify(f, Read(out), set); err != nil {
		return "", err
	}
	return out, nil
}

// verify reads the new front matter back and checks it says what was
// asked: each set property has its new value or is gone, and every other
// property is as it was.
func verify(before, after Front, set map[string]*string) error {
	if after.Problem != "" {
		return errors.New("the change would leave front matter that cannot be read (" + after.Problem + "), so it was not made")
	}
	now := map[string]Entry{}
	for _, e := range after.Entries {
		now[e.Key] = e
	}
	for _, e := range before.Entries {
		if _, asked := set[e.Key]; asked {
			continue
		}
		n, ok := now[e.Key]
		if !ok || n.Value != e.Value || n.Kind != e.Kind {
			return fmt.Errorf("the change would have altered %s, so it was not made", e.Key)
		}
	}
	for k, v := range set {
		n, ok := now[k]
		if v == nil {
			if ok {
				return fmt.Errorf("%s could not be taken out", k)
			}
			continue
		}
		if !ok || n.Value != *v || n.Kind != "scalar" {
			return fmt.Errorf("%s would not read back as written, so the change was not made", k)
		}
	}
	if len(after.Entries) != len(before.Entries)+countAdded(before, set)-countRemoved(before, set) {
		return errors.New("the change would have added or lost a property, so it was not made")
	}
	return nil
}

func countAdded(f Front, set map[string]*string) int {
	have := map[string]bool{}
	for _, e := range f.Entries {
		have[e.Key] = true
	}
	n := 0
	for k, v := range set {
		if v != nil && !have[k] {
			n++
		}
	}
	return n
}

func countRemoved(f Front, set map[string]*string) int {
	n := 0
	for _, e := range f.Entries {
		if v, asked := set[e.Key]; asked && v == nil {
			n++
		}
	}
	return n
}
