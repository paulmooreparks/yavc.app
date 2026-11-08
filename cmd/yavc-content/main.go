// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// yavc-content assembles the portable content release used by both hosts.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type asset struct {
	Path   string `json:"path"`
	Bytes  int    `json:"bytes"`
	SHA256 string `json:"sha256"`
}

var packages = []string{"content-kit", "diagrams", "diagram-kit", "md-editor", "md-engine", "text-workspace", "editor", "docs", "slides"}

func copyTree(source, target string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("package symlink refused: %s", path)
		}
		if entry.IsDir() && (entry.Name() == "test" || entry.Name() == "node_modules") {
			return filepath.SkipDir
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return os.MkdirAll(filepath.Join(target, rel), 0755)
		}
		if strings.HasSuffix(entry.Name(), ".wasm") || entry.Name() == "wasm_exec.js" {
			return nil
		}
		return copyFile(path, filepath.Join(target, rel))
	})
}

func copyFile(source, target string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("not a regular asset: %s", source)
	}
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return err
	}
	return os.WriteFile(target, data, 0644)
}

func goCommand(root string, args ...string) ([]byte, error) {
	command := exec.Command("go", args...)
	command.Dir = root
	data, err := command.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("go %v: %w\n%s", args, err, data)
	}
	return data, nil
}

func wasm(root, output, name, prebuilt, goroot string) error {
	if prebuilt != "" {
		for _, file := range []string{name + ".wasm", "wasm_exec.js"} {
			if err := copyFile(filepath.Join(prebuilt, file), filepath.Join(output, file)); err != nil {
				return err
			}
		}
		return nil
	}
	command := exec.Command("go", "build", "-buildvcs=false", "-trimpath", "-ldflags=-s -w", "-o", filepath.Join(output, name+".wasm"), "./cmd/"+name)
	command.Dir = root
	command.Env = append(os.Environ(), "GOOS=js", "GOARCH=wasm")
	if data, err := command.CombinedOutput(); err != nil {
		return fmt.Errorf("compile %s: %w\n%s", name, err, data)
	}
	return copyFile(filepath.Join(goroot, "lib", "wasm", "wasm_exec.js"), filepath.Join(output, "wasm_exec.js"))
}

func assemble(root, out, md, d2 string) error {
	root, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	root, err = filepath.EvalSymlinks(root)
	if err != nil {
		return err
	}
	out, err = filepath.Abs(out)
	if err != nil {
		return err
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(out))
	if err != nil {
		return err
	}
	out = filepath.Join(parent, filepath.Base(out))
	rel, err := filepath.Rel(root, out)
	if err != nil {
		return err
	}
	if rel == "." || rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("output must be outside the source checkout")
	}
	if err = os.Mkdir(out, 0755); err != nil {
		return err
	}
	for _, name := range []string{"LICENSE", "go.mod", "go.sum"} {
		if err = copyFile(filepath.Join(root, name), filepath.Join(out, name)); err != nil {
			return err
		}
	}
	for _, name := range packages {
		if err = copyTree(filepath.Join(root, "apps", name), filepath.Join(out, "content", name)); err != nil {
			return err
		}
	}
	for _, pair := range [][2]string{{"web/pudl", "pudl"}, {"scripts/fixtures/portable-diagrams", "lab"}, {"scripts/fixtures/portable-workspace", "workspace-lab"}} {
		if err = copyTree(filepath.Join(root, filepath.FromSlash(pair[0])), filepath.Join(out, pair[1])); err != nil {
			return err
		}
	}
	for _, name := range []string{"yavc-util.js", "dialogs.js", "doc-tabs.js", "pudl-host-kit.js", "snapshot.js"} {
		if err = copyFile(filepath.Join(root, "internal", "web", "static", name), filepath.Join(out, "support", name)); err != nil {
			return err
		}
	}
	css, err := os.ReadFile(filepath.Join(root, "internal", "web", "static", "site.css"))
	if err != nil {
		return err
	}
	glyphs := regexp.MustCompile(`--glyph-yavc-[a-z0-9-]+:\s*url\("[^"\n]*"\);`).FindAllString(string(css), -1)
	if len(glyphs) == 0 {
		return fmt.Errorf("project glyphs are missing")
	}
	if err = os.WriteFile(filepath.Join(out, "support", "glyphs.css"), []byte(":root {\n"+strings.Join(glyphs, "\n")+"\n}\n"), 0644); err != nil {
		return err
	}
	gorootBytes, err := goCommand(root, "env", "GOROOT")
	if err != nil {
		return err
	}
	goroot := strings.TrimSpace(string(gorootBytes))
	if err = copyFile(filepath.Join(goroot, "LICENSE"), filepath.Join(out, "support", "GO-LICENSE")); err != nil {
		return err
	}
	if err = wasm(root, filepath.Join(out, "content", "md-engine"), "yavc-md", md, goroot); err != nil {
		return err
	}
	if err = wasm(root, filepath.Join(out, "content", "diagram-kit"), "yavc-d2", d2, goroot); err != nil {
		return err
	}
	files := []asset{}
	err = filepath.WalkDir(out, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(out, path)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(data)
		files = append(files, asset{filepath.ToSlash(rel), len(data), hex.EncodeToString(sum[:])})
		return nil
	})
	if err != nil {
		return err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	encoded, err := json.Marshal(files)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(encoded)
	manifest := map[string]any{"version": 1, "kind": "portable-content-release-set", "entry": "content/diagrams/applet.json", "entries": []string{"content/editor/applet.json", "content/docs/applet.json", "content/diagrams/applet.json", "content/slides/applet.json"}, "requirements": map[string]any{"scriptKind": "classic", "resourceContract": 1, "workspaceContract": 1, "snapshotContract": 2}, "files": files, "digest": hex.EncodeToString(sum[:])}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if err = os.WriteFile(filepath.Join(out, "manifest.json"), data, 0644); err != nil {
		return err
	}
	fmt.Printf("Portable content %s (%d files)\n", manifest["digest"], len(files))
	return nil
}

func main() {
	root := flag.String("source", ".", "source checkout")
	out := flag.String("out", "", "new output directory outside the checkout")
	md := flag.String("md", "", "prebuilt Markdown WASM directory")
	d2 := flag.String("d2", "", "prebuilt D2 WASM directory")
	flag.Parse()
	if *out == "" {
		fmt.Fprintln(os.Stderr, "-out is required")
		os.Exit(1)
	}
	if err := assemble(*root, *out, *md, *d2); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
