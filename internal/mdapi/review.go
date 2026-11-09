// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package mdapi

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"yavc.app/internal/preview"
	"yavc.app/internal/review"
	"yavc.app/internal/shortcodes"
)

type reviewEntry struct {
	ID     string      `json:"id"`
	Kind   review.Kind `json:"kind"`
	From   int         `json:"from"`
	To     int         `json:"to"`
	Line   int         `json:"line"`
	Before string      `json:"before"`
	After  string      `json:"after"`
	Raw    string      `json:"raw"`
}
type reviewProblem struct {
	From    int    `json:"from"`
	Message string `json:"message"`
}
type reviewResult struct {
	Revision string          `json:"revision"`
	Marks    []reviewEntry   `json:"marks"`
	Problems []reviewProblem `json:"problems"`
}
type reviewEdit struct {
	From   int    `json:"from"`
	To     int    `json:"to"`
	Insert string `json:"insert"`
}

func inlineReview(raw string) (any, error) {
	catalog, err := review.Scan(raw, 0)
	if err != nil {
		return nil, err
	}
	if strings.ContainsAny(raw, "\r\n") || len(catalog.Marks) != 1 || len(catalog.Problems) != 0 || catalog.Marks[0].From != 0 || catalog.Marks[0].To != len(raw) {
		return nil, fmt.Errorf("not a complete inline review mark")
	}
	mark := catalog.Marks[0]
	draw := func(body string) string { return preview.ReviewInlineHTML(body, nil) }
	cell := mark
	cell.Before = strings.ReplaceAll(cell.Before, `\|`, `|`)
	cell.After = strings.ReplaceAll(cell.After, `\|`, `|`)
	return map[string]any{"src": raw, "kind": mark.Kind, "cellSafe": review.CellSafe(raw), "cellHTML": review.InlineHTML(cell, draw), "html": review.InlineHTML(mark, draw)}, nil
}

func reviewID(mark review.Mark) string {
	return fmt.Sprintf("%d:%d:%x", mark.From, mark.To, sha256.Sum256([]byte(mark.Raw)))
}
func reviewScan(source string) (review.Catalog, error) {
	return review.Scan(source, frontBytes(source), shortcodes.WithMacros(shortcodes.DiscoverMacros(source, "")))
}

// Offset conversion walks the source once; a dense per-character index and
// repeated whole-prefix scans are both unnecessary for a bounded catalog.
type reviewPosition struct{ Units, Line int }

func reviewOffsets(source string, positions []int) map[int]reviewPosition {
	wanted := make(map[int]bool, len(positions))
	for _, position := range positions {
		wanted[position] = true
	}
	result := make(map[int]reviewPosition, len(wanted))
	units, line := 0, 1
	for at, char := range source {
		if wanted[at] {
			result[at] = reviewPosition{units, line}
		}
		units++
		if char > 0xffff {
			units++
		}
		if char == '\n' {
			line++
		}
	}
	if wanted[len(source)] {
		result[len(source)] = reviewPosition{units, line}
	}
	return result
}
func reviewCatalog(source string) (any, error) {
	catalog, err := reviewScan(source)
	if err != nil {
		return nil, err
	}
	positions := []int{}
	for _, mark := range catalog.Marks {
		positions = append(positions, mark.From, mark.To)
	}
	for _, problem := range catalog.Problems {
		positions = append(positions, problem.From)
	}
	offsets := reviewOffsets(source, positions)
	result := reviewResult{Revision: sourceRevision(source), Marks: []reviewEntry{}, Problems: []reviewProblem{}}
	for _, mark := range catalog.Marks {
		result.Marks = append(result.Marks, reviewEntry{ID: reviewID(mark), Kind: mark.Kind, From: offsets[mark.From].Units, To: offsets[mark.To].Units, Line: offsets[mark.From].Line, Before: mark.Before, After: mark.After, Raw: mark.Raw})
	}
	for _, problem := range catalog.Problems {
		result.Problems = append(result.Problems, reviewProblem{offsets[problem.From].Units, problem.Message})
	}
	return result, nil
}
func reviewEdits(source string, edits []review.Edit) (any, error) {
	result, err := review.Apply(source, edits)
	if err != nil {
		return nil, err
	}
	if len(result) > review.MaxSource {
		return nil, fmt.Errorf("the reviewed source exceeds 1 MiB")
	}
	positions := []int{}
	for _, edit := range edits {
		positions = append(positions, edit.From, edit.To)
	}
	offsets := reviewOffsets(source, positions)
	changes := []reviewEdit{}
	for _, edit := range edits {
		changes = append(changes, reviewEdit{offsets[edit.From].Units, offsets[edit.To].Units, edit.Insert})
	}
	return map[string]any{"revision": sourceRevision(source), "resultRevision": sourceRevision(result), "edits": changes, "text": result}, nil
}
func resolveReview(request string) (any, error) {
	var r struct{ Text, Revision, ID, Decision string }
	if err := json.Unmarshal([]byte(request), &r); err != nil {
		return nil, err
	}
	if r.Revision != sourceRevision(r.Text) {
		return nil, fmt.Errorf("the document changed before review resolution")
	}
	if r.Decision != "accept" && r.Decision != "reject" {
		return nil, fmt.Errorf("choose Accept or Reject")
	}
	catalog, err := reviewScan(r.Text)
	if err != nil {
		return nil, err
	}
	edits := []review.Edit{}
	found := r.ID == "all"
	for _, mark := range catalog.Marks {
		if r.ID == "all" || reviewID(mark) == r.ID {
			found = true
			edits = append(edits, review.Resolve(mark, r.Decision == "accept")...)
		}
	}
	if !found {
		return nil, fmt.Errorf("the review mark is no longer present")
	}
	return reviewEdits(r.Text, edits)
}

func editReview(request string) (any, error) {
	var r struct{ Text, Revision, ID, Body string }
	if err := json.Unmarshal([]byte(request), &r); err != nil {
		return nil, err
	}
	if r.Revision != sourceRevision(r.Text) {
		return nil, fmt.Errorf("the document changed before the review edit")
	}
	catalog, err := reviewScan(r.Text)
	if err != nil {
		return nil, err
	}
	for _, mark := range catalog.Marks {
		if reviewID(mark) != r.ID {
			continue
		}
		before, after := mark.Before, mark.After
		from := mark.BodyFrom
		switch mark.Kind {
		case review.Addition:
			after = r.Body
		case review.Replacement:
			after = r.Body
			from = mark.Separator + 2
		case review.Comment:
			before = r.Body
		default:
			return nil, fmt.Errorf("this annotation has no editable proposed text")
		}
		if _, err := review.Propose(mark.Kind, before, after); err != nil {
			return nil, err
		}
		edits := []review.Edit{{From: from, To: mark.BodyTo, Insert: r.Body}}
		next, err := review.Apply(r.Text, edits)
		if err != nil {
			return nil, err
		}
		checked, err := reviewScan(next)
		if err != nil {
			return nil, err
		}
		if len(checked.Marks) != len(catalog.Marks) || len(checked.Problems) != len(catalog.Problems) {
			return nil, fmt.Errorf("the edited annotation is not valid in this Markdown context")
		}
		located := false
		for _, candidate := range checked.Marks {
			if candidate.From == mark.From && candidate.Kind == mark.Kind && candidate.Before == before && candidate.After == after {
				located = true
				break
			}
		}
		if !located {
			return nil, fmt.Errorf("the edited annotation changed its Markdown context")
		}
		return reviewEdits(r.Text, edits)
	}
	return nil, fmt.Errorf("the review mark is no longer present")
}
func reviewByte(source string, offset int) (int, error) {
	if offset < 0 {
		return 0, fmt.Errorf("invalid review selection")
	}
	units := 0
	for at, char := range source {
		if units == offset {
			return at, nil
		}
		units++
		if char > 0xffff {
			units++
		}
		if units > offset {
			return 0, fmt.Errorf("review selection splits a Unicode character")
		}
	}
	if units == offset {
		return len(source), nil
	}
	return 0, fmt.Errorf("review selection is outside the document")
}
func proposeReview(request string) (any, error) {
	var r struct {
		Text, Revision, Body string
		Kind                 review.Kind
		From, To             int
	}
	if err := json.Unmarshal([]byte(request), &r); err != nil {
		return nil, err
	}
	if r.Revision != sourceRevision(r.Text) {
		return nil, fmt.Errorf("the document changed before the proposal")
	}
	from, err := reviewByte(r.Text, r.From)
	if err != nil {
		return nil, err
	}
	to, err := reviewByte(r.Text, r.To)
	if err != nil {
		return nil, err
	}
	if to < from {
		return nil, fmt.Errorf("invalid review selection")
	}
	catalog, err := reviewScan(r.Text)
	if err != nil {
		return nil, err
	}
	for _, mark := range catalog.Marks {
		if from < mark.To && to > mark.From || from == to && from > mark.From && from < mark.To {
			return nil, fmt.Errorf("resolve the existing review mark before proposing another change here")
		}
	}
	before := r.Text[from:to]
	var edits []review.Edit
	switch r.Kind {
	case review.Addition:
		if from != to {
			return nil, fmt.Errorf("place the caret where the insertion belongs")
		}
		raw, err := review.Propose(r.Kind, "", r.Body)
		if err != nil {
			return nil, err
		}
		edits = []review.Edit{{From: from, To: to, Insert: raw}}
	case review.Comment:
		raw, err := review.Propose(r.Kind, r.Body, "")
		if err != nil {
			return nil, err
		}
		if from == to {
			edits = []review.Edit{{From: from, To: to, Insert: raw}}
		} else {
			_, err := review.Propose(review.Highlight, before, "")
			if err != nil {
				return nil, err
			}
			edits = []review.Edit{{From: from, To: from, Insert: "{=="}, {From: to, To: to, Insert: "==}" + raw}}
		}
	case review.Deletion, review.Highlight, review.Replacement:
		if from == to {
			return nil, fmt.Errorf("select the text to review first")
		}
		if _, err := review.Propose(r.Kind, before, r.Body); err != nil {
			return nil, err
		}
		open, close := "{--", "--}"
		if r.Kind == review.Highlight {
			open, close = "{==", "==}"
		}
		if r.Kind == review.Replacement {
			open, close = "{~~", "~>"+r.Body+"~~}"
		}
		edits = []review.Edit{{From: from, To: from, Insert: open}, {From: to, To: to, Insert: close}}
	default:
		return nil, fmt.Errorf("unknown review proposal kind")
	}
	proposed, err := review.Apply(r.Text, edits)
	if err != nil {
		return nil, err
	}
	next, err := reviewScan(proposed)
	if err != nil {
		return nil, err
	}
	expected := 1
	if r.Kind == review.Comment && from != to {
		expected = 2
	}
	if len(next.Marks) != len(catalog.Marks)+expected || len(next.Problems) != len(catalog.Problems) {
		return nil, fmt.Errorf("the selection cannot hold a review mark safely in this Markdown context")
	}
	newKind := r.Kind
	if r.Kind == review.Comment && from != to {
		newKind = review.Highlight
	}
	located := false
	for _, mark := range next.Marks {
		if mark.From == from && mark.Kind == newKind {
			located = true
			break
		}
	}
	if !located {
		return nil, fmt.Errorf("the proposed mark is outside an editable Markdown text context")
	}
	return reviewEdits(r.Text, edits)
}
