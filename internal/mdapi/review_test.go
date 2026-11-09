// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package mdapi

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf16"
	"yavc.app/internal/review"
)

func reviewRequest(t *testing.T, value any) string {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}
func TestReviewCatalogUsesOriginalUTF16AndIgnoresMetadata(t *testing.T) {
	source := "---\r\nauthor: '{++hidden++}'\r\n---\r\n\r\n😀 {++retained\r\nbody++}."
	got, err := reviewCatalog(source)
	if err != nil {
		t.Fatal(err)
	}
	catalog := got.(reviewResult)
	if len(catalog.Marks) != 1 {
		t.Fatalf("%+v", catalog)
	}
	entry := catalog.Marks[0]
	units := utf16.Encode([]rune(source))
	if string(utf16.Decode(units[entry.From:entry.To])) != entry.Raw || entry.Line != 5 {
		t.Fatalf("%+v", entry)
	}
	for _, accept := range []string{"accept", "reject"} {
		got, err := resolveReview(reviewRequest(t, map[string]any{"text": source, "revision": catalog.Revision, "id": entry.ID, "decision": accept}))
		if err != nil {
			t.Fatal(err)
		}
		result := got.(map[string]any)
		if result["revision"] != catalog.Revision {
			t.Fatal("missing baseline")
		}
		text := result["text"].(string)
		if strings.Contains(text, "{++retained") {
			t.Fatal(text)
		}
		if !strings.Contains(text, "{++hidden++}") {
			t.Fatal("metadata changed")
		}
		if accept == "accept" && !strings.Contains(text, "retained\r\nbody") {
			t.Fatal("body endings changed")
		}
	}
	if _, err := resolveReview(reviewRequest(t, map[string]any{"text": source + " changed", "revision": catalog.Revision, "id": entry.ID, "decision": "accept"})); err == nil {
		t.Fatal("accepted stale revision")
	}
}
func TestReviewProposalContextsAndMinimalChanges(t *testing.T) {
	source := "😀 Original\r\nwords.\n"
	for _, kind := range []review.Kind{review.Addition, review.Deletion, review.Replacement, review.Comment, review.Highlight} {
		from, to := 3, 11
		if kind == review.Addition {
			to = from
		}
		got, err := proposeReview(reviewRequest(t, map[string]any{"text": source, "revision": sourceRevision(source), "from": from, "to": to, "kind": kind, "body": "Proposed words."}))
		if err != nil {
			t.Fatalf("%s: %v", kind, err)
		}
		result := got.(map[string]any)
		changes := result["edits"].([]reviewEdit)
		if len(changes) == 0 {
			t.Fatal("no edit")
		}
		for _, change := range changes {
			if change.From != change.To {
				t.Fatal("proposal replaced retained body")
			}
		}
		catalog, err := reviewScan(result["text"].(string))
		if err != nil || len(catalog.Marks) == 0 {
			t.Fatalf("%+v %v", catalog, err)
		}
	}
	for _, test := range []struct {
		source   string
		position int
	}{{"`code`", 2}, {"[label](https://example.invalid/path)", 18}, {"---\nauthor: Paul\n---\n\nBody.", 12}} {
		if _, err := proposeReview(reviewRequest(t, map[string]any{"text": test.source, "revision": sourceRevision(test.source), "from": test.position, "to": test.position, "kind": "addition", "body": "Literal"})); err == nil {
			t.Fatalf("accepted %q", test.source)
		}
	}
	if _, err := proposeReview(reviewRequest(t, map[string]any{"text": source, "revision": sourceRevision(source), "from": 1, "to": 1, "kind": "addition", "body": "x"})); err == nil {
		t.Fatal("split Unicode")
	}
}
func TestReviewAllLeavesMalformedMarksAndCodeUntouched(t *testing.T) {
	source := "{++new++} {--old--} {~~old~>next~~} {>>comment<<} {==highlight==}\n\n`{++code++}`\n\n{++incomplete"
	got, err := resolveReview(reviewRequest(t, map[string]any{"text": source, "revision": sourceRevision(source), "id": "all", "decision": "accept"}))
	if err != nil {
		t.Fatal(err)
	}
	if got.(map[string]any)["text"] != "new  next  highlight\n\n`{++code++}`\n\n{++incomplete" {
		t.Fatal(got)
	}
}

func TestReviewEditPreservesOriginalAndRefusesStaleOrInvalidBody(t *testing.T) {
	for _, raw := range []string{"{++proposed++}", "{~~old~>proposed~~}", "{>>comment<<}"} {
		source := "😀 " + raw + "\r\nRetained.\n"
		value, err := reviewCatalog(source)
		if err != nil {
			t.Fatal(err)
		}
		catalog := value.(reviewResult)
		request := map[string]any{"text": source, "revision": catalog.Revision, "id": catalog.Marks[0].ID, "body": "Edited **words**"}
		value, err = editReview(reviewRequest(t, request))
		if err != nil {
			t.Fatal(err)
		}
		result := value.(map[string]any)
		text := result["text"].(string)
		if !strings.Contains(text, "Edited **words**") || !strings.HasSuffix(text, "\r\nRetained.\n") {
			t.Fatal(text)
		}
		if strings.Contains(raw, "~>") && !strings.Contains(text, "{~~old~>") {
			t.Fatal(text)
		}
		if len(result["edits"].([]reviewEdit)) != 1 {
			t.Fatal("edit replaced unrelated source")
		}
		request["text"] = source + "changed"
		if _, err := editReview(reviewRequest(t, request)); err == nil {
			t.Fatal("accepted stale edit")
		}
		request["text"], request["body"] = source, "nested {++mark++}"
		if _, err := editReview(reviewRequest(t, request)); err == nil {
			t.Fatal("accepted nested review edit")
		}
	}
}
