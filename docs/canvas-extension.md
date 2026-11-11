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

The file's `yavc` object also accepts `font` and `styles`, which the sections on text and on named styles below define. It accepts `background` (a hex color or preset, omitted for the theme default), `grid` (a boolean, default false) and `snap` (a boolean, default true). Background applies to the drawing and exports. Grid and snapping affect editing only. The grid and snap spacing is eight file pixels; a zoomed-out grid may show a coarser subset of those points. These are additive version 1 properties, and another reader can ignore them without changing document content or geometry.

## On a node

```json
"yavc": { "shape": "cylinder", "line": "dashed", "lineWidth": 2 }
```

- `shape` is how a text node is drawn: `rectangle` (the default), `rounded`, `oval`, `diamond`, `parallelogram`, `document`, `cylinder`, `queue`, `person`, `cloud`, `hexagon`, `package` or `text`, which draws the text with no outline. The shape is drawn to fill the node's box. It applies to text nodes only; file, link and group nodes keep their own drawing.
- `line` is the outline's style: `solid` (the default), `dashed` or `dotted`.
- `lineWidth` is the outline's width in pixels, a whole number from 1 to 8; the default is 2.
- `fillColor` and `strokeColor` independently override the node's fill and outline. Each accepts a hex color or preset as the standard `color` property does. Omit either to use its coordinated default. They apply to text, file, link and group nodes and are additive version 1 properties; dropping them retains the standard coordinated color.
- `textAlign` controls horizontal alignment on a text node: `left`, `center` or `right`. When absent, rectangle, rounded, text, document and package shapes use left alignment; the other shapes use centre alignment.
- `textVerticalAlign` controls vertical alignment on a text node: `top`, `middle` or `bottom`. When absent, rectangle, rounded, text, document and package shapes use top alignment; the other shapes use middle alignment. Both alignment properties apply within the shape's usable text inset and are additive version 1 properties. Another reader may ignore them without losing the text or geometry.
- `anchor` is an optional boolean. When true, the node represents a free connector endpoint and must be a text node with empty `text`, zero `width` and `height`, integer coordinates and `shape` set to `text`. Diagrams draws no node or node-selection control for it. The connector still uses its standard node ID and coordinates. The editor removes such a node only when no connector refers to it; a normal empty text node is never removed this way. A reader ignoring this property can draw the empty text node and its connector normally. This is an additive version 1 property.

### Text on a node

These properties were added on 2026-11-11 so that a screen design can be drawn as it looks (DESIGN.md, decision 122). They are additive version 1 properties. Another reader may ignore them and still has the text, in its own font and colour.

- `textColor` is the colour of the node's text, as a hex colour or preset. When absent, Diagrams chooses a colour that can be read on the node's fill.
- `fontSize` is the size of the text in file pixels, a number from 6 to 200. The default is 14. Headings in a text node's Markdown keep their proportion to it.
- `fontWeight` is a whole number of hundreds from 100 to 900. The default is the font's normal weight, with bold where the Markdown asks for it.
- `fontFamily` is a list of font family names separated by commas, such as `Roboto, Arial`. It may contain letters, digits, spaces, commas, hyphens and underscores only, and at most 200 characters. Diagrams adds its own font after the list, so a family the reader's machine does not have falls back to it.
- `padding` is the space between the node's box and its text, a whole number of file pixels from 0 to 64. The default is 8 at the sides, and 6 above and below on the screen.
- `lineHeight` is the height of a line of text as a multiple of the font size, a number from 0.8 to 3. The default is 1.3. It was added on 2026-11-12 (DESIGN.md, decision 128) and is an additive version 1 property.
- `paddingSides` is the padding of each side, as four whole numbers of file pixels from 0 to 64 for the top, right, bottom and left. It takes the place of `padding` where both are given. A reader that ignores it uses `padding` or its own default. It was added on 2026-11-12 with the same decision and is an additive version 1 property.

A family is written into a drawing so that CSS reads it. Each name is quoted, since the format allows a name that is not a CSS identifier, such as `GKR Roboto 5-29-0` with a word that starts with a digit, and CSS drops a whole list for one unquoted name of that kind. The generic families, such as `sans-serif` and `system-ui`, are left unquoted.

The picture of a canvas, which is what an export, a document and a slide show, breaks a text into lines by its width. Where there is a page, the width is measured in the node's own font, size and weight, so a label in a box exactly as wide as its letters is drawn whole. Where there is none, as in Node, the width is estimated at 0.56 of the font size for each character, and the estimate is trusted only when it says a text is wider than its box by more than a fifth, both for starting a new line and for cutting a single word. A line breaks between words in both cases. A caller of `render` may pass `measure`, a function of the text, size, weight and family list that returns a width, or `measure: false` for the estimate. A canvas written from a screen has boxes as tight as the screen's, so it reads best where its fonts are loaded and the widths are measured.

The first line's baseline follows the rule CSS has for a line box: the font's ascent and descent are centred in the line's height, and the baseline is the ascent below the top of that. Where there is a page, the ascent and descent are the font's own, which the canvas API gives as `fontBoundingBoxAscent` and `fontBoundingBoxDescent`, each rounded to a whole pixel so that text sits on a pixel row. A `measure` function may have a `metrics(size, weight, families)` function that returns `{ ascent, descent }` or null. Without them the ascent is taken as 0.85 of the font size and the two together as the size.

The file's `yavc` object accepts `font`, with the same rule as `fontFamily`. It is the font for every text in the canvas that has no `fontFamily` of its own.

A canvas file never contains a font, and Diagrams never fetches one. A family is drawn when the page or the reader's machine already has it. A host that wants a brand font drawn supplies it to its own pages. An exported SVG picture contains the family's name. An exported PNG, and a canvas shown in a document or on a slide, is a picture the browser draws by itself, so it has the fonts installed on the reader's machine and none that only the page loaded.

A line that ends in a backslash, or in two spaces, breaks there without the gap a new paragraph has. That is Markdown's own hard line break, and the SVG text of an export now honours it as the screen does.

### The outline of a rectangle

- `radius` is the corner radius in file pixels, a number from 0 to 1000, on a node drawn as a rectangle: a text node whose shape is `rectangle` or `rounded`, and a file, link or group node. It is drawn no larger than half the node's shorter side. When absent, each of those keeps its own radius.
- `outlineSides` is a list of the sides whose outline is drawn, from `top`, `right`, `bottom` and `left`, on the same nodes. An empty list draws the fill with no outline. When absent, the whole outline is drawn. A side that is drawn alone is a straight line, whatever the radius.

- `radiusCorners` is a radius for each corner, as four numbers from 0 to 1000 for the top left, top right, bottom right and bottom left, on the same nodes. It takes the place of `radius` where both are given, and each is drawn no larger than half the node's shorter side. A reader that ignores it uses `radius` or its own corners. It was added on 2026-11-12 (DESIGN.md, decision 128) and is an additive version 1 property.
- `outlinePosition` is `center` or `inside`, on the same nodes. `center`, the default, draws the outline astride the node's edge, half inside and half outside, as SVG draws a stroke. `inside` draws it wholly within the node's box, as CSS draws a border, so a screen's one-pixel borders land on the pixels they have in the browser.
- `noFill` is a boolean, on the same nodes. When true the node has its outline and nothing inside it, whatever `fillColor` or `color` say, and its text is coloured to be read against the canvas's background. It is a property of its own and not a value of `fillColor`, because a reader of an earlier release refuses a colour it does not know and ignores a property it does not know.

All four are additive version 1 properties. A reader that ignores them draws the whole outline astride the edge, with its own corners and its own fill. `outlinePosition` and `noFill` were added on 2026-11-12 (DESIGN.md, decision 128).

### Pictures

A file node whose `file` ends in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` or `.svg` is a picture, and Diagrams draws the picture in the node's box. The path is relative to the folder the canvas file is in, or it is an absolute virtual path that begins with `/` or `~/`. JSON Canvas itself says only that `file` is a path within the system, and Obsidian reads it from the vault's root, so a canvas meant for both keeps its pictures where both rules find them.

- `fit` is how the picture fills the box: `contain` (the default) shows all of it, `cover` fills the box and crops, and `stretch` fills the box without keeping the picture's proportions.
- `tint` is a hex colour or preset. Every pixel of the picture is drawn in that colour, with the picture's own transparency. It is for a symbol drawn in one colour, which can then take the colour of the button it sits on.
- A picture has no outline and no fill unless the node says so: `color`, `strokeColor`, `line` or `lineWidth` gives it an outline, and `fillColor` gives it a fill behind the picture.

The host reads the picture, by the rules of `docs/document-host-overlays-contract.md`. Diagrams accepts PNG, JPEG, GIF, WebP and SVG, checks that the bytes are of the kind the name says, and draws at most 64 different pictures in a canvas, of at most 1 MiB each and 8 MiB together. A picture goes into the drawing as image data inside an SVG `image` element and never as markup of the drawing's own, so an SVG picture's scripts and outside references do not run or load. A picture that cannot be read is drawn as the box with the file's name that every other file node has, and Diagrams says which picture and why.

These are additive version 1 properties. Another reader draws the file node its own way.

#### A picture in the file

A picture node may keep its picture in the canvas file, as `picture` in the node's `yavc` object: a data address such as `data:image/png;base64,...`. It is for a picture that belongs to one drawing and has no file of its own, such as a product's thumbnail on a screen that was written out as a canvas. The node still has a `file` that ends as a picture's name does, which is what makes it a picture node, and another reader shows that name.

- The address is base64 image data of a PNG, JPEG, GIF, WebP or SVG picture and is at most 256 KiB long. Its first bytes must be of the kind it says. A file with a `picture` that breaks these rules is refused, as any value this version cannot read is.
- The picture in the file is drawn, and the host is not asked for the node's `file`. `fit`, `tint` and the outline rules apply as to any picture.
- It goes into the drawing as image data inside an SVG `image` element, as a picture the host read does, so an SVG picture's scripts and outside references do not run or load.
- The whole canvas file is still at most 2 MiB, which bounds the pictures in it together. A picture used on many nodes is better kept as a file, since each node would have its own copy.

`picture` was added on 2026-11-12 (DESIGN.md, decision 128) and is an additive version 1 property.

### Named styles

The file's `yavc` object accepts `styles`, an object whose keys are style names and whose values are objects of the node properties on this page, other than `anchor`. A name has from 1 to 64 letters, digits, hyphens and underscores, and a file has at most 200 styles.

```json
"yavc": { "version": 1, "styles": { "key": { "shape": "rectangle", "radius": 6, "fillColor": "#00a0e6", "outlineSides": [], "textColor": "#ffffff", "fontSize": 13, "fontWeight": 500, "textAlign": "center", "textVerticalAlign": "middle" } } }
```

A node's `yavc.style` is the name of one of them. The node is drawn with the style's properties, and a property the node has itself wins over the style's. A reader refuses a node whose style is not in the file. A property in a style that does not apply to a node's type is ignored on that node.

Styles are additive version 1 properties. A reader that ignores them draws each node by its own properties and the specification's.

## On an edge

```json
"yavc": { "route": "curve", "fromHead": "cf-one", "toHead": "cf-many", "line": "dashed", "lineWidth": 2 }
```

- `route` is how the connector is drawn between its two sides: `elbow` (the default), which runs in horizontal and vertical lines, `straight` or `curve`. The route itself is never stored: it is computed from the two nodes' boxes and the two sides each time the file is drawn.
- `fromHead` and `toHead` are the shapes of the connector's ends: `none`, `arrow` (a filled triangle, the specification's arrow), `triangle` (an open one), `diamond`, `circle`, `box`, `cross`, and the crow's feet of an entity relationship diagram, `cf-one`, `cf-one-required`, `cf-many` and `cf-many-required`. When one is not given, the end is the specification's `fromEnd` or `toEnd`.
- `line` and `lineWidth` are as on a node.
- `fromAuto` and `toAuto` retain automatic side selection across readers that materialize optional standard sides. Each is an object containing `node` (the endpoint's node ID) and `side` (the standard side projected when this file was written). Automatic selection applies only while the corresponding standard endpoint still matches both fields. An externally changed node or side therefore takes precedence. An endpoint with no standard side retains the legacy automatic behavior. The writer projects the current logical side into the standard field and records this metadata for automatic endpoints, without changing the caller's document. Explicit anchoring commands clear the corresponding metadata even if the chosen side equals its previous projection. A later geometry edit recomputes and writes a new projection. These are additive version 1 properties; a reader ignoring them sees ordinary fixed standard anchors.

Copy, paste, duplication and node-ID remapping preserve automatic intent only if it was active before the remap. They rebase the cached node ID with the standard endpoint, or discard stale cache data while retaining the fixed side. They must not reactivate an external override. Conversion that changes anchoring semantics reports that loss instead of carrying an unrelated cache forward.

An external explicit choice that leaves both the node ID and side equal to the cached projection is indistinguishable from an unchanged endpoint. Such a file retains automatic behavior when reopened here. Choosing an explicit side in yavc clears that intent even when the visible side stays the same.

Projection occurs when the Canvas writer serializes a visual edit or native copy. Ordinary Text saves retain the authored source and do not silently reformat it. A legacy file must pass through the updated writer before another application saves it if its omitted-side automatic intent is to survive. Once another writer has already replaced that omission with a fixed side, the original intent cannot be inferred from the standard fields. Generated metadata counts toward the existing source-size limit; a visual edit that would exceed that limit is refused without replacing its source.

## What a reader must refuse

A reader refuses a file over 2 MB, a file with more than 5,000 nodes and edges together, a value of the wrong type for a property this page or the specification defines, an edge whose `fromNode` or `toNode` is not a node in the file, and two nodes or two edges with one `id`. It reports the first problem and its place, and draws nothing until the file is put right. A property it does not know, in the specification's places or the extension's, is kept as written and ignored.

## Versions

A change that would make a reader of this version draw a file wrongly needs a new version, written here with what changed. A new value, or a new property that a reader of this version may safely ignore, does not.
