# Editor

Editor edits text and source code. It shows Markdown as source, including `.docs.md` and `.slides.md`, without changing its identity or converting the file. Docs provides visual Markdown authoring and document layout.

Editor shows every file as its text, and it has no other view. A Markdown document is drawn in Docs, as a page or as it will look. When you choose a `.md` file in Editor's Open dialog or its Files pane, it opens in Docs where Docs is there to open it, unless it is already open in Editor. A deck's `.slides.md` file is the deck's source and stays in Editor. File, Open in Docs sends the document in front to Docs, and Docs has Open in Editor for the times you want a document as plain source. Save preserves the native source; Save As creates a copy through the host file service.

Files occupies the outer pane below the toolbar. Document tabs run to its right. Outline belongs to the active document and has its own width. Both widths are remembered.

Editor supports JSON completion, diagnostics and formatting through the shared language-service integration. Ctrl+Space requests completion. Shift+Alt+F formats supported JSON in one undoable change. Language assistance cannot write a read-only resource.

Editor retains its own tabs, drafts and settings. Existing document drafts remain recoverable here as source. Save the draft before opening it in Docs. Each standalone subdomain has its own browser-local files; moving between applets on the same desktop keeps the host file authority.

Editor, Key Bindings opens its shortcut preferences dialog. Search shortcuts, assign a command, choose Disabled or restore defaults, then Apply. Cancel leaves the settings unchanged. Docs has its own bindings. These preferences use the host settings service and leave the active document open.
