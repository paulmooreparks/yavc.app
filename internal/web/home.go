// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

// The stock files of a reader's home folder (DESIGN.md, decision 11): the
// README, the Howto guides, the starter scripts and the standard folders,
// kept as files under site/home and handed to the browser, which keeps
// the home itself. The browser seeds each file once, so a reader who
// deletes one keeps it deleted, and takes a changed file only while their
// copy is still the one that was seeded.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type homeEntry struct {
	Kind    string `json:"t"`
	Content string `json:"c,omitempty"`
}

// homeSeed reads the stock files: every file under the folder, as text,
// and every folder, a folder holding only a .keep file counting as an
// empty one.
func (s *Server) homeSeed() (map[string]homeEntry, string) {
	out := map[string]homeEntry{}
	if s.Home == "" {
		return out, ""
	}
	filepath.WalkDir(s.Home, func(p string, d fs.DirEntry, err error) error {
		if err != nil || p == s.Home {
			return nil
		}
		rel := "/" + filepath.ToSlash(strings.TrimPrefix(p, s.Home+string(filepath.Separator)))
		if d.IsDir() {
			out[rel] = homeEntry{Kind: "d"}
			return nil
		}
		if d.Name() == ".keep" {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		out[rel] = homeEntry{Kind: "f", Content: strings.ReplaceAll(string(b), "\r\n", "\n")}
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
		h.Write([]byte(out[k].Content))
		h.Write([]byte{0})
	}
	return out, hex.EncodeToString(h.Sum(nil))[:12]
}

func (s *Server) homeSeedHandler(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	files, version := s.homeSeed()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]any{"version": version, "files": files})
}
