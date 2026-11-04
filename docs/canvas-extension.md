# The yavc extension to JSON Canvas, version 1

Status: written on 2026-11-04, before the first canvas file, as decision 2 of `docs/canvas-design.md` requires. This page defines everything a canvas file written by Diagrams holds beyond JSON Canvas 1.0. The reader and writer in `apps/diagram-kit/jcanvas.js` implement it, and its tests (`apps/diagram-kit/test/jcanvas.test.mjs`) hold them to it.

A file that uses the extension is a valid JSON Canvas 1.0 file. Everything the specification defines is written as the specification writes it. The extension is held in properties called `yavc`, one on the file, one on any node and one on any edge, and nowhere else.

## The rule of degrading

Another application may drop the `yavc` properties, because JSON Canvas says nothing about properties it does not define. Every file must still be a sensible diagram without them. The writer therefore keeps the specification's own properties in agreement with the extension:

- A connector whose extension gives an end a head other than `none` has that end's `fromEnd` or `toEnd` written as `arrow`, and one whose head is `none` has it written as `none`.
- A node's text, position, size and colour are always the specification's own properties, whatever its shape.

A reader that sees no `yavc` property, or one it cannot read, draws the file by the specification alone: cards, arrows and the specification's colours.

## On the file

```json
"yavc": { "version": 1 }
```

`version` is the version of this extension the file was written with. A reader that meets a larger number draws what it understands and says that the file was written by a newer Diagrams.

## On a node

```json
"yavc": { "shape": "cylinder", "line": "dashed", "lineWidth": 2 }
```

- `shape` is how a text node is drawn: `rectangle` (the default), `rounded`, `oval`, `diamond`, `parallelogram`, `document`, `cylinder`, `queue`, `person`, `cloud`, `hexagon`, `package` or `text`, which draws the text with no outline. The shape is drawn to fill the node's box. It applies to text nodes only; file, link and group nodes keep their own drawing.
- `line` is the outline's style: `solid` (the default), `dashed` or `dotted`.
- `lineWidth` is the outline's width in pixels, a whole number from 1 to 8; the default is 2.
- `anchor` is an optional boolean. When true, the node represents a free connector endpoint and must be a text node with empty `text`, zero `width` and `height`, integer coordinates and `shape` set to `text`. Diagrams draws no node or node-selection control for it. The connector still uses its standard node ID and coordinates. The editor removes such a node only when no connector refers to it; a normal empty text node is never removed this way. A reader ignoring this property can draw the empty text node and its connector normally. This is an additive version 1 property.

## On an edge

```json
"yavc": { "route": "curve", "fromHead": "cf-one", "toHead": "cf-many", "line": "dashed", "lineWidth": 2 }
```

- `route` is how the connector is drawn between its two sides: `elbow` (the default), which runs in horizontal and vertical lines, `straight` or `curve`. The route itself is never stored: it is computed from the two nodes' boxes and the two sides each time the file is drawn.
- `fromHead` and `toHead` are the shapes of the connector's ends: `none`, `arrow` (a filled triangle, the specification's arrow), `triangle` (an open one), `diamond`, `circle`, `box`, `cross`, and the crow's feet of an entity relationship diagram, `cf-one`, `cf-one-required`, `cf-many` and `cf-many-required`. When one is not given, the end is the specification's `fromEnd` or `toEnd`.
- `line` and `lineWidth` are as on a node.

## What a reader must refuse

A reader refuses a file over 2 MB, a file with more than 5,000 nodes and edges together, a value of the wrong type for a property this page or the specification defines, an edge whose `fromNode` or `toNode` is not a node in the file, and two nodes or two edges with one `id`. It reports the first problem and its place, and draws nothing until the file is put right. A property it does not know, in the specification's places or the extension's, is kept as written and ignored.

## Versions

A change that would make a reader of this version draw a file wrongly needs a new version, written here with what changed. A new value, or a new property that a reader of this version may safely ignore, does not.
