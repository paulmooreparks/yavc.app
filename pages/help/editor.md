# Editor

Editor edits text and source code. It opens Markdown as source, including `.docs.md` and `.slides.md`, without changing its identity or converting the file. Docs provides visual Markdown authoring and document layout.

Text is the default view. Markdown also offers Split and Preview with a read-only rendered surface. These views cannot format the document or start embedded applets. Save preserves the native source; Save As creates a copy through the host file service.

Files occupies the outer pane below the toolbar. Document tabs run to its right. Outline belongs to the active document and has its own width. Both widths are remembered.

Editor supports JSON completion, diagnostics and formatting through the shared language-service integration. Ctrl+Space requests completion. Shift+Alt+F formats supported JSON in one undoable change. Language assistance cannot write a read-only resource.

Editor retains its own tabs, drafts and settings. Existing document drafts remain recoverable here as source. Save the draft before opening it in Docs. Each standalone subdomain has its own browser-local files; moving between applets on the same desktop keeps the host file authority.

Editor, Key Bindings opens its shortcut preferences dialog. Search shortcuts, assign a command, choose Disabled or restore defaults, then Apply. Cancel leaves the settings unchanged. Docs has its own bindings. These preferences use the host settings service and leave the active document open.
