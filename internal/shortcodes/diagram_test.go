// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package shortcodes_test

import (
	"strings"
	"testing"
)

func TestDiagramReference(t *testing.T) {
	for _, path := range []string{"~/diagrams/flow.canvas", "flow.d2", "../shared/flow.mmd", "/site/flow.mermaid"} {
		html := render(t, `{{diagram:`+path+` alt="Request flow" width=80% caption="The **saved** diagram."}}`)
		if !strings.Contains(html, `data-diagram-src="`+path+`"`) || !strings.Contains(html, `data-diagram-alt="Request flow"`) || !strings.Contains(html, `width:80%`) || !strings.Contains(html, `<strong>saved</strong>`) {
			t.Fatalf("%s: %s", path, html)
		}
	}
	for _, source := range []string{`{{diagram:https://example.com/a.canvas}}`, `{{diagram://example.com/a.d2}}`, `{{diagram:javascript:bad.canvas}}`, `{{diagram:~/file.txt}}`, `{{diagram:~/file.canvas width=101%}}`, `{{diagram:~/file.canvas board=secret}}`} {
		html := render(t, source)
		if !strings.Contains(html, `sc-problem`) || strings.Contains(html, `data-diagram-src`) {
			t.Fatalf("unsafe or unsupported reference accepted: %s", html)
		}
	}
}
