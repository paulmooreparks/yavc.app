# The team's backlog

This page lists the defects and gaps the yavc.app team has found and not yet fixed, so that they outlast the chat they were found in. The lead keeps it. An item is added when it is found, with where it came from, and removed by the pull request that fixes it. Larger designs and Paul's open questions live elsewhere: `docs/editor-follow-ups.md` and `docs/waiting-on-paul.md`.

## Docs and Editor, page view

- **There is no line break inside a paragraph.** Shift+Enter does nothing in the page view, so an address or a short list of lines in one paragraph cannot be typed there. A paragraph that already has a hard break is shown as a block that opens as a Markdown box. Found by Yavc.App Tester on 2026-11-13 while checking that the page view keeps a person's words.
- **A backslash hard break is drawn as a backslash.** A line ending in `\`, which CommonMark defines as a hard break, appears in the page view as a backslash and a space, and the break is lost from view. Found with the previous item, and best fixed with it.
- **A link reference definition is drawn as text.** `[1]: https://example.org/ref` appears in the page view as a visible line. Found with the previous items.
- **Typing `---` and Enter does not make a rule.** The three characters stay as text. Found with the previous items.
- **Right-to-left paragraphs are drawn left to right.** A paragraph in Hebrew or Arabic sits at the left edge, and its closing punctuation lands on the wrong side, in both views and all three browsers, because no `dir` is set. The fix is `dir="auto"` on each paragraph in the page view and CodeMirror's documented per-line text direction in the Text view, with export following. Found by Yavc.App Tester on 2026-11-13.
- **The page view takes the browser's selection a frame late.** A key pressed within a frame or two of a click acts at the old caret. Found by Yavc.App Tester on 2026-11-13. A person rarely does that, but a script does.
- **A caret placed before a diagram has drawn is lost when it draws.** A click made while the page is still loading can be lost. Found with the previous item.
- **In Firefox, Control+End in a table at the end of a document stays in the last cell.** There is then no evident way to the end of the document to type after the table. Found by Yavc.App Tester on 2026-11-13.

## Tests

- `test-files-dialogs.cjs` failed in CI without a cause in the logs. Look again when a run keeps its logs. `test-editor-visual-defaults.cjs` is repaired (see review.md, "Waits that ran once"); the same fault is in nine more tests, listed there.
