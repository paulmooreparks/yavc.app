// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// standIns makes the engines the tests give the assembler, so that a package can be built where the real ones have not been.
func standIns(t *testing.T) (md, d2 string) {
	t.Helper()
	md, d2 = t.TempDir(), t.TempDir()
	for dir, name := range map[string]string{md: "yavc-md", d2: "yavc-d2"} {
		for file, body := range map[string]string{name + ".wasm": "\x00asm " + name, "wasm_exec.js": "// stand-in"} {
			if err := os.WriteFile(filepath.Join(dir, file), []byte(body), 0644); err != nil {
				t.Fatal(err)
			}
		}
	}
	return md, d2
}

type built struct {
	dir      string
	manifest map[string]json.RawMessage
	files    map[string]string // path to the file's bytes
}

func build(t *testing.T, name string) built {
	t.Helper()
	md, d2 := standIns(t)
	out := filepath.Join(t.TempDir(), "package")
	if err := assemble("../..", out, md, d2, name); err != nil {
		t.Fatal(err)
	}
	b := built{dir: out, files: map[string]string{}}
	data, err := os.ReadFile(filepath.Join(out, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &b.manifest); err != nil {
		t.Fatal(err)
	}
	var listed []asset
	if err = json.Unmarshal(b.manifest["files"], &listed); err != nil {
		t.Fatal(err)
	}
	for _, f := range listed {
		body, err := os.ReadFile(filepath.Join(out, filepath.FromSlash(f.Path)))
		if err != nil {
			t.Fatal(err)
		}
		b.files[f.Path] = string(body)
	}
	b.files["manifest.json"] = string(data)
	return b
}

// The full package is what it was before profiles existed. Its manifest has no member for them and it has no list of omissions,
// and asking for it by name gives the same bytes as not asking.
func TestFullProfileHasNoProfileMembers(t *testing.T) {
	plain, named := build(t, ""), build(t, "full")
	for _, member := range []string{"profile", "omits"} {
		if _, found := plain.manifest[member]; found {
			t.Errorf("the full manifest has %q", member)
		}
	}
	if _, found := plain.files["content/omitted.json"]; found {
		t.Error("the full package has content/omitted.json")
	}
	if string(plain.manifest["digest"]) != string(named.manifest["digest"]) || plain.files["manifest.json"] != named.files["manifest.json"] {
		t.Error("-profile full differs from no profile")
	}
	if string(plain.manifest["entry"]) != `"content/diagrams/applet.json"` {
		t.Errorf("the full package's entry is %s", plain.manifest["entry"])
	}
}

// Every file of the docs package is the same file, byte for byte, as in the full package, and what the docs package lacks is
// exactly the applets and fixtures it does not hold and the features it says it omits.
func TestDocsProfileIsTheFullPackageLessWhatItSays(t *testing.T) {
	full, docs := build(t, "full"), build(t, "docs")
	prof := profiles["docs"]
	for path, body := range docs.files {
		switch path {
		case "manifest.json", "content/omitted.json":
			continue
		case "support/yavc-util.js":
			// The one file that differs: the line that takes the list of omissions. Everything else in it is the full package's text.
			if strings.Replace(body, omissionsLineWith(t, body), omissionsLine, 1) != full.files[path] {
				t.Error("support/yavc-util.js differs from the full package's in more than the omissions line")
			}
			continue
		}
		if full.files[path] != body {
			t.Errorf("%s differs from the full package or is not in it", path)
		}
		if prof.omitted(path) {
			t.Errorf("%s belongs to a feature the docs package omits", path)
		}
	}
	for path := range full.files {
		if _, held := docs.files[path]; held || path == "manifest.json" {
			continue
		}
		fixture := strings.HasPrefix(path, "lab/") || strings.HasPrefix(path, "workspace-lab/")
		applet := false
		for _, name := range []string{"editor", "slides", "diagrams"} {
			applet = applet || strings.HasPrefix(path, "content/"+name+"/")
		}
		if !fixture && !applet && !prof.omitted(path) {
			t.Errorf("%s is missing from the docs package and nothing says why", path)
		}
	}
	if docs.manifest["profile"] == nil || string(docs.manifest["profile"]) != `"docs"` {
		t.Errorf("profile is %s", docs.manifest["profile"])
	}
	if string(docs.manifest["entry"]) != `"content/docs/applet.json"` || string(docs.manifest["entries"]) == string(full.manifest["entries"]) {
		t.Errorf("entry is %s and entries %s", docs.manifest["entry"], docs.manifest["entries"])
	}
	if string(docs.manifest["digest"]) == string(full.manifest["digest"]) {
		t.Error("the docs digest is the full digest")
	}
	// The manifest's list and the file an applet reads are the same list, and each feature says something and names something.
	var fromManifest, fromFile struct {
		Omits    []feature `json:"omits"`
		Omitted  []feature `json:"omitted"`
		Features []feature
	}
	if err := json.Unmarshal(docs.manifest["omits"], &fromManifest.Features); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(docs.files["content/omitted.json"]), &fromFile); err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(fromManifest.Features)
	b, _ := json.Marshal(fromFile.Omitted)
	if !bytes.Equal(a, b) || len(fromFile.Omitted) == 0 {
		t.Errorf("manifest omits %s, omitted.json %s", a, b)
	}
	for _, f := range fromFile.Omitted {
		if f.Feature == "" || !strings.HasSuffix(f.Message, "is not part of this build of Docs.") && !strings.HasSuffix(f.Message, "are not part of this build of Docs.") || len(f.Paths) == 0 {
			t.Errorf("feature %+v is incomplete", f)
		}
		// Each path names something the full package has, so a feature cannot drift into naming nothing.
		for _, path := range f.Paths {
			found := false
			for held := range full.files {
				found = found || held == path || strings.HasSuffix(path, "/") && strings.HasPrefix(held, path)
			}
			if !found {
				t.Errorf("%s: %s is not in the full package", f.Feature, path)
			}
		}
	}
}

// A reduced package says in its own loader that it has omissions, so the loader asks for nothing to find out. The full package keeps
// null there, and the loader makes no request when a file is missing.
func TestLoaderKnowsTheOmissionsWithoutAsking(t *testing.T) {
	full, docs := build(t, "full"), build(t, "docs")
	if !strings.Contains(full.files["support/yavc-util.js"], omissionsLine) {
		t.Error("the full package's loader does not have null for its omissions")
	}
	body := docs.files["support/yavc-util.js"]
	if strings.Contains(body, omissionsLine) {
		t.Fatal("the docs package's loader still has null for its omissions")
	}
	line := omissionsLineWith(t, body)
	var list struct {
		Version int       `json:"version"`
		Omitted []feature `json:"omitted"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSuffix(strings.TrimPrefix(line, "var omittedByBuild = "), "; // yavc-content: omissions")), &list); err != nil {
		t.Fatalf("the omissions in the loader are not JSON: %v", err)
	}
	var fromFile struct{ Omitted []feature }
	if err := json.Unmarshal([]byte(docs.files["content/omitted.json"]), &fromFile); err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(list.Omitted)
	b, _ := json.Marshal(fromFile.Omitted)
	if list.Version != 1 || len(list.Omitted) == 0 || !bytes.Equal(a, b) {
		t.Errorf("the loader lists %s and omitted.json %s", a, b)
	}
	if strings.Contains(full.files["support/yavc-util.js"], "content/omitted.json") || strings.Contains(body, "content/omitted.json") {
		t.Error("the loader asks for content/omitted.json")
	}
}

// omissionsLineWith is the line of a reduced package's loader that holds the list.
func omissionsLineWith(t *testing.T, body string) string {
	t.Helper()
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "var omittedByBuild = ") && strings.HasSuffix(line, "; // yavc-content: omissions") {
			return line
		}
	}
	t.Fatal("the loader has no line with the omissions")
	return ""
}

func TestUnknownProfileIsRefused(t *testing.T) {
	md, d2 := standIns(t)
	if err := assemble("../..", filepath.Join(t.TempDir(), "package"), md, d2, "everything"); err == nil {
		t.Fatal("accepted an unknown profile")
	}
}
