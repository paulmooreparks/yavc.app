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
	"regexp"
	"slices"
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

// maxTokens is how many pairing tokens one session keeps.
const maxTokens = 20

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
	m.HandleFunc("POST /mcp", s.mcpEndpoint)
	m.HandleFunc("DELETE /mcp", s.mcpEndpoint)
}

// mcpEndpoint is the MCP server, on the site's own hosts only.
func (s *Server) mcpEndpoint(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	s.mcp.ServeHTTP(w, r)
}

// === The catalogue ==========================================================

// actionsDoc is a package's actions manifest, as the catalogue reads it.
type actionsDoc struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Module      string           `json:"module"`
	Actions     []map[string]any `json:"actions"`
}

// providers lists every package's actions manifest, with its module and
// page at their addresses for this request. The manifests are read once
// for each state of the catalogue and shared, so nothing here changes
// them.
func (s *Server) providers(r *http.Request) []mcp.Provider {
	var out []mcp.Provider
	origin := strings.TrimSuffix(s.siteURL(r), "/")
	for _, a := range s.applets() {
		if a.Actions == "" {
			continue
		}
		m, ok := s.actionsManifest(a)
		if !ok {
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
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	writeJSON(w, http.StatusOK, map[string]any{"site": s.siteURL(r), "mcp": strings.TrimSuffix(s.siteURL(r), "/") + "/mcp", "providers": s.providers(r)})
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
	if !a.Expires.IsZero() {
		v["expires"] = a.Expires
	} else {
		v["expires"] = a.Created.Add(session.TokenLife)
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
	writeJSON(w, http.StatusOK, map[string]any{"tokens": views, "grantable": grantable})
}

// errTokensFull is a session that keeps as many tokens as it may.
var errTokensFull = errors.New("the session keeps as many tokens as it may")

func (s *Server) makeToken(w http.ResponseWriter, r *http.Request) {
	if !s.desktopOnly(w, r) {
		return
	}
	var in struct {
		Name  string   `json:"name"`
		Grant []string `json:"grant"`
	}
	if !decodeJSON(w, r, &in, "A token is made from a JSON object of name and grant.") {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 64 {
		http.Error(w, "A token needs a name of up to 64 characters.", http.StatusBadRequest)
		return
	}
	grant := []string{}
	for _, g := range in.Grant {
		if !slices.Contains(grantable, g) {
			http.Error(w, "A token may be granted "+strings.Join(grantable, ", ")+".", http.StatusBadRequest)
			return
		}
		if !slices.Contains(grant, g) {
			grant = append(grant, g)
		}
	}
	var secret [32]byte
	rand.Read(secret[:])
	token := "yavc_" + base64.RawURLEncoding.EncodeToString(secret[:])
	var id [12]byte
	rand.Read(id[:])
	now := s.now().UTC()
	agent := session.Agent{ID: base64.RawURLEncoding.EncodeToString(id[:]), Name: in.Name, Hash: hashToken(token), Grant: grant,
		Created: now, Expires: now.Add(session.TokenLife)}
	sess, err := s.update(w, r, func(sess *session.Session) error {
		if len(sess.Agents) >= maxTokens {
			return errTokensFull
		}
		sess.Agents = append(sess.Agents, agent)
		return nil
	})
	if errors.Is(err, errTokensFull) {
		http.Error(w, fmt.Sprintf("A session keeps up to %d tokens; revoke one first.", maxTokens), http.StatusConflict)
		return
	}
	if err != nil {
		s.done(w, err, "")
		return
	}
	s.Sessions.IndexAgent(agent.Hash, sess.ID)
	v := tokenView(agent)
	v["token"] = token
	writeJSON(w, http.StatusOK, v)
}

// revokeToken takes a token out of the reader's session. A reader with no
// session has no token, and none is made for the asking.
func (s *Server) revokeToken(w http.ResponseWriter, r *http.Request) {
	if !s.desktopOnly(w, r) {
		return
	}
	id := r.PathValue("id")
	sess := s.sessionOf(r)
	if !tokenID.MatchString(id) || sess == nil || !sess.HasAgent(id) {
		http.Error(w, "No such token.", http.StatusNotFound)
		return
	}
	var hash string
	_, err := s.Sessions.Update(sess.ID, func(sess *session.Session) error {
		sess.Agents = slices.DeleteFunc(sess.Agents, func(a session.Agent) bool {
			if a.ID == id {
				hash = a.Hash
				return true
			}
			return false
		})
		return nil
	})
	if hash != "" {
		s.Sessions.IndexAgent(hash, "")
	}
	s.done(w, err, "")
}

// pair finds the person a bearer token belongs to. A token past its
// expiry pairs no one.
func (s *Server) pair(token string) (mcp.Peer, bool) {
	if !strings.HasPrefix(token, "yavc_") {
		return mcp.Peer{}, false
	}
	sess, agent, err := s.Sessions.FindAgent(hashToken(token))
	if err != nil || sess == nil {
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("pair: %v", err)
		}
		return mcp.Peer{}, false
	}
	now := s.now()
	if agent.Expired(now) {
		return mcp.Peer{}, false
	}
	if now.Sub(agent.Used) > time.Minute {
		s.Sessions.Update(sess.ID, func(in *session.Session) error {
			for i := range in.Agents {
				if in.Agents[i].ID == agent.ID {
					in.Agents[i].Used = now.UTC()
				}
			}
			return nil
		})
	}
	grant := append([]string{"artifact.create", "notification.post"}, agent.Grant...)
	return mcp.Peer{Session: sess.ID, ID: agent.ID, Name: agent.Name, Grant: grant}, true
}

// === The page's stream and reports ==========================================

var pageID = regexp.MustCompile(`^[0-9a-f]{24}$`)

func (s *Server) agentStream(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	page := r.URL.Query().Get("page")
	if !pageID.MatchString(page) {
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
	events, leave, err := s.hub.Subscribe(sess.ID, page)
	if err != nil {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "The site has as many pages connected as it can keep; try again later.", http.StatusServiceUnavailable)
		return
	}
	defer leave()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()
	beat := time.NewTicker(25 * time.Second)
	defer beat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-beat.C:
			fmt.Fprint(w, ": beat\n\n")
			flusher.Flush()
		case e, open := <-events:
			if !open {
				// The hub dropped this stream: the page opened another,
				// or the session was deleted.
				return
			}
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
	if !decodeJSON(w, r, &in, "Which page?") {
		return
	}
	if !pageID.MatchString(in.Page) {
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
	if !decodeJSON(w, r, &in, "A report is an invocation's id and its record.") {
		return
	}
	if in.ID == "" || len(in.View) == 0 {
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
		if a.Key == "" {
			continue
		}
		if base64.StdEncoding.DecodedLen(len(a.Data)) > relay.MaxArtifact+3 {
			http.Error(w, "An artifact is larger than the relay keeps.", http.StatusRequestEntityTooLarge)
			return
		}
		data, err := base64.StdEncoding.DecodeString(a.Data)
		if err != nil {
			// The record still finishes, without the artifact the page
			// could not send, as it always has.
			continue
		}
		arts[a.Key] = relay.Artifact{Name: a.Name, Mime: a.Mime, Data: data}
	}
	err := s.hub.Report(sess.ID, in.ID, in.View, arts)
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, relay.ErrNoRecord):
		http.Error(w, "No such invocation.", http.StatusNotFound)
	case errors.Is(err, relay.ErrFinished):
		http.Error(w, "That invocation has already finished.", http.StatusConflict)
	case errors.Is(err, relay.ErrArtifactSize):
		http.Error(w, "The artifacts are larger than the relay keeps.", http.StatusRequestEntityTooLarge)
	default:
		http.Error(w, err.Error(), http.StatusBadRequest)
	}
}
