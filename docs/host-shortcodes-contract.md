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

## Forms and insertion

`form(source)` resolves to `null` or `{kind, title, description, fields}`. Each field is `{name, label, description, required, value, values}`. A nonempty values array produces a select; otherwise the applet uses a text input. The supplied value initializes both Insert and Change forms. Forms use the shared PUDL dialog and keep validation errors beside their fields.

`build(kind, values)` resolves to `{source}` or `{error: {field, message}}`. The host owns argument parsing, quoting and validation. Forms accept at most 32 fields and a serialized descriptor of at most 256 KiB. Field names are unique, bounded identifiers. Prototype property names are refused. Built source has a 64 KiB limit and cannot contain NUL.

Clicking an inline or opaque block opens its host form. A container's Arguments control opens the host form and preserves its body when the host returns a replacement opening alone. A rich span has a Change shortcode button; its form changes the opening while keeping the body. Removing the span removes its wrapper and retains its words. Cancel and stale responses leave source unchanged. Shortcodes without forms retain source editing where appropriate.

The Insert menu and slash menu include non-managed host entries alongside built-ins. Insertion captures the active document, view and selection before awaiting the form. A changed target cancels insertion. Completing a typed host inline shortcode creates an atom only while the captured document is still current. Undo retains the normal editing history.

## Export boundary

This service supplies screen drawings for Document, Visual and Preview, including Slides' shared renderer. It does not define a trusted print or Office export representation. Export explicitly refuses host-rendered placeholders rather than exporting fallback text or losing content. A host that needs those exports must provide a separate export representation in a future contract.

## Verification

`scripts/test-host-shortcodes.cjs` runs an independent host fixture against a generated release package in Chromium, Firefox and WebKit. It checks rendering across views, sanitization, source retention, host defaults, field validation, Undo, insertion, paired body retention and delayed keyboard editing. The fixture uses synthetic product-neutral shortcodes and does not modify Dinah or GK Companion. Go tests cover parsing, precedence, prefixes, managed content and source round trips. These checks validate the applet contract; the receiving product must still validate its own Confluence output after pinning the release.
