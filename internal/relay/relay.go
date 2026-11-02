// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package relay carries an agent's invocations to a page the person has
// open and the page's reports back (docs/agents-design.md, decisions 4, 7
// and 8). The engine runs no action itself: a reader's files and every
// applet are in the browser, so the page's action broker runs each one
// and posts the record as it changes. A hub keeps, in memory, the pages
// connected for each session and the records of the invocations sent.
package relay

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"
)

// An Event goes down a page's stream: invoke, with an Invocation, or
// cancel, with an id.
type Event struct {
	Name string
	Data any
}

// Owner says who asked for an invocation, as the broker records it.
type Owner struct {
	Kind string `json:"kind"`
	Name string `json:"name,omitempty"`
	ID   string `json:"id,omitempty"`
}

// An Invocation is what the page is asked to run.
type Invocation struct {
	ID     string          `json:"id"`
	Action string          `json:"action"`
	Input  json.RawMessage `json:"input"`
	Owner  Owner           `json:"owner"`
	Grant  []string        `json:"grant"`
	RunMs  int             `json:"runMs,omitempty"`
}

// An Artifact is a file an action made, as the page sent it.
type Artifact struct {
	Name string
	Mime string
	Data []byte
}

// A Record is an invocation as the page last reported it.
type Record struct {
	ID        string
	Session   string
	Page      string
	inv       Invocation
	tried     map[string]bool
	Status    string
	View      json.RawMessage
	Artifacts map[string]Artifact
	Created   time.Time
	Updated   time.Time
	Finished  time.Time
	done      chan struct{}
}

// Done is closed when the record is done, failed or cancelled.
func (r *Record) Done() <-chan struct{} { return r.done }

type page struct {
	id string
	ch chan Event
}

type sessionHub struct {
	pages map[string]*page
	order []string // by joining, oldest first
	front string
}

// Hub is the relay for every session.
type Hub struct {
	mu       sync.Mutex
	sessions map[string]*sessionHub
	records  map[string]*Record
	// Keep is how long a finished record stays readable.
	Keep time.Duration
}

var (
	ErrNoPage   = errors.New("no page of this session is open")
	ErrNoRecord = errors.New("there is no such invocation")
	ErrBusy     = errors.New("the page is not keeping up")
)

func New() *Hub {
	return &Hub{sessions: map[string]*sessionHub{}, records: map[string]*Record{}, Keep: time.Hour}
}

func key(session, id string) string { return session + "/" + id }

// NewID makes an invocation id.
func NewID() string {
	var b [16]byte
	rand.Read(b[:])
	return base64.RawURLEncoding.EncodeToString(b[:])
}

// Subscribe joins a page to its session's hub. The page reads events from
// the channel and calls leave when it goes, which fails any invocation it
// was running.
func (h *Hub) Subscribe(session, pageID string) (<-chan Event, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	sh := h.sessions[session]
	if sh == nil {
		sh = &sessionHub{pages: map[string]*page{}}
		h.sessions[session] = sh
	}
	p := &page{id: pageID, ch: make(chan Event, 32)}
	sh.pages[pageID] = p
	sh.order = append(sh.order, pageID)
	sh.front = pageID
	return p.ch, func() { h.leave(session, pageID) }
}

func (h *Hub) leave(session, pageID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	sh := h.sessions[session]
	if sh == nil {
		return
	}
	delete(sh.pages, pageID)
	for i, id := range sh.order {
		if id == pageID {
			sh.order = append(sh.order[:i], sh.order[i+1:]...)
			break
		}
	}
	if sh.front == pageID {
		sh.front = ""
		if n := len(sh.order); n > 0 {
			sh.front = sh.order[n-1]
		}
	}
	if len(sh.pages) == 0 {
		delete(h.sessions, session)
	}
	for _, rec := range h.records {
		if rec.Session == session && rec.Page == pageID && rec.Finished.IsZero() {
			h.finishLocked(rec, "failed", "the page that was running it closed")
		}
	}
}

// Front says which page of the session the person is looking at.
func (h *Hub) Front(session, pageID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if sh := h.sessions[session]; sh != nil && sh.pages[pageID] != nil {
		sh.front = pageID
	}
}

// Connected says whether any page of the session is open.
func (h *Hub) Connected(session string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	sh := h.sessions[session]
	return sh != nil && len(sh.pages) > 0
}

// Invoke sends an invocation to the session's front page and records it.
// A second call with an id already recorded gives that record, so an
// agent that retries does not run the action twice.
func (h *Hub) Invoke(session string, inv Invocation) (*Record, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sweepLocked()
	if inv.ID == "" {
		inv.ID = NewID()
	}
	if rec := h.records[key(session, inv.ID)]; rec != nil {
		return rec, nil
	}
	sh := h.sessions[session]
	if sh == nil || len(sh.pages) == 0 {
		return nil, ErrNoPage
	}
	p := sh.pages[sh.front]
	if p == nil {
		p = sh.pages[sh.order[len(sh.order)-1]]
	}
	now := time.Now()
	view, _ := json.Marshal(map[string]any{"id": inv.ID, "action": inv.Action, "owner": inv.Owner, "status": "sent", "input": inv.Input, "created": now.UTC().Format(time.RFC3339Nano)})
	rec := &Record{ID: inv.ID, Session: session, Page: p.id, inv: inv, tried: map[string]bool{p.id: true}, Status: "sent", View: view, Artifacts: map[string]Artifact{}, Created: now, Updated: now, done: make(chan struct{})}
	select {
	case p.ch <- Event{Name: "invoke", Data: inv}:
	default:
		return nil, ErrBusy
	}
	h.records[key(session, inv.ID)] = rec
	return rec, nil
}

// Report takes the page's view of a record. The status comes from the
// view; done, failed and cancelled finish the record.
func (h *Hub) Report(session, id string, view json.RawMessage, artifacts map[string]Artifact) error {
	var v struct {
		Status string `json:"status"`
		Error  string `json:"error"`
	}
	if err := json.Unmarshal(view, &v); err != nil || v.Status == "" {
		return errors.New("the report is not a record")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	rec := h.records[key(session, id)]
	if rec == nil {
		return ErrNoRecord
	}
	if !rec.Finished.IsZero() {
		return nil
	}
	// A live action is answered by the open applet; a page without it
	// says so, and the invocation goes on to another page of the session
	// that has not been asked, since the applet may be open there
	// (docs/agents-design.md, decision 7).
	if v.Status == "failed" && strings.HasPrefix(v.Error, "no open ") {
		if sh := h.sessions[session]; sh != nil {
			for _, id := range sh.order {
				if p := sh.pages[id]; p != nil && !rec.tried[id] {
					select {
					case p.ch <- Event{Name: "invoke", Data: rec.inv}:
						rec.tried[id] = true
						rec.Page = id
						rec.Updated = time.Now()
						return nil
					default:
					}
				}
			}
		}
	}
	rec.View = view
	rec.Status = v.Status
	rec.Updated = time.Now()
	for k, a := range artifacts {
		rec.Artifacts[k] = a
	}
	if v.Status == "done" || v.Status == "failed" || v.Status == "cancelled" {
		rec.Finished = rec.Updated
		close(rec.done)
	}
	return nil
}

func (h *Hub) finishLocked(rec *Record, status, reason string) {
	var m map[string]any
	if json.Unmarshal(rec.View, &m) != nil || m == nil {
		m = map[string]any{"id": rec.ID}
	}
	m["status"] = status
	m["error"] = reason
	m["updated"] = time.Now().UTC().Format(time.RFC3339Nano)
	rec.View, _ = json.Marshal(m)
	rec.Status = status
	rec.Updated = time.Now()
	rec.Finished = rec.Updated
	close(rec.done)
}

// Cancel asks the page running an invocation to stop it.
func (h *Hub) Cancel(session, id string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	rec := h.records[key(session, id)]
	if rec == nil {
		return ErrNoRecord
	}
	if !rec.Finished.IsZero() {
		return nil
	}
	sh := h.sessions[session]
	if sh == nil || sh.pages[rec.Page] == nil {
		h.finishLocked(rec, "cancelled", "cancelled; the page that was running it had closed")
		return nil
	}
	select {
	case sh.pages[rec.Page].ch <- Event{Name: "cancel", Data: map[string]string{"id": id}}:
	default:
		return ErrBusy
	}
	return nil
}

// Record finds an invocation of the session.
func (h *Hub) Record(session, id string) (*Record, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	rec := h.records[key(session, id)]
	return rec, rec != nil
}

// Snapshot is a record's view and artifacts as they are now, copied.
func (h *Hub) Snapshot(rec *Record) (status string, view json.RawMessage, artifacts map[string]Artifact) {
	h.mu.Lock()
	defer h.mu.Unlock()
	arts := map[string]Artifact{}
	for k, a := range rec.Artifacts {
		arts[k] = a
	}
	return rec.Status, append(json.RawMessage(nil), rec.View...), arts
}

func (h *Hub) sweepLocked() {
	for k, rec := range h.records {
		if !rec.Finished.IsZero() && time.Since(rec.Finished) > h.Keep {
			delete(h.records, k)
		}
	}
}
