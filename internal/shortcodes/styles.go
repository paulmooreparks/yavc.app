// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package shortcodes

import (
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/text"
	"strings"
	"yavc.app/internal/frontmatter"
)

// StyleBlock identifies a complete top-level style declaration. Offsets are
// source bytes; the browser API converts them to UTF-16 editor positions.
type StyleBlock struct {
	CSS      string
	Slide    bool
	From, To int
}

// StyleBlocks uses the same Markdown grammar as rendering. Code fences,
// indented examples, front matter and quoted examples cannot become styles.
func StyleBlocks(source string) []StyleBlock {
	src := []byte(source)
	end := frontmatter.End(source)
	parsed := append([]byte(nil), src...)
	for i := 0; i < end; i++ {
		if parsed[i] != '\n' && parsed[i] != '\r' {
			parsed[i] = ' '
		}
	}
	doc := goldmark.New(goldmark.WithExtensions(Extension)).Parser().Parse(text.NewReader(parsed))
	result := []StyleBlock{}
	for node := doc.FirstChild(); node != nil; node = node.NextSibling() {
		block, ok := node.(*Block)
		if !ok || !block.Closed || block.Call.Name != "style" || block.BodyStart > block.BodyEnd {
			continue
		}
		slide := false
		for _, word := range strings.Fields(block.Call.Args) {
			if word == "slide" {
				slide = true
			}
		}
		result = append(result, StyleBlock{CSS: source[block.BodyStart:block.BodyEnd], Slide: slide, From: block.BodyStart, To: block.BodyEnd})
	}
	return result
}
