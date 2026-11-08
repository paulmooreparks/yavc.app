# Diagram conversion and portable embedding

The November 9 batch provides D2 Outline navigation, Canvas fences and explicit D2/Canvas copy conversion. The original source remains open and unchanged after conversion. File offers Convert to Canvas or Convert to D2, followed by a loss report and Create Copy. The result is an unsaved document under the host's single-window or tabbed policy. Cancellation creates nothing. A changed source invalidates the result before a new document is opened.

## Conversion contract

D2 to Canvas takes integer node geometry from the current compiled board and labels, shapes, parents and connections from the matching outline. Containers become Canvas groups. Supported shape kinds, explicit hex fills/strokes, bounded stroke widths and simple line styles are retained. Unsupported shapes become rectangles and are named in the report. Connections retain endpoints, labels and direction, with elbow routing. Custom arrowheads and connection styling use Canvas defaults. Automatic layout rules, themes, imports, comments, board definitions, icons, links, tooltips and other unsupported styles remain in the original D2 file.

Canvas to D2 uses generated keys and preserves text labels and connection direction. D2's exported `d2ast.RawString` and `d2format.Format` APIs format literals in one bounded worker request, avoiding hand-written escaping or source interpolation. Native and browser tests include empty text, quotes, Unicode, multiline text, braces and literal substitutions. The copy is compiled before it can be offered. D2 chooses new positions, dimensions and routes. Groups, linked files and URLs become labeled shapes; coordinates, grouping, Markdown formatting, text alignment and unknown extension properties remain in Canvas. Coordinated colors become outline colors. Supported explicit fills/strokes and simple shape line styles are retained. The dialog reports these changes.

The live `yavc.diagrams/convert@1` action returns `{kind,text,warnings}` and requires `files.read`. It neither saves nor opens its result. Source identity and text must still match when conversion completes. Generated Canvas passes the normal bounded reader; generated D2 passes its normal compile limit.

Save As keeps the native format's suffix through the resource host's pre-commit name check. Renaming Canvas JSON to `.d2` would create an invalid D2 file, so the chooser directs the person to Convert instead. A legacy host without conditional destination creation cannot use Save As or create a new destination through the save action; Download as Source remains available. Existing-resource legacy writes retain their previous contract and are outside this destination change.

## Portable Canvas fences

Copy as Embed now accepts Canvas and chooses a backtick delimiter longer than every run in the source. Pasting the result into Docs, Editor Markdown preview or Slides draws a static image from the shared validated renderer. The image retains a white paper palette across host themes; authored Canvas colors still apply. Its data URL survives an HTML snapshot without a live object-URL owner. The contents disclosure lists labels and connections and can be opened in rich editing without switching the block to source mode.

This supersedes the earlier decision against a Canvas fence in `canvas-design.md` decision 12. Copying source into a document provides an independent portable snapshot without requiring the person to write JSON by hand. The current DOCX/PDF writers continue to refuse diagram blocks explicitly; this batch does not claim Office diagram export. Embedded text uses the renderer's plain SVG labels, as image export does. It does not load file cards, external sites or applets.

The existing 2 MiB/5,000-item Canvas limits apply. Embedded drawings additionally refuse dimensions over 32,768 units or SVG over 16 MiB. Failed validation renders the existing local diagram error notice. A removed or replaced target cannot receive a late result.

## Saved diagram references

`{{diagram:plan.canvas alt="Request flow" width=80% caption="The saved diagram"}}` displays a saved top-level D2, Mermaid or Canvas file. Insert > Other > Diagram from a File provides a host file browser and upload option. Description, caption and optional whole percentage width remain authored Markdown. Paths may be relative to the owning document or absolute virtual paths. URLs and unsupported options are rejected. An unsaved document needs an absolute path because its dependency base is unknown.

The shared loader uses the host's authorized text reader and optional change subscription. It does not fetch document resources, parse opaque resource identities or read browser storage. The yavc adapter implements the existing optional `contentWorkspace.directory(resource)` service using its VFS. A receiving host without a dependency reader gets a local diagnostic. The loader rereads saved files after notifications or when the window returns to the foreground. Unsaved drawing changes do not change another document's embed.

Each refresh accepts at most 16 distinct files, 32 displayed references and 8 MiB of UTF-8 source, with a 2 MiB limit per file. The consumer checks content after its authorized read; receiving hosts may enforce the supplied `maxBytes` request earlier. Duplicate paths share one read per refresh. Rendered results replace the prior image only after success. An invalid update retains the last good image with a warning. A new document or dependency base clears the old image before loading, so a failed Save As rebase cannot silently show the previous directory's diagram.

Cancellation, disposal and ownership checks reject late reads and renders. The loader unsubscribes when its last figure leaves the document. The current version supports the saved file's top-level diagram without D2 board selection or relative D2 imports. DOCX/PDF reject reference blocks explicitly. This batch does not add a live dependency service to exported files.

## Compatibility evidence

The [JSON Canvas 1.0 specification](https://github.com/obsidianmd/jsoncanvas/blob/main/spec/1.0.md) defines text, file, link and group nodes, integer geometry, edge sides/ends and six color presets. [Obsidian's Canvas documentation](https://obsidian.md/help/plugins/canvas) confirms that its `.canvas` files use this format. The compatibility fixture round-trips these standard fields and preserves unknown fields through our reader/writer, then repeats with the yavc extension removed. This is format-level evidence. It does not establish whether Obsidian retains unknown properties when saving; that remains a receiving-application acceptance check.

The D2 literal and connection choices use the documented [string](https://d2lang.com/tour/strings/), [substitution](https://d2lang.com/tour/vars/) and [connection](https://d2lang.com/tour/connections/) contracts, together with the exported API comments in the pinned Go module. No escaping decision depends on undocumented parser behavior.
