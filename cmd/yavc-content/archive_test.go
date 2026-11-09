// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func archiveFixture(t *testing.T, name string) (string, string) {
	t.Helper()
	dir := t.TempDir()
	data := []byte("release source\n")
	sum := sha256.Sum256(data)
	files := []asset{{Path: name, Bytes: len(data), SHA256: hex.EncodeToString(sum[:])}}
	encoded, _ := json.Marshal(files)
	digest := sha256.Sum256(encoded)
	manifest, _ := json.Marshal(map[string]any{"version": 1, "kind": "portable-content-release-set", "files": files, "digest": hex.EncodeToString(digest[:])})
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), manifest, 0644); err != nil {
		t.Fatal(err)
	}
	if name == "asset.js" {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	return dir, filepath.Join(t.TempDir(), "release.zip")
}

func TestReleaseArchiveReproducesAndIncludesManifest(t *testing.T) {
	dir, first := archiveFixture(t, "asset.js")
	second := filepath.Join(t.TempDir(), "second.zip")
	for _, target := range []string{first, second} {
		if err := writeReleaseArchive(dir, target); err != nil {
			t.Fatal(err)
		}
	}
	a, _ := os.ReadFile(first)
	b, _ := os.ReadFile(second)
	if !bytes.Equal(a, b) {
		t.Fatal("same inventory produced different archives")
	}
	reader, err := zip.OpenReader(first)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	if len(reader.File) != 2 {
		t.Fatal("unexpected archive entries")
	}
	for _, file := range reader.File {
		entry, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(entry)
		entry.Close()
		if err != nil {
			t.Fatal(err)
		}
		expected, err := os.ReadFile(filepath.Join(dir, file.Name))
		if err != nil || !bytes.Equal(data, expected) {
			t.Fatal("archive differs from verified source")
		}
	}
	if err := writeReleaseArchive(dir, first); err == nil {
		t.Fatal("overwrote published archive")
	}
}

func TestReleaseArchiveRefusesCorruptAndEscapingAssets(t *testing.T) {
	for _, name := range []string{"../outside", "C:/outside", "asset.js"} {
		t.Run(name, func(t *testing.T) {
			dir, target := archiveFixture(t, name)
			if name == "asset.js" {
				if err := os.WriteFile(filepath.Join(dir, name), []byte("RELEASE source\n"), 0644); err != nil {
					t.Fatal(err)
				}
			}
			if err := writeReleaseArchive(dir, target); err == nil {
				t.Fatal("accepted invalid asset")
			}
			if _, err := os.Stat(target); !os.IsNotExist(err) {
				t.Fatal("retained invalid archive")
			}
		})
	}
	dir, _ := archiveFixture(t, "asset.js")
	if err := writeReleaseArchive(dir, filepath.Join(dir, "self.zip")); err == nil {
		t.Fatal("accepted archive within input")
	}
}
