// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package mdapi

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"html"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/text"
	"yavc.app/internal/frontmatter"
	"yavc.app/internal/shortcodes"
)

type heading struct {
	Title              string `json:"title"`
	Level              int    `json:"level"`
	Depth              int    `json:"depth"`
	Line               int    `json:"line"`
	From               int    `json:"from"`
	End                int    `json:"end"`
	Parent             int    `json:"parent"`
	Previous           int    `json:"previous"`
	Next               int    `json:"next"`
	startByte, endByte int
}

func sourceRevision(source string) string { return fmt.Sprintf("%x", sha256.Sum256([]byte(source))) }

func outline(source string) []heading {
	parsed := []byte(source)
	front := frontmatter.End(strings.ReplaceAll(source, "\r\n", "\n"))
	end, normalized := 0, 0
	for end < len(source) && normalized < front {
		if source[end] != '\r' || end+1 >= len(source) || source[end+1] != '\n' {
			normalized++
		}
		end++
	}
	for i := 0; i < end; i++ {
		if parsed[i] != '\r' && parsed[i] != '\n' {
			parsed[i] = ' '
		}
	}
	md := goldmark.New(goldmark.WithExtensions(extension.GFM, shortcodes.Extension))
	doc := md.Parser().Parse(text.NewReader(parsed))
	entries := []heading{}
	var parents []int
	for node := doc.FirstChild(); node != nil; node = node.NextSibling() {
		h, ok := node.(*ast.Heading)
		if !ok || h.Lines().Len() == 0 {
			continue
		}
		start := h.Lines().At(0).Start
		for start > 0 && source[start-1] != '\n' {
			start--
		}
		var label strings.Builder
		ast.Walk(h, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
			if !entering {
				return ast.WalkContinue, nil
			}
			switch v := n.(type) {
			case *ast.Text:
				label.Write(v.Segment.Value(parsed))
				if v.SoftLineBreak() || v.HardLineBreak() {
					label.WriteByte(' ')
				}
			case *ast.String:
				label.Write(v.Value)
			case *shortcodes.Inline:
				label.WriteString(v.Raw)
			}
			return ast.WalkContinue, nil
		})
		for len(parents) > 0 && entries[parents[len(parents)-1]].Level >= h.Level {
			parents = parents[:len(parents)-1]
		}
		parent := -1
		if len(parents) > 0 {
			parent = parents[len(parents)-1]
		}
		title := strings.Join(strings.Fields(html.UnescapeString(label.String())), " ")
		if title == "" {
			title = "Untitled Heading"
		}
		entries = append(entries, heading{Title: title, Level: h.Level, Depth: len(parents) + 1, Line: strings.Count(source[:start], "\n") + 1,
			From: utf16Length(source[:start]), Parent: parent, Previous: -1, Next: -1, startByte: start})
		parents = append(parents, len(entries)-1)
	}
	for i := range entries {
		end := len(source)
		for j := i + 1; j < len(entries); j++ {
			if entries[j].Level <= entries[i].Level {
				end = entries[j].startByte
				break
			}
		}
		entries[i].endByte, entries[i].End = end, utf16Length(source[:end])
		for j := i - 1; j >= 0; j-- {
			if entries[j].Level == entries[i].Level && entries[j].Parent == entries[i].Parent {
				entries[i].Previous = j
				entries[j].Next = i
				break
			}
		}
	}
	return entries
}

func moveSection(request string) (any, error) {
	var r struct {
		Text      string
		From      int
		Direction string
		Before    *int
		After     *int
		Expected  string
	}
	if err := json.Unmarshal([]byte(request), &r); err != nil {
		return nil, err
	}
	if r.Expected != "" && r.Expected != sourceRevision(r.Text) {
		return nil, fmt.Errorf("the document changed; read its outline again before moving a section")
	}
	entries := outline(r.Text)
	index := -1
	for i, entry := range entries {
		if entry.From == r.From {
			index = i
			break
		}
	}
	if index < 0 {
		return nil, fmt.Errorf("choose a document heading to move")
	}
	entry, destination := entries[index], -1
	if r.Before != nil || r.After != nil {
		if r.Direction != "" || r.Before != nil && r.After != nil {
			return nil, fmt.Errorf("choose a direction or a destination, not both")
		}
		address := r.Before
		if address == nil {
			address = r.After
		}
		for _, target := range entries {
			if target.From == *address && target.Parent == entry.Parent && target.Level == entry.Level {
				destination = target.startByte
				if r.After != nil {
					destination = target.endByte
				}
				break
			}
		}
	} else {
		switch r.Direction {
		case "up":
			if entry.Previous >= 0 {
				destination = entries[entry.Previous].startByte
			}
		case "down":
			if entry.Next >= 0 {
				destination = entries[entry.Next].endByte
			}
		default:
			return nil, fmt.Errorf("section direction is up or down")
		}
	}
	if destination < 0 {
		return nil, fmt.Errorf("the section cannot move there; choose a sibling of the same heading level")
	}
	if destination >= entry.startByte && destination <= entry.endByte {
		return map[string]any{"text": r.Text, "from": r.From}, nil
	}
	newline := "\n"
	if strings.Contains(r.Text, "\r\n") && !strings.Contains(strings.ReplaceAll(r.Text, "\r\n", ""), "\n") {
		newline = "\r\n"
	}
	join := func(left, right string) string {
		if left != "" && right != "" && !strings.HasSuffix(left, "\n") && !strings.HasPrefix(right, "\n") && !strings.HasPrefix(right, "\r\n") {
			return left + newline + newline + right
		}
		return left + right
	}
	body := r.Text[entry.startByte:entry.endByte]
	var before, after string
	if destination < entry.startByte {
		before = r.Text[:destination]
		after = r.Text[destination:entry.startByte] + r.Text[entry.endByte:]
	} else {
		before = r.Text[:entry.startByte] + r.Text[entry.endByte:destination]
		after = r.Text[destination:]
	}
	result := join(join(before, body), after)
	position := utf16Length(before)
	if before != "" && !strings.HasSuffix(before, "\n") {
		position += utf16Length(newline + newline)
	}
	return map[string]any{"text": result, "from": position}, nil
}
