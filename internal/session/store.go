// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// Package session keeps what the engine remembers for a reader: the state
// of each applet, each applet's settings, and the reader's appearance
// choices. A session is an opaque random identifier in a cookie on the
// site's domain, so every subdomain reads the same one (DESIGN.md,
// decision 2). Nothing in a session identifies the reader.
//
// A session is one file in the data folder, written whole to a temporary
// file, flushed to the disk and renamed into place, so a reader never sees
// a half-written one. The file is JSON until the XferLang library exists
// (DESIGN.md, decision 4 and open question 1).
package session

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"hash/fnv"
	"log"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
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

// TokenLife is how long a pairing token lasts from when it was made,
// whether or not it is used.
const TokenLife = 90 * 24 * time.Hour

// Agent is a pairing token the reader made for an AI agent
// (docs/agents-design.md, decision 5): the token's hash, its name, the
// capabilities it was granted beyond the harmless ones, when it was last
// used, and when it stops working.
type Agent struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Hash    string    `json:"hash"`
	Grant   []string  `json:"grant"`
	Created time.Time `json:"created"`
	Used    time.Time `json:"used,omitempty"`
	Expires time.Time `json:"expires,omitempty"`
}

// Expired says whether the token no longer works at now. A token written
// before tokens had an expiry lasts TokenLife from when it was made.
func (a Agent) Expired(now time.Time) bool {
	end := a.Expires
	if end.IsZero() {
		end = a.Created.Add(TokenLife)
	}
	return !now.Before(end)
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

// clone is a copy of the session that shares nothing with it, so the
// store's cached copy is never changed by a caller.
func (s *Session) clone() *Session {
	c := *s
	c.State = maps.Clone(s.State)
	c.Config = maps.Clone(s.Config)
	c.Agents = slices.Clone(s.Agents)
	for i := range c.Agents {
		c.Agents[i].Grant = slices.Clone(c.Agents[i].Grant)
	}
	if c.State == nil {
		c.State = map[string]string{}
	}
	if c.Config == nil {
		c.Config = map[string]string{}
	}
	return &c
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

// stripes is how many locks the sessions share. Two sessions contend only
// when their identifiers hash to the same stripe.
const stripes = 64

// staleTemp is how old a temporary file must be before Sweep takes it for
// one left by a write that never finished.
const staleTemp = 10 * time.Minute

// Store keeps sessions in a folder. Each session's reads and writes are
// serialised by its own lock (one of a fixed set, by the identifier's
// hash), because a write is a rename over the file, and a read that meets
// the rename half-way fails on some file systems (Windows among them).
type Store struct {
	Dir    string
	Retain time.Duration // how long a session lives unseen

	locks [stripes]sync.Mutex

	// cache keeps each session read or written, with the file's
	// modification time and size when it was, so a request that finds the
	// file unchanged does not read and parse it again.
	cacheMu sync.Mutex
	cache   map[string]cached

	// agents is which session holds each token hash. It is built from the
	// files when the store opens and kept current as tokens are made and
	// revoked and sessions deleted, so finding a token never reads the
	// folder.
	agentMu sync.Mutex
	agents  map[string]string

	now func() time.Time
}

type cached struct {
	sess *Session
	mod  time.Time
	size int64
}

// New opens a store in dir, creating the folder, and indexes the tokens
// its sessions hold.
func New(dir string, retain time.Duration) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &Store{Dir: dir, Retain: retain, cache: map[string]cached{}, agents: map[string]string{}, now: time.Now}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		id, ok := sessionFile(e)
		if !ok {
			continue
		}
		sess, err := s.Load(id)
		if err != nil {
			continue
		}
		for _, a := range sess.Agents {
			s.agents[a.Hash] = id
		}
	}
	return s, nil
}

// sessionFile is the identifier a folder entry is the session file of.
func sessionFile(e os.DirEntry) (string, bool) {
	name := e.Name()
	if e.IsDir() || filepath.Ext(name) != ".json" {
		return "", false
	}
	id := strings.TrimSuffix(name, ".json")
	return id, ValidID(id)
}

func (s *Store) path(id string) string { return filepath.Join(s.Dir, id+".json") }

func (s *Store) lock(id string) *sync.Mutex {
	h := fnv.New32a()
	h.Write([]byte(id))
	return &s.locks[h.Sum32()%stripes]
}

// Create makes a new session and writes it.
func (s *Store) Create() (*Session, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return nil, err
	}
	now := s.now().UTC()
	sess := &Session{ID: base64.RawURLEncoding.EncodeToString(b[:]), Created: now, Seen: now,
		State: map[string]string{}, Config: map[string]string{}}
	return sess, s.Save(sess)
}

// Load reads a session by its identifier. A missing, malformed or expired
// one is reported as os.ErrNotExist; any other error is the file system's,
// and a caller must not take it for an absent session. The session
// returned is the caller's own copy.
func (s *Store) Load(id string) (*Session, error) {
	if !ValidID(id) {
		return nil, os.ErrNotExist
	}
	l := s.lock(id)
	l.Lock()
	defer l.Unlock()
	return s.loadLocked(id)
}

// errMalformed is a session file that is not a session. It is reported to
// callers as os.ErrNotExist.
var errMalformed = errors.New("session: the file is not a session")

func (s *Store) loadLocked(id string) (*Session, error) {
	sess, err := s.readLocked(id)
	if errors.Is(err, errMalformed) {
		return nil, os.ErrNotExist
	}
	return sess, err
}

// readLocked reads a session, from the cache when its file has not changed
// since. An expired session is removed.
func (s *Store) readLocked(id string) (*Session, error) {
	fi, err := os.Stat(s.path(id))
	if err != nil {
		s.forget(id)
		return nil, err
	}
	s.cacheMu.Lock()
	c, hit := s.cache[id]
	s.cacheMu.Unlock()
	var sess *Session
	if hit && c.mod.Equal(fi.ModTime()) && c.size == fi.Size() {
		sess = c.sess.clone()
	} else {
		raw, err := os.ReadFile(s.path(id))
		if err != nil {
			return nil, err
		}
		var read Session
		if err := json.Unmarshal(raw, &read); err != nil || read.ID != id {
			log.Printf("session: the file of %s… is not a session, and is left as it is", id[:8])
			s.forget(id)
			return nil, errMalformed
		}
		sess = &read
		s.remember(sess, fi)
		sess = sess.clone()
	}
	if s.Retain > 0 && s.now().Sub(sess.Seen) > s.Retain {
		if err := s.removeLocked(id); err != nil {
			return nil, err
		}
		return nil, os.ErrNotExist
	}
	return sess, nil
}

func (s *Store) remember(sess *Session, fi os.FileInfo) {
	s.cacheMu.Lock()
	s.cache[sess.ID] = cached{sess: sess.clone(), mod: fi.ModTime(), size: fi.Size()}
	s.cacheMu.Unlock()
}

func (s *Store) forget(id string) {
	s.cacheMu.Lock()
	delete(s.cache, id)
	s.cacheMu.Unlock()
}

// Save writes a session whole. Seen is set to now.
func (s *Store) Save(sess *Session) error {
	if !ValidID(sess.ID) {
		return errors.New("session: bad identifier")
	}
	l := s.lock(sess.ID)
	l.Lock()
	defer l.Unlock()
	return s.saveLocked(sess)
}

// saveLocked writes the session to a temporary file in the same folder,
// flushes it to the disk, renames it over the session's file, and then
// flushes the folder, where the system allows a folder to be flushed, so
// the rename itself survives a crash.
func (s *Store) saveLocked(sess *Session) error {
	sess.Seen = s.now().UTC()
	raw, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(s.Dir, sess.ID+".*.tmp")
	if err != nil {
		return err
	}
	tmp := f.Name()
	_, err = f.Write(raw)
	if err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(tmp, s.path(sess.ID))
	}
	if err != nil {
		os.Remove(tmp)
		s.forget(sess.ID)
		return err
	}
	syncDir(s.Dir)
	if fi, err := os.Stat(s.path(sess.ID)); err == nil {
		s.remember(sess, fi)
	} else {
		s.forget(sess.ID)
	}
	return nil
}

// syncDir flushes a folder's entries to the disk. Windows has no way to
// open a folder for that through the os package, so it is done only
// elsewhere; the write itself has already been flushed.
func syncDir(dir string) {
	if runtime.GOOS == "windows" {
		return
	}
	if d, err := os.Open(dir); err == nil {
		d.Sync()
		d.Close()
	}
}

// Update loads a session, applies change and saves it, all under the
// session's lock, so a change from one request never overwrites another's.
// When change returns an error nothing is saved and the error is returned.
func (s *Store) Update(id string, change func(*Session) error) (*Session, error) {
	if !ValidID(id) {
		return nil, os.ErrNotExist
	}
	l := s.lock(id)
	l.Lock()
	defer l.Unlock()
	sess, err := s.loadLocked(id)
	if err != nil {
		return nil, err
	}
	if err := change(sess); err != nil {
		return nil, err
	}
	if err := s.saveLocked(sess); err != nil {
		return nil, err
	}
	return sess.clone(), nil
}

// Delete removes a session and everything in it, and forgets its tokens.
func (s *Store) Delete(id string) error {
	if !ValidID(id) {
		return os.ErrNotExist
	}
	l := s.lock(id)
	l.Lock()
	defer l.Unlock()
	return s.removeLocked(id)
}

// removeLocked removes a session's file, its cached copy and every token
// hash the index has for it. A file already gone is not an error.
func (s *Store) removeLocked(id string) error {
	err := os.Remove(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		err = nil
	}
	if err != nil {
		return err
	}
	s.forget(id)
	s.agentMu.Lock()
	for hash, holder := range s.agents {
		if holder == id {
			delete(s.agents, hash)
		}
	}
	s.agentMu.Unlock()
	return nil
}

// Sweep removes every session unseen for longer than the retention period
// and every temporary file a write left behind, and says how many sessions
// it removed. A file that is not a session is logged and left alone.
func (s *Store) Sweep() int {
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		log.Printf("session: the data folder cannot be read: %v", err)
		return 0
	}
	gone := 0
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".tmp") {
			if fi, err := e.Info(); err == nil && s.now().Sub(fi.ModTime()) > staleTemp {
				os.Remove(filepath.Join(s.Dir, e.Name()))
			}
			continue
		}
		id, ok := sessionFile(e)
		if !ok || s.Retain <= 0 {
			continue
		}
		if s.sweepOne(id) {
			gone++
		}
	}
	return gone
}

// sweepOne removes one session if it has expired, and says whether it did.
func (s *Store) sweepOne(id string) bool {
	l := s.lock(id)
	l.Lock()
	defer l.Unlock()
	_, statErr := os.Stat(s.path(id))
	if statErr != nil {
		return false
	}
	_, err := s.readLocked(id)
	if !errors.Is(err, os.ErrNotExist) {
		return false
	}
	_, statErr = os.Stat(s.path(id))
	return errors.Is(statErr, os.ErrNotExist)
}

// IndexAgent records which session holds a token hash; an empty session
// forgets the hash.
func (s *Store) IndexAgent(hash, sessionID string) {
	s.agentMu.Lock()
	defer s.agentMu.Unlock()
	if sessionID == "" {
		delete(s.agents, hash)
	} else {
		s.agents[hash] = sessionID
	}
}

// FindAgent finds the session and the token with this hash, from the
// index alone: a hash the index does not hold is not looked for in the
// folder.
func (s *Store) FindAgent(hash string) (*Session, *Agent, error) {
	s.agentMu.Lock()
	id, ok := s.agents[hash]
	s.agentMu.Unlock()
	if !ok {
		return nil, nil, os.ErrNotExist
	}
	sess, err := s.Load(id)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.IndexAgent(hash, "")
		}
		return nil, nil, err
	}
	for i := range sess.Agents {
		if sess.Agents[i].Hash == hash {
			return sess, &sess.Agents[i], nil
		}
	}
	s.IndexAgent(hash, "")
	return nil, nil, os.ErrNotExist
}
