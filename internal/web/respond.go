// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

// How the engine answers: JSON, request bodies, files with their caching
// rules, and compression.

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"
)

// writeJSON answers with v as JSON. A handler that wants the answer kept
// sets Cache-Control before calling it; otherwise it is never kept.
func writeJSON(w http.ResponseWriter, status int, v any) {
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	if h.Get("Cache-Control") == "" {
		h.Set("Cache-Control", "no-store")
	}
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write JSON: %v", err)
	}
}

// errTooLarge is a request, or a change it asks for, larger than the
// engine takes.
var errTooLarge = errors.New("too large")

// tooLarge says whether an error is a request body over its limit, or a
// change over a session's budget.
func tooLarge(err error) bool {
	var mb *http.MaxBytesError
	return errors.As(err, &mb) || errors.Is(err, errTooLarge)
}

// decodeJSON reads the request's body as JSON into v. On failure it has
// answered already, with 413 for a body over its limit and 400 with
// message otherwise, and returns false.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any, message string) bool {
	err := json.NewDecoder(r.Body).Decode(v)
	if err == nil {
		return true
	}
	if tooLarge(err) {
		http.Error(w, "That is larger than this site takes.", http.StatusRequestEntityTooLarge)
		return false
	}
	http.Error(w, message, http.StatusBadRequest)
	return false
}

// readText reads the request's body as text.
func readText(r *http.Request) (string, error) {
	b, err := io.ReadAll(r.Body)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// === Files ==================================================================

// immutable and revalidate are the two ways a file may be kept: forever,
// when its address has the version of what it holds, and otherwise only
// after asking whether it has changed.
const (
	immutable  = "public, max-age=31536000, immutable"
	revalidate = "no-cache"
)

// cacheFor is how a file at the request's address may be kept, given the
// version its contents have now.
func cacheFor(r *http.Request, version string) string {
	if version != "" && r.URL.Query().Get("v") == version {
		return immutable
	}
	return revalidate
}

// serveFile answers with a file of fsys, which is a folder opened as an
// os.Root (so no link inside it leads out) or the embedded files. A folder
// is not served, as a listing or otherwise. etag, when not empty, is the
// file's entity tag.
func serveFile(w http.ResponseWriter, r *http.Request, fsys fs.FS, name, cache, etag string) bool {
	if !fs.ValidPath(name) || strings.ContainsAny(name, "\\\x00") {
		return false
	}
	f, err := fsys.Open(name)
	if err != nil {
		return false
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		return false
	}
	content, ok := f.(io.ReadSeeker)
	if !ok {
		return false
	}
	if ct := mime.TypeByExtension(path.Ext(name)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", cache)
	if etag != "" {
		w.Header().Set("ETag", etag)
	}
	http.ServeContent(w, r, name, fi.ModTime(), content)
	return true
}

// serveDir answers with a file under a folder on the disk, through an
// os.Root opened for the request.
func serveDir(w http.ResponseWriter, r *http.Request, dir, name, cache string) bool {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return false
	}
	defer root.Close()
	return serveFile(w, r, root.FS(), name, cache, "")
}

// staticTags is each embedded file's entity tag, a digest of its contents
// computed once.
func staticTags(fsys fs.FS) map[string]string {
	tags := map[string]string{}
	fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		b, err := fs.ReadFile(fsys, p)
		if err != nil {
			return nil
		}
		sum := sha256.Sum256(b)
		tags[p] = `"` + hex.EncodeToString(sum[:])[:20] + `"`
		return nil
	})
	return tags
}

// === Compression ============================================================

// compressible says whether a response of this type is worth compressing:
// text of every kind and WebAssembly. An event stream is not, since each
// event must reach the page when it is written.
func compressible(contentType string) bool {
	t, _, _ := strings.Cut(contentType, ";")
	t = strings.TrimSpace(strings.ToLower(t))
	switch {
	case t == "text/event-stream":
		return false
	case strings.HasPrefix(t, "text/"):
		return true
	}
	switch t {
	case "application/json", "application/javascript", "application/wasm", "application/xml", "image/svg+xml", "application/manifest+json":
		return true
	}
	return false
}

var gzipPool = sync.Pool{New: func() any { w, _ := gzip.NewWriterLevel(io.Discard, gzip.DefaultCompression); return w }}

// acceptsGzip says whether the request's Accept-Encoding allows gzip.
func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		coding, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if !strings.EqualFold(strings.TrimSpace(coding), "gzip") {
			continue
		}
		for _, p := range strings.Split(params, ";") {
			k, v, _ := strings.Cut(strings.TrimSpace(p), "=")
			if strings.EqualFold(k, "q") {
				q, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
				return err == nil && q > 0
			}
		}
		return true
	}
	return false
}

// gzipWriter compresses a response whose type is compressible, decided
// when the status is written: only a whole answer (200) is compressed,
// never part of one or an answer already encoded.
type gzipWriter struct {
	http.ResponseWriter
	gz          *gzip.Writer
	wroteHeader bool
}

func (g *gzipWriter) WriteHeader(code int) {
	if g.wroteHeader {
		return
	}
	g.wroteHeader = true
	h := g.Header()
	h.Add("Vary", "Accept-Encoding")
	if code == http.StatusOK && h.Get("Content-Encoding") == "" && h.Get("Content-Range") == "" && compressible(h.Get("Content-Type")) {
		h.Del("Content-Length")
		h.Set("Content-Encoding", "gzip")
		// The compressed answer is another representation of the same
		// file, so a strong tag becomes a weak one (RFC 9110, 8.8.1).
		if tag := h.Get("ETag"); strings.HasPrefix(tag, `"`) {
			h.Set("ETag", "W/"+tag)
		}
		g.gz = gzipPool.Get().(*gzip.Writer)
		g.gz.Reset(g.ResponseWriter)
	}
	g.ResponseWriter.WriteHeader(code)
}

func (g *gzipWriter) Write(b []byte) (int, error) {
	if !g.wroteHeader {
		if g.Header().Get("Content-Type") == "" {
			g.Header().Set("Content-Type", http.DetectContentType(b))
		}
		g.WriteHeader(http.StatusOK)
	}
	if g.gz != nil {
		return g.gz.Write(b)
	}
	return g.ResponseWriter.Write(b)
}

// Flush sends what has been compressed so far.
func (g *gzipWriter) Flush() {
	if g.gz != nil {
		g.gz.Flush()
	}
	http.NewResponseController(g.ResponseWriter).Flush()
}

// Unwrap gives http.ResponseController the writer underneath.
func (g *gzipWriter) Unwrap() http.ResponseWriter { return g.ResponseWriter }

func (g *gzipWriter) close() {
	if g.gz != nil {
		g.gz.Close()
		g.gz.Reset(io.Discard)
		gzipPool.Put(g.gz)
		g.gz = nil
	}
}
