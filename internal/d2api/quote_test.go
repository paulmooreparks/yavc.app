// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package d2api

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestConversionLabelsRemainLiteral(t *testing.T) {
	labels := []string{"", "name: value {shape: person}", "quotes ' and \" and \\", "${missing} and apostrophe's", "First\nSecond", "日本語"}
	request, _ := json.Marshal(map[string]any{"values": labels})
	var quoted struct {
		Values []string `json:"values"`
	}
	if err := json.Unmarshal([]byte(Call("quote", string(request))), &quoted); err != nil || len(quoted.Values) != len(labels) {
		t.Fatalf("quote: %s %v", Call("quote", string(request)), err)
	}
	for i, label := range labels {
		input, _ := json.Marshal(TextRequest{Text: "item: " + quoted.Values[i] + "\n"})
		var result OutlineResponse
		output := Call("outline", string(input))
		if err := json.Unmarshal([]byte(output), &result); err != nil || len(result.Problems) > 0 || len(result.Shapes) != 1 || result.Shapes[0].Label != label {
			t.Fatalf("%q became %s", label, output)
		}
	}
	if output := Call("quote", `{"values":["`+strings.Repeat("x", MaxSource+1)+`"]}`); !strings.Contains(output, `"error"`) {
		t.Fatal("oversized labels accepted")
	}
}
