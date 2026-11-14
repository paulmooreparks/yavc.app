# Settings a host gives the editing areas

Editor and Docs accept an optional `pudlHost.editing` capability, version 1. It is a yavc capability, in the same way as `pudlHost.contentWorkspace` and the snapshot service of [the recovery contract](content-recovery-contract.md), and PUDL does not publish it. A host that omits it, or gives a service whose `version` is not 1, leaves the applets as they were.

## What the host supplies

| Member | Contract |
| --- | --- |
| `version` | The number 1. |
| `documentName` | When it is `false`, Docs and Editor leave the document's name out of the status line, which a host that shows the name itself, or whose names are not for people, uses. When it is the string `"resource"`, the status line shows the resource's ID and not its name, which a host whose IDs are addresses a person reads, as the yavc.app site's are, uses. Any other value shows the name the host gave the resource, and the ID only when the host gave none. The same name is what a document's tab shows when a person points at it, and a host that left the name out has no ID there either. |
| `fileCommands` | When it is `false`, Docs leaves out its own New, Open, Save As, Export and Print commands entirely, so that there is no toolbar button, no menu item and no key for them, and the actions that do the same work as a person's command (`new@1`, `new-template@1` and `open-file@1`) refuse with a message that says the host has taken the file commands away. `export@1` and `print@1` stay callable, since they are the host's own controls: it asks for the file, or for the document to be printed, and no person's command is involved. Any other value leaves them. Save is not in this group; `save` says who saves. |
| `save` | `"docs"`, the default, shows Docs' own Save, which asks the host's `contentResources` to write. `"host"` shows no Save command at all, with no button, menu item or key, and leaves saving to the host, which reads the text with `yavc.docs/document@1` or from its snapshot. Any other value is `"docs"`. |
| `nonce` | A string of the characters a Content-Security-Policy nonce has (letters, digits, `+`, `/`, `_`, `=` and `-`, from 8 to 200 of them). Docs puts it on every `<style>` element it makes and gives it to CodeMirror, so that a host whose policy is `style-src 'self' 'nonce-...'` with no `'unsafe-inline'` can run it. Any other value is no nonce. See "A nonce". |
| `spellcheck` | A boolean. When it is `false`, the applet sets the HTML `spellcheck` attribute to `false` on each area where a person types the text of a document. What a browser does with that attribute is the browser's business. Any other value, including `true`, a string or a missing member, changes nothing, so the setting can turn the attribute off and cannot turn anything on. |

## A read-only instance

A host that shows a document and does not let anyone change it, such as a page of notes beside a form, sets `data-docs-mode="read"` on the applet's root element before it starts the applet. The attribute is read once, when the applet starts, and it holds for the life of that instance. Several read-only instances can be on one page with an editable one, and each shares the page's code and engine and keeps its own view, selection, find and place. A key acts only on the instance that has the focus.

- **How it is drawn.** It draws as Preview does, flowing to the width of its pane, down to 320 CSS pixels. When the root also has `data-docs-layout="pages"` it draws as Document view does, in pages of the document's page size. There is no other layout and no way for a person to change it.
- **What works.** Selecting, copying, links to a heading of the same note (which move that note and no other, leave the page's address alone and keep the keyboard in the instance), Find without Replace (a bar that selects each match in turn and does not change the page), the outline and links. Pictures come through the host's `contentResources`, as for any instance. The document is read as it is for an editable instance, and a document the host gives as not writable is read-only in the same way.
- **What is not there.** The view switch and every view in which text can be typed, the Replace field of Find, Save, Save As, New, Open, Export, and the formatting, insert and review commands. They are not created, so there is no button, no menu item and no key for them. `yavc.docs/set-text@1` and every other action that changes text refuses with a message that says the instance is read-only, and `yavc.docs/view@1` refuses a view in which text can be typed. `yavc.docs/document@1`, `yavc.docs/export@1`, `yavc.docs/print@1` and `yavc.docs/position@1` work. Print is a command in a read-only instance, as in any other, and goes with the other file commands when `fileCommands` is `false`.
- **What it does not keep.** It does not join the snapshot service, so there is no draft, no `changed()` and no `take()`. It writes nothing through `contentResources`. It reads the `docs` key of `pudlHost.config` and never writes it, so a setting the person made in an editable instance applies and nothing the read-only instance does is stored.
- **A place in the text.** An opaque string says where the instance is in the document: the block at the top of the pane. Actions go to the instance that started last, so a host with several instances reads the place of one by dispatching a `yavc-docs-position` event on that instance's root, with a `detail` object, and the instance puts the string in `detail.position`; `yavc.docs/position@1` gives the same string for a host with one instance. A host gives it back as `data-docs-position` on the root at the next start, and the instance opens there when that text is still in the document, and at the top when it is not. The string means nothing outside Docs and may change between versions, and one that Docs cannot read is ignored.
- **Changing the note.** The documented route is to dispose the instance, which the host does by removing its root element as for any applet, and to start another on the new document. Disposing takes away what the instance drew, its listeners and its timers, and it leaves nothing stored. It also disconnects the observers the instance made. A read-only instance draws its few commands in a bar of its own and not in a PUDL toolbar, so it leaves none; an editable instance does use PUDL's toolbar, which makes two observers (a MutationObserver and a ResizeObserver) that PUDL has no call to undo, so each dispose of an editable instance leaves those two connected to elements that are gone, until PUDL adds a teardown.
## Inserting text

`yavc.docs/insert@1` takes `{text, format}`, where `format` is `"markdown"` (the default) or `"plain"`. A host that puts a passage into the document, such as a button that copies a selection from one note into another, uses it and not the system clipboard, which the action never touches.

- **`"plain"`.** The words go in as they are, in the page views and in the Text view, with no reading as Markdown. They replace a selection, or go in at the caret, and the caret ends after them. The insertion is one step of Undo. On the page they go inline into the paragraph the caret is in, with the marks the caret has, and a line break in them is a hard break and a blank line starts a new paragraph. In the Text view the stored text reads back as the same words: what would be taken for Markdown (`\`, `` ` ``, `*`, `_`, `[`, `]`, `<`, `>`, `|`, `~`, `&`, `{` and `}`, and at the start of a line `#`, `+`, `-`, `=` and a number with `.` or `)`) is escaped with a backslash, a line break is a backslash break, and a blank line is a blank line. If the caret is not in text, such as in a drawn host block, the action refuses and says so.
- **`"markdown"`.** The text is read as Markdown. In the Text view it replaces the selection as it is. On the page it is inserted as blocks after the block the caret is in, and, as the action's description has always said, it now replaces a selected passage of text, in the same step of Undo; before, it left the selection and went in after the block.
- **Both.** A document that is read-only refuses the action, a `format` other than these two is refused, and an action that finds the document or the selection changed while it worked refuses and says so.

## A nonce

A host that sends `Content-Security-Policy: style-src 'self' 'nonce-X'` with a new `X` for each response, and no `'unsafe-inline'`, gives Docs the same `X` as `pudlHost.editing.nonce` before it starts the applet. It is read once, with the rest of `pudlHost.editing`. The host's own page and Docs' package then run with no violation of `style-src`:

- Every `<style>` element that Docs makes, for the document's own styles and for the print frame, carries the nonce. The print frame also gets it on the copies it makes of the page's style elements, since the browser hides a nonce from a copy.
- CodeMirror's own style element carries it, through CodeMirror's `EditorView.cspNonce` setting, in the Text view, in the stylesheet dialog and in the editor that Docs draws first.
- No markup of Docs' has a `style` attribute, which a nonce does not cover. A glyph is `<span class="glyph" data-glyph="name">`, and `yavc-util.js` gives it its picture with the style object (`yavcUtil.glyph(name)` makes the markup); the style object is not blocked by the policy. `scripts/check.mjs` fails on a style attribute in the code of the package.

A page that has no nonce is as it was. The host keeps `'unsafe-inline'` where it wants, such as for static mockups; only the page that has the nonce can drop it.

## Running an action on one instance

`pudlActions.run` hands an action of the Docs applet (`yavc.docs/...`) to the instance that started last, since PUDL keeps its handlers in the order they were attached. A host with several instances on a page, such as notes drawn beside the one a person writes in, which start again when a note changes, addresses one instance by an event on its root.

- **The event.** The host dispatches `yavc-docs-action` on the instance's root, with a `detail` object `{ref, input, grant}`: `ref` is the reference of a Docs action such as `"yavc.docs/insert@1"`, `input` is its input (`{}` when left out), and `grant` is what `pudlActions.run` takes as `grant`. The instance puts a promise in `detail.result`.
- **What runs.** That instance alone runs the action, through `pudlActions.run`, so the input is checked against the action's schema, the grants are checked as for any call, and the output has the action's output schema. The promise resolves with the output and rejects with the reason of a refusal, which is the action's own: a read-only instance refuses what changes the text, a host that took the file commands away refuses those, and a `ref` that is not a Docs action is refused.
- **What it covers.** Every action of the applet, including `document@1`, `export@1`, `print@1`, `insert@1` and `position@1`. The event `yavc-docs-position` (see "A read-only instance") keeps working as it does.
- **An instance that is gone.** A call for an instance that has been disposed rejects with a message that says so, and never reaches another one.

An action that is not addressed by an event still goes to the instance that started last, as before.

## Finding words

`yavc.docs/find@1` takes `{text, select}` and is for a host whose own search, such as one across several notes, should land on a match in a note: the instance opens its Find with the words and selects the first match. `text` is the words as they are, and capital letters do not matter. `select` is `"first"`, the only value. It resolves with `{matches, index}`, the number of matches and which one is selected, counted from 1, and it rejects with a reason when there is no match. It changes no text, so it works in a read-only instance, where Find is the small bar of that instance, and in every view of an editable one. Like every Docs action, a host with several instances runs it on one by the event of "Running an action on one instance".

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
