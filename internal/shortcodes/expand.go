// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes

import (
	"bytes"
	"strings"

	"github.com/yuin/goldmark/ast"
	"yavc.app/internal/frontmatter"
)

// ExpandProblem is a use of a document's own shortcode that could not be
// expanded and was left as it is written. At is a byte offset in the text
// ExpandDocument was given, after its line endings were made LF.
type ExpandProblem struct {
	Name    string `json:"name"`
	Message string `json:"message"`
	At      int    `json:"at"`
}

// ExpandDocument is a document's Markdown with every use of a shortcode the
// document or the shared file defines replaced by what it stands for, and
// with the definitions themselves taken out. It is for a destination that
// knows the built-in shortcodes and cannot know a document's own
// (docs/shortcode-destinations.md). The front matter is kept as it is, and
// line endings are LF. The rules are the ones the engine draws by: the same
// arguments and defaults, the same eight levels and 256 KiB, and nothing in
// a code block, a quoted example or a host's literal container is touched.
// A use that cannot be expanded stays as written and is reported.
func ExpandDocument(source, shared string, hosts []HostShortcode) (string, []ExpandProblem) {
	source = strings.ReplaceAll(source, "\r\n", "\n")
	registry := DiscoverMacros(source, shared).WithHosts(hosts)
	head := frontmatter.End(source)
	body := source[head:]
	src := []byte(body)
	doc := registry.parse(src)
	type edit struct {
		from, to int
		value    string
	}
	var edits []edit
	problems := []ExpandProblem{}
	budget := &MacroBudget{}
	// lineEnd is the end of the line that starts at or after at, without
	// its line ending.
	lineEnd := func(at int) int {
		if end := bytes.IndexByte(src[at:], '\n'); end >= 0 {
			return at + end
		}
		return len(src)
	}
	_ = ast.Walk(doc, func(n ast.Node, enter bool) (ast.WalkStatus, error) {
		if !enter {
			return ast.WalkContinue, nil
		}
		var call Call
		inner, from, to := "", 0, 0
		switch v := n.(type) {
		case *Block:
			if v.Call.Name == "define" {
				// A definition is read only at the top of a document, so
				// only there is it one. A complete one goes, with the
				// line ending after it.
				if v.Parent() == doc && v.Closed && v.BodyStart <= v.BodyEnd {
					end := lineEnd(v.BodyEnd)
					if end < len(src) {
						end++
					}
					edits = append(edits, edit{v.Pos(), end, ""})
				}
				return ast.WalkSkipChildren, nil
			}
			if why := registry.problems[v.Call.Name]; why != "" {
				problems = append(problems, ExpandProblem{Name: v.Call.Name, Message: why, At: head + v.Pos()})
				return ast.WalkSkipChildren, nil
			}
			if _, ok := registry.definition(v.Call.Name); !ok {
				return ast.WalkContinue, nil
			}
			if !v.Closed {
				problems = append(problems, ExpandProblem{Name: v.Call.Name, Message: "shortcode \"" + v.Call.Name + "\" needs its closing line", At: head + v.Pos()})
				return ast.WalkSkipChildren, nil
			}
			call, inner, from, to = v.Call, body[v.BodyStart:v.BodyEnd], v.Pos(), lineEnd(v.BodyEnd)
		case *Inline:
			if v.Closing {
				return ast.WalkContinue, nil
			}
			if why := registry.problems[v.Call.Name]; why != "" {
				problems = append(problems, ExpandProblem{Name: v.Call.Name, Message: why, At: head + v.Pos()})
				return ast.WalkSkipChildren, nil
			}
			d, ok := registry.definition(v.Call.Name)
			if !ok {
				return ast.WalkContinue, nil
			}
			if d.Container {
				problems = append(problems, ExpandProblem{Name: v.Call.Name, Message: "shortcode \"" + v.Call.Name + "\" opens on its own line", At: head + v.Pos()})
				return ast.WalkSkipChildren, nil
			}
			call, from, to = v.Call, v.Pos(), v.Pos()+len(v.Raw)
		default:
			return ast.WalkContinue, nil
		}
		value, err := registry.expand(call, inner, 0, budget)
		if err != nil {
			problems = append(problems, ExpandProblem{Name: call.Name, Message: err.Error(), At: head + from})
			return ast.WalkSkipChildren, nil
		}
		// A block's expansion ends as the block did, without a line ending
		// of its own, so the line after it stays where it was.
		if _, block := n.(*Block); block {
			value = strings.TrimRight(value, "\n")
		}
		edits = append(edits, edit{from, to, value})
		return ast.WalkSkipChildren, nil
	})
	for i := len(edits) - 1; i >= 0; i-- {
		e := edits[i]
		body = body[:e.from] + e.value + body[e.to:]
	}
	return source[:head] + body, problems
}
