// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package review discovers persisted CriticMarkup in Markdown text contexts.
// Its edits remove only delimiters or rejected content, preserving the source
// positions and line-ending provenance of retained bodies.
package review

import (
	"bytes"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

const MaxSource = 1024 * 1024
const MaxBody = 64 * 1024
const MaxMarks = 2048

// CellSafe prevents an atom's source from introducing a GFM table separator.
func CellSafe(raw string) bool {
	slashes := 0
	for _, char := range raw {
		if char == '|' && slashes%2 == 0 {
			return false
		}
		if char == '\\' {
			slashes++
		} else {
			slashes = 0
		}
	}
	return !strings.ContainsAny(raw, "\r\n")
}

type Kind string

const (
	Addition    Kind = "addition"
	Deletion    Kind = "deletion"
	Replacement Kind = "replacement"
	Comment     Kind = "comment"
	Highlight   Kind = "highlight"
)

type Mark struct {
	Kind                                  Kind
	From, To, BodyFrom, BodyTo, Separator int
	Before, After, Raw                    string
}

type Problem struct {
	From    int
	Message string
}
type Catalog struct {
	Marks    []Mark
	Problems []Problem
}
type Edit struct {
	From, To int
	Insert   string
}

var candidatesKey = parser.NewContextKey()
var closersKey = parser.NewContextKey()
var separatorsKey = parser.NewContextKey()
var forms = []struct {
	kind        Kind
	open, close string
}{
	{Addition, "{++", "++}"}, {Deletion, "{--", "--}"}, {Replacement, "{~~", "~~}"}, {Comment, "{>>", "<<}"}, {Highlight, "{==", "==}"},
}

type observer struct{}

func (*observer) Trigger() []byte { return []byte{'{', '+', '-', '~', '<', '='} }
func (*observer) Parse(parent ast.Node, reader text.Reader, context parser.Context) ast.Node {
	for node := parent; node != nil; node = node.Parent() {
		if opaque, ok := node.(interface{ ReviewOpaque() bool }); ok && opaque.ReviewOpaque() {
			return nil
		}
	}
	line, segment := reader.PeekLine()
	for _, form := range forms {
		if bytes.HasPrefix(line, []byte(form.open)) {
			positions, _ := context.Get(candidatesKey).([]int)
			if len(positions) <= MaxMarks {
				context.Set(candidatesKey, append(positions, segment.Start))
			}
			break
		}
	}
	for _, form := range forms {
		if bytes.HasPrefix(line, []byte(form.close)) {
			positions, _ := context.Get(closersKey).([]int)
			if len(positions) <= MaxMarks*2 {
				context.Set(closersKey, append(positions, segment.Start))
			}
			break
		}
	}
	if bytes.HasPrefix(line, []byte("~>")) {
		positions, _ := context.Get(separatorsKey).([]int)
		if len(positions) <= MaxMarks*2 {
			context.Set(separatorsKey, append(positions, segment.Start))
		}
	}
	// Observing never consumes input or changes Markdown's grammar.
	return nil
}

type observeExtension struct{}

func (observeExtension) Extend(markdown goldmark.Markdown) {
	markdown.Parser().AddOptions(parser.WithInlineParsers(util.Prioritized(&observer{}, 40)))
}

func escaped(source string, at int) bool {
	n := 0
	for at > 0 && source[at-1] == '\\' {
		at--
		n++
	}
	return n%2 == 1
}
func find(source, delimiter string, from, to int) int {
	for from < to {
		offset := strings.Index(source[from:to], delimiter)
		if offset < 0 {
			return -1
		}
		at := from + offset
		if !escaped(source, at) {
			return at
		}
		from = at + 1
	}
	return -1
}

// Scan ignores the metadata prefix ending at skip. Extensions let the caller
// retain its ordinary shortcode grammar without introducing an I/O dependency.
// Every range is a byte offset into the unchanged original source.
func Scan(source string, skip int, extensions ...goldmark.Extender) (Catalog, error) {
	out := Catalog{Marks: []Mark{}, Problems: []Problem{}}
	if len(source) > MaxSource || !utf8.ValidString(source) {
		return out, fmt.Errorf("review requires valid UTF-8 source no larger than 1 MiB")
	}
	if skip < 0 || skip > len(source) || !utf8.ValidString(source[:skip]) {
		return out, fmt.Errorf("invalid review metadata boundary")
	}
	masked := []byte(source)
	for i := 0; i < skip; i++ {
		if masked[i] != '\n' && masked[i] != '\r' {
			masked[i] = ' '
		}
	}
	context := parser.NewContext()
	all := append([]goldmark.Extender{extension.GFM}, extensions...)
	all = append(all, observeExtension{})
	goldmark.New(goldmark.WithExtensions(all...)).Parser().Parse(text.NewReader(masked), parser.WithContext(context))
	positions, _ := context.Get(candidatesKey).([]int)
	closers, _ := context.Get(closersKey).([]int)
	separators, _ := context.Get(separatorsKey).([]int)
	if len(closers) > MaxMarks*2 || len(separators) > MaxMarks*2 {
		return out, fmt.Errorf("review exceeds its delimiter limit")
	}
	validClose := make(map[int]bool, len(closers))
	for _, at := range closers {
		validClose[at] = true
	}
	validSeparator := make(map[int]bool, len(separators))
	for _, at := range separators {
		validSeparator[at] = true
	}
	sort.Ints(positions)
	unique := positions[:0]
	for _, at := range positions {
		if len(unique) == 0 || unique[len(unique)-1] != at {
			unique = append(unique, at)
		}
	}
	positions = unique
	if len(positions) > MaxMarks {
		return out, fmt.Errorf("review exceeds the limit of %d marks", MaxMarks)
	}
	for i := 0; i < len(positions); i++ {
		from := positions[i]
		if from < skip {
			continue
		}
		for _, form := range forms {
			if !strings.HasPrefix(source[from:], form.open) {
				continue
			}
			bodyFrom := from + len(form.open)
			limit := min(len(source), bodyFrom+MaxBody+len(form.close))
			closeAt := find(source, form.close, bodyFrom, limit)
			for closeAt >= 0 && !validClose[closeAt] {
				closeAt = find(source, form.close, closeAt+1, limit)
			}
			if closeAt < 0 {
				out.Problems = append(out.Problems, Problem{from, "An incomplete or oversized review mark was retained literally."})
				break
			}
			to := closeAt + len(form.close)
			if i+1 < len(positions) && positions[i+1] < to {
				out.Problems = append(out.Problems, Problem{from, "Nested review marks were retained literally."})
				for i+1 < len(positions) && positions[i+1] < to {
					i++
				}
				break
			}
			mark := Mark{Kind: form.kind, From: from, To: to, BodyFrom: bodyFrom, BodyTo: closeAt, Separator: -1, Raw: source[from:to]}
			body := source[bodyFrom:closeAt]
			if form.kind == Replacement {
				mark.Separator = find(source, "~>", bodyFrom, closeAt)
				for mark.Separator >= 0 && !validSeparator[mark.Separator] {
					mark.Separator = find(source, "~>", mark.Separator+1, closeAt)
				}
				if mark.Separator < 0 {
					out.Problems = append(out.Problems, Problem{from, "A replacement without its separator was retained literally."})
					break
				}
				mark.Before = source[bodyFrom:mark.Separator]
				mark.After = source[mark.Separator+2 : closeAt]
			} else if form.kind == Addition {
				mark.After = body
			} else {
				mark.Before = body
			}
			out.Marks = append(out.Marks, mark)
			break
		}
	}
	return out, nil
}

// Resolve returns delimiter-only edits wherever the retained source can stay
// in place. Applying a whole-source replacement would lose mixed line endings.
func Resolve(mark Mark, accept bool) []Edit {
	unwrap := func() []Edit { return []Edit{{From: mark.From, To: mark.BodyFrom}, {From: mark.BodyTo, To: mark.To}} }
	switch mark.Kind {
	case Addition:
		if accept {
			return unwrap()
		}
	case Deletion:
		if !accept {
			return unwrap()
		}
	case Highlight:
		return unwrap()
	case Replacement:
		if accept {
			return []Edit{{From: mark.From, To: mark.Separator + 2}, {From: mark.BodyTo, To: mark.To}}
		}
		return []Edit{{From: mark.From, To: mark.BodyFrom}, {From: mark.Separator, To: mark.To}}
	}
	return []Edit{{From: mark.From, To: mark.To}}
}

// Apply requires ordered, nonoverlapping ranges. It performs no I/O.
func Apply(source string, edits []Edit) (string, error) {
	if !utf8.ValidString(source) {
		return "", fmt.Errorf("invalid review source encoding")
	}
	var out strings.Builder
	at := 0
	for _, edit := range edits {
		if edit.From < at || edit.To < edit.From || edit.To > len(source) || edit.From < len(source) && !utf8.RuneStart(source[edit.From]) || edit.To < len(source) && !utf8.RuneStart(source[edit.To]) || !utf8.ValidString(edit.Insert) {
			return "", fmt.Errorf("invalid review edit range")
		}
		out.WriteString(source[at:edit.From])
		out.WriteString(edit.Insert)
		at = edit.To
	}
	out.WriteString(source[at:])
	return out.String(), nil
}

// Propose validates the persisted form before it can enter a document.
func Propose(kind Kind, before, after string) (string, error) {
	for _, form := range forms {
		if form.kind == kind {
			body := before
			if kind == Addition {
				body = after
			} else if kind == Replacement {
				body = before + "~>" + after
			}
			if len(body) > MaxBody || !utf8.ValidString(body) {
				return "", fmt.Errorf("the proposed body is invalid, oversized or contains its closing delimiter")
			}
			raw := form.open + body + form.close
			catalog, err := Scan(raw, 0)
			if err != nil || len(catalog.Marks) != 1 || len(catalog.Problems) != 0 || catalog.Marks[0].To != len(raw) {
				return "", fmt.Errorf("the proposed delimiters are ambiguous in Markdown")
			}
			if kind == Replacement && (catalog.Marks[0].Before != before || catalog.Marks[0].After != after) {
				return "", fmt.Errorf("the replacement separator is ambiguous")
			}
			return raw, nil
		}
	}
	return "", fmt.Errorf("unknown review mark kind")
}
