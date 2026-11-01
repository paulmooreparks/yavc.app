package relay

import (
	"encoding/json"
	"testing"
	"time"
)

func TestRelayRoundTrip(t *testing.T) {
	h := New()
	if _, err := h.Invoke("s1", Invocation{Action: "x/y@1", Input: json.RawMessage(`{}`)}); err != ErrNoPage {
		t.Fatalf("want ErrNoPage, got %v", err)
	}
	events, leave := h.Subscribe("s1", "p1")
	rec, err := h.Invoke("s1", Invocation{ID: "r1", Action: "x/y@1", Input: json.RawMessage(`{"a":1}`)})
	if err != nil {
		t.Fatal(err)
	}
	e := <-events
	if e.Name != "invoke" || e.Data.(Invocation).ID != "r1" {
		t.Fatalf("bad event %+v", e)
	}
	again, _ := h.Invoke("s1", Invocation{ID: "r1", Action: "x/y@1"})
	if again != rec {
		t.Fatal("a repeated id should give the same record")
	}
	if err := h.Report("s1", "r1", json.RawMessage(`{"id":"r1","status":"running","version":1}`), nil); err != nil {
		t.Fatal(err)
	}
	select {
	case <-rec.Done():
		t.Fatal("not done yet")
	default:
	}
	h.Report("s1", "r1", json.RawMessage(`{"id":"r1","status":"done","output":{"ok":true}}`), map[string]Artifact{"page": {Name: "a.html", Mime: "text/html", Data: []byte("<p>")}})
	select {
	case <-rec.Done():
	case <-time.After(time.Second):
		t.Fatal("should be done")
	}
	status, _, arts := h.Snapshot(rec)
	if status != "done" || string(arts["page"].Data) != "<p>" {
		t.Fatalf("bad snapshot %s %v", status, arts)
	}
	if _, err := h.Record("s2", "r1"); err {
		t.Fatal("another session must not see the record")
	}
	// A page closing fails what it was running.
	rec2, _ := h.Invoke("s1", Invocation{ID: "r2", Action: "x/y@1"})
	<-events
	leave()
	select {
	case <-rec2.Done():
	case <-time.After(time.Second):
		t.Fatal("leaving should fail the running record")
	}
	if st, view, _ := h.Snapshot(rec2); st != "failed" || !json.Valid(view) {
		t.Fatalf("bad %s %s", st, view)
	}
}
