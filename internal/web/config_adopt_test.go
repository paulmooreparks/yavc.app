// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package web

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"
)

func TestSettingsAdoptionPreservesChoicesAndRunsOnce(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "PUT", site("/config/docs"), `{"wrap":false,"outline":null}`)
	cookie := cookieOf(t, w)
	for _, body := range []string{`{"marker":"split-v1","defaults":{"wrap":true,"outline":true,"documentZoom":"125"}}`, `{"marker":"split-v1","defaults":{"documentZoom":"200","added-later":true}}`} {
		if w := req(t, s, "POST", site("/config/docs/adopt"), body, "Cookie", cookie); w.Code != http.StatusNoContent && w.Code != http.StatusOK {
			t.Fatalf("adopt: %d %s", w.Code, w.Body.String())
		}
	}
	w = req(t, s, "GET", site("/config/docs"), "", "Cookie", cookie)
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["wrap"] != false || got["outline"] != nil || got["documentZoom"] != "125" || got["split-v1"] != float64(1) {
		t.Fatalf("lost choices: %#v", got)
	}
	if _, exists := got["added-later"]; exists {
		t.Fatal("migration repeated")
	}
}

func TestConcurrentSettingsAdoptionKeepsOneCompleteCopy(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "PUT", site("/config/docs"), `{"chosen":"keep"}`)
	cookie := cookieOf(t, w)
	var wait sync.WaitGroup
	for _, body := range []string{`{"marker":"split-v1","defaults":{"pair":"first","first":true}}`, `{"marker":"split-v1","defaults":{"pair":"second","second":true}}`} {
		wait.Add(1)
		go func(body string) {
			defer wait.Done()
			w := req(t, s, "POST", site("/config/docs/adopt"), body, "Cookie", cookie)
			if w.Code != http.StatusNoContent && w.Code != http.StatusOK {
				t.Errorf("adopt: %d", w.Code)
			}
		}(body)
	}
	wait.Wait()
	w = req(t, s, "GET", site("/config/docs"), "", "Cookie", cookie)
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got["chosen"] != "keep" {
		t.Fatal("lost choice")
	}
	if got["first"] == got["second"] {
		t.Fatalf("combined independent migrations: %#v", got)
	}
}

func TestSettingsAdoptionRefusesOversizedMergedState(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "PUT", site("/config/docs"), `{"keep":"`+strings.Repeat("a", 40000)+`"}`)
	cookie := cookieOf(t, w)
	body := `{"marker":"split-v1","defaults":{"extra":"` + strings.Repeat("b", 40000) + `"}}`
	w = req(t, s, "POST", site("/config/docs/adopt"), body, "Cookie", cookie)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected budget refusal, got %d %s", w.Code, w.Body.String())
	}
	w = req(t, s, "GET", site("/config/docs"), "", "Cookie", cookie)
	if strings.Contains(w.Body.String(), "split-v1") || strings.Contains(w.Body.String(), "extra") {
		t.Fatal("refused migration changed settings")
	}
}
