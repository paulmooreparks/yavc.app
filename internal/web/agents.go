// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

// The agents' side of the engine (docs/agents-design.md): the catalogue of
// every application's actions, the pairing tokens a person makes in
// Settings, the stream each page keeps open for relayed invocations and
// the reports it posts back, and the MCP endpoint.

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"yavc.app/internal/mcp"
	"yavc.app/internal/relay"
	"yavc.app/internal/session"
)

// The capabilities a token may be made with. PUDL's artifact.create and
// notification.post have no effect beyond the page and come with every
// token; the rest the person chooses.
var grantable = []string{"files.read", "files.write", "window.open", "attention.request"}

func (s *Server) agentRoutes(m *http.ServeMux) {
	s.hub = relay.New()
	s.mcp = mcp.New(&mcp.Server{Name: "yavc.app", Title: s.Title, Catalog: s.providers, Pair: s.pair, Hub: s.hub})
	m.HandleFunc("GET /api/actions", s.actionsCatalogue)
	m.HandleFunc("GET /agent/tokens", s.listTokens)
	m.HandleFunc("POST /agent/tokens", s.makeToken)
	m.HandleFunc("DELETE /agent/tokens/{id}", s.revokeToken)
	m.HandleFunc("GET /agent/stream", s.agentStream)
	m.HandleFunc("POST /agent/front", s.agentFront)
	m.HandleFunc("POST /agent/report", s.agentReport)
	m.Handle("POST /mcp", s.mcp)
	m.Handle("DELETE /mcp", s.mcp)
}

// === The catalogue ==========================================================

// providers reads every package's actions manifest, with its module and
// page at their addresses for this request.
func (s *Server) providers(r *http.Request) []mcp.Provider {
	var out []mcp.Provider
	origin := strings.TrimSuffix(s.siteURL(r), "/")
	for _, a := range s.applets() {
		if a.Actions == "" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(a.Dir, a.Actions))
		if err != nil {
			continue
		}
		var m struct {
			ID          string           `json:"id"`
			Title       string           `json:"title"`
			Description string           `json:"description"`
			Module      string           `json:"module"`
			Actions     []map[string]any `json:"actions"`
		}
		if json.Unmarshal(raw, &m) != nil || m.ID == "" {
			log.Printf("applet %s: its actions manifest could not be read", a.Name)
			continue
		}
		p := mcp.Provider{ID: m.ID, Applet: a.Name, Title: m.Title, Description: m.Description, Page: s.appletPageURL(r, a.Name),
			Manifest: origin + a.URL(a.Actions) + "?v=" + a.Version, Actions: m.Actions}
		if p.Title == "" {
			p.Title = a.Title
		}
		if m.Module != "" {
			p.Module = origin + a.URL(m.Module) + "?v=" + a.Version
		}
		if p.Actions == nil {
			p.Actions = []map[string]any{}
		}
		out = append(out, p)
	}
	return out
}

func (s *Server) actionsCatalogue(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]any{"site": s.siteURL(r), "mcp": strings.TrimSuffix(s.siteURL(r), "/") + "/mcp", "providers": s.providers(r)})
}

// === Tokens =================================================================

var tokenID = regexp.MustCompile(`^[A-Za-z0-9_-]{8,32}$`)

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func tokenView(a session.Agent) map[string]any {
	v := map[string]any{"id": a.ID, "name": a.Name, "grant": a.Grant, "created": a.Created}
	if !a.Used.IsZero() {
		v["used"] = a.Used
	}
	if a.Grant == nil {
		v["grant"] = []string{}
	}
	return v
}

func (s *Server) listTokens(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	sess := s.sessionOf(r)
	views := []map[string]any{}
	if sess != nil {
		for _, a := range sess.Agents {
			views = append(views, tokenView(a))
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]any{"tokens": views, "grantable": grantable})
}

func (s *Server) makeToken(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	var in struct {
		Name  string   `json:"name"`
		Grant []string `json:"grant"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "A token is made from a JSON object of name and grant.", http.StatusBadRequest)
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 64 {
		http.Error(w, "A token needs a name of up to 64 characters.", http.StatusBadRequest)
		return
	}
	grant := []string{}
	for _, g := range in.Grant {
		ok := false
		for _, allowed := range grantable {
			ok = ok || g == allowed
		}
		if !ok {
			http.Error(w, "A token may be granted "+strings.Join(grantable, ", ")+".", http.StatusBadRequest)
			return
		}
		grant = append(grant, g)
	}
	var secret [32]byte
	rand.Read(secret[:])
	token := "yavc_" + base64.RawURLEncoding.EncodeToString(secret[:])
	var id [12]byte
	rand.Read(id[:])
	agent := session.Agent{ID: base64.RawURLEncoding.EncodeToString(id[:]), Name: in.Name, Hash: hashToken(token), Grant: grant, Created: time.Now().UTC()}
	err := s.update(w, r, func(sess *session.Session) {
		if len(sess.Agents) >= 20 {
			return
		}
		sess.Agents = append(sess.Agents, agent)
	})
	if err != nil {
		s.done(w, err)
		return
	}
	sess := s.sessionOf(r)
	if sess == nil || !sess.HasAgent(agent.ID) {
		http.Error(w, "A session keeps up to 20 tokens; revoke one first.", http.StatusConflict)
		return
	}
	s.Sessions.IndexAgent(agent.Hash, sess.ID)
	v := tokenView(agent)
	v["token"] = token
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}

func (s *Server) revokeToken(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.own(w, r) || !tokenID.MatchString(id) {
		http.Error(w, "No such token.", http.StatusNotFound)
		return
	}
	var hash string
	err := s.update(w, r, func(sess *session.Session) {
		kept := sess.Agents[:0]
		for _, a := range sess.Agents {
			if a.ID == id {
				hash = a.Hash
				continue
			}
			kept = append(kept, a)
		}
		sess.Agents = kept
	})
	if hash != "" {
		s.Sessions.IndexAgent(hash, "")
	}
	s.done(w, err)
}

// pair finds the person a bearer token belongs to.
func (s *Server) pair(token string) (mcp.Peer, bool) {
	if !strings.HasPrefix(token, "yavc_") {
		return mcp.Peer{}, false
	}
	sess, agent, err := s.Sessions.FindAgent(hashToken(token))
	if err != nil || sess == nil {
		return mcp.Peer{}, false
	}
	if time.Since(agent.Used) > time.Minute {
		s.Sessions.Update(sess.ID, func(in *session.Session) {
			for i := range in.Agents {
				if in.Agents[i].ID == agent.ID {
					in.Agents[i].Used = time.Now().UTC()
				}
			}
		})
	}
	grant := append([]string{"artifact.create", "notification.post"}, agent.Grant...)
	return mcp.Peer{Session: sess.ID, ID: agent.ID, Name: agent.Name, Grant: grant}, true
}

// === The page's stream and reports ==========================================

var pageID = regexp.MustCompile(`^[0-9a-f]{24}$`)

func (s *Server) agentStream(w http.ResponseWriter, r *http.Request) {
	page := r.URL.Query().Get("page")
	if !s.own(w, r) || !pageID.MatchString(page) {
		http.Error(w, "A stream needs a page id.", http.StatusBadRequest)
		return
	}
	sess := s.sessionOf(r)
	if sess == nil {
		// A page with no session has paired no agent; the page tries
		// again later, by which time it may have.
		http.Error(w, "No session.", http.StatusForbidden)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming is not possible here.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()
	events, leave := s.hub.Subscribe(sess.ID, page)
	defer leave()
	beat := time.NewTicker(25 * time.Second)
	defer beat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-beat.C:
			fmt.Fprint(w, ": beat\n\n")
			flusher.Flush()
		case e := <-events:
			data, err := json.Marshal(e.Data)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", e.Name, data)
			flusher.Flush()
		}
	}
}

func (s *Server) agentFront(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	var in struct{ Page string }
	if json.NewDecoder(r.Body).Decode(&in) != nil || !pageID.MatchString(in.Page) {
		http.Error(w, "Which page?", http.StatusBadRequest)
		return
	}
	if sess := s.sessionOf(r); sess != nil {
		s.hub.Front(sess.ID, in.Page)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) agentReport(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	var in struct {
		ID        string          `json:"id"`
		View      json.RawMessage `json:"view"`
		Artifacts []struct {
			Key, Name, Mime, Data string
		} `json:"artifacts"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil || in.ID == "" || len(in.View) == 0 {
		http.Error(w, "A report is an invocation's id and its record.", http.StatusBadRequest)
		return
	}
	sess := s.sessionOf(r)
	if sess == nil {
		http.Error(w, "No session.", http.StatusForbidden)
		return
	}
	arts := map[string]relay.Artifact{}
	for _, a := range in.Artifacts {
		data, err := base64.StdEncoding.DecodeString(a.Data)
		if err != nil || a.Key == "" {
			continue
		}
		arts[a.Key] = relay.Artifact{Name: a.Name, Mime: a.Mime, Data: data}
	}
	err := s.hub.Report(sess.ID, in.ID, in.View, arts)
	if errors.Is(err, relay.ErrNoRecord) {
		http.Error(w, "No such invocation.", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("agent report: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
