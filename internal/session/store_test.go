package session

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func newStore(t *testing.T, retain time.Duration) *Store {
	t.Helper()
	s, err := New(t.TempDir(), retain)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func create(t *testing.T, s *Store) *Session {
	t.Helper()
	sess, err := s.Create()
	if err != nil {
		t.Fatal(err)
	}
	return sess
}

func TestRoundTripAndFileMode(t *testing.T) {
	s := newStore(t, time.Hour)
	sess := create(t, s)
	_, err := s.Update(sess.ID, func(in *Session) error {
		in.State["sudoku"] = "board"
		in.Config["dice"] = `{"n":2}`
		in.Appearance.Skin = "classic"
		in.Agents = append(in.Agents, Agent{ID: "agent-1", Hash: "h1", Grant: []string{"files.read"}})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Load(sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.State["sudoku"] != "board" || got.Config["dice"] != `{"n":2}` || got.Appearance.Skin != "classic" || !got.HasAgent("agent-1") {
		t.Fatalf("round trip lost something: %+v", got)
	}
	// The copy a caller gets is its own.
	got.State["sudoku"] = "changed"
	got.Agents[0].Grant[0] = "changed"
	again, _ := s.Load(sess.ID)
	if again.State["sudoku"] != "board" || again.Agents[0].Grant[0] != "files.read" {
		t.Fatal("a caller's change reached the store's copy")
	}
	// A fresh store reads the file, not the cache.
	fresh, err := New(s.Dir, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := fresh.Load(sess.ID); err != nil || got.State["sudoku"] != "board" {
		t.Fatalf("reread: %+v %v", got, err)
	}
	fi, err := os.Stat(s.path(sess.ID))
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && fi.Mode().Perm() != 0o600 {
		t.Fatalf("session file mode %v", fi.Mode().Perm())
	}
	dir, _ := os.Stat(s.Dir)
	if runtime.GOOS != "windows" && dir.Mode().Perm()&0o077 != 0 {
		// t.TempDir is made by the test runner; New makes its own folders 0700.
		sub, err := New(filepath.Join(s.Dir, "sub"), 0)
		if err != nil {
			t.Fatal(err)
		}
		if fi, _ := os.Stat(sub.Dir); fi.Mode().Perm() != 0o700 {
			t.Fatalf("data folder mode %v", fi.Mode().Perm())
		}
	}
	// No temporary file is left behind.
	if tmp, _ := filepath.Glob(filepath.Join(s.Dir, "*.tmp")); len(tmp) != 0 {
		t.Fatalf("temporary files left: %v", tmp)
	}
}

func TestValidIDAndKey(t *testing.T) {
	for id, want := range map[string]bool{
		strings.Repeat("a", 32): true, strings.Repeat("A-_9", 16): true, strings.Repeat("a", 31): false,
		strings.Repeat("a", 65): false, "../" + strings.Repeat("a", 32): false, strings.Repeat("a", 32) + ".json": false, "": false,
	} {
		if ValidID(id) != want {
			t.Errorf("ValidID(%q) = %v", id, !want)
		}
	}
	for key, want := range map[string]bool{
		"sudoku": true, "sudoku:2": true, "a-b:x-1": true, "Sudoku": false, "1abc": false, "a:": false,
		"a:b:c": false, "a/b": false, strings.Repeat("a", 64): true, strings.Repeat("a", 65): false,
	} {
		if ValidKey(key) != want {
			t.Errorf("ValidKey(%q) = %v", key, !want)
		}
	}
	s := newStore(t, 0)
	if _, err := s.Load("../etc/passwd"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("a bad id should read as absent, got %v", err)
	}
	if err := s.Save(&Session{ID: "bad"}); err == nil {
		t.Fatal("a bad id was saved")
	}
}

func TestExpiry(t *testing.T) {
	s := newStore(t, time.Hour)
	now := time.Now()
	s.now = func() time.Time { return now }
	sess := create(t, s)
	now = now.Add(59 * time.Minute)
	if _, err := s.Load(sess.ID); err != nil {
		t.Fatalf("not yet expired: %v", err)
	}
	now = now.Add(2 * time.Minute)
	if _, err := s.Load(sess.ID); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expired session: %v", err)
	}
	if _, err := os.Stat(s.path(sess.ID)); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("an expired session's file should be removed")
	}
}

// A session that is only read stays alive: touching it once a day moves its
// Seen time, and touching it more often does not write the file.
func TestTouchKeepsSessionAlive(t *testing.T) {
	s := newStore(t, 90*24*time.Hour)
	now := time.Now()
	s.now = func() time.Time { return now }
	sess, err := s.Create()
	if err != nil {
		t.Fatal(err)
	}
	fi, _ := os.Stat(s.path(sess.ID))
	now = now.Add(time.Hour)
	if wrote, err := s.Touch(sess.ID); err != nil || wrote {
		t.Fatalf("a touch within SeenEvery: wrote %v, %v", wrote, err)
	}
	if fi2, _ := os.Stat(s.path(sess.ID)); !fi2.ModTime().Equal(fi.ModTime()) || fi2.Size() != fi.Size() {
		t.Error("a touch within SeenEvery rewrote the session")
	}
	for i := 0; i < 100; i++ {
		now = now.Add(SeenEvery)
		if wrote, err := s.Touch(sess.ID); err != nil || !wrote {
			t.Fatalf("after %d days of reading only: wrote %v, %v", i+1, wrote, err)
		}
	}
	got, err := s.Load(sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if now.Sub(got.Seen) >= SeenEvery {
		t.Errorf("Seen is %v behind after a touch", now.Sub(got.Seen))
	}
	if _, err := s.Touch("not-a-session"); err == nil {
		t.Error("touching a session that does not exist succeeded")
	}
}

func TestMalformedAndEmptyFiles(t *testing.T) {
	s := newStore(t, time.Hour)
	for name, body := range map[string]string{
		strings.Repeat("m", 40): "{not json",
		strings.Repeat("e", 40): "",
		strings.Repeat("w", 40): `{"id":"someone-else"}`,
	} {
		if err := os.WriteFile(s.path(name), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Load(name); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("%q should read as absent, got %v", body, err)
		}
		if _, err := os.Stat(s.path(name)); err != nil {
			t.Fatalf("a malformed file is left as it is: %v", err)
		}
	}
	if n := s.Sweep(); n != 0 {
		t.Fatalf("Sweep counted %d malformed files as removed", n)
	}
}

func TestSweep(t *testing.T) {
	s := newStore(t, time.Hour)
	now := time.Now()
	s.now = func() time.Time { return now }
	old := create(t, s)
	now = now.Add(30 * time.Minute)
	young := create(t, s)
	// A temporary file left by a write that never finished, and one that
	// may belong to a write in progress.
	stale := filepath.Join(s.Dir, old.ID+".123.tmp")
	recent := filepath.Join(s.Dir, old.ID+".456.tmp")
	os.WriteFile(stale, []byte("x"), 0o600)
	os.WriteFile(recent, []byte("x"), 0o600)
	now = now.Add(31 * time.Minute)
	os.Chtimes(stale, now.Add(-time.Hour), now.Add(-time.Hour))
	os.Chtimes(recent, now, now)
	if n := s.Sweep(); n != 1 {
		t.Fatalf("Sweep removed %d, want 1", n)
	}
	if _, err := s.Load(young.ID); err != nil {
		t.Fatalf("the young session went: %v", err)
	}
	if _, err := os.Stat(stale); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a stale temporary file should be removed")
	}
	if _, err := os.Stat(recent); err != nil {
		t.Fatal("a recent temporary file should be kept")
	}
	// Nothing left to remove counts nothing.
	if n := s.Sweep(); n != 0 {
		t.Fatalf("a second Sweep counted %d", n)
	}
}

func TestConcurrentUpdatesLoseNothing(t *testing.T) {
	s := newStore(t, time.Hour)
	sess := create(t, s)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if _, err := s.Update(sess.ID, func(in *Session) error {
				in.State[fmt.Sprintf("k%d", i)] = "v"
				return nil
			}); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	got, err := s.Load(sess.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.State) != 100 {
		t.Fatalf("%d of 100 updates kept", len(got.State))
	}
	// A change that fails is not kept.
	_, err = s.Update(sess.ID, func(in *Session) error { in.State = nil; return errors.New("no") })
	if err == nil {
		t.Fatal("the change's error should be returned")
	}
	if got, _ := s.Load(sess.ID); len(got.State) != 100 {
		t.Fatal("a failed change was kept")
	}
}

// Delete and Update racing never leave the session behind once Delete has
// run, and Update never makes it again.
func TestDeleteRacesUpdate(t *testing.T) {
	s := newStore(t, time.Hour)
	for i := 0; i < 1000; i++ {
		sess := create(t, s)
		s.IndexAgent("hash", sess.ID)
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			if _, err := s.Update(sess.ID, func(in *Session) error { in.State["k"] = "v"; return nil }); err != nil && !errors.Is(err, os.ErrNotExist) {
				t.Error(err)
			}
		}()
		go func() {
			defer wg.Done()
			if err := s.Delete(sess.ID); err != nil {
				t.Error(err)
			}
		}()
		wg.Wait()
		if _, err := s.Load(sess.ID); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("round %d: the session survived its deletion (%v)", i, err)
		}
		if _, _, err := s.FindAgent("hash"); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("round %d: the deleted session's token is still found", i)
		}
	}
}

func TestIndexAndFindAgent(t *testing.T) {
	s := newStore(t, time.Hour)
	sess := create(t, s)
	s.Update(sess.ID, func(in *Session) error {
		in.Agents = append(in.Agents, Agent{ID: "a1", Hash: "h1", Name: "Claude"})
		return nil
	})
	s.IndexAgent("h1", sess.ID)
	got, agent, err := s.FindAgent("h1")
	if err != nil || got.ID != sess.ID || agent.Name != "Claude" {
		t.Fatalf("FindAgent: %v %v %v", got, agent, err)
	}
	// A store opened later finds the token from the files at start-up.
	again, err := New(s.Dir, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if _, agent, err := again.FindAgent("h1"); err != nil || agent.ID != "a1" {
		t.Fatalf("start-up index: %v %v", agent, err)
	}
	// A hash revoked from the index is not found, and one indexed for a
	// session that no longer holds it is dropped.
	s.IndexAgent("h1", "")
	if _, _, err := s.FindAgent("h1"); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a revoked hash was found")
	}
	s.IndexAgent("h2", sess.ID)
	if _, _, err := s.FindAgent("h2"); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a hash the session does not hold was found")
	}
	s.agentMu.Lock()
	_, kept := s.agents["h2"]
	s.agentMu.Unlock()
	if kept {
		t.Fatal("a stale hash stays in the index")
	}
	// Deleting the session forgets its hashes.
	again.Delete(sess.ID)
	if _, _, err := again.FindAgent("h1"); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a deleted session's token was found")
	}
}

// A hash the index does not hold is not looked for in the folder, so a
// session file written behind the store's back is not found by its token.
func TestFindAgentMissDoesNotScan(t *testing.T) {
	s := newStore(t, time.Hour)
	if _, _, err := s.FindAgent("unknown"); !errors.Is(err, os.ErrNotExist) {
		t.Fatal(err)
	}
	id := strings.Repeat("z", 43)
	raw, _ := json.Marshal(Session{ID: id, Created: time.Now(), Seen: time.Now(), Agents: []Agent{{ID: "a", Hash: "behind"}}})
	if err := os.WriteFile(s.path(id), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.FindAgent("behind"); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a miss read the folder")
	}
}

func TestTokenExpiry(t *testing.T) {
	made := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	a := Agent{Created: made, Expires: made.Add(TokenLife)}
	if a.Expired(made.Add(TokenLife - time.Second)) {
		t.Fatal("expired early")
	}
	if !a.Expired(made.Add(TokenLife)) {
		t.Fatal("not expired at its expiry")
	}
	// A token from before expiries lasts TokenLife from when it was made.
	legacy := Agent{Created: made}
	if legacy.Expired(made.Add(TokenLife-time.Second)) || !legacy.Expired(made.Add(TokenLife)) {
		t.Fatal("a token with no expiry should last TokenLife")
	}
}
