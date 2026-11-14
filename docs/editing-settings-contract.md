# Settings a host gives the editing areas

Editor and Docs accept an optional `pudlHost.editing` capability, version 1. It is a yavc capability, in the same way as `pudlHost.contentWorkspace` and the snapshot service of [the recovery contract](content-recovery-contract.md), and PUDL does not publish it. A host that omits it, or gives a service whose `version` is not 1, leaves the applets as they were.

## What the host supplies

| Member | Contract |
| --- | --- |
| `version` | The number 1. |
| `documentName` | When it is `false`, Docs and Editor leave the document's name out of the status line, which a host that shows the name itself, or whose names are not for people, uses. When it is the string `"resource"`, the status line shows the resource's ID and not its name, which a host whose IDs are addresses a person reads, as the yavc.app site's are, uses. Any other value shows the name the host gave the resource, and the ID only when the host gave none. |
| `fileCommands` | When it is `false`, Docs leaves out its own New, Open, Save As, Export and Print commands entirely, so that there is no toolbar button, no menu item and no key for them, and the actions that do the same work as a person's command (`new@1`, `new-template@1` and `open-file@1`) refuse with a message that says the host has taken the file commands away. `export@1` and `print@1` stay callable, since they are the host's own controls: it asks for the file, or for the document to be printed, and no person's command is involved. Any other value leaves them. Save is not in this group; `save` says who saves. |
| `save` | `"docs"`, the default, shows Docs' own Save, which asks the host's `contentResources` to write. `"host"` shows no Save command at all, with no button, menu item or key, and leaves saving to the host, which reads the text with `yavc.docs/document@1` or from its snapshot. Any other value is `"docs"`. |
| `spellcheck` | A boolean. When it is `false`, the applet sets the HTML `spellcheck` attribute to `false` on each area where a person types the text of a document. What a browser does with that attribute is the browser's business. Any other value, including `true`, a string or a missing member, changes nothing, so the setting can turn the attribute off and cannot turn anything on. |

## A read-only instance

A host that shows a document and does not let anyone change it, such as a page of notes beside a form, sets `data-docs-mode="read"` on the applet's root element before it starts the applet. The attribute is read once, when the applet starts, and it holds for the life of that instance. Several read-only instances can be on one page with an editable one, and each shares the page's code and engine and keeps its own view, selection, find and place. A key acts only on the instance that has the focus.

- **How it is drawn.** It draws as Preview does, flowing to the width of its pane, down to 320 CSS pixels. When the root also has `data-docs-layout="pages"` it draws as Document view does, in pages of the document's page size. There is no other layout and no way for a person to change it.
- **What works.** Selecting, copying, Find without Replace (a bar that selects each match in turn and does not change the page), the outline and links. Pictures come through the host's `contentResources`, as for any instance. The document is read as it is for an editable instance, and a document the host gives as not writable is read-only in the same way.
- **What is not there.** The view switch and every view in which text can be typed, the Replace field of Find, Save, Save As, New, Open, Export, and the formatting, insert and review commands. They are not created, so there is no button, no menu item and no key for them. `yavc.docs/set-text@1` and every other action that changes text refuses with a message that says the instance is read-only, and `yavc.docs/view@1` refuses a view in which text can be typed. `yavc.docs/document@1`, `yavc.docs/export@1`, `yavc.docs/print@1` and `yavc.docs/position@1` work. Print is a command in a read-only instance, as in any other, and goes with the other file commands when `fileCommands` is `false`.
- **What it does not keep.** It does not join the snapshot service, so there is no draft, no `changed()` and no `take()`. It writes nothing through `contentResources`. It reads the `docs` key of `pudlHost.config` and never writes it, so a setting the person made in an editable instance applies and nothing the read-only instance does is stored.
- **A place in the text.** An opaque string says where the instance is in the document: the block at the top of the pane. Actions go to the instance that started last, so a host with several instances reads the place of one by dispatching a `yavc-docs-position` event on that instance's root, with a `detail` object, and the instance puts the string in `detail.position`; `yavc.docs/position@1` gives the same string for a host with one instance. A host gives it back as `data-docs-position` on the root at the next start, and the instance opens there when that text is still in the document, and at the top when it is not. The string means nothing outside Docs and may change between versions, and one that Docs cannot read is ignored.
- **Changing the note.** The documented route is to dispose the instance, which the host does by removing its root element as for any applet, and to start another on the new document. Disposing takes away what the instance drew, its listeners and its timers, and it leaves nothing stored. It also disconnects the observers the instance made, except the two (a MutationObserver and a ResizeObserver) that PUDL's toolbar makes when the instance has it draw its toolbar, which PUDL has no call to undo; they watch elements that are gone, and a host that swaps notes very often pays a small cost for each swap until PUDL adds one.

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
