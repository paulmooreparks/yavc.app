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

## Other applets

- **A change to a settings file that arrives while a save of it is under way is dropped.** `config.js` `watch()` returns when `saving` is set and does not read the file again afterwards, so a change made elsewhere during a save is not seen until the next change. Barcode Tool (decision 161) reads such a change when the save is done, and `config.js` should too. Found by Yavc.App Builder on 2026-11-14.

## Tests

- `test-files-dialogs.cjs` failed in CI without a cause in the logs. Look again when a run keeps its logs. `test-editor-visual-defaults.cjs` is repaired (see review.md, "Waits that ran once"); the same fault is in nine more tests, listed there.
