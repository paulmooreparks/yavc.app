# Shortcodes and the places a document goes

A shortcode says what a thing in a document is: a page break, a notice, a diagram from a file. It does not say how any one place draws it. The page on the screen, a printed page, a Word file, a slide and a wiki page are each a destination, and each has its own way to produce the thing a shortcode stands for. Paul compared this with the codes of WordStar and WordPerfect, where the document says what is meant and a printer driver decides how to produce it, and the comparison is exact. DESIGN.md decision 127 gives the reasons for the rules here.

## The rule for a destination

For every shortcode, a destination does one of three things.

1. It writes its own form of the thing, such as a wiki's macro for a notice.
2. It puts a picture of the thing in its place, when the table says a picture is a faithful stand-in.
3. It writes the shortcode's plain words, as the table says how to find them.

A destination never writes the shortcode itself as text. A shortcode whose row says `"published": false` is left out, with its body.

## The table

Every release has the table as `content/shortcodes.json`, and the release's manifest lists the file. `cmd/yavc-content` writes it from the definitions the engine reads (`internal/shortcodes/portable.go`), so a shortcode cannot be read by the engine and be missing from the table. `TestPortableTableCoversEveryShortcode` fails when one is. A destination should have a test of its own that reads this file and fails for a row it has no answer for, which is how a new shortcode is noticed before a reader meets it as raw text.

The file is `{ "version": 1, "shortcodes": [...] }`. A row has these members.

| Member | Meaning |
| --- | --- |
| `name` | The name written after `{{`. |
| `kind` | `inline` (stands in a line), `block` (stands on a line of its own), `span` (written around words in a line, with `{{/name}}` after them) or `container` (written around blocks, with a closing line). |
| `title` | The name a person sees for it in the Insert menu. |
| `aliasOf` | Present when the shortcode is another spelling of the one given. `colour` is `color`. |
| `meaning` | One sentence that says what the thing is. |
| `arguments` | The arguments, each with `name`, `position`, `required` and `description`. `position` is 1 for the first unnamed value and 0 for an argument that is only ever named. An argument with a position can also be written by name. `rest: true` means the argument takes every unnamed value from its position on, so it may have spaces in it. |
| `plain` | How the shortcode reads as plain words. The forms are below. |
| `picture` | `true` when a picture of the shortcode as drawn is a faithful stand-in for it. |
| `published` | `false` for working material or an instruction to one application. Nothing of it belongs in a published copy. |
| `spanToo` | `true` for a container that may also be written around words in a line. |

`plain.from` is one of these.

| Value | The plain words are |
| --- | --- |
| `body` | The shortcode's body, which is Markdown. When `lead` gives an argument and the argument has a value, that value goes before the body as its title. |
| `argument` | The value of the argument `argument` gives. When that is absent and `otherwise` gives another argument, the value of that one. |
| `file` | The text of the file that the argument `argument` gives, as a listing. |
| `word` | The fixed text in `word`. No built-in shortcode uses it yet. |
| `nothing` | No words. The shortcode marks a place or gives an instruction, and a destination with no form of its own for it leaves it out. |

A change that would make a reader of version 1 treat a row wrongly needs a new version number. A new row, a new member a reader may ignore, or a new value of `plain.from` for a new shortcode does not, so a reader should treat a `plain.from` it does not know as it treats a row it has no answer for.

## What is not in the table

- A shortcode the host application adds (`docs/host-shortcodes-contract.md`). The host that added it knows what it means.
- A shortcode a document defines for itself with `{{define:name}}`, or takes from a shared file. A use of one stands for the definition's body, which is Markdown and other shortcodes. A destination works from the text with those uses expanded. The `define` row is in the table so that the definition itself is recognised and left out.
- Review marks in CriticMarkup, and an attribute block such as `{#top}` after a heading, a link or a picture (decision 123). They are Markdown syntax of this engine and not shortcodes, and a destination meets them in the same text.

## A picture of a diagram

`{{diagram:path}}` is the one shortcode whose picture cannot be made without the applets' own code, because a canvas and a Mermaid diagram are drawn in the browser. A host's page makes the picture with `content/diagram-kit/picture.js`, which needs `support/yavc-util.js` on the page and no applet.

```
yavcDiagramPicture.draw({ kind, text, format, scale, pictures, signal })
```

| Member | Meaning |
| --- | --- |
| `kind` | `canvas`, `d2` or `mermaid`. `yavcDiagramPicture.kindOf(fileName)` gives it from a file's name, or null. |
| `text` | The diagram file's text, at most 2 MiB. |
| `format` | `svg`, which is the default, or `png`. |
| `scale` | For a PNG, from 1 to 3 times the drawing's size. The default is 2. |
| `pictures` | For a canvas with picture nodes, a function given a picture's path as the canvas has it. It resolves to `{ url }` on the page's own origin, to `{ bytes }`, or to null. The caller resolves the path against the folder the canvas file is in. The limits and checks are those of a canvas in a window (`docs/canvas-extension.md`). |
| `signal` | An `AbortSignal` that ends the work. |

It resolves to `{ format, svg, width, height, problems }`, or with `blob` in place of `svg` for a PNG. `width` and `height` are in CSS pixels, and for a PNG they are the picture's own size. `problems` are warnings about a drawing that was still made, such as a picture that could not be read. A diagram with a mistake in it rejects with the mistake, and an aborted request rejects with an `AbortError`.

The drawing is the one a document shows on paper, light whatever the page's theme. Each kind's engine is fetched the first time a diagram of that kind is asked for. Fonts are the page's own, as they are in a window, so a canvas that asks for a brand font is drawn with it only where the host's page has loaded it. Mermaid writes its labels as HTML inside the SVG. All three browser engines the tests run made a PNG of such a drawing, and a destination that cannot show HTML inside an SVG should ask for the PNG.

`scripts/test-diagram-picture.cjs` covers all three kinds from a page that has no applet on it, a canvas's picture read through the caller's reader, the PNG, and the refusals.

## Opening a diagram from the document

Editor and Docs offer Edit Diagram for a diagram drawn from a file: on a right-click on the diagram, as a button in the diagram's form, and as a command in the Format menu for the diagram the cursor is on. It first asks the host's `contentWorkspace.openDiagram(path, context)` where the host offers one (`docs/content-workspace-contract.md`). Otherwise, or when the host does not take the request, it asks PUDL to open the file with the `diagram` verb, `pudlApplets.request('diagram', { path }, root)`, which is how Files opens a diagram too. The path is the reference resolved against the document's folder. The command is not offered where nothing on the page handles that verb. The document draws the diagram again when the host says the file changed (`fs.onChange`).
