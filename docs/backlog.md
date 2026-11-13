# The team's backlog

This page lists the defects and gaps the yavc.app team has found and not yet fixed, so that they outlast the chat they were found in. The lead keeps it. An item is added when it is found, with where it came from, and removed by the pull request that fixes it. Larger designs and Paul's open questions live elsewhere: `docs/editor-follow-ups.md` and `docs/waiting-on-paul.md`.

## Docs and Editor, page view

- **There is no line break inside a paragraph.** Shift+Enter does nothing in the page view, so an address or a short list of lines in one paragraph cannot be typed there. A paragraph that already has a hard break is shown as a block that opens as a Markdown box. Found by Yavc.App Tester on 2026-11-13 while checking that the page view keeps a person's words.
- **A backslash hard break is drawn as a backslash.** A line ending in `\`, which CommonMark defines as a hard break, appears in the page view as a backslash and a space, and the break is lost from view. Found with the previous item, and best fixed with it.
- **A link reference definition is drawn as text.** `[1]: https://example.org/ref` appears in the page view as a visible line. Found with the previous items.
- **Typing `---` and Enter does not make a rule.** The three characters stay as text. Found with the previous items.
- **PDF export has no right-to-left layout.** pdfmake has no such layout and the Roboto font it uses has no Hebrew or Arabic glyphs, so a PDF export refuses a document with such text. Left over from the right-to-left work (decision 155).
- **Typing right-to-left text is not tested.** The right-to-left test reads a document and checks how it is drawn, printed and exported, and does not type Hebrew or Arabic into the page or the Text view. Left over from decision 155.
- **A paragraph's direction cannot be set by hand.** Each block takes its direction from its first strong character, so a person cannot make a Hebrew paragraph left to right, or an English one right to left, and a mixed-script paragraph follows its first letter. Left over from decision 155.
- **The page view takes the browser's selection a frame late.** A key pressed within a frame or two of a click acts at the old caret. Found by Yavc.App Tester on 2026-11-13. A person rarely does that, but a script does. Under load the delay can pass two frames: `test-document-review.cjs` set a selection on a heading and gave Comment, and the comment went on the old selection, in about one run in forty with a one-frame wait and one in sixty with two (2026-11-14). A command given in the same turn as the selection goes wrong every time.
- **A caret placed before a diagram has drawn is lost when it draws.** A click made while the page is still loading can be lost. Found with the previous item.
- **In Firefox, Control+End in a table at the end of a document stays in the last cell.** There is then no evident way to the end of the document to type after the table. Found by Yavc.App Tester on 2026-11-13.
- **An undo in the page view sometimes takes back nothing.** In one of 60 WebKit runs of `test-docs-draft-notification.cjs` at 14 runs at once, after typing 12345678 into the page without a `take()` and pressing Ctrl+Z, the text still had 12345678. Not traced; it was seen once with the fix of decision 159 and before it was not told apart from the failures that fix removed. The next step is to log the page's transactions and the Editor's history in a run that does it. Found by Yavc.App Builder on 2026-11-14.

## Diagrams

- **The inspector can stay disabled after a click on a shape made just after typing.** In Diagrams (a D2 diagram, with the text and the drawing both open), typing at the end of the text and then clicking a shape at once can leave the inspector's fields disabled, and they stay so until another click; the shape's selection seems to be lost when the drawing is redrawn from the typed text. Found while running `test-portable-diagrams.cjs` in WebKit with 14 runs at once: 3 failures in 140 runs (about 2 %), at the step that clicks `#one .dg-hit-shape` after typing and expects `.dg-inspector-fields:not([disabled])`; two timed out at 30 seconds and one found none. Not seen in Chromium or Firefox, which were not run under load. It does not depend on the page view. The next task is to find the cause.

## Tests

- `test-files-dialogs.cjs` failed in CI without a cause in the logs. Look again when a run keeps its logs. `test-editor-visual-defaults.cjs` is repaired (see review.md, "Waits that ran once"); the same fault is in nine more tests, listed there.
