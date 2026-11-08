// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOutputRefusesCheckoutAndExistingDirectory(t *testing.T) {
	root := t.TempDir()
	if err := assemble(root, filepath.Join(root, "output"), "", ""); err == nil {
		t.Fatal("accepted output within source checkout")
	}
	if _, err := os.Stat(filepath.Join(root, "output")); !os.IsNotExist(err) {
		t.Fatal("created rejected output")
	}
	sibling := t.TempDir()
	if err := assemble(root, sibling, "", ""); err == nil {
		t.Fatal("accepted an existing output directory")
	}
}

func TestCopyRejectsSymlink(t *testing.T) {
	source := t.TempDir()
	target := filepath.Join(t.TempDir(), "package")
	if err := os.WriteFile(filepath.Join(source, "asset.js"), []byte("asset"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(source, "asset.js"), filepath.Join(source, "linked.js")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if err := copyTree(source, target); err == nil {
		t.Fatal("packaged a symlink")
	}
}
