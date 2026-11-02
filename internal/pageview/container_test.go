package pageview

import (
	"encoding/json"
	"strings"
	"testing"

	"yavc.app/internal/preview"
)

func docOf(t *testing.T, text string) *Node {
	t.Helper()
	blocks, _ := preview.Render(text)
	return ParseDocument(text, Units(blocks))
}

func back(t *testing.T, doc *Node) string {
	t.Helper()
	// Through JSON, as the editor hands it back.
	b, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	var n Node
	if err := json.Unmarshal(b, &n); err != nil {
		t.Fatal(err)
	}
	out, err := SerializeDocument(&n)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// A container's body is rich text, and an untouched container comes back
// byte for byte.
func TestContainerRoundTrip(t *testing.T) {
	for _, text := range []string{
		"# Top\n\n{{tip:For instance}}\nThis is a *tip*.\n\n- one\n- two\n{{/tip}}\n\nAfter.\n",
		"{{expand:More}}\n\nOpens.\n\n{{/expand}}\n",
		"{{note}}\n{{/note}}\n",
		"{{columns}}\nThe first column.\n\n{{column}}\n\nThe second.\n{{/columns}}\n",
		"{{info:Outer}}\nBefore.\n\n{{tip:Inner}}\nInside.\n{{/tip}}\n\nAfter.\n{{/info}}\n",
		"{{style}}\n.x { color: red }\n{{/style}}\n",
		"{{info:Outer}}\nBefore.\n\n{{warning:Inner}}\nInside.\n{{/warning}}\n{{/info}}\n\nAfter.\n",
		"{{info:Outer}}\nBefore.\n{{/info}}\nAfter.\n",
	} {
		doc := docOf(t, text)
		if got := back(t, doc); got != text {
			t.Fatalf("%q came back as %q", text, got)
		}
	}
}

func TestContainerShape(t *testing.T) {
	doc := docOf(t, "{{tip:For instance}}\nThis is a *tip*.\n{{/tip}}\n")
	c := doc.Content[0]
	if c.Type != "container" || c.Attrs["name"] != "tip" || c.Attrs["args"] != "For instance" {
		t.Fatalf("not a tip container: %+v", c)
	}
	if len(c.Content) != 1 || c.Content[0].Type != "paragraph" {
		t.Fatalf("body not rich: %+v", c.Content)
	}
	if !strings.Contains(c.Attrs["before"].(string), "notice-title") {
		t.Fatalf("no title HTML: %v", c.Attrs["before"])
	}
	cols := docOf(t, "{{columns}}\nA.\n\n{{column}}\n\nB.\n{{/columns}}\n").Content[0]
	if cols.Type != "columns" || len(cols.Content) != 2 || cols.Content[1].Type != "column" {
		t.Fatalf("not two columns: %+v", cols)
	}
	// A nested box, and a box followed at once by text: each block its own.
	nested := docOf(t, "{{info:Outer}}\nBefore.\n\n{{warning:Inner}}\nInside.\n{{/warning}}\n{{/info}}\n\nAfter.\n")
	if len(nested.Content) != 2 || nested.Content[0].Type != "container" || len(nested.Content[0].Content) != 2 || nested.Content[0].Content[1].Type != "container" || nested.Content[1].Type != "paragraph" {
		t.Fatalf("nested boxes: %+v", nested.Content)
	}
	tight := docOf(t, "{{info:Outer}}\nBefore.\n{{/info}}\nAfter.\n")
	if len(tight.Content) != 2 || tight.Content[1].Type != "paragraph" {
		t.Fatalf("text after a box: %+v", tight.Content)
	}
	style := docOf(t, "{{style}}\n.x { }\n{{/style}}\n").Content[0]
	if style.Type != "source_block" {
		t.Fatalf("a style block is source, got %s", style.Type)
	}
	// A container edited: a new paragraph in the body, and the title changed.
	doc = docOf(t, "{{tip:Old}}\nText.\n{{/tip}}\n")
	c = doc.Content[0]
	c.Attrs["open"] = "{{tip:New}}"
	c.Content = append(c.Content, &Node{Type: "paragraph", Content: []*Node{{Type: "text", Text: "More."}}})
	if got := back(t, doc); got != "{{tip:New}}\nText.\n\nMore.\n{{/tip}}\n" {
		t.Fatalf("edited tip came back as %q", got)
	}
	// Fresh blocks (an insert) make a container with no place.
	fresh := Fresh(docOf(t, "{{note:T}}\nType here.\n{{/note}}").Content)
	if _, has := fresh[0].Attrs["uid"]; has || fresh[0].Content[0].Attrs["uid"] != nil {
		t.Fatalf("fresh container keeps a place: %+v", fresh[0])
	}
}
