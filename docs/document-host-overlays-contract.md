# Document assets and host-owned suggestions

These optional services belong to `pudlHost.contentWorkspace` version 1. They apply to the resource identifier already used by `contentResources`, including opaque draft identifiers. Package URLs are never used as document directories. Hosts retain file access and suggestion ownership.

## Images

`resources.resolve({resource, href, kind:'image'}, context)` returns a promise of `{url}` or null. The request contains the authored document-relative reference. Null means the host does not resolve it; the existing optional yavc VFS adapter may then try. A rejected request or invalid result leaves a missing image without fetching the authored reference against the applet URL.

The returned URL may be root-relative, relative to the host page, or absolute. Its resolved form must use HTTP or HTTPS on the host page's origin, without embedded credentials. Other schemes and origins are refused. Ordinary authored web and image-data URLs keep their existing rules and do not call this resolver. The host validates names, allowed folders, draft ownership and response content types. For example, Dinah can return `/draft-file?draft=ID&name=shot.png` without changing its routing.

Context contains `host`, the applet mount, its lifetime `signal`, and a `current()` predicate. The result is discarded after changing the active resource, Save As or disposal. The URL belongs to the host and the applet does not revoke it. Hosts should serve mutable draft images with appropriate cache headers or versioned URLs.

Only display addresses change. Markdown, recovery source and the rich document model retain the authored reference. Relative HTML image sources become inert attachment markers during sanitization, before entering a live DOM. A host without the service retains the existing VFS behavior. Editor previews, Docs drawn views and Slides use the same image loader.

Docs Office export can embed host-resolved PNG, JPEG, GIF and WebP images. It fetches only the already resolved same-origin URL, refuses redirects, enforces a ten-second deadline and the existing 16 MiB and decoded-image limits, then releases its temporary blob URL. Remote authored image export and SVG export retain their existing restrictions.

## Suggestion subscription

`suggestions.subscribe(resource, callback, context)` returns an unsubscribe function synchronously. It may call the callback synchronously and must stop after unsubscription or abort. The context contains `host`, a per-subscription `signal`, and `current()`. Subscriptions follow the active resource and never follow package URLs.

The callback receives `{revision, text?, items}`. `revision` is a nonempty opaque string. Supplying `text` is recommended; it binds the offsets to that exact draft text even when its revision has advanced since the applet's last acknowledged read or write. Without `text`, the revision must match the applet's issued resource snapshot. A snapshot for other text waits until that text is visible; it cannot place marks using coincidentally matching words.

Each item has `id`, `start`, `end`, `before`, `after`, and optional `author`, `reason`, `group`, `stale`, `edited`, `prefix` and `suffix`. Offsets count UTF-16 code units in the supplied text, including original line endings. Boundaries cannot split a surrogate pair or CRLF. A non-stale item's `before` must equal the selected source. Stale items may retain their original `before`, but still need a valid currently placed range. Unplaced suggestions stay in the host's list rather than receiving an invented position.

The limits are 256 items, 4 Mi UTF-16 source units, 64 Ki units per before/after value and 512 Ki units of combined item text. IDs are unique and at most 256 units; author and group are at most 256, reason at most 4096, and prefix/suffix at most 4096 each. Invalid snapshots are refused without modifying source.

CodeMirror and ProseMirror map placed decorations through local transactions while waiting for the host's next snapshot. Edits touching a suggestion make its local placement stale and disable Accept. The host remains responsible for durable remapping, grouping and suggestion history. Applet overlays are omitted from recovery, exports, serialization and Undo content. The existing persisted Markdown review actions keep their separate meaning.

Text view marks exact source spans. Rich view highlights the affected blocks and places a card with the exact proposed removal and replacement after them. It does not strike unrelated words in the surrounding paragraph. Rich positions are rebuilt from verified block serialization when an edited block no longer retains its original source, without reloading the editor. Host controls retain host theme tokens and form a lower boundary of authored stylesheet scope.

## Decisions

`suggestions.decide(request, context)` receives `resource`, `revision`, `id`, `decision` (`accept` or `reject`), the current `text`, and mapped `start`/`end`. `after` is included if the person edited the replacement in the inline UI. A stale suggestion can only be rejected. Context contains the owning mount, lifetime signal and a predicate binding the request to the captured visible source and selection of suggestion.

The host checks the proposal and document revision, flushes or reconciles its normal draft path if needed, then owns the complete decision. It must refuse a stale request rather than replacing later typing. Resolving the promise acknowledges handling; it does not ask the applet to apply returned text. The host delivers accepted text through its existing document refresh path and publishes a new suggestion snapshot. Failure leaves the source and overlay available and produces an operation error. Buttons remain disabled while a decision is pending. Repeated clicks on that pending item do not send another request.

Editing a replacement in the inline UI remains a temporary overlay value until a decision. It never inserts annotation syntax into Markdown. The host's panel remains the durable list and group Accept All/Reject All surface. The applet adds per-item actions and navigation without maintaining another suggestion database.
