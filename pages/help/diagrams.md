# Diagrams Help

[Diagrams](/diagrams) draws a diagram from a text file and shows the drawing beside the text, redrawing it as you type. It reads two languages: [D2](https://d2lang.com), in files named `something.d2`, and [Mermaid](https://mermaid.js.org), in files named `something.mmd` or `something.mermaid`. It also draws canvases, freeform diagrams in the open [JSON Canvas](https://github.com/obsidianmd/jsoncanvas) format, in files named `something.canvas`. The file is the whole diagram, so anything that can open a text file can read it. Diagrams runs in a window on the desktop and on its own at `diagrams.yavc.app`.

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

Choose a drawing tool from Shape, Drawing Tool, then click the drawing. The ribbon offers the same picker as a menu button. Each shape tool is a toggle; choosing the active tool again returns to Select. A click on empty space puts the new shape at the top of the diagram, and a click on a shape puts it inside that shape, which makes that shape a container. The tool goes back to Select after each shape, and Escape goes back to it at any time. N places the chosen kind too.

A selected shape has a round handle on each side. Drag from the handle to another shape to connect them, or to empty space to connect it to a new shape of the palette's kind. Drag a selected shape onto another shape to move it inside, or onto empty space to move it out to the top of the diagram; its connections follow it. Shape, Move Into does the same from the keyboard, asking for the container's name, and Shape, Move to the Top takes it out again. A connection to a new shape is N and then C from the keyboard. While you drag, the shape it would land on has a dashed edge.

The inspector beside the drawing shows the settings of whatever is selected, and View, Show the Inspector hides it. For a shape it has the label, the kind of shape, the fill, the line's colour, style and width, the text's colour, size, bold, italic and underline, a shadow, 3D, multiple and double border, and the icon, link and tooltip. For a connection it has the label, the direction (forward, backward, both ways or no arrows) with Reverse to swap its ends, the arrowhead and label at each end, including the crow's feet of an entity diagram, the line's colour, style and width, and animation. A change is made when you leave the field or press Enter, and emptying a field takes that setting away. If D2 will not take a value, the field says why, and while the text has a mistake in it the inspector's fields wait until it is put right.

D2 decides where a line meets a shape, so the side you drag a connection from does not fix where it attaches.

Every change on the drawing is a change to the text, made through D2's own editing, so Undo takes it back as it does typing, and the text is always the whole diagram. D2 writes the whole text again in its own layout as it makes a change, which tidies the spacing and keeps every comment; the first time it does this in a file, the status line says so. D2 places the shapes itself, so a new shape goes where the layout puts it rather than where you clicked. While the text has a mistake in it, the drawing cannot be changed until the mistake is put right.

## Canvases

Selecting a canvas node or connector highlights its JSON object in the source. Moving the caret within that object highlights the item in the drawing and brings it into view. These selections leave the text unchanged.

The inspector's Horizontal Alignment and Vertical Alignment fields position a text node's content within the shape's usable interior. Choose Left, Centre or Right, and Top, Middle or Bottom. Shape Default removes that override. With both axes at Shape Default, rectangle, rounded rectangle, text-only, document and package shapes place text at the top-left inset; the other shapes centre it. Shape, Drawing Tool offers the drawing tools through a submenu, which becomes a menu button in ribbon mode.

A canvas is a diagram where every shape stays where it was put, as on a whiteboard. Its file is JSON Canvas 1.0, the format Obsidian and other applications read, so a canvas made here opens there with the same cards in the same places joined by the same connectors. File, New Canvas starts one. Each node has a place and a size in pixels, and a text node holds Markdown, which the drawing shows with its headings, lists, emphasis and links.

```
{
  "nodes": [
    { "id": "start", "type": "text", "x": 0, "y": 0, "width": 180, "height": 80, "text": "**Start** here", "yavc": { "shape": "rounded" } },
    { "id": "next", "type": "text", "x": 300, "y": 0, "width": 180, "height": 80, "text": "Then this", "color": "5" }
  ],
  "edges": [
    { "id": "start-next", "fromNode": "start", "fromSide": "right", "toNode": "next", "toSide": "left", "toEnd": "arrow" }
  ]
}
```

JSON Canvas draws every node as a card and every connector end as an arrow or nothing. The `yavc` property adds what it lacks: thirteen shapes, connectors drawn as elbows, straight lines or curves, dashed and dotted lines, and more kinds of end, including the crow's feet of an entity relationship diagram. [The canvas extension](https://github.com/paulmooreparks/yavc.app/blob/main/docs/canvas-extension.md) lists them all. An application that does not know the property still draws the file sensibly, as cards with arrows, because Diagrams keeps the format's own properties in agreement with it. A connector's route is worked out each time from the two nodes and the sides it joins, so it is never stored.

Diagram, Tidy the Text writes a canvas in one steady layout, with two spaces of indent and each object's properties in the order the format lists them, so that a change shows in a comparison as only the lines it changed. Editing the drawing uses this layout too. Each gesture is one change in the text's Undo history. A downloaded picture of a canvas draws the text of each node as plain words, keeping paragraphs and dropping the rest of the Markdown, so it can differ a little from the screen. A canvas cannot be embedded in a document yet.

Click a node or connector to select it. Tab moves through them in drawing order, and Shift+Tab moves back. Tab after the last item, or Shift+Tab before the first, leaves the drawing. Drag a node to move it. The square handles resize it, with Shift keeping its proportions. Movement snaps to an eight-pixel grid and nearby edges and centres; dashed lines show matches, and Alt disables snapping. Arrow keys move a node by one pixel, or eight with Shift. Shape, Resize (R) and the inspector's numeric fields provide keyboard resizing. Escape cancels a drag.

Choose one of the thirteen shapes in the Shape menu or its ribbon, then click to place it, or press N to place it in the middle of the view. The round handles outside a selected node start connectors. Drag one near a side midpoint to pin the connector there, or into the middle of a node for an automatic attachment that follows the nearest side as the nodes move. Dropping on empty canvas leaves a free endpoint. Shape, Connect to a Node (C) asks for the target ID. The inspector changes a text node's Markdown, shape, colour and line, or a connector's label, route, sides and heads. Colours accept a hex colour or a preset from 1 to 6. A field that cannot be applied shows the reason beside it.

Edit provides Copy Node, Paste Nodes, Duplicate and Delete, with Ctrl (Command on macOS) and C, V and D, and Delete. Copying a group includes the nodes wholly inside it and their internal connectors. Pasted nodes receive new IDs and an offset of 24 pixels. Shape, Bring Forward and Send Back change the drawing order, also on Ctrl or Command with ] and [. G creates a group behind the existing nodes. Moving a group carries the nodes wholly inside its rectangle; a node moved out leaves it. Resizing a group changes its rectangle, and deleting one leaves its contents.

Select a connector to show a raised handle at each tip. Drag either tip to another anchor, another node or empty canvas. The dashed preview uses the same routing as the finished connector and updates while you move an attached node. Each release is one change in Undo. Shape, Reconnect End (E) and Reconnect Start (Shift+E), also available in the inspector, provide the same operation from the keyboard. Choose a node with an Automatic or pinned anchor, or Free Point with X and Y coordinates.

The wheel pans, and Ctrl or Command with the wheel zooms at the pointer. Space with a drag pans too. View, Pan (H) selects a pan tool, and the View menu also has pan and zoom commands. Alt with arrow keys pans, plus and minus zoom, 0 fits the contents, and 1 shows actual size. The view is kept while you edit. Neither its position nor its zoom changes the file or an exported picture.

Diagrams refuses a canvas over 2 MB or with more than 5,000 nodes and connectors, and one that has two nodes with the same id or a connector to a node that is not there; the notice says what is wrong, and the place is marked in the text. A link node shows its address as text and is not followed, and a file node shows the file's name. A link written in a text node's Markdown is shown as its words, without the link, since the drawing is a picture.

## Colours

A D2 diagram takes the site's colours, so it follows light and dark mode and the colour theme you chose in View. A diagram that sets its own `theme-id` or `theme-overrides` in a `vars: {d2-config: {...}}` block keeps them. Mermaid diagrams use Mermaid's own light and dark themes. A canvas takes the site's colours too, and its six preset colours (red, orange, yellow, green, cyan and purple, written `"1"` to `"6"`) have a lighter set in dark mode.

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
