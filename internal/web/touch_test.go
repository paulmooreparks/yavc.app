package web

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A reader who only reads keeps the session: a request that carries the
// cookie moves the session's Seen time when it has fallen behind, and sets
// the cookie again with the full retention period. A request soon after
// writes nothing and sets no cookie, and a versioned file never does.
func TestReadingRenewsSessionAndCookie(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "PUT", site("/state/dice"), "x")
	cookie := cookieOf(t, w)
	id := sessionID(cookie)
	path := filepath.Join(s.Sessions.Dir, id+".json")

	age := func(d time.Duration) {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			t.Fatal(err)
		}
		m["seen"] = time.Now().Add(-d).UTC().Format(time.RFC3339Nano)
		raw, _ = json.Marshal(m)
		if err := os.WriteFile(path, raw, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	renewed := func(target string) bool {
		for _, c := range req(t, s, "GET", target, "", "Cookie", cookie).Result().Cookies() {
			if c.Name == cookieName {
				if c.Value != id || c.MaxAge != int(s.Sessions.Retain/time.Second) {
					t.Errorf("renewed cookie is %+v", c)
				}
				return true
			}
		}
		return false
	}

	if renewed(site("/state/dice")) {
		t.Error("a request just after the session was written renewed the cookie")
	}
	age(7 * time.Hour) // the test store keeps sessions a day, so it renews after six hours
	if renewed(site("/static/yavc-util.js")) {
		t.Error("a versioned file renewed the cookie")
	}
	if !renewed(site("/state/dice")) {
		t.Error("a read after the session fell behind did not renew the cookie")
	}
	if renewed(site("/state/dice")) {
		t.Error("a second read renewed the cookie again")
	}
	age(23 * time.Hour)
	if !renewed(site("/")) {
		t.Error("loading the desktop did not renew the cookie")
	}
}
