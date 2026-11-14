# The team's backlog

This page lists the defects and gaps the yavc.app team has found and not yet fixed, so that they outlast the chat they were found in. The lead keeps it. An item is added when it is found, with where it came from, and removed by the pull request that fixes it. Larger designs and Paul's open questions live elsewhere: `docs/editor-follow-ups.md` and `docs/waiting-on-paul.md`.

## Docs and Editor, page view

- **A link reference definition is drawn as text.** `[1]: https://example.org/ref` appears in the page view as a visible line. Found with the previous items.
- **Typing `---` and Enter does not make a rule.** The three characters stay as text. Found with the previous items.
- **PDF export has no right-to-left layout.** pdfmake has no such layout and the Roboto font it uses has no Hebrew or Arabic glyphs, so a PDF export refuses a document with such text. Left over from the right-to-left work (decision 155).
- **Typing right-to-left text is not tested.** The right-to-left test reads a document and checks how it is drawn, printed and exported, and does not type Hebrew or Arabic into the page or the Text view. Left over from decision 155.
- **A paragraph's direction cannot be set by hand.** Each block takes its direction from its first strong character, so a person cannot make a Hebrew paragraph left to right, or an English one right to left, and a mixed-script paragraph follows its first letter. Left over from decision 155.
- **A caret placed before a diagram has drawn is lost when it draws.** A click made while the page is still loading can be lost. Found with the previous item.
- **In Firefox, Control+End in a table at the end of a document stays in the last cell.** There is then no evident way to the end of the document to type after the table. Found by Yavc.App Tester on 2026-11-13.
- **An undo in the page view sometimes takes back nothing.** In one of 60 WebKit runs of `test-docs-draft-notification.cjs` at 14 runs at once, after typing 12345678 into the page without a `take()` and pressing Ctrl+Z, the text still had 12345678. Not traced; it was seen once with the fix of decision 159 and before it was not told apart from the failures that fix removed. The next step is to log the page's transactions and the Editor's history in a run that does it. Found by Yavc.App Builder on 2026-11-14.
- **A download of an exported document is named after the resource's ID and not the document's name.** `workspace.js` (line 920 in v0.2.88) builds the name of a Word or PDF download from `tab.path`, where `tab.name` is the display name. Under a host whose resource IDs are opaque, such as `memory:export.docs.md`, a person gets the ID as the file name (`memory_export.docx` in Chromium and Firefox, `memory:export.docx` in WebKit). It affects Dinah and GK Companion as well. Found by Yavc.App Tester on 2026-11-14 (message 7240). To fix as a small pull request with a test.
- **Docs tells the host of a change when only the view or the Split caret moved.** With no edit, the snapshot handle's `changed()` is called on each view switch (Split 2, Visual 1, Preview 2, Text 1, Document 1) and when Split maps the caret from one pane to the other (decision 168), 11 times in `test-pagination-preserves.cjs` in all three browsers, although the text and its unsaved state stay as they were. The recovery contract says `changed()` is for edits to the text. A resize and the settling of the layout call it 0 times. The test's check is a known failure until this is fixed, and the fix turns it on. Found by Yavc.App Tester on 2026-11-14 (message 7442).
- **A document with a host shortcode does not print, and nothing says why.** Print… resolves in about 10 ms with no print frame, no `print()` and no message for any document that has a shortcode the host draws (a frame, a flowing block or a block drawn whole), in Chromium and WebKit; a plain document and the built-in info box print. v0.2.88 does the same. `printDocument` (`workspace.js`, about line 1392) returns early before preparation; the line is not pinned. GK Companion's documents are full of such shortcodes. The check in `test-pagination-preserves.cjs` is a known failure until this is fixed. Found by Yavc.App Tester on 2026-11-14 (message 7442).

## Docs in another host's page

- **Docs has no menus on a page without a PUDL menu bar.** It offers menus() and not commands(), so PUDL's fallback Commands row does not appear (pudl-applets.js:286, :647). The Markdown view is then reachable only from the toolbar switch, and the editing settings contract (`docs/editing-settings-contract.md:27`) wrongly says it stays in the View menu. Found by Yavc.App Tester on 2026-11-14 in the one-page host with the v0.2.88 Docs-only package, for PFO.

## Other applets

- **A change to a settings file that arrives while a save of it is under way is dropped.** `config.js` `watch()` returns when `saving` is set and does not read the file again afterwards, so a change made elsewhere during a save is not seen until the next change. Barcode Tool (decision 161) reads such a change when the save is done, and `config.js` should too. Found by Yavc.App Builder on 2026-11-14.

## Diagrams

- **Closing a Diagrams window while the language service is still starting rejects with an error nobody handles.** The language-service bridge's start is rejected with `{code: -32800, message: "Language session ended."}` and the rejection is not caught, so a closed window leaves an unhandled rejection in the console. It should be handled quietly, as a start that was cancelled. Found by Dinah Team Lead on 2026-11-14.

## Tests

- `test-files-dialogs.cjs` failed in CI without a cause in the logs. Look again when a run keeps its logs. `test-editor-visual-defaults.cjs` is repaired (see review.md, "Waits that ran once"); the same fault is in nine more tests, listed there.
- `test-docs-key-selection.cjs` fails in Firefox on a clean build of main (2026-11-14): after Click, End, Shift+Enter and typing in the Document view, the text the test typed is still on the page at line 41, where it waits for it to go. It passed in Firefox on an earlier build and in Chromium throughout, so it is intermittent. It has not been diagnosed.
