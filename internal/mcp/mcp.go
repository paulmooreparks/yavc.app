// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package mcp lets an AI agent drive yavc.app's applications through the
// Model Context Protocol, over its Streamable HTTP transport, with the
// five tools the PUDL specification recommends as the binding of the
// applet actions contract: applet_discover, applet_invoke, applet_status,
// applet_cancel and applet_artifact (docs/agents-design.md, decision 4).
// Discovery answers from the site's catalogue. The rest is relayed to a
// page the person has open, through the relay package, because the
// person's files and every applet are in the browser. The shape of the
// server is PUDL Desktop's internal/mcp.
package mcp

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"yavc.app/internal/relay"
)

// The protocol versions this server speaks, newest first.
var versions = []string{"2025-06-18", "2025-03-26"}

// A Provider is one application's manifest as the catalogue lists it.
type Provider struct {
	ID          string           `json:"id"`
	Applet      string           `json:"applet"`
	Title       string           `json:"title"`
	Description string           `json:"description,omitempty"`
	Page        string           `json:"page"`
	Manifest    string           `json:"manifest"`
	Module      string           `json:"module,omitempty"`
	Actions     []map[string]any `json:"actions"`
}

// A Peer is the person an agent's token pairs it to.
type Peer struct {
	Session string
	ID      string
	Name    string
	Grant   []string
}

// Server is the MCP endpoint.
type Server struct {
	// Name and Title describe the site to the agent.
	Name, Title, Version string
	// Catalog is the site's providers, for the request's addresses.
	Catalog func(r *http.Request) []Provider
	// Pair finds the person a bearer token pairs to, or false.
	Pair func(token string) (Peer, bool)
	// Hub relays invocations to the person's pages.
	Hub *relay.Hub

	mu       sync.Mutex
	sessions map[string]*session
	// waits is how many applet_invoke calls are waiting, by token.
	waits map[string]int
	now   func() time.Time
	// uses counts every making or use of a session, so the one used longest
	// ago is known exactly even when the clock gives two uses the same time.
	uses uint64
}

type session struct {
	used time.Time
	use  uint64
}

// The server's limits.
const (
	// MaxSessions is how many MCP sessions the server keeps; making one
	// more forgets the one used longest ago.
	MaxSessions = 1024
	// SessionIdle is how long an MCP session lasts unused.
	SessionIdle = time.Hour
	// MaxWaits is how many applet_invoke calls one token may have waiting
	// for their result at once.
	MaxWaits = 4
	// MaxBody is the largest request the endpoint reads.
	MaxBody = 16 << 20
	// MaxWait is the longest applet_invoke waits.
	MaxWait = 600 * time.Second
)

func New(s *Server) *Server {
	s.sessions = map[string]*session{}
	s.waits = map[string]int{}
	if s.now == nil {
		s.now = time.Now
	}
	if s.Name == "" {
		s.Name = "yavc.app"
	}
	if s.Title == "" {
		s.Title = s.Name
	}
	if s.Version == "" {
		s.Version = "0.1.0"
	}
	return s
}

const instructions = `%s is a desktop of applications, each also a page of its own, built so that an agent can do what a person can do in them. Every application publishes actions with JSON Schemas for input and output. Start with applet_discover, which needs no token: the whole catalogue is large, so pass provider for one application once you know which. To run anything, the person must have paired you: they make a token in the site's Settings, under Agents, and you send it as a bearer token; without one, applet_invoke says so, and you should ask the person for a token rather than guess. An invocation runs on a page the person has open in their browser, with their files and state, so the person must have the site open; the person may be asked on that page to allow an action that needs more than your token grants, and may refuse. applet_invoke waits for the result up to waitSeconds; a record still running is read again with applet_status. An action marked live is answered by the open application, and opening one is itself an action, such as yavc.slides/present@1.`

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
	case http.MethodDelete:
		s.mu.Lock()
		delete(s.sessions, r.Header.Get("Mcp-Session-Id"))
		s.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
		return
	default:
		// The server sends nothing of its own accord, so it offers no stream.
		w.Header().Set("Allow", "POST, DELETE")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req rpcRequest
	err := json.NewDecoder(http.MaxBytesReader(w, r.Body, MaxBody)).Decode(&req)
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		replyStatus(w, http.StatusRequestEntityTooLarge, nil, nil, &rpcError{-32600, "The request is larger than this server reads."})
		return
	}
	if err != nil || req.JSONRPC != "2.0" || req.Method == "" {
		reply(w, nil, nil, &rpcError{-32700, "The body is not a JSON-RPC 2.0 request."})
		return
	}
	// A notification, which has no id, is accepted and needs no answer.
	if len(req.ID) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	if req.Method == "initialize" {
		s.initialize(w, req)
		return
	}
	sess := s.session(r.Header.Get("Mcp-Session-Id"))
	if sess == nil {
		replyStatus(w, http.StatusNotFound, req.ID, nil, &rpcError{-32001, "Unknown or expired session; initialize again."})
		return
	}
	switch req.Method {
	case "ping":
		reply(w, req.ID, struct{}{}, nil)
	case "tools/list":
		reply(w, req.ID, map[string]any{"tools": tools}, nil)
	case "tools/call":
		s.call(w, r, req)
	default:
		reply(w, req.ID, nil, &rpcError{-32601, "No such method: " + req.Method})
	}
}

func (s *Server) initialize(w http.ResponseWriter, req rpcRequest) {
	var p struct {
		ProtocolVersion string `json:"protocolVersion"`
	}
	json.Unmarshal(req.Params, &p)
	version := versions[0]
	for _, v := range versions {
		if v == p.ProtocolVersion {
			version = v
		}
	}
	b := make([]byte, 16)
	rand.Read(b)
	id := hex.EncodeToString(b)
	s.mu.Lock()
	s.sweepLocked()
	if len(s.sessions) >= MaxSessions {
		oldest, at := "", uint64(0)
		for k, sess := range s.sessions {
			if oldest == "" || sess.use < at {
				oldest, at = k, sess.use
			}
		}
		delete(s.sessions, oldest)
	}
	s.uses++
	s.sessions[id] = &session{used: s.now(), use: s.uses}
	s.mu.Unlock()
	w.Header().Set("Mcp-Session-Id", id)
	reply(w, req.ID, map[string]any{
		"protocolVersion": version,
		"capabilities":    map[string]any{"tools": map[string]any{}},
		"serverInfo":      map[string]any{"name": s.Name, "title": s.Title, "version": s.Version},
		"instructions":    fmt.Sprintf(instructions, s.Title),
	}, nil)
}

func (s *Server) session(id string) *session {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess := s.sessions[id]
	if sess != nil && s.now().Sub(sess.used) > SessionIdle {
		delete(s.sessions, id)
		sess = nil
	}
	if sess != nil {
		s.uses++
		sess.used, sess.use = s.now(), s.uses
	}
	return sess
}

// Sweep forgets the sessions unused for longer than SessionIdle. The
// server sweeps whenever a session is made; a host may also call it on a
// ticker.
func (s *Server) Sweep() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweepLocked()
}

func (s *Server) sweepLocked() {
	for k, sess := range s.sessions {
		if s.now().Sub(sess.used) > SessionIdle {
			delete(s.sessions, k)
		}
	}
}

func schema(props map[string]any, required ...string) map[string]any {
	m := map[string]any{"type": "object", "properties": props, "additionalProperties": false}
	if len(required) > 0 {
		m["required"] = required
	}
	return m
}

var yes, no = true, false

var tools = []map[string]any{
	{
		"name":        "applet_discover",
		"title":       "Discover applet actions",
		"description": "Lists the applications' actions with their schemas, capabilities and replay rules. Pass provider, such as yavc.slides, for one application's actions, or action, a reference such as yavc.slides/go@1, for one; with neither the whole catalogue is returned, which is large. Needs no token.",
		"inputSchema": schema(map[string]any{
			"provider": map[string]any{"type": "string", "description": "A provider id, such as yavc.slides."},
			"action":   map[string]any{"type": "string", "description": "An action reference, such as yavc.slides/go@1."},
		}),
		"annotations": map[string]any{"readOnlyHint": yes, "openWorldHint": no},
	},
	{
		"name":        "applet_invoke",
		"title":       "Run an applet action",
		"description": "Runs an action on a page the paired person has open, with the input the action's schema asks for, and waits up to waitSeconds for the record to finish. The record comes back whatever its status: done with its output, failed with why, waiting for the person, or still running, which applet_status reads again. Needs the person's token.",
		"inputSchema": schema(map[string]any{
			"action":      map[string]any{"type": "string", "description": "The action's reference."},
			"input":       map[string]any{"type": "object", "description": "The input, as the action's inputSchema says."},
			"requestId":   map[string]any{"type": "string", "description": "An id of your own, 1 to 128 letters, digits, - and _. Send it again with the same call if a response is lost: the same invocation is returned, not a second run."},
			"waitSeconds": map[string]any{"type": "integer", "minimum": 0, "maximum": 600, "description": "How long to wait for the result; 60 by default."},
		}, "action"),
		"annotations": map[string]any{"readOnlyHint": no, "destructiveHint": yes, "openWorldHint": no},
	},
	{
		"name":        "applet_status",
		"title":       "Read an invocation",
		"description": "The record of an invocation you made, as the page last reported it.",
		"inputSchema": schema(map[string]any{"id": map[string]any{"type": "string"}}, "id"),
		"annotations": map[string]any{"readOnlyHint": yes, "openWorldHint": no},
	},
	{
		"name":        "applet_cancel",
		"title":       "Cancel an invocation",
		"description": "Asks the page to stop an invocation that is running or waiting.",
		"inputSchema": schema(map[string]any{"id": map[string]any{"type": "string"}}, "id"),
		"annotations": map[string]any{"readOnlyHint": no, "destructiveHint": yes, "openWorldHint": no},
	},
	{
		"name":        "applet_artifact",
		"title":       "Read an artifact",
		"description": "A file an invocation made, by the invocation's id and the artifact's key from its record: a picture as an image, text as text, anything else as a resource.",
		"inputSchema": schema(map[string]any{"id": map[string]any{"type": "string"}, "key": map[string]any{"type": "string"}}, "id", "key"),
		"annotations": map[string]any{"readOnlyHint": yes, "openWorldHint": no},
	},
}

func (s *Server) peer(r *http.Request) (Peer, bool) {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(strings.ToLower(auth), "bearer ") || s.Pair == nil {
		return Peer{}, false
	}
	return s.Pair(strings.TrimSpace(auth[7:]))
}

func (s *Server) call(w http.ResponseWriter, r *http.Request, req rpcRequest) {
	var p struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(req.Params, &p); err != nil {
		reply(w, req.ID, nil, &rpcError{-32602, "The call's parameters could not be read."})
		return
	}
	var result map[string]any
	var err error
	switch p.Name {
	case "applet_discover":
		result, err = s.discover(r, p.Arguments)
	case "applet_invoke":
		result, err = s.invoke(r, p.Arguments)
	case "applet_status":
		result, err = s.status(r, p.Arguments)
	case "applet_cancel":
		result, err = s.cancel(r, p.Arguments)
	case "applet_artifact":
		result, err = s.artifact(r, p.Arguments)
	default:
		reply(w, req.ID, nil, &rpcError{-32602, "No such tool: " + p.Name})
		return
	}
	if err != nil {
		reply(w, req.ID, map[string]any{"content": []map[string]any{{"type": "text", "text": err.Error()}}, "isError": true}, nil)
		return
	}
	reply(w, req.ID, result, nil)
}

func text(v any) map[string]any {
	b, _ := json.MarshalIndent(v, "", "  ")
	return map[string]any{"content": []map[string]any{{"type": "text", "text": string(b)}}, "structuredContent": v}
}

func (s *Server) discover(r *http.Request, args json.RawMessage) (map[string]any, error) {
	var a struct{ Provider, Action string }
	json.Unmarshal(args, &a)
	all := s.Catalog(r)
	if a.Action != "" {
		for _, p := range all {
			for _, act := range p.Actions {
				if ref, _ := act["ref"].(string); ref == a.Action {
					return text(map[string]any{"provider": p.ID, "applet": p.Applet, "page": p.Page, "action": act}), nil
				}
			}
		}
		return nil, fmt.Errorf("there is no action %s; applet_discover with no arguments lists them all", a.Action)
	}
	if a.Provider != "" {
		for _, p := range all {
			if p.ID == a.Provider {
				return text(p), nil
			}
		}
		return nil, fmt.Errorf("there is no provider %s; applet_discover with no arguments lists them all", a.Provider)
	}
	brief := make([]map[string]any, 0, len(all))
	for _, p := range all {
		refs := make([]string, 0, len(p.Actions))
		for _, act := range p.Actions {
			ref, _ := act["ref"].(string)
			title, _ := act["title"].(string)
			refs = append(refs, ref+": "+title)
		}
		brief = append(brief, map[string]any{"id": p.ID, "applet": p.Applet, "title": p.Title, "description": p.Description, "page": p.Page, "actions": refs})
	}
	return text(map[string]any{"providers": brief, "note": "Pass provider for an application's actions with their schemas."}), nil
}

var recordID = func(id string) bool {
	if len(id) < 1 || len(id) > 128 {
		return false
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func (s *Server) invoke(r *http.Request, args json.RawMessage) (map[string]any, error) {
	peer, ok := s.peer(r)
	if !ok {
		return nil, fmt.Errorf("no person is paired: send the token the person made in Settings, under Agents, as a bearer token")
	}
	var a struct {
		Action      string          `json:"action"`
		Input       json.RawMessage `json:"input"`
		RequestID   string          `json:"requestId"`
		WaitSeconds *int            `json:"waitSeconds"`
	}
	if err := json.Unmarshal(args, &a); err != nil || a.Action == "" {
		return nil, fmt.Errorf("applet_invoke needs an action and its input")
	}
	if len(a.Input) == 0 {
		a.Input = json.RawMessage("{}")
	}
	if a.RequestID != "" && !recordID(a.RequestID) {
		return nil, fmt.Errorf("a requestId is 1 to 128 letters, digits, - and _")
	}
	if !s.offers(r, a.Action) {
		return nil, fmt.Errorf("there is no action %s; applet_discover lists the actions there are", a.Action)
	}
	wait := waitFor(a.WaitSeconds)
	if wait > 0 {
		if !s.startWait(peer.ID) {
			return nil, fmt.Errorf("this token already has %d calls waiting for their results; wait for one to finish, or pass waitSeconds 0 and read the record with applet_status", MaxWaits)
		}
		defer s.endWait(peer.ID)
	}
	rec, err := s.Hub.Invoke(peer.Session, relay.Invocation{
		ID: a.RequestID, Action: a.Action, Input: a.Input,
		Owner: relay.Owner{Kind: "agent", Name: peer.Name, ID: peer.ID}, Grant: peer.Grant,
	})
	if errors.Is(err, relay.ErrNoPage) {
		return nil, fmt.Errorf("no page of the site is open for %s: ask the person to open %s in their browser and keep it open", peer.Name, s.Title)
	}
	if err != nil {
		return nil, err
	}
	ctx, stop := context.WithTimeout(r.Context(), wait)
	defer stop()
	select {
	case <-rec.Done():
	case <-ctx.Done():
	}
	return s.view(rec), nil
}

// waitFor is how long applet_invoke waits for waitSeconds: 60 seconds when
// it is not given, and otherwise between none and MaxWait.
func waitFor(seconds *int) time.Duration {
	if seconds == nil {
		return 60 * time.Second
	}
	return time.Duration(max(0, min(int(MaxWait/time.Second), *seconds))) * time.Second
}

// offers says whether the catalogue has an action with this reference.
func (s *Server) offers(r *http.Request, ref string) bool {
	if s.Catalog == nil {
		return false
	}
	for _, p := range s.Catalog(r) {
		for _, act := range p.Actions {
			if have, _ := act["ref"].(string); have == ref {
				return true
			}
		}
	}
	return false
}

func (s *Server) startWait(token string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.waits[token] >= MaxWaits {
		return false
	}
	s.waits[token]++
	return true
}

func (s *Server) endWait(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.waits[token]--; s.waits[token] <= 0 {
		delete(s.waits, token)
	}
}

func (s *Server) view(rec *relay.Record) map[string]any {
	status, view, _ := s.Hub.Snapshot(rec)
	var v map[string]any
	json.Unmarshal(view, &v)
	if v == nil {
		v = map[string]any{"id": rec.ID, "status": status}
	}
	switch status {
	case "sent", "running":
		v["note"] = "Still running; read it again with applet_status."
	case "waiting":
		v["note"] = "Waiting for the person to answer on their page."
	}
	return text(v)
}

func (s *Server) record(r *http.Request, args json.RawMessage) (*relay.Record, error) {
	peer, ok := s.peer(r)
	if !ok {
		return nil, fmt.Errorf("no person is paired: send the token the person made in Settings, under Agents, as a bearer token")
	}
	var a struct{ ID, Key string }
	json.Unmarshal(args, &a)
	rec, found := s.Hub.Record(peer.Session, a.ID)
	if !found {
		return nil, fmt.Errorf("there is no invocation %s of yours; finished ones are kept for an hour", a.ID)
	}
	return rec, nil
}

func (s *Server) status(r *http.Request, args json.RawMessage) (map[string]any, error) {
	rec, err := s.record(r, args)
	if err != nil {
		return nil, err
	}
	return s.view(rec), nil
}

func (s *Server) cancel(r *http.Request, args json.RawMessage) (map[string]any, error) {
	rec, err := s.record(r, args)
	if err != nil {
		return nil, err
	}
	if err := s.Hub.Cancel(rec.Session, rec.ID); err != nil {
		return nil, err
	}
	return s.view(rec), nil
}

func (s *Server) artifact(r *http.Request, args json.RawMessage) (map[string]any, error) {
	rec, err := s.record(r, args)
	if err != nil {
		return nil, err
	}
	var a struct{ ID, Key string }
	json.Unmarshal(args, &a)
	_, _, arts := s.Hub.Snapshot(rec)
	art, ok := arts[a.Key]
	if !ok {
		return nil, fmt.Errorf("invocation %s has no artifact %s", a.ID, a.Key)
	}
	mime, _, _ := strings.Cut(art.Mime, ";")
	mime = strings.TrimSpace(mime)
	switch {
	case strings.HasPrefix(mime, "image/"):
		return map[string]any{"content": []map[string]any{
			{"type": "image", "mimeType": mime, "data": base64.StdEncoding.EncodeToString(art.Data)},
			{"type": "text", "text": fmt.Sprintf("%s, %s, %d bytes.", art.Name, mime, len(art.Data))},
		}}, nil
	case strings.HasPrefix(mime, "text/") || strings.HasSuffix(mime, "json") || strings.HasSuffix(mime, "xml"):
		return map[string]any{"content": []map[string]any{{"type": "text", "text": string(art.Data)}}}, nil
	default:
		return map[string]any{"content": []map[string]any{{"type": "resource", "resource": map[string]any{
			"uri": "yavc://invocation/" + rec.ID + "/" + a.Key, "mimeType": mime, "blob": base64.StdEncoding.EncodeToString(art.Data),
		}}}}, nil
	}
}

func reply(w http.ResponseWriter, id json.RawMessage, result any, e *rpcError) {
	replyStatus(w, http.StatusOK, id, result, e)
}

// replyStatus writes a JSON-RPC message with an HTTP status, its headers
// set before the status is written.
func replyStatus(w http.ResponseWriter, status int, id json.RawMessage, result any, e *rpcError) {
	msg := map[string]any{"jsonrpc": "2.0"}
	if id != nil {
		msg["id"] = id
	} else {
		msg["id"] = nil
	}
	if e != nil {
		msg["error"] = e
	} else {
		msg["result"] = result
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(msg)
}
