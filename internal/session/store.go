// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package session keeps what the engine remembers for a reader: the state
// of each applet, each applet's settings, and the reader's appearance
// choices. A session is an opaque random identifier in a cookie on the
// site's domain, so every subdomain reads the same one (DESIGN.md,
// decision 2). Nothing in a session identifies the reader.
//
// A session is one file in the data folder, written whole and renamed into
// place, so a reader never sees a half-written one. The file is JSON until
// the XferLang library exists (DESIGN.md, decision 4 and open question 1).
package session

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

// Appearance is the reader's three independent choices: the skin, the
// colour theme (PUDL's data-palette) and the mode, light, dark or system.
type Appearance struct {
	Skin    string `json:"skin,omitempty"`
	Palette string `json:"palette,omitempty"`
	Mode    string `json:"mode,omitempty"`
}

// Session is what the engine keeps for one reader.
type Session struct {
	ID         string            `json:"id"`
	Created    time.Time         `json:"created"`
	Seen       time.Time         `json:"seen"`
	Appearance Appearance        `json:"appearance"`
	State      map[string]string `json:"state,omitempty"`  // applet continuity, by instance key
	Config     map[string]string `json:"config,omitempty"` // applet settings, by applet name
	Agents     []Agent           `json:"agents,omitempty"` // the pairing tokens the reader made
}

// Agent is a pairing token the reader made for an AI agent
// (docs/agents-design.md, decision 5): the token's hash, its name, the
// capabilities it was granted beyond the harmless ones, and when it was
// last used.
type Agent struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Hash    string    `json:"hash"`
	Grant   []string  `json:"grant"`
	Created time.Time `json:"created"`
	Used    time.Time `json:"used,omitempty"`
}

// HasAgent says whether the session keeps a token with this id.
func (s *Session) HasAgent(id string) bool {
	for _, a := range s.Agents {
		if a.ID == id {
			return true
		}
	}
	return false
}

var (
	validID  = regexp.MustCompile(`^[A-Za-z0-9_-]{32,64}$`)
	validKey = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}(:[a-z0-9-]{1,64})?$`)
)

// ValidID says whether a string could be a session identifier.
func ValidID(id string) bool { return validID.MatchString(id) }

// ValidKey says whether a string is an instance key: an applet's name,
// with an instance after a colon for a numbered window.
func ValidKey(key string) bool { return validKey.MatchString(key) }

// Store keeps sessions in a folder.
type Store struct {
	Dir    string
	Retain time.Duration // how long a session lives unseen
	mu     sync.Mutex
	// agents is which session holds each token hash, built from the
	// files on first use and kept up as tokens are made and revoked.
	agents  map[string]string
	scanned time.Time
}

// New makes a store in dir, creating it.
func New(dir string, retain time.Duration) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &Store{Dir: dir, Retain: retain}, nil
}

func (s *Store) path(id string) string { return filepath.Join(s.Dir, id+".json") }

// Create makes a new session and writes it.
func (s *Store) Create() (*Session, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	sess := &Session{ID: base64.RawURLEncoding.EncodeToString(b[:]), Created: now, Seen: now,
		State: map[string]string{}, Config: map[string]string{}}
	return sess, s.Save(sess)
}

// Load reads a session by its identifier. A missing, malformed or expired
// one is reported as os.ErrNotExist; any other error is the file system's,
// and a caller must not take it for an absent session.
func (s *Store) Load(id string) (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked(id)
}

// Every read and write of a session file happens under the store's lock,
// because a write is a rename over the file, and a read that meets the
// rename half-way fails on some file systems (Windows among them).
func (s *Store) loadLocked(id string) (*Session, error) {
	if !ValidID(id) {
		return nil, os.ErrNotExist
	}
	raw, err := os.ReadFile(s.path(id))
	if err != nil {
		return nil, err
	}
	var sess Session
	if err := json.Unmarshal(raw, &sess); err != nil || sess.ID != id {
		return nil, os.ErrNotExist
	}
	if s.Retain > 0 && time.Since(sess.Seen) > s.Retain {
		_ = os.Remove(s.path(id))
		return nil, os.ErrNotExist
	}
	if sess.State == nil {
		sess.State = map[string]string{}
	}
	if sess.Config == nil {
		sess.Config = map[string]string{}
	}
	return &sess, nil
}

// Save writes a session whole. Seen is set to now.
func (s *Store) Save(sess *Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked(sess)
}

func (s *Store) saveLocked(sess *Session) error {
	if !ValidID(sess.ID) {
		return errors.New("session: bad identifier")
	}
	sess.Seen = time.Now().UTC()
	raw, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path(sess.ID) + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path(sess.ID))
}

// Update loads a session, applies change and saves it, all under the
// store's lock, so a change from one request never overwrites another's.
func (s *Store) Update(id string, change func(*Session)) (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, err := s.loadLocked(id)
	if err != nil {
		return nil, err
	}
	change(sess)
	return sess, s.saveLocked(sess)
}

// Delete removes a session and everything in it.
func (s *Store) Delete(id string) error {
	if !ValidID(id) {
		return os.ErrNotExist
	}
	err := os.Remove(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// Sweep removes every session unseen for longer than the retention
// period, and says how many went.
func (s *Store) Sweep() int {
	if s.Retain <= 0 {
		return 0
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		return 0
	}
	gone := 0
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		id := e.Name()[:len(e.Name())-len(".json")]
		if _, err := s.Load(id); errors.Is(err, os.ErrNotExist) {
			gone++
		}
	}
	return gone
}

// IndexAgent records which session holds a token hash; an empty session
// forgets the hash.
func (s *Store) IndexAgent(hash, sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.agents == nil {
		s.agents = map[string]string{}
	}
	if sessionID == "" {
		delete(s.agents, hash)
	} else {
		s.agents[hash] = sessionID
	}
}

// FindAgent finds the session and the token with this hash. A hash not
// in the index makes the store read every session's file again, no
// more than once a few seconds, so a token made by another process of
// the engine is found too.
func (s *Store) FindAgent(hash string) (*Session, *Agent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.agents == nil {
		s.agents = map[string]string{}
	}
	id, ok := s.agents[hash]
	if !ok {
		if time.Since(s.scanned) < 5*time.Second {
			return nil, nil, os.ErrNotExist
		}
		s.scanned = time.Now()
		entries, err := os.ReadDir(s.Dir)
		if err != nil {
			return nil, nil, err
		}
		for _, e := range entries {
			if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
				continue
			}
			sess, err := s.loadLocked(e.Name()[:len(e.Name())-len(".json")])
			if err != nil {
				continue
			}
			for _, a := range sess.Agents {
				s.agents[a.Hash] = sess.ID
			}
		}
		if id, ok = s.agents[hash]; !ok {
			return nil, nil, os.ErrNotExist
		}
	}
	sess, err := s.loadLocked(id)
	if err != nil {
		delete(s.agents, hash)
		return nil, nil, err
	}
	for i := range sess.Agents {
		if sess.Agents[i].Hash == hash {
			return sess, &sess.Agents[i], nil
		}
	}
	delete(s.agents, hash)
	return nil, nil, os.ErrNotExist
}
