# Commands a host adds to an applet's menus

Editor and Docs accept an optional `pudlHost.documentCommands` version 1 capability. A host uses it to put commands of its own in the applet's File or Review menu, where a person looks for them: publishing a document to the place the host keeps it, or asking for a change to the selected passage. The applet draws the row and asks the host about it. The host decides which documents have the command, says whether it can run, and runs it. A host that omits the capability gets the menus as they were.

## What the host supplies

| Member | Contract |
| --- | --- |
| `version` | The number 1. |
| `list(application)` | Called once when the applet starts, with `editor`, `docs` or `diagrams`. It returns up to eight declarations. A declaration has an `id` (a lower-case letter, then up to 39 letters, digits and hyphens) and a `label` of up to 64 characters. It may have a `glyph` (a PUDL glyph's name), a `shortcut` in PUDL's notation such as `Mod+Shift+U`, a `menu` (`file`, which is the default, or `review`), `after` (the id of the command in that menu the row follows), `context: true` and `replaces: 'save'`. A declaration that breaks these rules is left out, and so is a second one with an id already declared. |
| `state(id, context)` | Returns `{present, disabled, reason}` at once, without a promise, because a menu is drawn in one step. `present` must be `true` for the row to be drawn. `disabled` greys it, and `reason` is the sentence shown with a greyed row. The applet calls this whenever it draws or refreshes its commands, so it must be cheap. An exception counts as not present. |
| `run(id, context)` | Runs the command and returns a promise. The applet first puts what is typed on the page into the document's text, and it does not call `run` for a command that is not present or is disabled at that moment. A rejection is shown to the person as an error with the rejection's message. An `AbortError` is not shown. |
| `onChange(callback)` | Optional. The host calls the callback when any command's state may have changed, and the applet then asks again. It returns a function that ends the subscription. |

## Where a row is drawn

A command for `file` follows the command `after` gives, and Save As without one. A command for `review` follows the command `after` gives, and without one it stands at the end of Review after a separator. Review is drawn for a host's command even for a document that has no review commands of the applet's own.

With `context: true` the command is also offered in the menu a right-click opens over the text or the page, after the applet's own rows. A command that is not present for the document leaves no row there either.

## A command in place of Save

Some places a document lives are written as the person works, such as a file. Others are seen by other people the moment they are written, such as a wiki page, and there the host keeps changes in a draft and writes them on an explicit command. For such a document the applet's Save does nothing a person can see. A declaration with `replaces: 'save'` puts the host's command where Save is, for the documents the command is present for.

- The applet's `save` command takes the host command's label, glyph, disabled state and reason. The toolbar's button and the File row are drawn from that command, so both follow, and `onChange` redraws them.
- Running it, from the button, the menu or the key bound to Save, calls the host's `run(id, context)` as for any other host command. The applet's own save does not run, so nothing is written through the resource.
- The command has no row of its own in File. Its own shortcut still runs it, and with `context: true` it is still offered on a right-click.
- For a document where the command is not present, Save is the applet's own.

The first declaration that asks is used, and a later one is treated as an ordinary command. Save As is not replaced. Three things still call the applet's own save, which writes through the resource and so to the host's draft: the question on closing a modified document, the question before opening it in the other application, and the agent action `save@1`. The applet clears a document's modified mark when its text is written through the resource, and running the host's command does not clear it.

## Diagrams

Diagrams takes the same commands for a diagram, so that a diagram kept where other people see it can be published from the applet that edits it. It differs from Editor and Docs in three ways. It has no Review menu, so a command for `review` is not drawn. A diagram has no selection of text, so `selected` is always false and `selection` is null. With `context: true` the command is offered at the end of the menu a right-click opens over the drawing or the text. A command in place of Save works as it does in the other two.

## A shortcut the text pane already uses

PUDL runs a command's shortcut only when nothing nearer the keyboard took the key. The text panes of all three applets are CodeMirror, which has its own keys, and a host's shortcut that is one of them does not reach the command while the text has the keyboard. `Mod+Shift+U` is one: CodeMirror uses it to redo a change of selection. A host should choose a shortcut CodeMirror's default keys leave free, such as `Mod+Shift+L`, or accept that it works from the page and the drawing and not from the text.

## The context

The `context` of `state` has these members.

| Member | Meaning |
| --- | --- |
| `application` | `editor`, `docs` or `diagrams`. |
| `resource` | The identity of the document in front, or null for one with no place yet. |
| `name` | The document's name. |
| `modified` | Whether the document has unsaved changes. |
| `selected` | Whether the view in front has a selection. It is false in Preview, which has none to act on. |

The `context` of `run` has the same members and three more.

| Member | Meaning |
| --- | --- |
| `selection` | `{text, start, end}`, or null. `start` and `end` are UTF-16 offsets into the document's text as the applet's `document@1` action returns it, and `text` is that range. In Text view it is the selection itself. In Visual view and in Docs' page view it is the range of the text the selection maps to. A selection on the page that cannot be mapped exactly gives null while `selected` is true, and the host should then ask the person to select the passage in Text view. The applet's own review proposals refuse such a selection in the same way. |
| `root` | The applet's element, for a host that shows a dialog beside it. |
| `signal` | An `AbortSignal` that ends when the applet goes. |

The selection's place is worked out only for `run`, because mapping a selection on the page to the text takes the engine and cannot be done each time a menu is drawn. The offsets are true for the text at the moment `run` is called. A host that keeps them must check that the document has not changed since, for example by comparing `text` with that range of the document when it uses them.

## What the applet does

The command's id in the applet is `host-` followed by the declared id, so it cannot take the place of one of the applet's own. PUDL draws the label, the glyph and the shortcut, and binds the shortcut while the applet has the keyboard. A host that also binds the same key in a menu of its own should give the key to one of the two.

The applet asks for the state again when the document or the selection changes, when the document is saved, and when another document comes to the front, as it does for its own commands. A state that depends on something the applet cannot see, such as what the host last published, needs `onChange`.

The host owns everything the command does: a question before it writes, the write, and what it says afterwards. The applet does not save the document before `run`. A host that publishes the saved file should say so in its `reason` while `modified` is true, or read the text through the applet's `document@1` action.

## Verification

`scripts/test-portable-diagrams.cjs` covers Diagrams: the application named to `list`, the Save command taking a host command's label, glyph, reason and disabled state for one diagram, the run from the command, from the key bound to Save and from the command's own shortcut with the context a diagram has, nothing written through the resource, and Save being Diagrams' own again afterwards.

`scripts/test-portable-workspace.cjs` covers a command present for one document and absent for another, refused with the host's reason while disabled, enabled after `onChange`, run with typed text already in the document, a rejection shown as an error, and declarations that are left out. For a command that needs the selection it covers the state without one, a selection in Text view, a selection on the page given as the range of the text it maps to, and the row in the right-click menu. For a command in place of Save it covers the label, glyph, reason and disabled state of the Save command and of a button drawn from it, the run from the command, from the key bound to Save and from the command's own shortcut, that nothing is written through the resource, a second declaration that asks being ignored, and Save being the applet's own again when the command is no longer present. The row's place in File after Save As, with its reason and shortcut, was checked by hand in Dinah's standalone page on 2026-11-11. The place of a row in Review is for the receiving host's own tests, since the test fixture draws no menu bar.
