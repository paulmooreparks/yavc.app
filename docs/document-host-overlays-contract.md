# Document assets and host-owned suggestions

These optional services belong to `pudlHost.contentWorkspace` version 1. They apply to the resource identifier already used by `contentResources`, including opaque draft identifiers. Package URLs are never used as document directories. Hosts retain file access and suggestion ownership.

## Images

`resources.resolve({resource, href, kind:'image'}, context)` returns a promise of `{url}` or null. The request contains the authored document-relative reference. Null means the host does not resolve it; the existing optional yavc VFS adapter may then try. A rejected request or invalid result leaves a missing image without fetching the authored reference against the applet URL.

A reference that starts with one `/` is a path from the root of the document's web site, such as `/images/chart.png`. The host is asked for it with the same request, and the `href` is the path as written. A host that keeps the site somewhere of its own, a folder the person chose as the web root say, returns `{url}`. A host that is the web site returns null, and the path is then used as written. The page is drawn with the written path first and corrected when the host answers, so such a host sees one request for the written path before the resolved one.

The pictures in view are asked for again when the host calls the listeners of `pudlHost.fs.onChange` (`content-workspace-contract.md`). A host calls them when the place of a document's pictures changes. A picture that resolves to the address it already has is left as it is.

The returned URL may be root-relative, relative to the host page, or absolute. Its resolved form must use HTTP or HTTPS on the host page's origin, without embedded credentials. Other schemes and origins are refused. Ordinary authored web and image-data URLs keep their existing rules and do not call this resolver. The host validates names, allowed folders, draft ownership and response content types. For example, Dinah can return `/draft-file?draft=ID&name=shot.png` without changing its routing.

Context contains `host`, the applet mount, its lifetime `signal`, and a `current()` predicate. The result is discarded after changing the active resource, Save As or disposal. The URL belongs to the host and the applet does not revoke it. Hosts should serve mutable draft images with appropriate cache headers or versioned URLs.

Only display addresses change. Markdown, recovery source and the rich document model retain the authored reference. Relative HTML image sources become inert attachment markers during sanitization, before entering a live DOM. A host without the service retains the existing VFS behavior. Editor previews, Docs drawn views and Slides use the same image loader.

A canvas's picture nodes use the same resolver (`docs/canvas-extension.md`, Pictures). In Diagrams the request's `resource` is the canvas file and `href` is the path as the file node has it. For a canvas a document shows, `resource` is the document. `href` is then the node's path for a canvas written in the document, and the folder of the reference followed by the node's path for a saved canvas, so `{{diagram:screens/plan.canvas}}` with a node for `icons/home.svg` asks for `screens/icons/home.svg`. A path in a node that begins with `/` or `~/` is passed as it is. The applet fetches the resolved address once with the page's credentials, refuses a redirect, an address on another origin and a file over 1 MiB, allows ten seconds for all the pictures of a canvas, and checks the bytes against the kind the name says. A host with no resolver leaves each picture drawn as a box with its name. Diagrams reads the pictures again when its window regains focus. A document redraws a saved canvas when the canvas file changes and does not watch its pictures.

Docs Office export can embed host-resolved PNG, JPEG, GIF and WebP images. It fetches only the already resolved same-origin URL, refuses redirects, enforces a ten-second deadline and the existing 16 MiB and decoded-image limits, then releases its temporary blob URL. Remote authored image export and SVG export retain their existing restrictions.

## Suggestion subscription

`suggestions.subscribe(resource, callback, context)` returns an unsubscribe function synchronously. It may call the callback synchronously and must stop after unsubscription or abort. The context contains `host`, a per-subscription `signal`, and `current()`. Subscriptions follow the active resource and never follow package URLs.

The callback receives `{revision, text?, items}`. `revision` is a nonempty opaque string. Supplying `text` is recommended; it binds the offsets to that exact draft text even when its revision has advanced since the applet's last acknowledged read or write. Without `text`, the revision must match the applet's issued resource snapshot. A snapshot for other text waits until that text is visible; it cannot place marks using coincidentally matching words.

Each item has `id`, `start`, `end`, `before`, `after`, and optional `author`, `reason`, `group`, `stale`, `edited`, `prefix` and `suffix`. Offsets count UTF-16 code units in the supplied text, including original line endings. Boundaries cannot split a surrogate pair or CRLF. A non-stale item's `before` must equal the selected source. Stale items may retain their original `before`, but still need a valid currently placed range. Unplaced suggestions stay in the host's list rather than receiving an invented position.

The limits are 256 items, 4 Mi UTF-16 source units, 64 Ki units per before/after value and 512 Ki units of combined item text. IDs are unique and at most 256 units; author and group are at most 256, reason at most 4096, and prefix/suffix at most 4096 each. Invalid snapshots are refused without modifying source.

CodeMirror and ProseMirror map placed decorations through local transactions while waiting for the host's next snapshot. Edits touching a suggestion make its local placement stale and disable Accept. The host remains responsible for durable remapping, grouping and suggestion history. Applet overlays are omitted from recovery, exports, serialization and Undo content. The existing persisted Markdown review actions keep their separate meaning.

A suggestion is marked no wider than what it changes, whatever range the host gives it. The applet compares `before` with `after` and leaves unmarked the text they share at the start and at the end, stopping at the edge of a word so that a changed word is shown whole. Accept, Reject and Edit still act on the whole suggestion as the host gave it, and the request to `decide` has the host's range. A stale suggestion keeps its whole range, since its text is no longer the text there.

Text view strikes the changed words in the source. Rich view marks them like this:

- In a table whose text has a line for each row, only the rows the change touches are tinted. That is a pipe table, and also a table written as HTML with one `<tr>` on a line, as in a host's literal container. A change to the delimiter line, or to a line that is not a row, tints the whole table.
- Changed words that are in the block's text once and on the page once are struck where they stand, in a paragraph, a heading, a list or a single changed row. The paragraph around them is not tinted.
- Any other change tints the affected blocks, as before. That includes an insertion, which has no old words to strike, and changed text that has markup in it or is there more than once.

The card after the block shows the shared words before and after the change unmarked and shortened when long, the old words struck and the new ones beside them. In Rich view a changed pipe table row is shown as its cells, with the difference marked inside each changed cell. Rich positions are rebuilt from verified block serialization when an edited block no longer retains its original source, without reloading the editor. Host controls retain host theme tokens and form a lower boundary of authored stylesheet scope.

## Decisions

`suggestions.decide(request, context)` receives `resource`, `revision`, `id`, `decision` (`accept` or `reject`), the current `text`, and mapped `start`/`end`. `after` is included if the person edited the replacement in the inline UI. A stale suggestion can only be rejected. Context contains the owning mount, lifetime signal and a predicate binding the request to the captured visible source and selection of suggestion.

The host checks the proposal and document revision, flushes or reconciles its normal draft path if needed, then owns the complete decision. It must refuse a stale request rather than replacing later typing. Resolving the promise acknowledges handling; it does not ask the applet to apply returned text. The host delivers accepted text through its existing document refresh path and publishes a new suggestion snapshot. Failure leaves the source and overlay available and produces an operation error. Buttons remain disabled while a decision is pending. Repeated clicks on that pending item do not send another request.

Editing a replacement in the inline UI remains a temporary overlay value until a decision. It never inserts annotation syntax into Markdown. The host's panel remains the durable list and group Accept All/Reject All surface. The applet adds per-item actions and navigation without maintaining another suggestion database.
