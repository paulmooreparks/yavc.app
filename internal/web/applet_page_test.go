// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package web

import (
	"strings"
	"testing"
)

func TestSameOriginAppletPage(t *testing.T) {
	s := newSite(t, testDomain)
	response := req(t, s, "GET", site("/applet/dice?file=kept&presenter=1"), "")
	if response.Code != 200 || response.Header().Get("Location") != "" || !strings.Contains(response.Body.String(), `data-applet-page`) || !strings.Contains(response.Body.String(), `data-applet="dice"`) {
		t.Fatalf("same-origin applet page: %d %s", response.Code, response.Body.String())
	}
	for _, url := range []string{site("/applet/missing"), "https://dice." + testDomain + "/applet/dice"} {
		if response := req(t, s, "GET", url, ""); response.Code != 404 {
			t.Fatalf("%s: got %d", url, response.Code)
		}
	}
}
