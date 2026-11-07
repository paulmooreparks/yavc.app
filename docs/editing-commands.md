# Editing command follow-up

Editor and Slides share Cut, Copy, Paste and Select All through the editing kit. Both menus retain the last focused editing pane when their own controls take focus. Text selections stay plain text; rich selections include safe HTML when the browser supports that clipboard representation. Preview and read-only documents allow Copy and Select All. A writable document can still undo a formatting change while displaying Preview.

## Clipboard ownership

The menu commands use the documented [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API). Native Cut, Copy and Paste keyboard handling remains with CodeMirror and ProseMirror. Browsers can require permission or a user gesture for menu clipboard access. Denial produces a notice with keyboard guidance and leaves content intact; the code does not use deprecated clipboard commands to bypass it.

Cut removes text only after a successful write, and only if the original document and selection are still current. Paste captures the same ownership before reading and refuses to apply after navigation or selection changes. Empty clipboard text leaves the selection intact. Rich Markdown parsing checks ownership again after its asynchronous conversion. HTML still passes through the shared sanitizer and schema parser.

Clipboard text is limited to 262,144 characters and HTML to 1,048,576 characters. Blob sizes are checked before decoding HTML/text representations where that browser API provides a Blob. Unsupported representations do not remove existing text.

Text length limits use JavaScript `String.length`; Blob limits use bytes.

## History

CodeMirror exposes its documented `undoDepth`, `redoDepth` and `isolateHistory` APIs through the existing pinned bundle. The build manifest and reproducibility check were regenerated without changing dependency versions. ProseMirror history commands provide their documented availability check without dispatching a transaction.

Editor retains its source document history. Menu and rich-view keyboard Undo/Redo flush pending rich edits before applying that history. Redo is disabled while an unsaved rich edit would invalidate it. The rich editor retains focus across the temporary noneditable state used to refresh it from source, unless the user has moved focus elsewhere. Read-only documents disable both history commands.

Slides keeps source history per slide and uses the current rich editor's local history in Visual. Source Cut, Paste and search replacements have explicit history boundaries. Replace All can be undone separately on each affected slide in Text view. This does not introduce history for slide insertion, deletion, reordering or deck properties.

## Slides search

Edit, Find and Replace and Ctrl+F open the shared Find bar with a Current Slide or Whole Deck scope. The search covers slide Markdown, including notes, shortcode declarations and style blocks. Deck front matter is excluded. Opening Find from Visual selects Split so the matching source is visible.

Case sensitivity, whole-word matching and regular expressions use the shared controls. Zero-length matches are skipped. Replacement capture tokens follow [ECMAScript GetSubstitution](https://tc39.es/ecma262/multipage/text-processing.html#sec-getsubstitution), including numbered/named captures and prefix/suffix substitutions. Unit tests compare these results with the language contract. A WebKit regression demonstrated why replacement must not depend on sticky `String.replace` behavior; the same capture-based implementation now runs on every engine.

Navigation invalidates stale matches. Replacements flush pending rich edits and validate deck, slide, query and scope before mutating source. Replace All recollects the matches after synchronization. Single Replace requires review when synchronization changes its selected match's source, because another occurrence could otherwise take the old ordinal position.

Search retains at most 10,000 matches and refuses Replace All at that boundary, asking for a narrower query. Replacement text is bounded to 262,144 characters. A replacement cannot grow a deck beyond 1,048,576 string-length units of source, or beyond its original size if it was already larger. The complete edit plan is validated before any slide changes.

## Dialog ownership

Slides text, color and property forms capture their deck and, for slide-specific forms, their slide. They synchronize pending rich edits before taking values. Navigation cancels owned metadata forms, disposal cancels all of them, and a concurrent source change prevents Apply. Existing stylesheet and custom-shortcode forms retain their source predicates and disposal signals; their opening preparation now also verifies ownership across synchronization.

The shared dialog helper accepts an optional AbortSignal and removes its listener when the dialog closes. Color and property forms use the same ownership contract as the existing managed forms.

## Verification

`scripts/test-editing-commands.cjs` uses fresh headless Chromium, Firefox and WebKit contexts and synthetic documents. Its simulated clipboard preserves the user's system clipboard while testing rich/plain formats, access denial, empty/oversized payloads, delayed reads/writes, stale selection/document guards and read-only source/Preview behavior. Browser-native permission prompts and operating-system clipboard integration are outside this fixture.

The fixture also exercises menu and keyboard history, retained rich focus, Split targeting, current-slide navigation, whole-deck replacement, per-slide Undo, regex capture replacement, invalid expressions, pending rich drafts during Replace/Replace All, stale metadata, concurrent properties and desktop disposal. Narrow dark screenshots and light search screenshots are retained in `%TEMP%/yavc-editing-commands-evidence`. `apps/slides/test/search.test.mjs` covers replacement-token semantics without a browser.
