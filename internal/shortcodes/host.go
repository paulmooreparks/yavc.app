// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes

import (
	"regexp"
	"strings"
)

// HostShortcode is a shortcode that the application hosting the editor
// draws itself (docs/content-workspace-contract.md). The engine reads where
// it starts and ends and writes a placeholder in its place; the page asks
// the host for the drawing and puts it in the placeholder.
//
// A built-in shortcode or one the document defines keeps its name. The host
// is offered a use of a built-in's name only when the built-in cannot draw
// that use, so a document written for the host's own reading of the name is
// still drawn.
type HostShortcode struct {
	Name string `json:"name"`
	// Kind is inline, block, container or span, as for a built-in.
	Kind string `json:"kind"`
	// Prefix is one character that writes the shortcode in a shorter form:
	// with the prefix @, {{@value}} is the shortcode with value as its
	// arguments. Only an inline shortcode may have one.
	Prefix string `json:"prefix,omitempty"`
	// Managed says the host keeps the shortcode's content with a tool of
	// its own, so the page shows it and does not edit it.
	Managed bool `json:"managed,omitempty"`
	// Literal says a container's body is markup, not Markdown: it is read
	// whole, blank lines and all, and drawn as it is. One table of the
	// strict shape in it is edited as a table (internal/pageview).
	Literal bool `json:"literal,omitempty"`
	// ColorAttribute is the name of an attribute the host keeps equal to
	// a table cell's colour beside its style, in a literal container's
	// table (a wiki's data-highlight-colour). The page writes, changes
	// and removes it with the colour; the engine only carries it.
	ColorAttribute string `json:"colorAttribute,omitempty"`
	// ColorClassPrefix is the beginning of the class names the host uses
	// for a cell's colour in such a table (a wiki's highlight-grey). The
	// page removes those classes when the colour is changed or removed.
	ColorClassPrefix string `json:"colorClassPrefix,omitempty"`
}

const (
	// HostLimit is the most host shortcodes one document reads.
	HostLimit = 256
	// hostPrefixes are the characters a host shortcode's short form may
	// begin with. None of them begins a shortcode's name or closes one.
	hostPrefixes = "@#~!$%&+=?^"
)

var (
	hostNameRe   = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
	hostPrefixRe = regexp.MustCompile(`^\{\{([@#~!$%&+=?^])([^{}\s]+)\}\}`)
)

// WithHosts gives a document's registry the host's shortcodes. An entry
// with a name that is not a shortcode's, a kind that is not one of the
// four, or a name already given is left out, and so is every entry past
// HostLimit. A nil registry becomes one that holds only the host's.
func (r *MacroRegistry) WithHosts(hosts []HostShortcode) *MacroRegistry {
	if r == nil {
		r = &MacroRegistry{Entries: []MacroEntry{}, definitions: map[string]MacroDefinition{}, problems: map[string]string{}}
	}
	r.hosts = map[string]HostShortcode{}
	r.prefixes = map[byte]string{}
	for _, h := range hosts {
		if len(r.hosts) >= HostLimit {
			break
		}
		if len(h.Name) > 64 || !hostNameRe.MatchString(h.Name) || h.Name == "define" || h.Name == "param" || h.Name == "arg" || h.Name == "content" {
			continue
		}
		switch h.Kind {
		case "inline", "block", "container", "span":
		default:
			continue
		}
		if _, dup := r.hosts[h.Name]; dup {
			continue
		}
		if len(h.Prefix) == 1 && h.Kind == "inline" && strings.Contains(hostPrefixes, h.Prefix) && r.prefixes[h.Prefix[0]] == "" {
			r.prefixes[h.Prefix[0]] = h.Name
		} else {
			h.Prefix = ""
		}
		r.hosts[h.Name] = h
	}
	return r
}

// host is the host's shortcode of a name. A name the document defines, or
// tried to, is the document's.
func (r *MacroRegistry) host(name string) (HostShortcode, bool) {
	if r == nil || r.hosts == nil {
		return HostShortcode{}, false
	}
	if _, ok := r.definitions[name]; ok {
		return HostShortcode{}, false
	}
	if r.problems[name] != "" {
		return HostShortcode{}, false
	}
	h, ok := r.hosts[name]
	return h, ok
}

// hostOnly is the host's shortcode of a name no built-in has, which the
// host's kind therefore says how to read.
func (r *MacroRegistry) hostOnly(name string) (HostShortcode, bool) {
	if table[name] != nil {
		return HostShortcode{}, false
	}
	return r.host(name)
}

// hostPairs says whether a host shortcode can be written around words in a
// line. A container can, as a built-in container with a span form can.
func hostPairs(h HostShortcode) bool { return h.Kind == "span" || h.Kind == "container" }

// readTag reads the shortcode that begins a line of text: {{name}},
// {{name:arguments}}, {{/name}}, or a host shortcode's short form.
func readTag(line []byte, registry *MacroRegistry) (call Call, closing bool, raw string, ok bool) {
	if m := tagRe.FindSubmatch(line); m != nil {
		return NewCall(string(m[2]), string(m[3])), len(m[1]) > 0, string(m[0]), true
	}
	if registry == nil || len(registry.prefixes) == 0 {
		return Call{}, false, "", false
	}
	m := hostPrefixRe.FindSubmatch(line)
	if m == nil {
		return Call{}, false, "", false
	}
	name := registry.prefixes[m[1][0]]
	if _, ok := registry.host(name); !ok {
		return Call{}, false, "", false
	}
	return NewCall(name, string(m[2])), false, string(m[0]), true
}

// HostSpan says whether an inline shortcode is a host's paired span with
// its match found, and gives its name.
func HostSpan(n *Inline) (name string, ok bool) {
	if !n.Matched {
		return "", false
	}
	h, ok := n.registry.hostOnly(n.Call.Name)
	if !ok || !hostPairs(h) || h.Managed {
		return "", false
	}
	return h.Name, true
}

// HostSpanOpen is a host span's opening as it is written back: the opening
// as it was read when that is one shortcode of the name, and the bare name
// otherwise.
func HostSpanOpen(name, open string) (string, bool) {
	if !hostNameRe.MatchString(name) {
		return "", false
	}
	if m := tagRe.FindStringSubmatch(open); m != nil && m[0] == open && m[1] == "" && m[2] == name && !strings.ContainsAny(open, "\r\n") {
		return open, true
	}
	return "{{" + name + "}}", true
}

// The placeholder a host shortcode is drawn as. The page finds it by its
// data-host-shortcode attribute, asks the host to draw the shortcode, and
// puts the drawing in its place; until then, and where no host draws it,
// an inline or block shortcode shows as it is written.
func hostAttributes(name, kind, args, source string, managed bool) string {
	out := ` class="sc-host" data-host-shortcode="` + Esc(name) + `" data-host-kind="` + kind + `" data-host-args="` + Esc(args) + `" data-host-source="` + Esc(source) + `"`
	if managed {
		out += ` data-host-managed="true"`
	}
	return out
}

func hostInline(h HostShortcode, c Call, raw string) string {
	return `<span` + hostAttributes(h.Name, "inline", c.Args, raw, h.Managed) + `><code class="sc-host-source">` + Esc(raw) + `</code></span>`
}

func hostBlock(h HostShortcode, c Call, raw string) string {
	return `<div` + hostAttributes(h.Name, "block", c.Args, raw, h.Managed) + `><code class="sc-host-source">` + Esc(raw) + `</code></div>`
}

func hostSpanOpen(h HostShortcode, c Call, raw string) string {
	return `<span` + hostAttributes(h.Name, "span", c.Args, raw, h.Managed) + `><span class="sc-host-body">`
}

const hostSpanClose = `</span></span>`

func hostContainerOpen(h HostShortcode, c Call) string {
	return `<div` + hostAttributes(h.Name, "container", c.Args, OpenLine(c.Name, c.Args), h.Managed) + `><div class="sc-host-body">`
}

const hostContainerClose = `</div></div>`

// hostContainer is a host's container as an editor reads one: the
// placeholder before and after its body.
func (r *MacroRegistry) hostContainer(c Call) (Container, bool) {
	h, ok := r.host(c.Name)
	if !ok || h.Kind != "container" || h.Managed {
		return Container{}, false
	}
	if d := table[c.Name]; d != nil && (d.kind != container || sourceOnly[d.name]) {
		return Container{}, false
	}
	return Container{Name: c.Name, Args: c.Args, Before: hostContainerOpen(h, c), After: hostContainerClose, Literal: h.Literal && table[c.Name] == nil}, true
}

// literalHost says whether a name is a host container whose body is
// markup, read whole; only a name no built-in has can be one.
func (r *MacroRegistry) literalHost(name string) bool {
	h, ok := r.hostOnly(name)
	return ok && h.Kind == "container" && h.Literal
}
