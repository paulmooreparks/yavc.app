# The team's backlog

This page lists the defects and gaps the yavc.app team has found and not yet fixed, so that they outlast the chat they were found in. The lead keeps it. An item is added when it is found, with where it came from, and removed by the pull request that fixes it. Larger designs and Paul's open questions live elsewhere: `docs/editor-follow-ups.md` and `docs/waiting-on-paul.md`.

## Docs and Editor, page view

- **Typing `---` and Enter does not make a rule.** The three characters stay as text. Found with the previous items.
- **PDF export has no right-to-left layout.** pdfmake has no such layout and the Roboto font it uses has no Hebrew or Arabic glyphs, so a PDF export refuses a document with such text. Left over from the right-to-left work (decision 155).
- **Typing right-to-left text is not tested.** The right-to-left test reads a document and checks how it is drawn, printed and exported, and does not type Hebrew or Arabic into the page or the Text view. Left over from decision 155.
- **A paragraph's direction cannot be set by hand.** Each block takes its direction from its first strong character, so a person cannot make a Hebrew paragraph left to right, or an English one right to left, and a mixed-script paragraph follows its first letter. Left over from decision 155.
- **A caret placed before a diagram has drawn is lost when it draws.** I could not reproduce this on 2026-11-14. In Chromium, Firefox and WebKit, in the Visual and the Document view, a click before or after a diagram whose drawing was held back for 2.5 seconds kept the caret, and typing across the draw went in the right place. Only a click made before the page has finished converting the document is lost, since the click lands on the page that is replaced; that is the page's loading and not the diagram. Open until someone has a case.
- **An undo in the page view sometimes takes back nothing.** In one of 60 WebKit runs of `test-docs-draft-notification.cjs` at 14 runs at once, after typing 12345678 into the page without a `take()` and pressing Ctrl+Z, the text still had 12345678. Not traced; it was seen once with the fix of decision 159 and before it was not told apart from the failures that fix removed. The next step is to log the page's transactions and the Editor's history in a run that does it. Found by Yavc.App Builder on 2026-11-14.
- **A download of an exported document is named after the resource's ID and not the document's name.** `workspace.js` (line 920 in v0.2.88) builds the name of a Word or PDF download from `tab.path`, where `tab.name` is the display name. Under a host whose resource IDs are opaque, such as `memory:export.docs.md`, a person gets the ID as the file name (`memory_export.docx` in Chromium and Firefox, `memory:export.docx` in WebKit). It affects Dinah and GK Companion as well. Found by Yavc.App Tester on 2026-11-14 (message 7240). To fix as a small pull request with a test.
- **In WebKit the Document view takes 19 to 24 seconds to settle on a long document with rows taller than a page.** With v0.2.89's Docs-only package in the one-page host, `test-document-settles.cjs` settles Dinah's tall generator in 24 s and tall-box in 19 s in WebKit, against about 2 s in Chromium and Firefox and 2.3 s for ordinary rows in WebKit. It does reach a fixed point within the test's 60 s, so it is slow and not unsettled. Dinah and GK Companion run on Chromium (WebView2), so this is low priority, but it matters for Safari readers of the site. Found by Yavc.App Tester on 2026-11-14 (message 7623).

## Docs in another host's page


## Other applets

- **A change to a settings file that arrives while a save of it is under way is dropped.** `config.js` `watch()` returns when `saving` is set and does not read the file again afterwards, so a change made elsewhere during a save is not seen until the next change. Barcode Tool (decision 161) reads such a change when the save is done, and `config.js` should too. Found by Yavc.App Builder on 2026-11-14.

## Diagrams

- **Closing a Diagrams window while the language service is still starting rejects with an error nobody handles.** The language-service bridge's start is rejected with `{code: -32800, message: "Language session ended."}` and the rejection is not caught, so a closed window leaves an unhandled rejection in the console. It should be handled quietly, as a start that was cancelled. Found by Dinah Team Lead on 2026-11-14.

## Tests

- `test-files-dialogs.cjs` failed in CI without a cause in the logs. Look again when a run keeps its logs. `test-editor-visual-defaults.cjs` is repaired (see review.md, "Waits that ran once"); the same fault is in nine more tests, listed there.
- `test-docs-key-selection.cjs` fails in Firefox on a clean build of main (2026-11-14): after Click, End, Shift+Enter and typing in the Document view, the text the test typed is still on the page at line 41, where it waits for it to go. It passed in Firefox on an earlier build and in Chromium throughout, so it is intermittent. It has not been diagnosed.
- A table row with a table or a code block in a cell is not cut inside, in a host's flowing block, so such a row taller than a page cannot be cut; the page and print say so (decisions 173, 183 and 184). A cell with a list, tight or loose, is cut between its items. `rowBands` refuses `table` and `pre` in a cell, and cutting between the rows of a nested table would need gaps between rows of a table inside a cell.
- Split (decision 174): a program that moves the page's selection within half a second after the mirror set it is not mapped to the text, since the page reports its selection a moment late and that window stops the two from chasing each other. A way to tell the mirror's own report from another without a clock would remove the limit.

- A read-only Docs instance should tell its host whether the position it was given (`data-docs-position`) was used, as a documented result or event, so that PFO can say that a note has changed since it was last read (PFO's request, for after the first release of the read-only instance).
- PUDL's toolbar (`pudlToolbar.enhance`) has no teardown: each instance that has Docs draw its toolbar leaves a MutationObserver and a ResizeObserver connected after it is disposed (pudl-toolbar.js, found by the Tester on the read-only instance). Ask PUDL for `release(root)` or for `enhance` to return a disconnect, and then call it from Docs' destroy, and remove the exception for an editable instance from "A read-only instance" in docs/editing-settings-contract.md. A read-only instance does not use PUDL's toolbar, so it is not affected.
