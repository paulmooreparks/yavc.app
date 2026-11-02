package web

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"yavc.app/internal/relay"
	"yavc.app/internal/session"
)

// makeToken pairs an agent, as Settings does, and gives the token and the
// session cookie.
func makeToken(t *testing.T, s *Server, cookie string) (string, string) {
	t.Helper()
	headers := []string{"Content-Type", "application/json"}
	if cookie != "" {
		headers = append(headers, "Cookie", cookie)
	}
	w := req(t, s, "POST", site("/agent/tokens"), `{"name":"Claude","grant":["files.read"]}`, headers...)
	if w.Code != http.StatusOK {
		t.Fatalf("make token: %d %q", w.Code, w.Body.String())
	}
	var v struct{ Token, ID string }
	json.Unmarshal(w.Body.Bytes(), &v)
	if cookie == "" {
		cookie = cookieOf(t, w)
	}
	return v.Token, cookie
}

// The first token a reader with no session makes succeeds, and makes the
// session.
func TestMakeTokenFirstRequest(t *testing.T) {
	s := newSite(t, testDomain)
	token, cookie := makeToken(t, s, "")
	if !strings.HasPrefix(token, "yavc_") {
		t.Fatalf("token %q", token)
	}
	peer, ok := s.pair(token)
	if !ok || peer.Session != sessionID(cookie) || peer.Name != "Claude" {
		t.Fatalf("pair: %+v %v", peer, ok)
	}
	w := req(t, s, "GET", site("/agent/tokens"), "", "Cookie", cookie)
	if !strings.Contains(w.Body.String(), `"name":"Claude"`) || strings.Contains(w.Body.String(), token) || !strings.Contains(w.Body.String(), `"expires"`) {
		t.Fatalf("the list: %s", w.Body.String())
	}
	// Twenty tokens and no more.
	for i := 1; i < maxTokens; i++ {
		makeToken(t, s, cookie)
	}
	if w := req(t, s, "POST", site("/agent/tokens"), `{"name":"one too many"}`, "Cookie", cookie); w.Code != http.StatusConflict {
		t.Fatalf("a 21st token: %d", w.Code)
	}
	if w := req(t, s, "POST", site("/agent/tokens"), `{"name":"x","grant":["everything"]}`, "Cookie", cookie); w.Code != http.StatusBadRequest {
		t.Fatalf("an unknown grant: %d", w.Code)
	}
}

func TestTokenRoutesDesktopOnly(t *testing.T) {
	s := newSite(t, testDomain)
	_, cookie := makeToken(t, s, "")
	applet := "http://dice." + testDomain
	if w := req(t, s, "POST", applet+"/agent/tokens", `{"name":"x"}`, "Cookie", cookie); w.Code != http.StatusNotFound {
		t.Fatalf("making a token at a subdomain: %d", w.Code)
	}
	sess, _ := s.Sessions.Load(sessionID(cookie))
	id := sess.Agents[0].ID
	if w := req(t, s, "DELETE", applet+"/agent/tokens/"+id, "", "Cookie", cookie); w.Code != http.StatusNotFound {
		t.Fatalf("revoking at a subdomain: %d", w.Code)
	}
	if w := req(t, s, "DELETE", site("/agent/tokens/"+id), "", "Cookie", cookie); w.Code != http.StatusNoContent {
		t.Fatalf("revoking at the desktop: %d", w.Code)
	}
	// Revoking without a session makes none.
	w := req(t, s, "DELETE", site("/agent/tokens/"+id), "")
	if w.Code != http.StatusNotFound || len(w.Result().Cookies()) != 0 {
		t.Fatalf("revoking with no session: %d %v", w.Code, w.Result().Cookies())
	}
}

func TestTokenExpires(t *testing.T) {
	s := newSite(t, testDomain)
	made := time.Now()
	s.now = func() time.Time { return made }
	token, _ := makeToken(t, s, "")
	// Use does not extend it.
	s.now = func() time.Time { return made.Add(session.TokenLife - time.Hour) }
	if _, ok := s.pair(token); !ok {
		t.Fatal("a token should work until its expiry")
	}
	s.now = func() time.Time { return made.Add(session.TokenLife + time.Second) }
	if _, ok := s.pair(token); ok {
		t.Fatal("an expired token still pairs")
	}
}

func TestDeleteSessionRevokesTokens(t *testing.T) {
	s := newSite(t, testDomain)
	token, cookie := makeToken(t, s, "")
	events, leave, err := s.hub.Subscribe(sessionID(cookie), "0123456789abcdef01234567")
	if err != nil {
		t.Fatal(err)
	}
	defer leave()
	w := req(t, s, "DELETE", site("/session"), "", "Cookie", cookie)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", w.Code)
	}
	if _, ok := s.pair(token); ok {
		t.Fatal("a deleted session's token still pairs")
	}
	if _, open := <-events; open {
		t.Fatal("a deleted session's stream is still open")
	}
	if s.hub.Connected(sessionID(cookie)) {
		t.Fatal("the hub still holds the session's pages")
	}
}

func TestActionsCatalogue(t *testing.T) {
	s := newSite(t, testDomain)
	w := req(t, s, "GET", site("/api/actions"), "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "test.dice/roll@1") || w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("catalogue: %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"manifest":"http://`+testDomain+`/applets/dice/actions.json?v=1.2.3"`) {
		t.Fatalf("manifest address: %s", w.Body.String())
	}
}

// A page connects, an invocation goes down its stream, its report finishes
// the record, and the page closing ends what it was running.
func TestStreamConnectInvokeDisconnect(t *testing.T) {
	s := newSite(t, "")
	srv := httptest.NewServer(s)
	defer srv.Close()
	_, cookie := makeToken(t, s, "")
	page := "0123456789abcdef01234567"
	r, _ := http.NewRequest("GET", srv.URL+"/agent/stream?page="+page, nil)
	r.Header.Set("Cookie", cookie)
	resp, err := srv.Client().Do(r)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "text/event-stream" || resp.Header.Get("Content-Encoding") != "" {
		t.Fatalf("stream: %d %v", resp.StatusCode, resp.Header)
	}
	lines := bufio.NewScanner(resp.Body)
	next := func() string {
		for lines.Scan() {
			if l := lines.Text(); l != "" {
				return l
			}
		}
		return ""
	}
	if l := next(); l != ": connected" {
		t.Fatalf("first line %q", l)
	}
	sess := sessionID(cookie)
	rec, err := s.hub.Invoke(sess, relay.Invocation{ID: "r1", Action: "test.dice/roll@1", Input: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	if l := next(); l != "event: invoke" {
		t.Fatalf("event line %q", l)
	}
	if l := next(); !strings.Contains(l, `"id":"r1"`) {
		t.Fatalf("data line %q", l)
	}
	w := req(t, s, "POST", "http://x/agent/report", `{"id":"r1","view":{"id":"r1","status":"done","output":{"n":4}},"artifacts":[{"key":"k","name":"a.txt","mime":"text/plain","data":"aGk="}]}`, "Cookie", cookie)
	if w.Code != http.StatusNoContent {
		t.Fatalf("report: %d %s", w.Code, w.Body.String())
	}
	if _, _, arts := s.hub.Snapshot(rec); string(arts["k"].Data) != "hi" {
		t.Fatal("the artifact was not kept")
	}
	if w := req(t, s, "POST", "http://x/agent/report", `{"id":"r1","view":{"status":"done"}}`, "Cookie", cookie); w.Code != http.StatusConflict {
		t.Fatalf("a report on a finished record: %d", w.Code)
	}
	rec2, _ := s.hub.Invoke(sess, relay.Invocation{ID: "r2", Action: "test.dice/roll@1"})
	next()
	resp.Body.Close()
	select {
	case <-rec2.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("the page closing should fail what it was running")
	}
	if s.hub.Connected(sess) {
		t.Fatal("the page is still connected")
	}
}
