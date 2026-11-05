// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

const MacroLimit = 256 * 1024

// MacroParameter is declarative form metadata. Values remain literal text.
type MacroParameter struct {
	Name    string `json:"name"`
	Default string `json:"default"`
	Help    string `json:"help"`
}

// MacroDefinition is a validated template. Source discovery and recursive
// expansion belong to the document registry, which is a separate layer.
type MacroDefinition struct {
	Name       string           `json:"name"`
	Template   string           `json:"template"`
	Parameters []MacroParameter `json:"parameters"`
	Container  bool             `json:"container"`
	Inline     bool             `json:"inline"`
}

var macroName = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
var macroSlot = regexp.MustCompile(`\{\{(arg:([a-z][a-z0-9-]*)|content)\}\}`)

func reservedMacro(name string) bool {
	return table[name] != nil || name == "define" || name == "param" || name == "arg" || name == "content"
}

// ParseMacroDefinition validates one definition body, preserving its template
// bytes except for whole parameter declaration lines. It does not run code,
// parse HTML or read shared files.
func ParseMacroDefinition(name, body string) (MacroDefinition, error) {
	d := MacroDefinition{Name: name}
	if !macroName.MatchString(name) || reservedMacro(name) {
		return d, fmt.Errorf("invalid or reserved shortcode name %q", name)
	}
	if len(body) > MacroLimit {
		return d, fmt.Errorf("shortcode definition exceeds 256 KiB")
	}
	declared := map[string]bool{}
	var template strings.Builder
	for _, line := range strings.SplitAfter(body, "\n") {
		m := lineRe.FindStringSubmatch(line)
		if m == nil || m[1] != "param" {
			template.WriteString(line)
			continue
		}
		// NewCall accepts the built-in shortcode quoting grammar. Reject
		// incomplete strings here so declarations cannot silently change.
		quoted, escaped := false, false
		for _, ch := range m[2] {
			if escaped {
				escaped = false
			} else if quoted && ch == '\\' {
				escaped = true
			} else if ch == '"' {
				quoted = !quoted
			}
		}
		if quoted || escaped {
			return d, fmt.Errorf("unclosed parameter string")
		}
		call := NewCall("param", m[2])
		if len(call.Positional) != 1 || !macroName.MatchString(call.Positional[0]) {
			return d, fmt.Errorf("parameter needs one valid name")
		}
		key := call.Positional[0]
		if declared[key] {
			return d, fmt.Errorf("duplicate parameter %q", key)
		}
		for attr := range call.Named {
			if attr != "default" && attr != "help" {
				return d, fmt.Errorf("unknown parameter property %q", attr)
			}
		}
		declared[key] = true
		d.Parameters = append(d.Parameters, MacroParameter{Name: key, Default: call.Named["default"], Help: call.Named["help"]})
	}
	d.Template = template.String()
	content := 0
	for _, m := range macroSlot.FindAllStringSubmatch(d.Template, -1) {
		if m[1] == "content" {
			content++
		} else if !declared[m[2]] {
			return d, fmt.Errorf("undeclared parameter %q", m[2])
		}
	}
	if content > 1 {
		return d, fmt.Errorf("a shortcode may use content at most once")
	}
	d.Container = content == 1
	self := false
	parsed := goldmark.New(goldmark.WithExtensions(Extension)).Parser().Parse(text.NewReader([]byte(d.Template)))
	ast.Walk(parsed, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering {
			if call, ok := node.(*Inline); ok && !call.Closing && call.Call.Name == name {
				self = true
			}
		}
		return ast.WalkContinue, nil
	})
	if self {
		return d, fmt.Errorf("shortcode %q refers to itself", name)
	}
	return d, nil
}

// Substitute replaces declared slots once. The caller must apply the shared
// recursion and total-output limits before expanding other macro calls.
// Replacement values are never scanned for slots or executable syntax.
func (d MacroDefinition) Substitute(args map[string]string, content string) (string, error) {
	values := map[string]string{}
	for _, p := range d.Parameters {
		value, ok := args[p.Name]
		if !ok {
			value = p.Default
		}
		if len(value) > MacroLimit {
			return "", fmt.Errorf("shortcode argument exceeds 256 KiB")
		}
		values[p.Name] = value
	}
	for name := range args {
		if _, ok := values[name]; !ok {
			return "", fmt.Errorf("unknown argument %q", name)
		}
	}
	if len(content) > MacroLimit || (!d.Container && content != "") {
		return "", fmt.Errorf("invalid shortcode content")
	}
	var out strings.Builder
	last := 0
	for _, loc := range macroSlot.FindAllStringSubmatchIndex(d.Template, -1) {
		out.WriteString(d.Template[last:loc[0]])
		if d.Template[loc[2]:loc[3]] == "content" {
			out.WriteString(content)
		} else {
			out.WriteString(literalMacroArgument(values[d.Template[loc[4]:loc[5]]]))
		}
		if out.Len() > MacroLimit {
			return "", fmt.Errorf("shortcode expansion exceeds 256 KiB")
		}
		last = loc[1]
	}
	out.WriteString(d.Template[last:])
	if out.Len() > MacroLimit {
		return "", fmt.Errorf("shortcode expansion exceeds 256 KiB")
	}
	return out.String(), nil
}

func literalMacroArgument(value string) string {
	var out strings.Builder
	for _, ch := range value {
		// Character references remain text in Markdown and in an HTML
		// attribute. Backslash escaping alone cannot protect HTML quotes.
		if ch <= ' ' || (ch >= '!' && ch <= '/') || (ch >= ':' && ch <= '@') || (ch >= '[' && ch <= '`') || (ch >= '{' && ch <= '~') {
			fmt.Fprintf(&out, "&#%d;", ch)
		} else {
			out.WriteRune(ch)
		}
	}
	return out.String()
}
