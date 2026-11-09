// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// writeReleaseArchive packages only manifest-listed, verified files.
func writeReleaseArchive(directory, destination string) error {
	root, err := os.OpenRoot(directory)
	if err != nil {
		return err
	}
	defer root.Close()
	manifest, err := root.ReadFile("manifest.json")
	if err != nil {
		return err
	}
	if len(manifest) > 8*1024*1024 {
		return fmt.Errorf("release manifest is too large")
	}
	var inventory struct {
		Version int     `json:"version"`
		Kind    string  `json:"kind"`
		Files   []asset `json:"files"`
		Digest  string  `json:"digest"`
	}
	if err := json.Unmarshal(manifest, &inventory); err != nil {
		return err
	}
	encoded, err := json.Marshal(inventory.Files)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(encoded)
	if inventory.Version != 1 || inventory.Kind != "portable-content-release-set" || hex.EncodeToString(sum[:]) != inventory.Digest || len(inventory.Files) == 0 || len(inventory.Files) > 10000 {
		return fmt.Errorf("invalid release inventory")
	}
	previous := ""
	var total int64
	for _, file := range inventory.Files {
		if !fs.ValidPath(file.Path) || strings.ContainsAny(file.Path, "\\:\x00") || file.Path == "manifest.json" || file.Path <= previous || file.Bytes < 0 || file.Bytes > 256*1024*1024 {
			return fmt.Errorf("invalid release path or size: %q", file.Path)
		}
		previous = file.Path
		total += int64(file.Bytes)
		if total > 512*1024*1024 {
			return fmt.Errorf("release exceeds archive budget")
		}
	}
	directory, err = filepath.Abs(directory)
	if err != nil {
		return err
	}
	directory, err = filepath.EvalSymlinks(directory)
	if err != nil {
		return err
	}
	destination, err = filepath.Abs(destination)
	if err != nil {
		return err
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(destination))
	if err != nil {
		return err
	}
	destination = filepath.Join(parent, filepath.Base(destination))
	rel, err := filepath.Rel(directory, destination)
	if err != nil {
		return err
	}
	if rel == "." || rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("archive must be outside the assembled output")
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	complete := false
	defer func() {
		output.Close()
		if !complete {
			os.Remove(destination)
		}
	}()
	writer := zip.NewWriter(output)
	defer writer.Close()
	write := func(name string, data []byte) error {
		header := &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: time.Date(1980, 1, 1, 0, 0, 0, 0, time.UTC)}
		header.SetMode(0644)
		entry, err := writer.CreateHeader(header)
		if err != nil {
			return err
		}
		_, err = entry.Write(data)
		return err
	}
	for _, file := range inventory.Files {
		at := ""
		for _, part := range strings.Split(file.Path, "/") {
			at = filepath.Join(at, part)
			info, err := root.Lstat(at)
			if err != nil {
				return err
			}
			if info.Mode()&os.ModeSymlink != 0 {
				return fmt.Errorf("release symlink refused: %s", file.Path)
			}
		}
		native := filepath.FromSlash(file.Path)
		info, err := root.Stat(native)
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() || info.Size() != int64(file.Bytes) {
			return fmt.Errorf("release size differs: %s", file.Path)
		}
		data, err := root.ReadFile(native)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(data)
		if len(data) != file.Bytes || hex.EncodeToString(sum[:]) != file.SHA256 {
			return fmt.Errorf("release hash differs: %s", file.Path)
		}
		if err := write(file.Path, data); err != nil {
			return err
		}
	}
	if err := write("manifest.json", manifest); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	if err := output.Close(); err != nil {
		return err
	}
	complete = true
	return nil
}
