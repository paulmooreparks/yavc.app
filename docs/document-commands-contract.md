# Commands a host adds to the File menu

Editor and Docs accept an optional `pudlHost.documentCommands` version 1 capability. A host uses it to put commands of its own in the applet's File menu, where a person looks for them: publishing a document to the place the host keeps it is the first. The applet draws the row and asks the host about it. The host decides which documents have the command, says whether it can run, and runs it. A host that omits the capability gets the File menu as it was.

## What the host supplies

| Member | Contract |
| --- | --- |
| `version` | The number 1. |
| `list(application)` | Called once when the applet starts, with `editor` or `docs`. It returns up to eight declarations. A declaration has an `id` (a lower-case letter, then up to 39 letters, digits and hyphens), a `label` of up to 64 characters, and optionally a `glyph` (a PUDL glyph's name), a `shortcut` in PUDL's notation such as `Mod+Shift+U`, and `after`, the id of the File command the row follows. Without `after`, or when the applet has no such command, the row follows Save As. A declaration that breaks these rules is left out, and so is a second one with an id already declared. |
| `state(id, context)` | Returns `{present, disabled, reason}` at once, without a promise, because a menu is drawn in one step. `present` must be `true` for the row to be drawn. `disabled` greys it, and `reason` is the sentence shown with a greyed row. The applet calls this whenever it draws or refreshes its commands, so it must be cheap. An exception counts as not present. |
| `run(id, context)` | Runs the command and returns a promise. The applet first puts what is typed on the page into the document's text, and it does not call `run` for a command that is not present or is disabled at that moment. A rejection is shown to the person as an error with the rejection's message. An `AbortError` is not shown. |
| `onChange(callback)` | Optional. The host calls the callback when any command's state may have changed, and the applet then asks again. It returns a function that ends the subscription. |

The `context` of `state` has `application`, `resource` (the identity of the document in front, or null for one with no place yet), `name` and `modified` (whether the document has unsaved changes). The `context` of `run` adds `root`, the applet's element, for a host that shows a dialog beside it, and `signal`, an `AbortSignal` that ends when the applet goes.

## What the applet does

The command's id in the applet is `host-` followed by the declared id, so it cannot take the place of one of the applet's own. PUDL draws the label, the glyph and the shortcut, and binds the shortcut while the applet has the keyboard. A host that also binds the same key in a menu of its own should give the key to one of the two.

The applet asks for the state again when the document changes, when it is saved, and when another document comes to the front, as it does for its own commands. A state that depends on something the applet cannot see, such as what the host last published, needs `onChange`.

The host owns everything the command does: a question before it writes, the write, and what it says afterwards. The applet does not save the document before `run`. A host that publishes the saved file should say so in its `reason` while `modified` is true, or read the text through the applet's `document@1` action.

## Verification

`scripts/test-portable-workspace.cjs` covers a command present for one document and absent for another, refused with the host's reason while disabled, enabled after `onChange`, run with typed text already in the document, a rejection shown as an error, and declarations that are left out. The row's place after Save As, with its reason and shortcut, was checked by hand in Dinah's standalone page on 2026-11-11 and is for the receiving host's own tests to keep.
