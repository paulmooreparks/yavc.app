package web

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

// The settings the browser shows as ~/.config: listed with their text and
// time, the same at an applet's subdomain, and deleted one at a time.
func TestSettingsListAndDelete(t *testing.T) {
	s := newSite(t, testDomain)
	if w := req(t, s, "GET", site("/config"), ""); w.Code != http.StatusOK || w.Body.String() != `{"settings":{}}`+"\n" {
		t.Fatalf("a reader with no session: %d %q", w.Code, w.Body.String())
	}
	w := req(t, s, "PUT", site("/config/editor"), "{\n  \"wrap\": true\n}\n")
	if w.Code != http.StatusOK {
		t.Fatalf("put: %d", w.Code)
	}
	cookie := cookieOf(t, w)
	if w := req(t, s, "PUT", site("/config/files"), `{"hidden":false}`, "Cookie", cookie); w.Code != http.StatusOK {
		t.Fatalf("put files: %d", w.Code)
	}

	list := func(host string) map[string]struct {
		Text     string    `json:"text"`
		Modified time.Time `json:"modified"`
	} {
		w := req(t, s, "GET", "http://"+host+"/config", "", "Cookie", cookie)
		var got struct {
			Settings map[string]struct {
				Text     string    `json:"text"`
				Modified time.Time `json:"modified"`
			} `json:"settings"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
			t.Fatalf("list at %s: %v %q", host, err, w.Body.String())
		}
		return got.Settings
	}
	got := list("dice." + testDomain)
	if len(got) != 2 || got["editor"].Text != "{\n  \"wrap\": true\n}\n" || time.Since(got["editor"].Modified) > time.Minute {
		t.Fatalf("listed at a subdomain: %+v", got)
	}

	if w := req(t, s, "DELETE", site("/config/files"), "", "Cookie", cookie); w.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", w.Code)
	}
	if got := list(testDomain); len(got) != 1 || got["files"].Text != "" {
		t.Fatalf("after delete: %+v", got)
	}
	if w := req(t, s, "DELETE", site("/config/Bad_Name"), "", "Cookie", cookie); w.Code != http.StatusNotFound {
		t.Errorf("a bad name: %d", w.Code)
	}
	if w := req(t, s, "DELETE", site("/config/editor"), ""); w.Code != http.StatusNoContent {
		t.Errorf("a delete with no session: %d", w.Code)
	}
	if w := req(t, s, "DELETE", site("/config/editor"), "", "Cookie", cookie, "Origin", "https://evil.example"); w.Code != http.StatusForbidden {
		t.Errorf("a delete from another site: %d", w.Code)
	}
}
