// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package web

import (
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenamedGameAddresses(t *testing.T) {
	s := newSite(t, testDomain)
	s.Applets = append(s.Applets, filepath.Join("..", "..", "applets"))
	for old, name := range map[string]string{"asteroids": "driftwake", "invaders": "lantern-line"} {
		for _, host := range []string{old, name} {
			response := req(t, s, "GET", "http://"+host+"."+testDomain+"/", "")
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `data-applet="`+name+`"`) {
				t.Fatalf("%s host: %d", host, response.Code)
			}
		}
		response := req(t, s, "GET", site("/"+old), "")
		if response.Code != http.StatusPermanentRedirect || response.Header().Get("Location") != "/"+name {
			t.Fatalf("%s redirect: %d %s", old, response.Code, response.Header().Get("Location"))
		}
		if response := req(t, s, "GET", site("/applet/"+name), ""); response.Code != http.StatusOK {
			t.Fatalf("%s same-origin applet: %d", name, response.Code)
		}
	}
}
