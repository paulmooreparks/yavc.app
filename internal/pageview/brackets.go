// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package pageview

import (
	"reflect"
	"regexp"
	"strings"

	"github.com/yuin/goldmark/text"
)

// Text in brackets, such as a citation written [S2], is a link wherever the
// document defines S2 as a reference, which a part read on its own cannot
// see. Serialize therefore escapes an opening bracket that has a closing
// one after it, and a paragraph written [S2] would not come back as it was
// read, so it was edited as source (DESIGN.md, decision 118). A document
// that defines no references has no such links: there the part is read as
// rich text with its brackets as they were, and a changed block is written
// with the escape left out wherever that reads the same.

// referenceRe is a line that could define a link reference or a footnote.
var referenceRe = regexp.MustCompile(`(?m)^ {0,3}\[[^\]\n]+\]:`)

// definesReferences says whether a document could define a link reference.
func definesReferences(text string) bool { return referenceRe.MatchString(text) }

// bracketsOnly says whether what was written back differs from the part
// only by the escape before an opening bracket.
func bracketsOnly(back, part string) bool {
	if !strings.Contains(back, `\[`) {
		return false
	}
	return layout(strings.ReplaceAll(back, `\[`, "[")) == layout(strings.ReplaceAll(part, `\[`, "["))
}

// relaxAll marks every block of a document that defines no references, for
// blockText to write its brackets plainly.
func relaxAll(nodes []*Node) {
	for _, n := range nodes {
		if n == nil || n.Type == "text" {
			continue
		}
		if n.Attrs == nil {
			n.Attrs = map[string]any{}
		}
		n.Attrs["relax"] = true
		relaxAll(n.Content)
	}
}

// plainBrackets is a block's text with the escape before each opening
// bracket left out, when the text reads the same without it: a bracket
// that would then open a link, a picture, a task's box or anything else
// keeps its escape, since the two readings differ.
func plainBrackets(s string) string {
	if !strings.Contains(s, `\[`) {
		return s
	}
	// A task's box, "[ ]" or "[x]", is read apart from the tree compared
	// below, so its escape always stays.
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) && s[i+1] == '[' {
			box := i+3 < len(s) && s[i+3] == ']' && (s[i+2] == ' ' || s[i+2] == 'x' || s[i+2] == 'X')
			if !box {
				continue
			}
		}
		b.WriteByte(s[i])
	}
	plain := b.String()
	if plain == s {
		return s
	}
	a, okA := readTree(s)
	other, okB := readTree(plain)
	if okA && okB && reflect.DeepEqual(a, other) {
		return plain
	}
	return s
}

// readTree reads text as the editor's blocks, without asking that it be
// written back as it was.
func readTree(s string) ([]*Node, bool) {
	src := []byte(s)
	root := md.Parser().Parse(text.NewReader(src))
	p := parser{src: src}
	var out []*Node
	for n := root.FirstChild(); n != nil; n = n.NextSibling() {
		block, err := p.block(n)
		if err != nil {
			return nil, false
		}
		out = append(out, block)
	}
	return out, len(out) > 0
}
