package mcp

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
	"time"

	"yavc.app/internal/relay"
)

const goodToken = "yavc_good"

func testServer() (*Server, *relay.Hub) {
	hub := relay.New()
	s := New(&Server{
		Title: "Test site",
		Catalog: func(*http.Request) []Provider {
			return []Provider{{ID: "yavc.slides", Applet: "slides", Title: "Slides", Actions: []map[string]any{
				{"ref": "yavc.slides/go@1", "title": "Go to a slide"},
			}}}
		},
		Pair: func(token string) (Peer, bool) {
			if token == goodToken {
				return Peer{Session: "sess", ID: "agent-1", Name: "Claude", Grant: []string{"artifact.create"}}, true
			}
			return Peer{}, false
		},
		Hub: hub,
	})
	return s, hub
}

type result struct {
	status  int
	header  http.Header
	ID      json.RawMessage `json:"id"`
	Result  map[string]any  `json:"result"`
	Error   *rpcError       `json:"error"`
	rawBody string
}

func call(t *testing.T, s *Server, session, token, body string) result {
	t.Helper()
	res, err := callCtx(context.Background(), s, session, token, body)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

// callCtx makes a call with a context of its own. It reports a body that
// is not JSON as an error rather than failing the test, so a goroutine
// may make it.
func callCtx(ctx context.Context, s *Server, session, token, body string) (result, error) {
	r := httptest.NewRequestWithContext(ctx, http.MethodPost, "/mcp", strings.NewReader(body))
	if session != "" {
		r.Header.Set("Mcp-Session-Id", session)
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	out := result{status: w.Code, header: w.Header(), rawBody: w.Body.String()}
	if w.Body.Len() > 0 {
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			return out, fmt.Errorf("not JSON: %q", w.Body.String())
		}
	}
	return out, nil
}

func initialize(t *testing.T, s *Server) string {
	t.Helper()
	res := call(t, s, "", "", `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}`)
	id := res.header.Get("Mcp-Session-Id")
	if res.status != 200 || id == "" {
		t.Fatalf("initialize: %d %q", res.status, res.rawBody)
	}
	if res.Result["protocolVersion"] != "2025-03-26" {
		t.Fatalf("version: %v", res.Result["protocolVersion"])
	}
	return id
}

func tool(name string, args string) string {
	return `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"` + name + `","arguments":` + args + `}}`
}

func toolText(res result) string {
	content, _ := res.Result["content"].([]any)
	if len(content) == 0 {
		return ""
	}
	first, _ := content[0].(map[string]any)
	s, _ := first["text"].(string)
	return s
}

func isError(res result) bool { b, _ := res.Result["isError"].(bool); return b }

func TestInitializeAndSession(t *testing.T) {
	s, _ := testServer()
	id := initialize(t, s)
	if res := call(t, s, id, "", `{"jsonrpc":"2.0","id":2,"method":"ping"}`); res.status != 200 || res.Error != nil {
		t.Fatalf("ping: %+v", res)
	}
	res := call(t, s, id, "", `{"jsonrpc":"2.0","id":3,"method":"tools/list"}`)
	if tools, _ := res.Result["tools"].([]any); len(tools) != 5 {
		t.Fatalf("tools/list: %v", res.Result)
	}
	// An unknown version is answered with the newest.
	res = call(t, s, "", "", `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1999-01-01"}}`)
	if res.Result["protocolVersion"] != versions[0] {
		t.Fatalf("fallback version: %v", res.Result["protocolVersion"])
	}
}

func TestMissingOrUnknownSession(t *testing.T) {
	s, _ := testServer()
	for _, id := range []string{"", "not-a-session"} {
		res := call(t, s, id, "", `{"jsonrpc":"2.0","id":2,"method":"ping"}`)
		if res.status != 404 || res.Error == nil || res.Error.Code != -32001 {
			t.Fatalf("session %q: %+v", id, res)
		}
		if ct := res.header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Fatalf("the 404 has content type %q", ct)
		}
	}
	// A session idle past SessionIdle is gone.
	id := initialize(t, s)
	now := time.Now()
	s.now = func() time.Time { return now.Add(SessionIdle + time.Minute) }
	if res := call(t, s, id, "", `{"jsonrpc":"2.0","id":2,"method":"ping"}`); res.status != 404 {
		t.Fatalf("an idle session answered %d", res.status)
	}
}

func TestSessionTableBounded(t *testing.T) {
	s, _ := testServer()
	first := initialize(t, s)
	for i := 0; i < MaxSessions; i++ {
		initialize(t, s)
	}
	if n := len(s.sessions); n > MaxSessions {
		t.Fatalf("%d sessions kept", n)
	}
	if res := call(t, s, first, "", `{"jsonrpc":"2.0","id":2,"method":"ping"}`); res.status != 404 {
		t.Fatal("the session used longest ago should be forgotten")
	}
}

func TestNotificationAndErrors(t *testing.T) {
	s, _ := testServer()
	id := initialize(t, s)
	if res := call(t, s, id, "", `{"jsonrpc":"2.0","method":"notifications/initialized"}`); res.status != http.StatusAccepted {
		t.Fatalf("notification: %d", res.status)
	}
	if res := call(t, s, id, "", `{"jsonrpc":"2.0","id":2,"method":"nothing/here"}`); res.Error == nil || res.Error.Code != -32601 {
		t.Fatalf("unknown method: %+v", res)
	}
	for _, body := range []string{`{`, `{"jsonrpc":"1.0","id":1,"method":"ping"}`, `[]`} {
		if res := call(t, s, id, "", body); res.Error == nil || res.Error.Code != -32700 {
			t.Fatalf("%s: %+v", body, res)
		}
	}
	big := `{"jsonrpc":"2.0","id":1,"method":"ping","params":"` + strings.Repeat("x", MaxBody) + `"}`
	if res := call(t, s, id, "", big); res.status != http.StatusRequestEntityTooLarge {
		t.Fatalf("a body over the limit answered %d", res.status)
	}
	if res := call(t, s, id, "", tool("applet_nothing", `{}`)); res.Error == nil || res.Error.Code != -32602 {
		t.Fatalf("unknown tool: %+v", res)
	}
}

func TestDiscoverWithoutToken(t *testing.T) {
	s, _ := testServer()
	id := initialize(t, s)
	res := call(t, s, id, "", tool("applet_discover", `{}`))
	if isError(res) || !strings.Contains(toolText(res), "yavc.slides/go@1") {
		t.Fatalf("discover: %+v", res.Result)
	}
	res = call(t, s, id, "", tool("applet_discover", `{"action":"yavc.slides/go@1"}`))
	if isError(res) || !strings.Contains(toolText(res), "Go to a slide") {
		t.Fatalf("discover one action: %+v", res.Result)
	}
	if res := call(t, s, id, "", tool("applet_discover", `{"provider":"nobody"}`)); !isError(res) {
		t.Fatal("an unknown provider should be an error")
	}
}

func TestTokenGatedTools(t *testing.T) {
	s, _ := testServer()
	id := initialize(t, s)
	calls := map[string]string{
		"applet_invoke":   `{"action":"yavc.slides/go@1"}`,
		"applet_status":   `{"id":"x"}`,
		"applet_cancel":   `{"id":"x"}`,
		"applet_artifact": `{"id":"x","key":"k"}`,
	}
	for name, args := range calls {
		for _, token := range []string{"", "good", "yavc_unpaired"} {
			res := call(t, s, id, token, tool(name, args))
			if !isError(res) || !strings.Contains(toolText(res), "no person is paired") {
				t.Fatalf("%s with token %q: %+v", name, token, res.Result)
			}
		}
	}
}

func TestInvokeValidation(t *testing.T) {
	s, _ := testServer()
	id := initialize(t, s)
	for args, want := range map[string]string{
		`{"action":"yavc.slides/go@1","requestId":"has space"}`:                        "requestId",
		`{"action":"yavc.slides/go@1","requestId":"` + strings.Repeat("a", 129) + `"}`: "requestId",
		`{"action":"yavc.slides/nothing@1"}`:                                           "no action",
		`{}`:                                                                           "needs an action",
		`{"action":"yavc.slides/go@1","waitSeconds":0}`:                                "no page of the site is open",
	} {
		res := call(t, s, id, goodToken, tool("applet_invoke", args))
		if !isError(res) || !strings.Contains(toolText(res), want) {
			t.Fatalf("%s: want %q, got %q", args, want, toolText(res))
		}
	}
}

func TestWaitSecondsClamped(t *testing.T) {
	n := func(v int) *int { return &v }
	for _, c := range []struct {
		in   *int
		want time.Duration
	}{{nil, 60 * time.Second}, {n(0), 0}, {n(-5), 0}, {n(30), 30 * time.Second}, {n(600), MaxWait}, {n(100000), MaxWait}} {
		if got := waitFor(c.in); got != c.want {
			t.Errorf("waitFor(%v) = %v, want %v", c.in, got, c.want)
		}
	}
}

// page reads a page's stream and answers each invocation as the page's
// bridge would, with the view given.
func page(t *testing.T, hub *relay.Hub, answer func(inv relay.Invocation)) func() {
	t.Helper()
	events, leave, err := hub.Subscribe("sess", "page")
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		for e := range events {
			if inv, ok := e.Data.(relay.Invocation); ok {
				answer(inv)
			}
		}
	}()
	return leave
}

func TestInvokeAndReportLoop(t *testing.T) {
	s, hub := testServer()
	id := initialize(t, s)
	leave := page(t, hub, func(inv relay.Invocation) {
		hub.Report("sess", inv.ID, json.RawMessage(`{"id":"`+inv.ID+`","status":"running"}`), nil)
		hub.Report("sess", inv.ID, json.RawMessage(`{"id":"`+inv.ID+`","status":"done","output":{"slide":3}}`), map[string]relay.Artifact{
			"shot": {Name: "shot.png", Mime: "image/png", Data: []byte{0x89, 'P', 'N', 'G'}},
			"page": {Name: "page.html", Mime: "text/html; charset=utf-8", Data: []byte("<p>hi</p>")},
			"blob": {Name: "deck.pptx", Mime: "application/octet-stream", Data: []byte{1, 2, 3}},
		})
	})
	defer leave()
	res := call(t, s, id, goodToken, tool("applet_invoke", `{"action":"yavc.slides/go@1","input":{"n":3},"requestId":"req-1","waitSeconds":5}`))
	if isError(res) {
		t.Fatalf("invoke: %s", toolText(res))
	}
	structured, _ := res.Result["structuredContent"].(map[string]any)
	if structured["status"] != "done" {
		t.Fatalf("invoke result: %+v", res.Result)
	}
	// The same requestId gives the same record, and runs nothing again.
	again := call(t, s, id, goodToken, tool("applet_invoke", `{"action":"yavc.slides/go@1","requestId":"req-1","waitSeconds":0}`))
	if st, _ := again.Result["structuredContent"].(map[string]any); st["status"] != "done" {
		t.Fatalf("repeat: %+v", again.Result)
	}
	if res := call(t, s, id, goodToken, tool("applet_status", `{"id":"req-1"}`)); isError(res) {
		t.Fatalf("status: %s", toolText(res))
	}
	// Artifacts by MIME type: a picture as an image, text as text, the
	// rest as a resource.
	kinds := map[string]string{"shot": "image", "page": "text", "blob": "resource"}
	for key, want := range kinds {
		res := call(t, s, id, goodToken, tool("applet_artifact", `{"id":"req-1","key":"`+key+`"}`))
		content, _ := res.Result["content"].([]any)
		if len(content) == 0 {
			t.Fatalf("%s: no content", key)
		}
		first := content[0].(map[string]any)
		if first["type"] != want {
			t.Fatalf("%s: type %v, want %s", key, first["type"], want)
		}
		if key == "shot" && first["data"] != base64.StdEncoding.EncodeToString([]byte{0x89, 'P', 'N', 'G'}) {
			t.Fatal("the image's bytes")
		}
		if key == "page" && first["text"] != "<p>hi</p>" {
			t.Fatal("the text's bytes")
		}
	}
	if res := call(t, s, id, goodToken, tool("applet_artifact", `{"id":"req-1","key":"none"}`)); !isError(res) {
		t.Fatal("a missing artifact should be an error")
	}
	if res := call(t, s, id, goodToken, tool("applet_cancel", `{"id":"req-1"}`)); isError(res) {
		t.Fatalf("cancelling a finished record: %s", toolText(res))
	}
}

// A client that goes away ends the wait, and nothing is left running.
func TestClientCancelEndsWait(t *testing.T) {
	s, hub := testServer()
	id := initialize(t, s)
	leave := page(t, hub, func(relay.Invocation) {})
	defer leave()
	before := runtime.NumGoroutine()
	ctx, cancel := context.WithCancel(context.Background())
	finished := make(chan result, 1)
	go func() {
		res, _ := callCtx(ctx, s, id, goodToken, tool("applet_invoke", `{"action":"yavc.slides/go@1","waitSeconds":600}`))
		finished <- res
	}()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case res := <-finished:
		if st, _ := res.Result["structuredContent"].(map[string]any); st["status"] != "sent" {
			t.Fatalf("an unfinished record comes back as it is: %+v", res.Result)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancelling the client did not end the wait")
	}
	deadline := time.Now().Add(2 * time.Second)
	for runtime.NumGoroutine() > before && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if n := runtime.NumGoroutine(); n > before {
		t.Fatalf("%d goroutines after the wait ended, %d before", n, before)
	}
	if len(s.waits) != 0 {
		t.Fatalf("waits still counted: %v", s.waits)
	}
}

func TestWaitsPerTokenLimited(t *testing.T) {
	s, hub := testServer()
	id := initialize(t, s)
	leave := page(t, hub, func(relay.Invocation) {})
	defer leave()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	for i := 0; i < MaxWaits; i++ {
		go callCtx(ctx, s, id, goodToken, tool("applet_invoke", `{"action":"yavc.slides/go@1","waitSeconds":600}`))
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		n := s.waits["agent-1"]
		s.mu.Unlock()
		if n == MaxWaits {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	res := call(t, s, id, goodToken, tool("applet_invoke", `{"action":"yavc.slides/go@1","waitSeconds":5}`))
	if !isError(res) || !strings.Contains(toolText(res), "calls waiting") {
		t.Fatalf("a fifth wait: %q", toolText(res))
	}
	// Without waiting, the call is made.
	if res := call(t, s, id, goodToken, tool("applet_invoke", `{"action":"yavc.slides/go@1","waitSeconds":0}`)); isError(res) {
		t.Fatalf("a call that does not wait: %q", toolText(res))
	}
}

func TestDelete(t *testing.T) {
	s, _ := testServer()
	id := initialize(t, s)
	r := httptest.NewRequest(http.MethodDelete, "/mcp", nil)
	r.Header.Set("Mcp-Session-Id", id)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("DELETE: %d", w.Code)
	}
	if res := call(t, s, id, "", `{"jsonrpc":"2.0","id":2,"method":"ping"}`); res.status != 404 {
		t.Fatal("a deleted session still answers")
	}
	w = httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/mcp", bytes.NewReader(nil)))
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET: %d", w.Code)
	}
}
