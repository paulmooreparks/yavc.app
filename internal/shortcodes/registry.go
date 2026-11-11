// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes

import (
	"bytes"
	"fmt"
	"sort"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	xhtml "golang.org/x/net/html"
	"yavc.app/internal/attrblock"
	"yavc.app/internal/frontmatter"
)

// MacroEntry retains the original declaration for source editing. Offsets
// are bytes in its own source, not in any expanded document.
type MacroEntry struct {
	Name       string          `json:"name"`
	Body       string          `json:"body"`
	From       int             `json:"from"`
	To         int             `json:"to"`
	Shared     bool            `json:"shared"`
	Problem    string          `json:"problem,omitempty"`
	Definition MacroDefinition `json:"definition"`
}

// MacroRegistry is immutable after discovery and belongs to one document.
// Shared definitions load first; a document can override a shared name.
type MacroRegistry struct {
	Entries     []MacroEntry `json:"entries"`
	definitions map[string]MacroDefinition
	problems    map[string]string
	// hosts and prefixes are the host application's shortcodes (host.go).
	hosts    map[string]HostShortcode
	prefixes map[byte]string
	// outer is the whole document, when a part of it is rendered on its
	// own (a container's body, for the page view), so a shortcode that
	// reads the document, such as the contents list, reads all of it.
	outer *Outer
}

// Outer is a whole document as parsed, with the text it was parsed from.
type Outer struct {
	Doc ast.Node
	Src []byte
}

// Within is the registry for rendering a part of doc on its own: the same
// registry, with the whole document for the shortcodes that read it.
func (r *MacroRegistry) Within(outer *Outer) *MacroRegistry {
	if r == nil {
		r = &MacroRegistry{Entries: []MacroEntry{}, definitions: map[string]MacroDefinition{}, problems: map[string]string{}}
	}
	within := *r
	within.outer = outer
	return &within
}

// Document is the document a shortcode reads: the whole one, when a part
// is being rendered on its own, and otherwise the one it is in.
func (r *MacroRegistry) Document(doc ast.Node, src []byte) (ast.Node, []byte) {
	if r != nil && r.outer != nil && r.outer.Doc != nil {
		return r.outer.Doc, r.outer.Src
	}
	return doc, src
}

func (r *MacroRegistry) definition(name string) (MacroDefinition, bool) {
	if r == nil {
		return MacroDefinition{}, false
	}
	d, ok := r.definitions[name]
	return d, ok
}

func macroSource(source string) []byte {
	data := []byte(source)
	for i := 0; i < frontmatter.End(source); i++ {
		if data[i] != '\n' && data[i] != '\r' {
			data[i] = ' '
		}
	}
	return data
}

// DiscoverMacros reads only complete, top-level declarations. Markdown's
// parser excludes examples in fences, quotes, lists and indented code.
func DiscoverMacros(source, shared string) *MacroRegistry {
	r := &MacroRegistry{Entries: []MacroEntry{}, definitions: map[string]MacroDefinition{}, problems: map[string]string{}}
	total := 0
	for tier, input := range []string{shared, source} {
		seen := map[string]bool{}
		doc := goldmark.New(goldmark.WithExtensions(Extension)).Parser().Parse(text.NewReader(macroSource(input)))
		for n := doc.FirstChild(); n != nil; n = n.NextSibling() {
			b, ok := n.(*Block)
			if !ok || b.Call.Name != "define" {
				continue
			}
			name := strings.TrimSpace(b.Call.Args)
			entry := MacroEntry{Name: name, From: b.BodyStart, To: b.BodyEnd, Shared: tier == 0}
			if b.Closed && b.BodyStart <= b.BodyEnd {
				entry.Body = input[b.BodyStart:b.BodyEnd]
			}
			d, err := ParseMacroDefinition(name, entry.Body)
			if err == nil && !d.Container {
				template := goldmark.New(goldmark.WithExtensions(Extension)).Parser().Parse(text.NewReader([]byte(d.Template)))
				d.Inline = template.ChildCount() == 1 && template.FirstChild().Kind() == ast.KindParagraph
			}
			if !b.Closed {
				err = fmt.Errorf("definition %q needs {{/define}} on its own line", name)
			}
			total += len(entry.Body)
			if total > MacroLimit || len(r.Entries) >= 128 {
				err = fmt.Errorf("shortcode declarations exceed the document budget (128 definitions or 256 KiB)")
			}
			if seen[name] {
				err = fmt.Errorf("duplicate shortcode definition %q", name)
			}
			seen[name] = true
			if err != nil {
				entry.Problem = err.Error()
				delete(r.definitions, name)
				r.problems[name] = entry.Problem
			} else {
				entry.Definition = d
				r.definitions[name] = d
				delete(r.problems, name)
			}
			r.Entries = append(r.Entries, entry)
		}
	}
	// Find template dependencies using the same syntax as invocations.
	// Code examples and escaped braces cannot create a dependency.
	graph := map[string][]string{}
	for name, d := range r.definitions {
		parsed := r.parse([]byte(d.Template))
		ast.Walk(parsed, func(n ast.Node, enter bool) (ast.WalkStatus, error) {
			if !enter {
				return ast.WalkContinue, nil
			}
			called := ""
			switch v := n.(type) {
			case *Inline:
				if !v.Closing {
					called = v.Call.Name
				}
			case *Block:
				called = v.Call.Name
			}
			if _, ok := r.definitions[called]; ok {
				graph[name] = append(graph[name], called)
			}
			return ast.WalkContinue, nil
		})
	}
	state := map[string]int{}
	var visit func(string) bool
	visit = func(name string) bool {
		if state[name] == 1 {
			return true
		}
		if state[name] == 2 {
			return r.problems[name] != ""
		}
		state[name] = 1
		bad := false
		for _, called := range graph[name] {
			if visit(called) {
				bad = true
			}
		}
		state[name] = 2
		if bad {
			r.problems[name] = "shortcode dependency cycle involving " + name
		}
		return bad
	}
	names := make([]string, 0, len(r.definitions))
	for name := range r.definitions {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		visit(name)
	}
	for i := range r.Entries {
		if why := r.problems[r.Entries[i].Name]; why != "" {
			r.Entries[i].Problem = why
		}
	}
	return r
}

func (r *MacroRegistry) parse(src []byte) ast.Node {
	return goldmark.New(goldmark.WithExtensions(&ext{registry: r})).Parser().Parse(text.NewReader(src))
}

// MacroBudget counts every generated byte, including intermediate nested
// expansions and repeated invocations in the same rendering request.
type MacroBudget struct{ Used int }

func (r *MacroRegistry) expand(call Call, body string, depth int, budget *MacroBudget) (string, error) {
	if depth >= 8 {
		return "", fmt.Errorf("shortcode expansion exceeds eight levels")
	}
	if why := r.problems[call.Name]; why != "" {
		return "", fmt.Errorf("%s", why)
	}
	d, ok := r.definition(call.Name)
	if !ok {
		return "", fmt.Errorf("undefined shortcode %q", call.Name)
	}
	args, err := macroArguments(d, call.Args)
	if err != nil {
		return "", err
	}
	value, err := d.Substitute(args, body)
	if err != nil {
		return "", err
	}
	budget.Used += len(value)
	if budget.Used > MacroLimit {
		return "", fmt.Errorf("shortcode expansions exceed 256 KiB in this document")
	}
	return r.expandText(value, depth+1, budget)
}

func (r *MacroRegistry) expandText(source string, depth int, budget *MacroBudget) (string, error) {
	src := []byte(source)
	doc := r.parse(src)
	type edit struct {
		from, to int
		value    string
	}
	var edits []edit
	err := ast.Walk(doc, func(n ast.Node, enter bool) (ast.WalkStatus, error) {
		if !enter {
			return ast.WalkContinue, nil
		}
		var call Call
		body, from, to := "", 0, 0
		switch v := n.(type) {
		case *Block:
			if v.Call.Name == "define" {
				return ast.WalkStop, fmt.Errorf("a shortcode template cannot declare definitions")
			}
			if _, ok := r.definition(v.Call.Name); !ok {
				return ast.WalkContinue, nil
			}
			if !v.Closed {
				return ast.WalkStop, fmt.Errorf("shortcode %q needs its closing line", v.Call.Name)
			}
			call, body, from = v.Call, source[v.BodyStart:v.BodyEnd], v.Pos()
			end := bytes.IndexByte(src[v.BodyEnd:], '\n')
			to = len(src)
			if end >= 0 {
				to = v.BodyEnd + end
			}
		case *Inline:
			if v.Closing {
				return ast.WalkContinue, nil
			}
			if _, ok := r.definition(v.Call.Name); !ok {
				return ast.WalkContinue, nil
			}
			d, _ := r.definition(v.Call.Name)
			if d.Container {
				return ast.WalkStop, fmt.Errorf("shortcode %q opens on its own line", v.Call.Name)
			}
			call, from, to = v.Call, v.Pos(), v.Pos()+len(v.Raw)
		default:
			return ast.WalkContinue, nil
		}
		value, err := r.expand(call, body, depth, budget)
		if err != nil {
			return ast.WalkStop, err
		}
		edits = append(edits, edit{from, to, value})
		return ast.WalkSkipChildren, nil
	})
	if err != nil {
		return "", err
	}
	for i := len(edits) - 1; i >= 0; i-- {
		e := edits[i]
		source = source[:e.from] + e.value + source[e.to:]
	}
	return source, nil
}

func macroArguments(d MacroDefinition, source string) (map[string]string, error) {
	out, pos := map[string]string{}, 0
	for strings.TrimSpace(source) != "" {
		source = strings.TrimLeft(source, " \t")
		key := ""
		if m := keyRe.FindStringSubmatch(source); m != nil {
			key = m[1]
			source = source[len(m[0]):]
		}
		var value strings.Builder
		if strings.HasPrefix(source, "\"") {
			source = source[1:]
			closed := false
			for len(source) > 0 {
				c := source[0]
				source = source[1:]
				if c == '"' {
					closed = true
					break
				}
				if c == '\\' {
					if source == "" {
						break
					}
					c = source[0]
					source = source[1:]
				}
				value.WriteByte(c)
			}
			if !closed || (source != "" && source[0] != ' ' && source[0] != '\t') {
				return nil, fmt.Errorf("invalid shortcode argument quoting")
			}
		} else {
			i := strings.IndexAny(source, " \t")
			if i < 0 {
				i = len(source)
			}
			value.WriteString(source[:i])
			source = source[i:]
		}
		if key == "" {
			if pos >= len(d.Parameters) {
				return nil, fmt.Errorf("too many positional arguments for %s", d.Name)
			}
			key = d.Parameters[pos].Name
			pos++
		}
		if _, exists := out[key]; exists {
			return nil, fmt.Errorf("duplicate argument %q", key)
		}
		out[key] = value.String()
	}
	return out, nil
}

// ContainerOf provides the template's rendered frame for rich body editing.
// A content slot embedded in an inline expression is edited as source.
func (r *MacroRegistry) ContainerOf(line string) (Container, bool) {
	m := lineRe.FindStringSubmatch(line)
	if m == nil {
		return Container{}, false
	}
	d, ok := r.definition(m[1])
	if !ok {
		// A container the host draws has the host's placeholder as its
		// frame. A line the built-in of the name can draw is the
		// built-in's, which the caller reads with the package's ContainerOf.
		if _, builtin := ContainerOf(line); builtin {
			return Container{}, false
		}
		return r.hostContainer(NewCall(m[1], m[2]))
	}
	if !d.Container || r.problems[d.Name] != "" {
		return Container{}, false
	}
	standalone := false
	for _, l := range strings.Split(d.Template, "\n") {
		if strings.TrimSpace(l) == "{{content}}" {
			standalone = true
		}
	}
	if !standalone {
		return Container{}, false
	}
	const slot = `<div class="yavc-macro-content-slot"></div>`
	c := NewCall(m[1], m[2])
	rendered, err := r.render(c, "\n"+slot+"\n", false, &MacroBudget{})
	if err != nil || strings.Count(rendered, slot) != 1 {
		return Container{}, false
	}
	// The literal marker can occur inside a comment or an HTML attribute.
	// Only a real element can hold ProseMirror's editable content DOM.
	parsed, err := xhtml.Parse(strings.NewReader(rendered))
	if err != nil {
		return Container{}, false
	}
	markers := 0
	var inspect func(*xhtml.Node)
	inspect = func(node *xhtml.Node) {
		if node.Type == xhtml.ElementNode && node.Data == "div" {
			for _, attr := range node.Attr {
				if attr.Key == "class" && attr.Val == "yavc-macro-content-slot" {
					markers++
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			inspect(child)
		}
	}
	inspect(parsed)
	if markers != 1 {
		return Container{}, false
	}
	parts := strings.SplitN(rendered, slot, 2)
	return Container{Name: c.Name, Args: c.Args, Before: parts[0], After: parts[1]}, true
}

func (r *MacroRegistry) render(call Call, body string, inline bool, budget *MacroBudget, exporting ...bool) (string, error) {
	expanded, err := r.expand(call, body, 0, budget)
	if err != nil {
		return "", err
	}
	md := goldmark.New(goldmark.WithExtensions(extension.GFM, Extension, attrblock.Extension), goldmark.WithRendererOptions(html.WithUnsafe()))
	var out bytes.Buffer
	parsed := md.Parser().Parse(text.NewReader([]byte(expanded)))
	if len(exporting) > 0 && exporting[0] {
		if err := PruneExport(parsed); err != nil {
			return "", err
		}
	}
	if err := md.Renderer().Render(&out, []byte(expanded), parsed); err != nil {
		return "", err
	}
	result := out.String()
	if inline {
		parsed := md.Parser().Parse(text.NewReader([]byte(expanded)))
		if parsed.ChildCount() != 1 || parsed.FirstChild().Kind() != ast.KindParagraph {
			return "", fmt.Errorf("shortcode %q must be written on its own line", call.Name)
		}
		result = strings.TrimSuffix(strings.TrimPrefix(result, "<p>"), "</p>\n")
	}
	return result, nil
}
