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

	"yavc.app/internal/shortcodes"
)

type asset struct {
	Path   string `json:"path"`
	Bytes  int    `json:"bytes"`
	SHA256 string `json:"sha256"`
}

// A feature a profile leaves out whole. Paths are in the package, a folder when it ends in a slash. Message is the
// sentence an applet shows when something asks for the feature (docs/content-release-downloads.md, "Profiles").
type feature struct {
	Feature string   `json:"feature"`
	Message string   `json:"message"`
	Paths   []string `json:"paths"`
}

// A profile is the applets and shared code a package holds and the features it leaves out. The full profile is the
// package as it was before profiles existed, and its manifest has no members for profiles.
type profile struct {
	name     string
	packages []string
	fixtures bool
	d2       bool
	entry    string
	entries  []string
	omit     []feature
}

var profiles = map[string]profile{
	"full": {
		name:     "full",
		packages: []string{"content-kit", "diagrams", "diagram-kit", "md-editor", "md-engine", "text-workspace", "editor", "docs", "slides"},
		fixtures: true,
		d2:       true,
		entry:    "content/diagrams/applet.json",
		entries:  []string{"content/editor/applet.json", "content/docs/applet.json", "content/diagrams/applet.json", "content/slides/applet.json"},
	},
	"docs": {
		name:     "docs",
		packages: []string{"content-kit", "md-editor", "md-engine", "text-workspace", "docs"},
		entry:    "content/docs/applet.json",
		entries:  []string{"content/docs/applet.json"},
		omit: []feature{
			{"export-word", "Export to Word is not part of this build of Docs.", []string{"content/md-editor/vendor/docx-9.15.2/"}},
			{"export-pdf", "Export to PDF is not part of this build of Docs.", []string{"content/md-editor/vendor/pdfmake-0.2.23/", "content/md-editor/vendor/fontkit-1.1.1/", "content/md-editor/vendor/pdf-lib-1.17.1/", "content/md-editor/pdf-notes.js"}},
			{"import-office", "Opening a Word document is not part of this build of Docs.", []string{"content/md-editor/import/", "content/md-editor/import-images.js", "content/md-editor/import-word.js", "content/md-editor/import-word-worker.js", "content/md-editor/office-input.js", "content/md-editor/vendor/mammoth-1.13.0/", "content/md-editor/vendor/office-NOTICE.md"}},
			{"mermaid", "Mermaid diagrams are not part of this build of Docs.", []string{"content/md-editor/vendor/mermaid/"}},
			{"diagrams", "Diagrams are not part of this build of Docs.", []string{"content/diagram-kit/", "content/diagrams/"}},
			{"language-service", "Checking and completion for JSON, CSS and HTML are not part of this build of Docs.", []string{
				"content/md-editor/language-service/WORKER-LICENSES.txt", "content/md-editor/language-service/build.mjs", "content/md-editor/language-service/canvas-schema.mjs",
				"content/md-editor/language-service/json-server.mjs", "content/md-editor/language-service/licenses/", "content/md-editor/language-service/manifest.json",
				"content/md-editor/language-service/package-lock.json", "content/md-editor/language-service/package.json", "content/md-editor/language-service/worker-entry.mjs",
				"content/md-editor/language-service/worker.js"}},
		},
	},
}

// omitted says whether a package path belongs to a feature the profile leaves out.
func (p profile) omitted(path string) bool {
	for _, f := range p.omit {
		for _, prefix := range f.Paths {
			if path == prefix || path+"/" == prefix || strings.HasSuffix(prefix, "/") && strings.HasPrefix(path, prefix) {
				return true
			}
		}
	}
	return false
}

func copyTree(source, target string) error {
	return copyTreeExcept(source, target, nil)
}

// copyTreeExcept copies a tree except the files and folders skip refuses, which it is given as paths in the package.
func copyTreeExcept(source, target string, skip func(path string) bool) error {
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
		if skip != nil && rel != "." && skip(filepath.ToSlash(filepath.Join(target, rel))) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
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

func assemble(root, out, md, d2, profileName string) error {
	if profileName == "" {
		profileName = "full"
	}
	prof, known := profiles[profileName]
	if !known {
		return fmt.Errorf("unknown profile %q", profileName)
	}
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
	skip := func(path string) bool {
		inside, err := filepath.Rel(out, path)
		return err == nil && prof.omitted(filepath.ToSlash(inside))
	}
	for _, name := range prof.packages {
		if err = copyTreeExcept(filepath.Join(root, "apps", name), filepath.Join(out, "content", name), skip); err != nil {
			return err
		}
	}
	trees := [][2]string{{"web/pudl", "pudl"}}
	if prof.fixtures {
		trees = append(trees, [2]string{"scripts/fixtures/portable-diagrams", "lab"}, [2]string{"scripts/fixtures/portable-workspace", "workspace-lab"})
	}
	for _, pair := range trees {
		if err = copyTree(filepath.Join(root, filepath.FromSlash(pair[0])), filepath.Join(out, pair[1])); err != nil {
			return err
		}
	}
	for _, name := range []string{"yavc-util.js", "dialogs.js", "doc-tabs.js", "pudl-host-kit.js", "snapshot.js", "command-toolbar.js"} {
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
	// The rules of the shared toolbar and its dialog, for a host that
	// offers pudlHost.commandToolbar (docs/command-toolbar-design.md).
	_, toolbar, found := strings.Cut(string(css), "/* command-toolbar: these rules go into the content package as support/command-toolbar.css */\n")
	if found {
		toolbar, _, found = strings.Cut(toolbar, "/* command-toolbar: end */")
	}
	if !found || !strings.Contains(toolbar, ".yavc-toolbar-columns") {
		return fmt.Errorf("the command toolbar's rules are missing")
	}
	if err = os.WriteFile(filepath.Join(out, "support", "command-toolbar.css"), []byte(toolbar), 0644); err != nil {
		return err
	}
	// The table of every built-in shortcode, for a host that sends a
	// document somewhere else (docs/shortcode-destinations.md).
	codes, err := shortcodes.Portable()
	if err != nil {
		return err
	}
	codeBytes, err := json.MarshalIndent(codes, "", "  ")
	if err != nil {
		return err
	}
	if err = os.WriteFile(filepath.Join(out, "content", "shortcodes.json"), append(codeBytes, '\n'), 0644); err != nil {
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
	if prof.d2 {
		if err = wasm(root, filepath.Join(out, "content", "diagram-kit"), "yavc-d2", d2, goroot); err != nil {
			return err
		}
	}
	// A package that leaves features out says which, where an applet looks when something it needs is missing
	// (docs/content-release-downloads.md, "Profiles"). The full package has no such file.
	if len(prof.omit) > 0 {
		omitted, err := json.MarshalIndent(map[string]any{"version": 1, "omitted": prof.omit}, "", "  ")
		if err != nil {
			return err
		}
		if err = os.WriteFile(filepath.Join(out, "content", "omitted.json"), append(omitted, '\n'), 0644); err != nil {
			return err
		}
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
	manifest := map[string]any{"version": 1, "kind": "portable-content-release-set", "entry": prof.entry, "entries": prof.entries, "requirements": map[string]any{"scriptKind": "classic", "resourceContract": 1, "workspaceContract": 1, "snapshotContract": 2}, "files": files, "digest": hex.EncodeToString(sum[:])}
	if prof.name != "full" {
		manifest["profile"] = prof.name
		manifest["omits"] = prof.omit
	}
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
	archive := flag.String("zip", "", "new ZIP archive outside the assembled output")
	profileName := flag.String("profile", "full", "full, or docs for Docs alone (docs/content-release-downloads.md)")
	flag.Parse()
	if *out == "" {
		fmt.Fprintln(os.Stderr, "-out is required")
		os.Exit(1)
	}
	if err := assemble(*root, *out, *md, *d2, *profileName); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if *archive != "" {
		if err := writeReleaseArchive(*out, *archive); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
}
