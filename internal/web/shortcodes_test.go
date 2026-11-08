// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package web

import (
	"encoding/json"
	"testing"

	"yavc.app/internal/shortcodes"
)

func TestPublicShortcodeCatalog(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "GET", site("/api/shortcodes"), "")
	if w.Code != 200 || w.Header().Get("Content-Type") != "application/json; charset=utf-8" || w.Header().Get("Set-Cookie") != "" || w.Header().Get("Cache-Control") != "public, max-age=60" {
		t.Fatalf("public catalog response: %d %v", w.Code, w.Header())
	}
	var result struct{ Shortcodes []shortcodes.Definition }
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || len(result.Shortcodes) != len(shortcodes.Definitions()) {
		t.Fatalf("catalog mismatch: %s", w.Body.String())
	}
}
