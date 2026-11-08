// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package mdapi

import (
	"encoding/json"
	"testing"

	"yavc.app/internal/shortcodes"
)

func TestBundledShortcodeCatalog(t *testing.T) {
	var result struct{ Shortcodes []shortcodes.Definition }
	if err := json.Unmarshal([]byte(Call("shortcodes", "")), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Shortcodes) != len(shortcodes.Definitions()) {
		t.Fatal("browser catalog differs from native definitions")
	}
	by := map[string]shortcodes.Definition{}
	for _, def := range result.Shortcodes {
		if def.Name == "" || def.Title == "" || def.Description == "" || def.Params == nil {
			t.Fatalf("incomplete definition: %+v", def)
		}
		by[def.Name] = def
	}
	if !by["figure"].ArgumentRequired || !by["diagram"].ArgumentRequired || !by["kbd"].ArgumentRequired || !by["status"].ArgumentRequired || by["toc"].ArgumentRequired {
		t.Fatal("required and optional arguments are not distinguished")
	}
	if len(by["diagram"].Params) != 4 || by["diagram"].Params[0].Name != "src" || !by["diagram"].Params[0].Required {
		t.Fatal("diagram metadata does not expose its accepted parameters")
	}
	copy := shortcodes.Definitions()
	for i := range copy {
		if len(copy[i].Params) > 0 {
			copy[i].Params[0].Name = "changed"
		}
	}
	for _, def := range shortcodes.Definitions() {
		for _, param := range def.Params {
			if param.Name == "changed" {
				t.Fatal("a caller mutated the catalog")
			}
		}
	}
}
