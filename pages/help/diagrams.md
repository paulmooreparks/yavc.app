# Diagrams Help

[Diagrams](/diagrams) draws a diagram from a text file and shows the drawing beside the text, redrawing it as you type. It reads two languages: [D2](https://d2lang.com), in files named `something.d2`, and [Mermaid](https://mermaid.js.org), in files named `something.mmd` or `something.mermaid`. The file is the whole diagram, so anything that can open a text file can read it. Diagrams runs in a window on the desktop and on its own at `diagrams.yavc.app`.

## The file

In D2 you give each shape a name and connect shapes with arrows. A shape's label follows a colon, and its settings go between braces.

```
direction: right

reader: Reader {shape: person}
site: The site {
  web: Web server
  app: Application
  web -> app
}
db: Database {shape: cylinder}

reader -> site.web: HTTPS
site.app -> db: reads and writes
```

A shape written inside another one is drawn inside it, and outside it you refer to it by both names joined with a dot, such as `site.web`. A Mermaid diagram begins with the kind of diagram it is, such as `flowchart LR` or `sequenceDiagram`. The [D2 tour](https://d2lang.com/tour/intro) and the [Mermaid syntax reference](https://mermaid.js.org/intro/syntax-reference.html) describe each language in full.

## Starting a diagram

File, New Diagram starts a D2 diagram in one of eight styles: a flowchart, an architecture diagram, a sequence diagram, an entity relationship diagram, a class diagram, a state machine, an org chart or a grid. File, New Mermaid Diagram offers Mermaid's kinds, including the charts D2 does not draw, such as a Gantt chart, a pie chart, a mind map, a timeline, a user journey and a git graph. Each starts from a small example that you change. The style is not recorded anywhere, so a diagram is whatever its text says it is.

## Editing

The text pane colours the language as you type, numbers its lines and keeps its own undo history for each open diagram. Edit has Undo, Redo and Find and Replace, and Go, Go to Line moves to a line by its number. In a D2 diagram, typing a dot or a colon after a shape offers what can follow there, such as the shapes after `shape:` and the style names after `style.`, and Ctrl+Space offers them anywhere.

When the text has a mistake in it, the last drawing that worked stays in place, dimmed, and a notice above it says what is wrong and on which line. The line is underlined in the text, and the mark in the margin gives the message too. Diagram, Tidy the Text writes a D2 diagram's text as D2's own formatter does, with even spacing and indents, and Undo puts it back.

The View menu shows the text, the drawing or both, and Drawing chooses which side of the text the drawing sits on. Fit the Drawing to the Pane shrinks a large drawing to fit, and with it off the drawing shows at its own size and scrolls.

File, Close Diagram closes the diagram in front, and asks first when it has changes that are not saved.

## Editing on the drawing

A D2 diagram can also be changed on its drawing, in the Visual and Split views. Click a shape or a connection to select it, and its text is selected beside it; putting the cursor in the text selects the shape written there. With the drawing in focus, the arrow keys move from one shape or connection to the next, and these keys act on the one selected.

| Key | What it does |
|---|---|
| Enter | Edits the label, the words shown on it |
| F2 | Renames the shape, and every connection to it follows |
| N | Adds a new shape; Shift+N adds it inside the selected shape |
| C | Starts a connection from the selected shape; click the shape to connect to, or move to it and press Enter |
| Delete | Deletes it, with its connections |
| Escape | Clears the selection, or stops a connection |

The Shape menu has the same commands, and Shape chooses the kind of shape, such as an oval, a diamond, a cylinder or a person. A double click on a shape edits its label too.

Every change on the drawing is a change to the text, made through D2's own editing, so Undo takes it back as it does typing, and the text is always the whole diagram. D2 writes the whole text again in its own layout as it makes a change, which tidies the spacing and keeps every comment; the first time it does this in a file, the status line says so. D2 places the shapes itself, so a new shape goes where the layout puts it rather than where you clicked. While the text has a mistake in it, the drawing cannot be changed until the mistake is put right.

## Colours

A D2 diagram takes the site's colours, so it follows light and dark mode and the colour theme you chose in View. A diagram that sets its own `theme-id` or `theme-overrides` in a `vars: {d2-config: {...}}` block keeps them. Mermaid diagrams use Mermaid's own light and dark themes.

## In documents and slides

Diagram, Copy as Embed puts the diagram on the clipboard as a fenced block, which the Editor and Slides draw wherever it is pasted. The block contains the diagram's text, so it is drawn the same in any document. File, Open in the Editor opens the diagram's file as text in the Editor.

## Downloading

- File, Download as SVG writes the drawing as an SVG picture, with its fonts inside it.
- File, Download as PNG writes it as a PNG picture at its own size, or at two or three times the size for a sharper print.
- File, Download the Text writes the diagram's file.

## What is drawn and what is not

A diagram is drawn as a picture, which runs nothing and loads nothing, so a diagram written by somebody else cannot make your browser contact another site. An icon from another site is left out of the drawing, and a note says so; an icon written into the diagram itself as a `data:` address is drawn. A D2 file can `import` other D2 files only once Diagrams supplies them, which it does not do yet. D2 lays diagrams out with its dagre engine. Diagrams does not draw a diagram that asks for ELK, and its notice says why. A diagram is limited to 256 KB of text and 2,000 shapes.

The first diagram you draw takes a few seconds while the D2 engine, about 7 MB, loads and starts. The browser keeps it after that.

## Where the file lives

Your files are kept in this browser, under the address you made them at. The desktop at yavc.app and the standalone page at diagrams.yavc.app each keep their own, so download a diagram to keep it anywhere else.

## Agents

Every command above is also an action an AI agent can call through the site's MCP endpoint, from starting and reading a diagram to replacing its text, reading a D2 diagram's shapes and connections, tidying it, saving it and exporting the drawing. You pair an agent in [Settings](/help/settings) with a token. The agent works on the page you have open, and the page asks you before it does more than you allowed. The page [For Agents](/agents) has the details.

Your home folder has a sample diagram, `~/Howto/Diagrams.d2`, which you can open, change and draw.
