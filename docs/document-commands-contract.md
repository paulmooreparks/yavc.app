# Commands a host adds to an applet's menus

Editor and Docs accept an optional `pudlHost.documentCommands` version 1 capability. A host uses it to put commands of its own in the applet's File or Review menu, where a person looks for them: publishing a document to the place the host keeps it, or asking for a change to the selected passage. The applet draws the row and asks the host about it. The host decides which documents have the command, says whether it can run, and runs it. A host that omits the capability gets the menus as they were.

## What the host supplies

| Member | Contract |
| --- | --- |
| `version` | The number 1. |
| `list(application)` | Called once when the applet starts, with `editor` or `docs`. It returns up to eight declarations. A declaration has an `id` (a lower-case letter, then up to 39 letters, digits and hyphens) and a `label` of up to 64 characters. It may have a `glyph` (a PUDL glyph's name), a `shortcut` in PUDL's notation such as `Mod+Shift+U`, a `menu` (`file`, which is the default, or `review`), `after` (the id of the command in that menu the row follows) and `context: true`. A declaration that breaks these rules is left out, and so is a second one with an id already declared. |
| `state(id, context)` | Returns `{present, disabled, reason}` at once, without a promise, because a menu is drawn in one step. `present` must be `true` for the row to be drawn. `disabled` greys it, and `reason` is the sentence shown with a greyed row. The applet calls this whenever it draws or refreshes its commands, so it must be cheap. An exception counts as not present. |
| `run(id, context)` | Runs the command and returns a promise. The applet first puts what is typed on the page into the document's text, and it does not call `run` for a command that is not present or is disabled at that moment. A rejection is shown to the person as an error with the rejection's message. An `AbortError` is not shown. |
| `onChange(callback)` | Optional. The host calls the callback when any command's state may have changed, and the applet then asks again. It returns a function that ends the subscription. |

## Where a row is drawn

A command for `file` follows the command `after` gives, and Save As without one. A command for `review` follows the command `after` gives, and without one it stands at the end of Review after a separator. Review is drawn for a host's command even for a document that has no review commands of the applet's own.

With `context: true` the command is also offered in the menu a right-click opens over the text or the page, after the applet's own rows. A command that is not present for the document leaves no row there either.

## The context

The `context` of `state` has these members.

| Member | Meaning |
| --- | --- |
| `application` | `editor` or `docs`. |
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

`scripts/test-portable-workspace.cjs` covers a command present for one document and absent for another, refused with the host's reason while disabled, enabled after `onChange`, run with typed text already in the document, a rejection shown as an error, and declarations that are left out. For a command that needs the selection it covers the state without one, a selection in Text view, a selection on the page given as the range of the text it maps to, and the row in the right-click menu. The row's place in File after Save As, with its reason and shortcut, was checked by hand in Dinah's standalone page on 2026-11-11. The place of a row in Review is for the receiving host's own tests, since the test fixture draws no menu bar.
