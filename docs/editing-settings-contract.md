# Settings a host gives the editing areas

Editor and Docs accept an optional `pudlHost.editing` capability, version 1. It is a yavc capability, in the same way as `pudlHost.contentWorkspace` and the snapshot service of [the recovery contract](content-recovery-contract.md), and PUDL does not publish it. A host that omits it, or gives a service whose `version` is not 1, leaves the applets as they were.

## What the host supplies

| Member | Contract |
| --- | --- |
| `version` | The number 1. |
| `spellcheck` | A boolean. When it is `false`, the applet sets the HTML `spellcheck` attribute to `false` on each area where a person types the text of a document. What a browser does with that attribute is the browser's business. Any other value, including `true`, a string or a missing member, changes nothing, so the setting can turn the attribute off and cannot turn anything on. |

## When it is read

Each applet reads `pudlHost.editing` once, when it starts, and uses that value for every editing area it draws for as long as it lives. A host sets it before it starts the applet. Changing the object afterwards has no effect on a running applet, and there is no `onChange` in version 1, so that one window cannot hold tabs that are set differently.

## Where it applies

The setting applies to every place a person types document text.

- The Text view of Editor and Docs, which is CodeMirror's content element. The applet gives CodeMirror the attribute through `EditorView.contentAttributes`, since CodeMirror owns that element and can reset attributes put on it from outside. CodeMirror's own default is already `spellcheck="false"`, so this setting changes nothing there today and keeps the behaviour if that default changes.
- The page view of Docs, which is the editable element of the page. Paragraphs, headings, list items, table cells, footnote text and the words of a link are inside it and take the attribute from it, as the HTML standard says an element's spellcheck state is inherited from its ancestors.

It does not apply to the fields of dialogs, the Find field or the Markdown box of a source block, which already have spell check off and are not document text.

## The view a document opens in

This section needs no host capability. Docs opens a Markdown document in its rich view, the page a person types on with formatting shown, unless the person has chosen another view. A file whose name ends in `.docs.md` opens in Document view, the same page laid out as printed pages. The person's choice is kept as a setting through the host's `pudlHost.config` service (`content-workspace-contract.md`), so a host that keeps those settings keeps the choice, and a host that starts with empty settings gets these defaults. The person can always switch views from the View menu. The Markdown view is how a person reaches the blocks that the rich view shows as Markdown and the only view that shows exactly what is stored, so a host cannot remove it. A host whose toolbar leaves the switch off still leaves it in the View menu.

## What is tested

`scripts/test-portable-spellcheck.cjs` runs against the built package in Chromium, Firefox and WebKit. With the setting on, and then with it absent, with a version 2 service and with a string for `spellcheck`, it types into Editor's text, a paragraph of Docs' page view, and in a document opened later a table cell, a header cell, a footnote and a link, and then into Docs' Text view. It reads the element's `spellcheck` property where the caret is, which is the state the browser acts on. The test fails without the change, because the page view's paragraphs are spell-checked by default.
