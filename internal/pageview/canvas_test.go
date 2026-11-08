// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package pageview

import "testing"

func TestCanvasFenceRoundTrip(t *testing.T) {
	source := "# Diagram\n\n````canvas\n{\"nodes\":[],\"edges\":[],\"unknown\":{\"keep\":true}}\n````\n\nAfter.\n"
	if got := back(t, docOf(t, source)); got != source {
		t.Fatalf("canvas source changed: %q", got)
	}
}
