---
title: A sample document
author: yavc.app
---

# A sample document

This document is yours to change. Open it in the Editor, try the Text, Visual, Split and Preview views under View, and type anywhere. The instructions for everything here are in [Editor Help](/help/editor), which is also under Help, Editor Help.

{{tip:Try this}}
Select a few words and press {{kbd:Ctrl+B}}, or type `/` on an empty line in Visual view for a menu of everything Insert offers.
{{/tip}}

## Text

Words can be **bold**, *italic*, ~~struck through~~, `code`, or {{color:accent}}coloured{{/color}}, and a [link](/help/editor) leads somewhere.

> A quote sits on its own, set in from the margin.

## Lists

- The first point
- The second point
  - A point inside the second

1. The first step
2. The second step

- [x] A task that is done
- [ ] A task still to do

## A table

| Key | What it does |
| --- | --- |
| {{kbd:Ctrl+S}} | Saves the document |
| {{kbd:Ctrl+F}} | Finds and replaces |
| {{kbd:Ctrl+K}} | Makes a link |

## Columns and a picture

{{columns}}
The Editor draws a picture beside the text when the document asks for one with a figure, and the picture can be one of yours in `~/Pictures` or one of the site's.
{{column}}
{{figure:/static/shots/desktop.jpg alt="The desktop with the Editor open" width=100% caption="The Editor on the desktop"}}
{{/columns}}

## Code

```js
function greet(name) {
    return 'Hello, ' + name + '.';
}
```

{{expand:Front matter}}
The lines between the two rows of dashes at the top of this file are its front matter. File, Properties edits them as a form.
{{/expand}}
