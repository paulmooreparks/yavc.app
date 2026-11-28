# The settled signal

Docs puts work off. A test or a host that acts on a document before that work is done sees a state that is about to change, and the only way to wait for it used to be a pause of a guessed length. The tests held 137 such pauses on 28 November 2026. This page says how Docs now tells a caller that its put-off work is done, what the signal covers, and what it does not cover yet.

## The contract

The action `yavc.docs/settled@1` takes no input and answers with an empty object when the document has settled. A document has settled when Docs has no put-off work outstanding and two frames have then been drawn with none starting.

```js
await pudlActions.run('yavc.docs/settled@1', {}, { grant: 'all' });
```

The action changes nothing, so a read-only instance has it too. It can be called at any time and any number of times. A call made while a person is typing answers after the typing stops and its work is done.

The action does not answer while the page is hidden. A browser draws no frames for a hidden page, and the Document view's layout waits for a frame, so there is nothing true to report until the page is shown again.

## How it works

The workspace keeps a count of put-off work (`apps/text-workspace/workspace.js`, "Settled"). Code that puts work off calls `busy()` when it does so and calls the function `busy()` returned when the work has run or has been cancelled. The page view and the pagination plugin receive `busy` as an option from the workspace.

`settled()` waits for the count to reach nothing, waits for two frames, and looks at the count again. It answers when the count is still nothing, and starts over when it is not. The two frames are there because a browser delivers `ResizeObserver` reports when it next updates the rendering, and the Document view starts a layout pass from such a report. Two frame callbacks have one update of the rendering between them. Work that starts further work takes the new hold before it gives up its own, so the count does not touch nothing between two steps of one job.

Nothing in this rests on how a browser behaves beyond its documented interfaces. The count is Docs' own bookkeeping, and the frames come from `requestAnimationFrame`.

## What the signal covers

The work counted today is listed in Table 1.

**Table 1** *Put-off Work That the Settled Signal Counts*

| Work | Where | Delay it replaces in a test |
|---|---|---|
| The page's text is written to the Markdown after a pause in typing | `page-view.js`, `schedule` and `sync` | 300 ms and the conversion |
| The page is read again after the Markdown changes | `page-view.js`, `textChanged` and `load` | 150 ms and the load |
| The Document view lays out until its layout stops changing | `pages.js`, the plugin's `schedule` | One frame for each pass |
| The page scrolls to the selection a second time | `page-view.js`, `scrollToSelection` | 300 ms |
| Split shows a selection in the other pane | `workspace.js`, `mirrorToPage` and `mirrorToText` | 120 ms and the mapping |
| Split ignores the page's own report of a selection it has just set | `workspace.js`, `mirrorToPage` | 500 ms |

*Note.* While an input method is composing, the page's text is not written to the Markdown, so the document does not settle until the composition ends.

## What it does not cover yet

Table 2 lists put-off work that is not counted. A caller that depends on one of these still has to wait for the thing itself, such as an element or an attribute.

**Table 2** *Put-off Work Not Yet Counted*

| Work | Where |
|---|---|
| Preview's own pagination | `pages.js`, `preview` |
| Pictures that are still loading, and the four-second limit on waiting for them | `kit.js` |
| Host shortcodes that are still being drawn, and the three-second limit on waiting for them | `workspace.js` |
| The Preview pane's redraw after a change | `workspace.js`, `schedulePreview` |
| Editor, Slides and Diagrams | They have no such action |

## Moving the tests

`scripts/test-table-editing.cjs` was the first test moved. Its nine pauses, of 300 to 1500 ms each, are now calls to the action. The files with the most pauses left are `test-code-colouring.cjs` (10), `test-docs-insert.cjs` (9), `test-document-layout-cycle.cjs` (9) and `test-workspace-command-state.cjs` (8). A pause is replaced only where the work it waits for is in Table 1. Where it is not, the work is added to the count first.

A PUDL event for the same purpose would be the place for a host's own windows and menus to report. Docs does not depend on one. If PUDL publishes one, Docs can report into it from the same count.
