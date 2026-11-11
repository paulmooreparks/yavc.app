// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package shortcodes

import (
	"strings"
	"testing"
)

// Every shortcode the engine reads has a row, and every row says enough
// for a destination to put something in the shortcode's place.
func TestPortableTableCoversEveryShortcode(t *testing.T) {
	got, err := Portable()
	if err != nil {
		t.Fatal(err)
	}
	rows := map[string]PortableShortcode{}
	for _, row := range got.Shortcodes {
		if _, twice := rows[row.Name]; twice {
			t.Fatalf("%s is in the table twice", row.Name)
		}
		rows[row.Name] = row
	}
	for name := range table {
		if _, ok := rows[name]; !ok {
			t.Errorf("%s has no row", name)
		}
	}
	for _, row := range got.Shortcodes {
		if !strings.HasSuffix(row.Meaning, ".") {
			t.Errorf("%s: the meaning must be a sentence: %q", row.Name, row.Meaning)
		}
		named := map[string]bool{}
		positions := map[int]bool{}
		for _, a := range row.Arguments {
			if a.Name == "" || a.Description == "" || named[a.Name] {
				t.Errorf("%s: argument %q needs a name of its own and a description", row.Name, a.Name)
			}
			named[a.Name] = true
			if a.Position < 0 || a.Position > 0 && positions[a.Position] {
				t.Errorf("%s: argument %s has a position another has", row.Name, a.Name)
			}
			positions[a.Position] = true
			if a.Rest && a.Position == 0 {
				t.Errorf("%s: argument %s takes the rest and so needs a position", row.Name, a.Name)
			}
		}
		body := row.Kind == "container" || row.Kind == "span"
		switch row.Plain.From {
		case "body":
			if !body {
				t.Errorf("%s has no body to read as plain words", row.Name)
			}
		case "argument", "file":
			if !named[row.Plain.Argument] || row.Plain.Otherwise != "" && !named[row.Plain.Otherwise] {
				t.Errorf("%s: the plain form uses an argument the shortcode does not have", row.Name)
			}
		case "word":
			if row.Plain.Word == "" {
				t.Errorf("%s: the plain form needs its word", row.Name)
			}
		case "nothing":
		default:
			t.Errorf("%s: unknown plain form %q", row.Name, row.Plain.From)
		}
		if row.Plain.Lead != "" && !named[row.Plain.Lead] {
			t.Errorf("%s: the lead is not one of its arguments", row.Name)
		}
		if !row.Published && (row.Plain.From != "nothing" || row.Picture) {
			t.Errorf("%s is not published, so it has no plain form and no picture", row.Name)
		}
		if row.AliasOf != "" {
			if _, ok := rows[row.AliasOf]; !ok {
				t.Errorf("%s is another spelling of %s, which is not in the table", row.Name, row.AliasOf)
			}
		}
	}
	// The arguments the Insert menu documents are the table's too.
	for _, d := range Definitions() {
		row := rows[d.Name]
		named := map[string]bool{}
		for _, a := range row.Arguments {
			named[a.Name] = true
		}
		for _, p := range d.Params {
			if !named[p.Name] {
				t.Errorf("%s: the Insert menu's argument %s is not in the table", d.Name, p.Name)
			}
		}
	}
}
