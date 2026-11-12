// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

import (
	"strings"
	"testing"
)

// Analytics are sent only when the site is reached over HTTPS, the public
// site (DESIGN.md, decision 147). A copy run without it loads no script
// from Plausible and its policy does not name Plausible's host, so no page
// waits on a host outside the machine and the policy allows only what the
// page uses.
func TestAnalyticsOnlyOnTheSecureSite(t *testing.T) {
	for _, tc := range []struct {
		name   string
		secure bool
	}{{"without HTTPS", false}, {"with HTTPS", true}} {
		t.Run(tc.name, func(t *testing.T) {
			s := newSite(t, testDomain)
			s.Secure = tc.secure
			for _, target := range []string{site("/"), "http://dice." + testDomain + "/", site("/applet/dice")} {
				w := req(t, s, "GET", target, "")
				if w.Code != 200 {
					t.Fatalf("%s: %d", target, w.Code)
				}
				body, policy := w.Body.String(), w.Header().Get("Content-Security-Policy")
				for what, got := range map[string]bool{
					"the Plausible script":       strings.Contains(body, "plausible.io/js/"),
					"the start of the analytics": strings.Contains(body, "/static/plausible.js"),
					"Plausible in script-src":    strings.Contains(sourceList(policy, "script-src"), "https://plausible.io"),
					"Plausible in connect-src":   strings.Contains(sourceList(policy, "connect-src"), "https://plausible.io"),
				} {
					if got != tc.secure {
						t.Errorf("%s: %s is present %v, want %v", target, what, got, tc.secure)
					}
				}
				if policy != contentSecurityPolicy(tc.secure) {
					t.Errorf("%s: policy %q", target, policy)
				}
				// Whatever the mode, no other host may be added to what a page may run or reach.
				for _, directive := range []string{"script-src", "connect-src"} {
					for _, source := range strings.Fields(sourceList(policy, directive)) {
						if strings.HasPrefix(source, "https://") && source != "https://plausible.io" {
							t.Errorf("%s: %s allows %s", target, directive, source)
						}
					}
				}
			}
		})
	}
}

// sourceList is the sources of one directive of a policy.
func sourceList(policy, directive string) string {
	for _, part := range strings.Split(policy, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, directive+" ") {
			return strings.TrimPrefix(part, directive+" ")
		}
	}
	return ""
}
