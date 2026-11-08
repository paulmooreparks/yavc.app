// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package pageview

import "testing"

func TestDiagramReferenceRoundTrip(t *testing.T) {
	source := "# Plan\n\n{{diagram:../plan.canvas alt=\"The plan\" width=80% caption=\"Saved state\"}}\n\nAfter.\n"
	if got := back(t, docOf(t, source)); got != source {
		t.Fatalf("diagram reference changed: %q", got)
	}
}
