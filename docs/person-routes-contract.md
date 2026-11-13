# The routes a person uses to drive Docs

A person who types in Docs, formats a word, switches views, opens a dialog and saves does it through the page's own controls. A tester outside this repository can drive Docs the same way, and this contract lists what the applet promises to keep stable for that. A script that goes only through these routes keeps working when the page's markup, class names, data attributes, layout and command ids change.

## What is promised

**The editing surfaces.** Both have the role `textbox` and `aria-multiline="true"`. The rich view is named "The Document, as Its Page". The Markdown view is named "Text of " followed by the file name, for example "Text of Document.docs.md". The names are what screen reader users hear, so they are not changed for scripts.

**The ready signal.** A surface accepts typing when it is not `aria-busy="true"`, which is a documented ARIA state. A script waits for that state to go before it types. After a click, a script also waits one animation frame before it types, because the page view takes the browser's selection a frame late (the backlog item "The page view takes the browser's selection a frame late" in `backlog.md`). That sentence is removed when the defect is fixed.

**The toolbar and the view buttons.** Each toolbar button has an accessible name: New, Open, Save, Save As, Undo, Redo, Find and Replace, Bold, Italic, Underline, Strike Through, Code, Link, Bulleted List, Numbered List, and the View group Document, Visual, Text, Split and Preview. The View buttons show the current view with `aria-pressed`.

**Dialogs.** A dialog has the role `dialog` and a name, such as "Link" or "Text Color". Find and Replace is a region with the role `search` and the name "Find and Replace", and its buttons are Previous Match, Next Match, Match Case, Whole Word, Regular Expression, Replace, Replace All and Close. Its buttons and the labels of its fields have names, for example the buttons Apply, Insert, Change, Cancel and Remove.

**Saving.** Ctrl+S (Cmd+S on macOS) and the Save button each save the document, and each writes once. That a save happened is seen on the host's side, from what the host was asked to write, because a save's result belongs to the host; this is the one intended exception to driving Docs by a person's routes alone.

**The menus.** The File, Edit, Format and View menus, and the items in them, have names. An item's name is its label followed by its shortcut when it has one, such as "Save Ctrl+S", so a script matches the beginning of the name. Items do not have one role: some are buttons, and the view choices and Wrap Lines are `menuitemradio` and `menuitemcheckbox`. When the menus are visible is not promised. At desktop width the toolbar shows its own buttons and hides the menus, and at phone width the menus replace the buttons.

## What is not promised

Class names, `data-` attributes, layout and widths, the host's own fixture, and command ids. Command ids belong to the toolbar's own contract (`command-toolbar-design.md`), not to this one. The libraries' own class names (`ProseMirror`, `cm-content`) are what those libraries give, and they are not promised either.

## What is tested

`scripts/test-docs-person-routes.cjs` drives Docs in the one-page host from a built package, in Chromium, Firefox and WebKit, at desktop width (1500 pixels) and at phone width (390 pixels). It uses roles, accessible names, `aria-busy`, `aria-pressed`, the keyboard and the Save button, and nothing else. At phone width it takes each command from its menu. The one thing it reads from the host is the text the host was given to save, since a save happens on the host's side. It types, makes a word bold, switches to the Markdown view and back and reads the Markdown through its textbox, saves with Ctrl+S and with the Save button (or the File menu) and counts one write for each, opens the Link and Text Color dialogs by name and cancels them, and opens Find and Replace and checks its buttons by name.
