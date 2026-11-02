// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

// The stock files of a reader's home folder (DESIGN.md, decision 11): the
// README, the Howto guides, the starter scripts and the standard folders,
// kept as files under site/home and handed to the browser, which keeps
// the home itself. The browser seeds each file once, so a reader who
// deletes one keeps it deleted, and takes a changed file only while their
// copy is still the one that was seeded.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type homeEntry struct {
	Kind    string `json:"t"`
	Content string `json:"c,omitempty"`
}

// homeCache is the stock files as last read, with what the folder held
// then; the folder is looked at again no more than once a second.
type homeCache struct {
	mu      sync.Mutex
	checked time.Time
	stamp   string
	files   map[string]homeEntry
	version string
	body    []byte
}

// homeStamp is what the folder holds that the seed depends on: every
// entry's path, with when it changed and its size.
func homeStamp(dir string) string {
	var b strings.Builder
	filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if fi, err := d.Info(); err == nil {
			fmt.Fprintf(&b, "%s:%t:%d:%d;", p, d.IsDir(), fi.ModTime().UnixNano(), fi.Size())
		}
		return nil
	})
	return b.String()
}

// readHome reads the stock files: every file under the folder, as text
// with \n line ends, and every folder, a folder holding only a .keep file
// counting as an empty one. Each is keyed by its path from the folder,
// with a leading slash. The version is a digest of every key, kind and
// content.
func readHome(dir string) (map[string]homeEntry, string) {
	out := map[string]homeEntry{}
	filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, err := filepath.Rel(dir, p)
		if err != nil || rel == "." {
			return nil
		}
		key := "/" + filepath.ToSlash(rel)
		if d.IsDir() {
			out[key] = homeEntry{Kind: "d"}
			return nil
		}
		if d.Name() == ".keep" {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		out[key] = homeEntry{Kind: "f", Content: strings.ReplaceAll(string(b), "\r\n", "\n")}
		return nil
	})
	keys := make([]string, 0, len(out))
	for k := range out {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	h := sha256.New()
	for _, k := range keys {
		h.Write([]byte(k))
		h.Write([]byte{0})
		h.Write([]byte(out[k].Kind))
		h.Write([]byte{0})
		h.Write([]byte(out[k].Content))
		h.Write([]byte{0})
	}
	return out, hex.EncodeToString(h.Sum(nil))[:12]
}

// homeSeed is the stock files and their version, read again only when the
// folder has changed.
func (s *Server) homeSeed() (map[string]homeEntry, string, []byte) {
	c := &s.home
	c.mu.Lock()
	defer c.mu.Unlock()
	if s.Home == "" {
		return map[string]homeEntry{}, "", []byte(`{"files":{},"version":""}` + "\n")
	}
	now := time.Now()
	if c.body != nil && now.Sub(c.checked) < time.Second {
		return c.files, c.version, c.body
	}
	c.checked = now
	stamp := homeStamp(s.Home)
	if c.body != nil && stamp == c.stamp {
		return c.files, c.version, c.body
	}
	files, version := readHome(s.Home)
	body, _ := json.Marshal(map[string]any{"version": version, "files": files})
	c.stamp, c.files, c.version, c.body = stamp, files, version, append(body, '\n')
	return c.files, c.version, c.body
}

// homeSeedHandler answers with the stock files, tagged with their version,
// so a browser that has them asks only whether they have changed.
func (s *Server) homeSeedHandler(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	_, version, body := s.homeSeed()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("ETag", `"`+version+`"`)
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(body))
}
