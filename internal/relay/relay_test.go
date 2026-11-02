package relay

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

// clock is a time the test moves by hand.
type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }
func testHub() (*Hub, *clock) {
	h := New()
	c := &clock{t: time.Unix(1_800_000_000, 0)}
	h.now = c.now
	return h, c
}
func view(id, status string) json.RawMessage {
	return json.RawMessage(`{"id":"` + id + `","status":"` + status + `"}`)
}

func subscribe(t *testing.T, h *Hub, session, page string) (<-chan Event, func()) {
	t.Helper()
	ch, leave, err := h.Subscribe(session, page)
	if err != nil {
		t.Fatal(err)
	}
	return ch, leave
}

func invoke(t *testing.T, h *Hub, session, id string) *Record {
	t.Helper()
	rec, err := h.Invoke(session, Invocation{ID: id, Action: "x/y@1", Input: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	return rec
}

func done(rec *Record) bool {
	select {
	case <-rec.Done():
		return true
	default:
		return false
	}
}

func TestRelayRoundTrip(t *testing.T) {
	h := New()
	if _, err := h.Invoke("s1", Invocation{Action: "x/y@1", Input: json.RawMessage(`{}`)}); err != ErrNoPage {
		t.Fatalf("want ErrNoPage, got %v", err)
	}
	events, leave := subscribe(t, h, "s1", "p1")
	rec, err := h.Invoke("s1", Invocation{ID: "r1", Action: "x/y@1", Input: json.RawMessage(`{"a":1}`)})
	if err != nil {
		t.Fatal(err)
	}
	e := <-events
	if e.Name != "invoke" || e.Data.(Invocation).ID != "r1" {
		t.Fatalf("bad event %+v", e)
	}
	if err := h.Report("s1", "r1", json.RawMessage(`{"id":"r1","status":"running","version":1}`), nil); err != nil {
		t.Fatal(err)
	}
	if done(rec) {
		t.Fatal("not done yet")
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
	if _, found := h.Record("s2", "r1"); found {
		t.Fatal("another session must not see the record")
	}
	// A page closing fails what it was running.
	rec2 := invoke(t, h, "s1", "r2")
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

// A repeated id gives the record already made, and sends nothing again.
func TestInvokeIdempotent(t *testing.T) {
	h, _ := testHub()
	events, _ := subscribe(t, h, "s", "p")
	a := invoke(t, h, "s", "r")
	b := invoke(t, h, "s", "r")
	if a != b {
		t.Fatal("a repeated id should give the same record")
	}
	<-events
	select {
	case e := <-events:
		t.Fatalf("a repeat was sent again: %+v", e)
	default:
	}
}

// An invocation goes to the front page, or the newest page when the front
// one has gone.
func TestFrontFallback(t *testing.T) {
	h, _ := testHub()
	a, _ := subscribe(t, h, "s", "a")
	b, leaveB := subscribe(t, h, "s", "b")
	h.Front("s", "a")
	invoke(t, h, "s", "r1")
	if e := <-a; e.Data.(Invocation).ID != "r1" {
		t.Fatal("the front page should run it")
	}
	h.Front("s", "b")
	leaveB()
	invoke(t, h, "s", "r2")
	if e := <-a; e.Data.(Invocation).ID != "r2" {
		t.Fatal("with the front page gone the remaining page should run it")
	}
	_ = b
}

// A page without the live applet says so, and the invocation goes on to a
// page not yet asked.
func TestRerouting(t *testing.T) {
	h, _ := testHub()
	a, _ := subscribe(t, h, "s", "a")
	b, _ := subscribe(t, h, "s", "b")
	h.Front("s", "a")
	rec := invoke(t, h, "s", "r")
	<-a
	if err := h.Report("s", "r", json.RawMessage(`{"status":"failed","error":"no open slides"}`), nil); err != nil {
		t.Fatal(err)
	}
	if e := <-b; e.Data.(Invocation).ID != "r" {
		t.Fatal("the other page should be asked")
	}
	if done(rec) || rec.Page != "b" {
		t.Fatalf("rerouted record: done %v page %s", done(rec), rec.Page)
	}
	// With every page asked, the failure stands.
	h.Report("s", "r", json.RawMessage(`{"status":"failed","error":"no open slides"}`), nil)
	if !done(rec) {
		t.Fatal("asked everywhere, the record should fail")
	}
}

func TestErrBusyAt32(t *testing.T) {
	h, _ := testHub()
	events, _ := subscribe(t, h, "s", "p")
	go func() {
		for range events {
		}
	}()
	for i := 0; i < MaxLive; i++ {
		invoke(t, h, "s", "r"+strings.Repeat("x", i+1))
	}
	if _, err := h.Invoke("s", Invocation{ID: "one-more", Action: "x/y@1"}); !errors.Is(err, ErrTooMany) {
		t.Fatalf("want ErrTooMany, got %v", err)
	}
	// Finishing one makes room for one.
	h.Report("s", "rx", view("rx", "done"), nil)
	if _, err := h.Invoke("s", Invocation{ID: "one-more", Action: "x/y@1"}); err != nil {
		t.Fatal(err)
	}
	// A page that is not reading fills its queue, and the hub says so.
	h2, _ := testHub()
	subscribe(t, h2, "s", "p")
	for i := 0; i < pageQueue; i++ {
		if _, err := h2.Invoke("s", Invocation{Action: "x/y@1", ID: "q" + strings.Repeat("x", i)}); err != nil {
			t.Fatal(err)
		}
	}
	if err := h2.Cancel("s", "q"); !errors.Is(err, ErrBusy) {
		t.Fatalf("want ErrBusy from a full queue, got %v", err)
	}
}

func TestCancelWithPageGone(t *testing.T) {
	h, _ := testHub()
	events, leave := subscribe(t, h, "s", "p")
	rec := invoke(t, h, "s", "r")
	<-events
	if err := h.Cancel("s", "r"); err != nil {
		t.Fatal(err)
	}
	if e := <-events; e.Name != "cancel" {
		t.Fatalf("the page should be asked to cancel, got %+v", e)
	}
	// The record survives its page only until leave fails it; one whose
	// page has gone by another route is cancelled at once.
	h.mu.Lock()
	rec.Page = "elsewhere"
	h.mu.Unlock()
	if err := h.Cancel("s", "r"); err != nil {
		t.Fatal(err)
	}
	if st, _, _ := h.Snapshot(rec); st != "cancelled" || !done(rec) {
		t.Fatalf("cancelled with the page gone: %s", st)
	}
	leave()
	if err := h.Cancel("s", "nothing"); !errors.Is(err, ErrNoRecord) {
		t.Fatalf("want ErrNoRecord, got %v", err)
	}
}

func TestSnapshotIsCopy(t *testing.T) {
	h, _ := testHub()
	subscribe(t, h, "s", "p")
	rec := invoke(t, h, "s", "r")
	h.Report("s", "r", view("r", "done"), map[string]Artifact{"a": {Name: "a", Data: []byte("x")}})
	_, v, arts := h.Snapshot(rec)
	v[0] = '!'
	delete(arts, "a")
	_, v2, arts2 := h.Snapshot(rec)
	if v2[0] != '{' || len(arts2) != 1 {
		t.Fatal("a snapshot must not share the record's view or map")
	}
}

func TestSweepAfterKeep(t *testing.T) {
	h, c := testHub()
	subscribe(t, h, "s", "p")
	invoke(t, h, "s", "r")
	h.Report("s", "r", view("r", "done"), nil)
	c.add(h.Keep - time.Second)
	if _, ok := h.Record("s", "r"); !ok {
		t.Fatal("a finished record is kept for Keep")
	}
	c.add(2 * time.Second)
	if _, ok := h.Record("s", "r"); ok {
		t.Fatal("a finished record is forgotten after Keep")
	}
}

// A report on a finished record is refused.
func TestReportOnFinished(t *testing.T) {
	h, _ := testHub()
	subscribe(t, h, "s", "p")
	rec := invoke(t, h, "s", "r")
	h.Report("s", "r", view("r", "failed"), nil)
	if err := h.Report("s", "r", view("r", "done"), nil); !errors.Is(err, ErrFinished) {
		t.Fatalf("want ErrFinished, got %v", err)
	}
	if st, _, _ := h.Snapshot(rec); st != "failed" {
		t.Fatalf("a late report changed the record to %s", st)
	}
	if err := h.Report("s", "r", json.RawMessage(`{}`), nil); !errors.Is(err, ErrNotRecord) {
		t.Fatalf("want ErrNotRecord, got %v", err)
	}
}

// A page leaving fails only the records it was running.
func TestLeaveFailsOnlyItsRecords(t *testing.T) {
	h, _ := testHub()
	a, leaveA := subscribe(t, h, "s", "a")
	b, _ := subscribe(t, h, "s", "b")
	h.Front("s", "a")
	ra := invoke(t, h, "s", "ra")
	h.Front("s", "b")
	rb := invoke(t, h, "s", "rb")
	<-a
	<-b
	leaveA()
	if !done(ra) || done(rb) {
		t.Fatalf("leave failed the wrong records: a %v b %v", done(ra), done(rb))
	}
}

func TestReportArtifactBudget(t *testing.T) {
	h, _ := testHub()
	subscribe(t, h, "s", "p")
	invoke(t, h, "s", "r")
	small := map[string]Artifact{"a": {Data: []byte("x")}}
	// Artifacts come only with the report that finishes the record.
	if err := h.Report("s", "r", view("r", "running"), small); !errors.Is(err, ErrEarly) {
		t.Fatalf("want ErrEarly, got %v", err)
	}
	big := map[string]Artifact{"a": {Data: make([]byte, MaxArtifact+1)}}
	if err := h.Report("s", "r", view("r", "done"), big); !errors.Is(err, ErrArtifactSize) {
		t.Fatalf("one artifact over 4 MB: %v", err)
	}
	many := map[string]Artifact{}
	for _, k := range []string{"a", "b", "c", "d", "e"} {
		many[k] = Artifact{Data: make([]byte, MaxArtifact)}
	}
	if err := h.Report("s", "r", view("r", "done"), many); !errors.Is(err, ErrArtifactSize) {
		t.Fatalf("a record over 16 MB: %v", err)
	}
	delete(many, "e")
	if err := h.Report("s", "r", view("r", "done"), many); err != nil {
		t.Fatalf("16 MB in four artifacts should be kept: %v", err)
	}
}

func TestUnfinishedRecordsExpire(t *testing.T) {
	h, c := testHub()
	subscribe(t, h, "s", "p")
	rec := invoke(t, h, "s", "r")
	c.add(Deadline - time.Second)
	h.Sweep()
	if done(rec) {
		t.Fatal("expired before its deadline")
	}
	c.add(2 * time.Second)
	// Reading the record sweeps, without the ticker.
	if _, ok := h.Record("s", "r"); !ok || !done(rec) {
		t.Fatal("a record past its deadline should fail")
	}
	if st, v, _ := h.Snapshot(rec); st != "failed" || !strings.Contains(string(v), "in time") {
		t.Fatalf("expired record: %s %s", st, v)
	}
	if err := h.Report("s", "r", view("r", "done"), nil); !errors.Is(err, ErrFinished) {
		t.Fatalf("a report after the deadline is refused: %v", err)
	}
	if h.live["s"] != 0 {
		t.Fatalf("live count %d after expiry", h.live["s"])
	}
}

// A page that subscribes again with the same id replaces its old stream:
// the old channel is closed, the old stream's leave does nothing, and the
// records sent to the page go on with the new stream.
func TestResubscribeSamePage(t *testing.T) {
	h, _ := testHub()
	old, leaveOld := subscribe(t, h, "s", "p")
	rec := invoke(t, h, "s", "r")
	fresh, leaveFresh := subscribe(t, h, "s", "p")
	if _, open := <-old; open {
		t.Fatal("the old stream should be closed, its queue emptied into the new one")
	}
	// The invocation still queued for the old stream went to the new one.
	if e := <-fresh; e.Data.(Invocation).ID != "r" {
		t.Fatalf("the queued invocation should move to the new stream, got %+v", e)
	}
	leaveOld()
	if done(rec) {
		t.Fatal("the old stream's leave failed a record the new stream holds")
	}
	if !h.Connected("s") || len(h.sessions["s"].order) != 1 {
		t.Fatalf("one page should remain, have %d", len(h.sessions["s"].order))
	}
	if err := h.Report("s", "r", view("r", "done"), nil); err != nil || !done(rec) {
		t.Fatalf("the new stream's report: %v", err)
	}
	rec2 := invoke(t, h, "s", "r2")
	<-fresh
	leaveFresh()
	if !done(rec2) || h.Connected("s") {
		t.Fatal("the new stream's leave should fail its record and leave nothing")
	}
}

func TestSubscribeCapPerSession(t *testing.T) {
	h, _ := testHub()
	first, _ := subscribe(t, h, "s", "page-0")
	rec := invoke(t, h, "s", "r")
	<-first
	for i := 1; i <= MaxPageStreams; i++ {
		subscribe(t, h, "s", "page-"+string(rune('0'+i)))
	}
	if _, open := <-first; open {
		t.Fatal("the oldest stream should be closed")
	}
	if !done(rec) {
		t.Fatal("the evicted page's record should fail")
	}
	if n := len(h.sessions["s"].order); n != MaxPageStreams {
		t.Fatalf("%d streams for one session", n)
	}
	// The hub's own limit over every session.
	h2, _ := testHub()
	h2.MaxStreams = 2
	subscribe(t, h2, "a", "p")
	subscribe(t, h2, "b", "p")
	if _, _, err := h2.Subscribe("c", "p"); !errors.Is(err, ErrStreams) {
		t.Fatalf("want ErrStreams, got %v", err)
	}
	if _, ok := h2.sessions["c"]; ok {
		t.Fatal("a refused stream should leave no session behind")
	}
	// Replacing a page is not a new stream.
	if _, _, err := h2.Subscribe("a", "p"); err != nil {
		t.Fatalf("replacing a page under the limit: %v", err)
	}
}

func TestCloseSession(t *testing.T) {
	h, _ := testHub()
	events, leave := subscribe(t, h, "s", "p")
	rec := invoke(t, h, "s", "r")
	<-events
	h.CloseSession("s")
	if _, open := <-events; open {
		t.Fatal("the stream should be closed")
	}
	if !done(rec) || h.Connected("s") {
		t.Fatal("closing the session should fail its records and drop its pages")
	}
	leave()
	if h.streams != 0 {
		t.Fatalf("%d streams counted after closing", h.streams)
	}
}
