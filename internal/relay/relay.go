// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package relay carries an agent's invocations to a page the person has
// open and the page's reports back (docs/agents-design.md, decisions 4, 7
// and 8). The engine runs no action itself: a reader's files and every
// applet are in the browser, so the page's action broker runs each one
// and posts the record as it changes. A hub keeps, in memory, the pages
// connected for each session and the records of the invocations sent.
//
// Everything a hub keeps is bounded: the streams of one session and of
// all of them, the records of one session still running, the bytes of
// each artifact and of each record's artifacts, and how long a record may
// run and stay readable after it finishes.
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

// The hub's limits.
const (
	// MaxArtifact is the most bytes one artifact may have, PUDL's rule.
	MaxArtifact = 4 << 20
	// MaxRecordArtifacts is the most bytes of artifacts one record may
	// keep in all.
	MaxRecordArtifacts = 16 << 20
	// MaxLive is how many records one session may have running at once.
	MaxLive = 32
	// MaxPageStreams is how many pages of one session may keep a stream
	// open; a page beyond it closes the oldest one's.
	MaxPageStreams = 8
	// Deadline is how long a record may run before the hub fails it: the
	// longest an agent may wait for one (600 seconds) and a margin.
	Deadline = 660 * time.Second
	// pageQueue is how many events wait for a page that is not reading.
	pageQueue = 32
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

// An Artifact is a file an action made, as the page sent it. Its Data is
// never changed once the hub has it, so copies of a record share it.
type Artifact struct {
	Name string
	Mime string
	Data []byte
}

// A Record is an invocation as the page last reported it. Its fields are
// the hub's; read them through Snapshot.
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
	deadline  time.Time
	done      chan struct{}
}

// Done is closed when the record is done, failed or cancelled.
func (r *Record) Done() <-chan struct{} { return r.done }

type page struct {
	id     string
	ch     chan Event
	closed bool
}

type sessionHub struct {
	pages map[string]*page
	order []*page // by joining, oldest first
	front string
}

// Hub is the relay for every session.
type Hub struct {
	mu       sync.Mutex
	sessions map[string]*sessionHub
	records  map[string]*Record
	live     map[string]int // records still running, by session
	streams  int
	// Keep is how long a finished record stays readable.
	Keep time.Duration
	// MaxStreams is how many streams the hub keeps open for all sessions.
	MaxStreams int
	now        func() time.Time
}

var (
	ErrNoPage       = errors.New("no page of this session is open")
	ErrNoRecord     = errors.New("there is no such invocation")
	ErrBusy         = errors.New("the page is not keeping up")
	ErrTooMany      = errors.New("too many invocations of this session are running")
	ErrStreams      = errors.New("the site has as many pages connected as it can keep")
	ErrFinished     = errors.New("the invocation has already finished")
	ErrNotRecord    = errors.New("the report is not a record")
	ErrEarly        = errors.New("artifacts come with the report that finishes the invocation")
	ErrArtifactSize = errors.New("the artifacts are larger than the relay keeps")
)

// New makes a hub with the default limits.
func New() *Hub {
	return &Hub{sessions: map[string]*sessionHub{}, records: map[string]*Record{}, live: map[string]int{},
		Keep: time.Hour, MaxStreams: 4096, now: time.Now}
}

func key(session, id string) string { return session + "/" + id }

// NewID makes an invocation id.
func NewID() string {
	var b [16]byte
	rand.Read(b[:])
	return base64.RawURLEncoding.EncodeToString(b[:])
}

// Subscribe joins a page to its session's hub. The page reads events from
// the channel, which the hub closes when it drops the page (another stream
// with the same page id, too many pages of the session, or the session
// deleted), and calls leave when it goes, which fails any invocation that
// page was running. A page that subscribes again with the same id takes
// over the old stream and the invocations sent to it.
func (h *Hub) Subscribe(session, pageID string) (<-chan Event, func(), error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	sh := h.sessions[session]
	if sh == nil {
		sh = &sessionHub{pages: map[string]*page{}}
		h.sessions[session] = sh
	}
	replaced := sh.pages[pageID]
	if replaced != nil {
		// The new stream inherits the old one's records, which name the
		// page by its id, so only the old stream itself goes.
		h.dropLocked(sh, replaced)
	} else {
		if h.streams >= h.MaxStreams {
			if len(sh.pages) == 0 {
				delete(h.sessions, session)
			}
			return nil, nil, ErrStreams
		}
		if len(sh.order) >= MaxPageStreams {
			oldest := sh.order[0]
			h.dropLocked(sh, oldest)
			h.failPageLocked(session, oldest.id, "the page that was running it was closed for a newer one")
		}
	}
	p := &page{id: pageID, ch: make(chan Event, pageQueue)}
	if replaced != nil {
		// Events the old stream had not yet written go down the new one.
		for e := range replaced.ch {
			p.ch <- e
		}
	}
	sh.pages[pageID] = p
	sh.order = append(sh.order, p)
	sh.front = pageID
	h.streams++
	return p.ch, func() { h.leave(session, p) }, nil
}

// dropLocked takes a page out of its session's hub and closes its stream.
func (h *Hub) dropLocked(sh *sessionHub, p *page) {
	if sh.pages[p.id] == p {
		delete(sh.pages, p.id)
	}
	for i, q := range sh.order {
		if q == p {
			sh.order = append(sh.order[:i], sh.order[i+1:]...)
			break
		}
	}
	if !p.closed {
		p.closed = true
		close(p.ch)
		h.streams--
	}
	if sh.front == p.id && sh.pages[p.id] == nil {
		sh.front = ""
		if n := len(sh.order); n > 0 {
			sh.front = sh.order[n-1].id
		}
	}
}

// leave is a page's stream ending. A stream the hub already dropped has
// nothing left to do: its place, and its records, belong to the stream
// that replaced it.
func (h *Hub) leave(session string, p *page) {
	h.mu.Lock()
	defer h.mu.Unlock()
	sh := h.sessions[session]
	if sh == nil || sh.pages[p.id] != p {
		return
	}
	h.dropLocked(sh, p)
	if len(sh.pages) == 0 {
		delete(h.sessions, session)
	}
	h.failPageLocked(session, p.id, "the page that was running it closed")
}

func (h *Hub) failPageLocked(session, pageID, reason string) {
	for _, rec := range h.records {
		if rec.Session == session && rec.Page == pageID && rec.Finished.IsZero() {
			h.finishLocked(rec, "failed", reason)
		}
	}
}

// CloseSession closes every stream of a session and fails what its pages
// were running, for a session the reader has deleted.
func (h *Hub) CloseSession(session string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if sh := h.sessions[session]; sh != nil {
		for _, p := range append([]*page(nil), sh.order...) {
			h.dropLocked(sh, p)
		}
		delete(h.sessions, session)
	}
	for _, rec := range h.records {
		if rec.Session == session && rec.Finished.IsZero() {
			h.finishLocked(rec, "failed", "the session was deleted")
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
// agent that retries does not run the action twice. The caller has
// checked that the action is one the site offers.
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
	if sh == nil || len(sh.order) == 0 {
		return nil, ErrNoPage
	}
	if h.live[session] >= MaxLive {
		return nil, ErrTooMany
	}
	p := sh.pages[sh.front]
	if p == nil {
		p = sh.order[len(sh.order)-1]
	}
	now := h.now()
	view, _ := json.Marshal(map[string]any{"id": inv.ID, "action": inv.Action, "owner": inv.Owner, "status": "sent", "input": inv.Input, "created": now.UTC().Format(time.RFC3339Nano)})
	rec := &Record{ID: inv.ID, Session: session, Page: p.id, inv: inv, tried: map[string]bool{p.id: true}, Status: "sent", View: view,
		Artifacts: map[string]Artifact{}, Created: now, Updated: now, deadline: now.Add(Deadline), done: make(chan struct{})}
	select {
	case p.ch <- Event{Name: "invoke", Data: inv}:
	default:
		return nil, ErrBusy
	}
	h.records[key(session, inv.ID)] = rec
	h.live[session]++
	return rec, nil
}

func final(status string) bool {
	return status == "done" || status == "failed" || status == "cancelled"
}

// Report takes the page's view of a record. The status comes from the
// view; done, failed and cancelled finish the record, and only the report
// that finishes it may bring artifacts. A report on a finished record is
// refused with ErrFinished.
func (h *Hub) Report(session, id string, view json.RawMessage, artifacts map[string]Artifact) error {
	var v struct {
		Status string `json:"status"`
		Error  string `json:"error"`
	}
	if err := json.Unmarshal(view, &v); err != nil || v.Status == "" {
		return ErrNotRecord
	}
	if len(artifacts) > 0 && !final(v.Status) {
		return ErrEarly
	}
	total := 0
	for _, a := range artifacts {
		if len(a.Data) > MaxArtifact {
			return ErrArtifactSize
		}
		total += len(a.Data)
	}
	if total > MaxRecordArtifacts {
		return ErrArtifactSize
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sweepLocked()
	rec := h.records[key(session, id)]
	if rec == nil {
		return ErrNoRecord
	}
	if !rec.Finished.IsZero() {
		return ErrFinished
	}
	// A live action is answered by the open applet; a page without it
	// says so, and the invocation goes on to another page of the session
	// that has not been asked, since the applet may be open there
	// (docs/agents-design.md, decision 7).
	if v.Status == "failed" && strings.HasPrefix(v.Error, "no open ") {
		if sh := h.sessions[session]; sh != nil {
			for _, p := range sh.order {
				if rec.tried[p.id] {
					continue
				}
				select {
				case p.ch <- Event{Name: "invoke", Data: rec.inv}:
					rec.tried[p.id] = true
					rec.Page = p.id
					rec.Updated = h.now()
					return nil
				default:
				}
			}
		}
	}
	rec.View = append(json.RawMessage(nil), view...)
	rec.Status = v.Status
	rec.Updated = h.now()
	for k, a := range artifacts {
		rec.Artifacts[k] = a
	}
	if final(v.Status) {
		h.closeLocked(rec)
	}
	return nil
}

// finishLocked ends a record the page did not finish, with the reason in
// its view.
func (h *Hub) finishLocked(rec *Record, status, reason string) {
	var m map[string]any
	if json.Unmarshal(rec.View, &m) != nil || m == nil {
		m = map[string]any{"id": rec.ID}
	}
	now := h.now()
	m["status"] = status
	m["error"] = reason
	m["updated"] = now.UTC().Format(time.RFC3339Nano)
	rec.View, _ = json.Marshal(m)
	rec.Status = status
	rec.Updated = now
	h.closeLocked(rec)
}

func (h *Hub) closeLocked(rec *Record) {
	rec.Finished = rec.Updated
	close(rec.done)
	if h.live[rec.Session]--; h.live[rec.Session] <= 0 {
		delete(h.live, rec.Session)
	}
}

// Cancel asks the page running an invocation to stop it. With that page
// gone the record is cancelled at once.
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
	h.sweepLocked()
	rec := h.records[key(session, id)]
	return rec, rec != nil
}

// Snapshot is a record's status, view and artifacts as they are now. The
// view and the map are copies; the artifacts' bytes are shared, since the
// hub never changes them.
func (h *Hub) Snapshot(rec *Record) (status string, view json.RawMessage, artifacts map[string]Artifact) {
	h.mu.Lock()
	defer h.mu.Unlock()
	arts := make(map[string]Artifact, len(rec.Artifacts))
	for k, a := range rec.Artifacts {
		arts[k] = a
	}
	return rec.Status, append(json.RawMessage(nil), rec.View...), arts
}

// Sweep fails the records that have run past their deadline and forgets
// the finished ones kept longer than Keep. The hub sweeps on every
// Invoke, Report and Record; a server also calls it on a ticker so a quiet
// hub lets go of what it holds.
func (h *Hub) Sweep() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sweepLocked()
}

func (h *Hub) sweepLocked() {
	now := h.now()
	for k, rec := range h.records {
		if rec.Finished.IsZero() && now.After(rec.deadline) {
			h.finishLocked(rec, "failed", "the page did not finish it in time")
		}
		if !rec.Finished.IsZero() && now.Sub(rec.Finished) > h.Keep {
			delete(h.records, k)
		}
	}
}
