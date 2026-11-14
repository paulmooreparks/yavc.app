# Host-rendered shortcodes

A content host can register product-specific shortcodes without putting product syntax or rendering code in the applets. The host supplies the catalog through `contentWorkspace.shortcodes(context)` and the optional service below through `contentWorkspace.shortcodeHost` before mounting a workspace. The site needs no service and retains its built-in behavior.

```js
shortcodeHost: {
    version: 1,
    render(request, context),
    form(source, context),
    build(kind, values, context)
}
```

The additional context argument is optional for existing implementations. It contains the captured `resource`, the workspace root as `host`, an `AbortSignal`, and `current()`. A host should stop work when the signal is aborted or `current()` becomes false. Older implementations may ignore the argument. The applet independently checks that the document and insertion target are still current before applying an asynchronous result.

## Catalog and drawing

Catalog entries use the existing name, title, description, kind, example and parameter metadata. Kinds are `inline`, `block`, `container` and `span`. Names contain a lowercase letter followed by lowercase letters, digits or hyphens and have at most 64 characters. The engine accepts at most 256 host entries. Definitions inside the document retain precedence. Built-ins render compatible occurrences themselves; a host can handle an occurrence the built-in refuses. Definition and argument-processing names remain reserved.

An inline entry can declare a one-character `prefix` from `@#~!$%&+=?^`. For example, a person shortcode with prefix `@` can read `{{@alex}}`. A `managed: true` entry is drawn but excluded from Insert. Managed paired content stays opaque to rich editing, and the applet refuses its page-edit form. Direct source editing remains available.

A container entry can declare `literal: true`, which says its body is markup rather than Markdown. The engine reads such a body whole, blank lines included, and draws it as it is through the shared sanitizer; Markdown would otherwise end an HTML block at the first blank line. When the body is exactly one table of the strict shape in DESIGN.md decision 112, Visual and Document view edit it as a table with no box around it and write it back as HTML between the container's two lines. Any other literal body is one source block inside the container's box. A name a built-in has cannot be literal.

A literal entry can also declare `colorAttribute`, the name of an attribute the host keeps equal to a table cell's colour beside the cell's style, as a wiki records a custom cell colour in `data-highlight-colour`. In a table of that container, Cell Color writes the attribute with the colour, changes it with it and removes it with it, and reads it as the cell's current colour when present. The style's background colour is written in every case. A bare HTML table, or a literal entry without the field, keeps only the style.

A literal entry can declare `colorClassPrefix` as well, the beginning of the class names the host uses for a cell's colour, such as `highlight-`. It is a letter followed by letters, digits, hyphens or underscores, at most 64 characters. When Cell Color changes or removes a cell's colour in that container's tables, every class of the cell that begins with the prefix is removed, and the class attribute is removed when no class is left. Nothing is added, other classes keep their order, and a cell whose colour is not changed is untouched.

An inline entry can set `cellColor: true` when the host keeps a table cell's colour in that shortcode, written first in the cell, such as `{{cell-colour:blue}}`. The first entry so marked is used. On a pipe table, Table, Cell Color then opens the host's own form for that shortcode, from `form(source)` with the shortcode in the caret's cell, or with the entry's example for a cell that has none, and writes what `build` returns first in each selected cell, in place of one already there. Remove takes it away, with the space after it. The table stays a pipe table. The host needs `form` and `build`; without them the command says so and changes nothing. The host draws the shortcode and paints the cell from its own stylesheet. While any cell of a pipe table has the shortcode, a command that would turn the table into an HTML table is refused with a message. An HTML table is unaffected by this field.

`render` receives `{name, kind, args, source}` and resolves to `{html}` or no drawing. For containers and spans, including managed occurrences, `source` is the opening shortcode, and the body stays with the applet. The returned frame must have exactly one `<slot name="content"></slot>`. Inline and standalone block occurrences include their complete source. This service does not pass a separate `content` value. A host that needs to replace a managed body's contents must use its own resource-editing mechanism.

The applet sanitizes returned HTML with the shared sanitizer and removes delegated action and host-marker attributes. It never executes scripts from a drawing. A rich span keeps editable words inside plain span wrappers derived from the slot's ancestors. Hosts should put span styling on those ancestors. Surrounding frame text and unrelated siblings are not rich-span content.

Drawing calls have a 20-second deadline, a concurrency limit of six per workspace cache and a bounded waiting queue. A workspace retains at most 512 cached drawings and eight million UTF-16 code units of keys and HTML. Cache identity includes the document owner, resource and occurrence source. Drawings expire after five minutes; failed drawings can be retried after 30 seconds. A single drawing cannot exceed 512 KiB of UTF-16 code units. Initial rendering waits up to four seconds before displaying the fallback, then installs a valid late drawing. Until a drawing arrives, inline and block shortcodes show their source and editable paired shortcodes show their body.

## Long shortcodes across pages

A page breaks a long drawing between its parts, and the host says where the parts are, in the drawing it returns.

- **A frame and a body.** A container's drawing may mark the element that is the frame with `data-sc-frame` and the element whose children are the body with `data-sc-body`, both with empty values, on one element or on two. The body goes where `<slot name="content"></slot>` is, as before, and the page breaks the shortcode between the body's children, and between the rows of a table in it, as it breaks its own containers. A drawing with neither mark is not broken, as before.
- **Flowing content.** A block's drawing, which the host returns as `{html, flow: true}`, is the content of one outer element. The page breaks between that element's children, and between the rows of a table in them. Only a boolean `true` says so; without it the block is drawn whole. A table's row taller than a page is cut inside the row, between its lines (and between the items of a list in a cell), and each cell goes on where it stopped, as in any table of the page; a paragraph is cut between its lines in the same way.
- **What the page keeps for itself.** `data-sc-piece` is the page's attribute, so it is taken out of every host drawing. The other three, `data-sc-frame`, `data-sc-body` and `data-sc-repeat`, are kept.
- **One shortcode.** The source keeps one shortcode with its opening, arguments, body and closing, whatever the pages do. Each child of the body is on the page once, a table's header is repeated at the top of each page that holds rows of it, and the host is asked once for each drawing, not again when the page is laid out again.

- **Pieces.** The frame is one element from the first piece to the last, so it draws the real top and the real bottom of the box and is marked `data-sc-piece="only"` whether or not a gap runs through it. Each gap inside the frame holds two caps, shells cloned from the frame with nothing in them and `aria-hidden`, which draw the edges that the gap opens: the cap above the gap is marked `first` or `middle` and the cap below it `middle` or `last`, with the classes `doc-gap-cap-end` and `doc-gap-cap-start`. A cover between them is painted as the page and its gutter are, which hides what the frame draws behind the gap. The caps take no room: a gap is as tall as it was, plus the height of a repeated title. A host styles `data-sc-piece` on its frame and on its caps alike. A rule for `first` leaves the foot open, one for `middle` leaves the head and the foot open, one for `last` leaves the head open, and a glyph shows only on `only` and `first`, so the host's rules work unchanged on the frame (always `only`) and on the caps. The page's own boxes (info, note, tip and warning) are styled the same way by the page.
- **A repeated title.** An element in the frame, outside its body, that the host marks `data-sc-repeat` is drawn again, as a copy no one can reach (`aria-hidden`, no ids, no tab stops, without the mark), at the head of each later piece, and the page makes room for it below each gap. The body's children are never repeated.

## Forms and insertion

`form(source)` resolves to `null` or `{kind, title, description, fields}`. Each field is `{name, label, description, required, value, values}`. A nonempty values array produces a select; otherwise the applet uses a text input. The supplied value initializes both Insert and Change forms. Forms use the shared PUDL dialog and keep validation errors beside their fields.

`build(kind, values)` resolves to `{source}` or `{error: {field, message}}`. The host owns argument parsing, quoting and validation. Forms accept at most 32 fields and a serialized descriptor of at most 256 KiB. Field names are unique, bounded identifiers. Prototype property names are refused. Built source has a 64 KiB limit and cannot contain NUL.

Clicking an inline or opaque block opens its host form. A container's Arguments control opens the host form and preserves its body when the host returns a replacement opening alone. A rich span has a Change shortcode button; its form changes the opening while keeping the body. Removing the span removes its wrapper and retains its words. Cancel and stale responses leave source unchanged. Shortcodes without forms retain source editing where appropriate.

The Insert menu and slash menu include non-managed host entries alongside built-ins. Insertion captures the active document, view and selection before awaiting the form. A changed target cancels insertion. Completing a typed host inline shortcode creates an atom only while the captured document is still current. Undo retains the normal editing history.

## Export boundary

Word and PDF are built from a structural description of the document and not from HTML, so a host's drawing gives them nothing to convert. Export explicitly refuses host-rendered placeholders rather than exporting fallback text or losing content. A host that needs those exports must provide a separate export representation in a future contract. The refusal is shown beside the tabs, as a notice that stays until it is dismissed or the next try, and it gives the shortcodes by name (`{{name}}`, up to eight), so that a person can find them.

### Print

Print is the browser drawing HTML, as the screen does, so it can use what the page already has. A host controls it with one optional field in a render result, `print`, whose value is `"screen"` or `"none"`.

- **`"screen"`, the default.** Print uses the drawing as it is at the moment of printing, which is the drawing the page already holds for the screen, after the page has sanitised it, with no new request to the host. It is laid out across the printed pages by the same code that lays out Document view, so a frame is drawn in pieces (each printed piece of a frame carries `data-sc-piece`, `first`, `middle`, `last` or `only`, and the page's boxes and a host's rules style it as they do on the screen), a title marked `data-sc-repeat` comes again, and a flowing block breaks between its parts, as they do on the screen. The print frame takes the page's own styles, which include the host's.
- **`"none"`.** A host sets it on a drawing that is live or interactive and that it does not want on paper. Print refuses the document and gives that shortcode by name. The notice has no Try Again, because trying again cannot change the answer.
- **A drawing that has failed, has timed out or is still pending.** Print never prints a blank or placeholder box. It refuses the document, gives each such shortcode by name and offers Try Again. Try Again prints the drawings as they are at that moment, again with no request to the host, so a host that wants a drawing retried makes it from its own side, as it does for the screen. A drawing the page does not hold at all, for a document printed from the Text view, which draws none, is asked for once, as the screen asks, and a drawing it holds is never asked for again.

A document that has any host-drawn shortcode is still refused by Word and PDF, whatever its `print` value.

## Verification

`scripts/test-host-shortcodes.cjs` runs an independent host fixture against a generated release package in Chromium, Firefox and WebKit. It checks rendering across views, sanitization, source retention, host defaults, field validation, Undo, insertion, paired body retention and delayed keyboard editing. The fixture uses synthetic product-neutral shortcodes and does not modify Dinah or GK Companion. Go tests cover parsing, precedence, prefixes, managed content and source round trips. These checks validate the applet contract; the receiving product must still validate its own Confluence output after pinning the release.
