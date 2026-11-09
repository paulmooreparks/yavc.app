// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package review_test

import (
	"testing"
	"yavc.app/internal/review"
	"yavc.app/internal/shortcodes"
)

func TestDeclarationsAreOpaqueAndRenderedContainersRemainReviewable(t *testing.T) {
	source := "{{style}}\n.callout { content: '{++CSS++}'; }\n{{/style}}\n\n{{define:test}}\n{++template++}\n{{/define}}\n\n{{note}}\nReal {++body++}.\n{{/note}}\n"
	catalog, err := review.Scan(source, 0, shortcodes.Extension)
	if err != nil || len(catalog.Marks) != 1 || catalog.Marks[0].After != "body" {
		t.Fatalf("%+v %v", catalog, err)
	}
}
