# Editor Help

The [Editor](/editor) edits text and Markdown files. Your own files under `~` can be changed, and the site's pages open read-only. For a Markdown file it also draws the page as it will look and lets you edit it there. It runs in a window on the desktop and on its own at `editor.yavc.app`.

At `docs.yavc.app` the same Editor starts for writing documents. File, New there makes a document named like `untitled-1.docs.md`, and a Markdown file opens on its page. Which view a Markdown file opens in at Docs is remembered apart from the Editor's own choice. Files are kept per address, so a document saved at `docs.yavc.app` is not seen at `editor.yavc.app`.

![The Editor on the desktop](/static/shots/desktop.jpg)

## Files and tabs

File, Open opens one of your files or a page of the site, and File, New starts an untitled document. View, Show Files shows a pane of your files on the left, where a click opens one. Open documents sit in tabs across the top once there is more than one. A tab with unsaved changes says so, and closing it asks first. Save is Ctrl+S, and Save As asks where to put the file, starting in `~/Documents`. Unsaved changes survive a reload of the page.

View, Customize Toolbar changes the common-command row below the topbar. Add or remove commands, move them up or down in the order, and add separators between groups. Apply saves the layout; Cancel discards the draft, and Restore Defaults restores the initial choices in the form. Show the Toolbar controls visibility, and Keep Visible with the Ribbon lets the row remain available beside any ribbon tab. Editor and Docs use the same toolbar preference within your session. A localhost run keeps a separate session for each host.

A file of the site opens read-only, and Save As keeps an editable copy under `~`. A file named `something.slides.md` is a deck, and File, Present the Deck opens it in [Slides](/help/slides).

File, Properties edits a Markdown file's front matter, which is the block between two lines of three dashes at its top. It offers the title, author, subject, keywords, language and date, and any property of your own. Only the lines of the properties you change are rewritten, and front matter that is not valid YAML is reported and left as it is.

## JSON language assistance

JSON files have completion, hover information, error markers and formatting in the text editor. Files ending in `.canvas` also offer JSON Canvas properties and the site's shape, alignment and connector settings. Ctrl+Space asks for completion, and Shift+Alt+F or Edit, Format JSON formats the document in one undoable change. Read-only files cannot be changed by assistance.

Language assistance runs in this browser using bundled assets. File contents and schema addresses do not trigger requests to an outside language service. If assistance stops, ordinary editing remains available; Edit, Restart Language Assistance retries it. Assistance pauses for very large documents and resumes when they become smaller.

## Views

The site's View menu offers four views of a Markdown file.

- **Text** shows the Markdown in a code editor with syntax colouring, line wrapping and the usual keys.
- **Visual** shows the page as it will look, and you edit it in place. A tip, a note, an expand section or a set of columns is a box on the page, edited inside as any text is; a bar at its top changes its title, removes the box or edits it as Markdown. A picture, a video, an applet or a code listing opens a form when clicked. A block the page cannot draw as rich text, such as a code block or a diagram, is drawn as it will show and edited as its Markdown in place.
- **Split** shows the Markdown and the page side by side, kept in step.
- **Preview** shows the page as it will look, read-only.

View, Open Markdown As chooses the view a Markdown file opens in, and each tab remembers the view you last chose for it. View, Wrap Lines turns line wrapping on and off in Text view.

## Formatting

The Format menu offers Bold (Ctrl+B), Italic (Ctrl+I), Underline (Ctrl+U), Strike Through, Code, Highlight (Ctrl+Shift+H), Superscript, Subscript, Text Colour, Style, Bulleted List and Numbered List, and Paragraph Style, which is Paragraph (Ctrl+0) or Heading 1 to 6 (Ctrl+1 to Ctrl+6). Any of these commands can be added to the toolbar. In Text view a format wraps the selection in its Markdown or takes it off again, and a heading or a list marks each selected line. In Visual view the page is formatted directly.

Underline is written `<u>…</u>`, and Highlight, Superscript and Subscript are written `{{mark}}…{{/mark}}`, `{{sup}}…{{/sup}}` and `{{sub}}…{{/sub}}`. Superscript and Subscript replace each other, since words are raised or lowered and never both.

Text Colour wraps the selected words in `{{color:…}}…{{/color}}` with one of the site's colours (ink, muted, accent, danger, warn or positive) or any CSS colour. Style wraps them in `{{class:…}}…{{/class}}` with a class: one of those the site provides for every document (`center`, `right`, `justify`, `indent`, `small`, `lead` and `no-break`), one from a `{{style}}` block in the document, or any name. Both stay editable as rich text in Visual view.

## Tables

Insert, Table (also under Format and in the right-click menu) opens a submenu. Insert Table adds a small table. While the cursor is in a table on the page, the same submenu also offers Insert Row Above and Below, Insert Column Before and After, Delete Row, Delete Column and Delete Table. Tab in the last cell adds a row. A Markdown table has one heading row and no merged cells, so the page does not offer them.

## Inserting

The Insert menu offers Link (Ctrl+K), and under Insert it lists headings, lists, a quote, a checklist, a table, a code block and the shortcodes. It also has Box, which wraps the selected paragraphs in a box, Insert Date and Time (Ctrl+;) and Update Last-Modified (Ctrl+Shift+;). On an empty line in Visual view, typing `/` opens a menu of the same things as Insert; typing more narrows it, and Enter inserts the one chosen.

Insert, Picture opens a dialog for a picture. It asks for the picture's address, with Browse for one already in your home folder or on the site and Upload for one from your computer, and for what it shows, its largest width and a caption. An uploaded picture is kept beside the document when the document is saved under `~`, and in `~/Pictures` otherwise; either way it lives in this browser, as your files do. In Visual view a click on a picture opens the same dialog to change it or remove it.

## Shortcodes

A shortcode is written `{{name:args}}`, or `{{name}}` and `{{/name}}` around some content. The Editor draws shortcodes in Visual view and Preview as the site does. These are the ones most used.

- `{{figure:cat.png alt="What it shows" width=60% caption="…"}}` shows a picture beside the document, in your home folder (`~/Pictures/cat.png`), on the site (`/static/shots/desktop.jpg`) or on the web.
- `{{columns}}`, `{{column}}` and `{{/columns}}` set content side by side.
- `{{tip:A title}}` and `{{/tip}}` make a notice, and so do `note`, `info` and `warning`.
- `{{expand:The title}}` and `{{/expand}}` make a section that opens and closes.
- `{{video:https://youtu.be/…}}` shows a hosted video from YouTube or Vimeo.
- `{{applet:dice}}` puts one of the site's games or tools on the page.
- `{{code:~/bin/hello}}` shows a file as a listing.
- `{{style}}` and `{{/style}}` hold CSS for the document.
- `{{kbd:Ctrl+S}}`, `{{status:green Done}}`, `{{glyph:check}}`, `{{toc}}`, `{{page:author}}` and `{{anchor:name}}` draw keys, a status label, a glyph, the contents, a link to a page and a place to link to.

A shortcode written wrongly shows a marked problem in its place, and hovering over it gives the reason.

## Words

The status bar shows the number of words in a Markdown file, and for the text you have selected in Text view, as in "12 of 340 words". Pointing at it shows about how many minutes the document takes to read. The front matter, the shortcodes' own tags and the addresses of links and pictures are not counted.

## Finding and moving around

Edit, Find and Replace (Ctrl+F) opens a bar with the two fields, Match Case, Whole Word and Regular Expression, and Replace and Replace All. It works on the Markdown in Text view and on the page in Visual view. Go, Go to Line (Ctrl+Alt+G) moves to a line by its number.

A right-click on the text or the page gives Undo, Redo, Find and the Format menu. On a tab it gives Close and Close the Others, and on a file in the pane it gives Open. Shift+F10 and the Menu key open the same menus from the keyboard.

## Keys

Editor, Key Bindings opens `~/.config/editor.json`, where each key is bound to a command by its name. A key set to null does nothing, and saved changes apply at once. The file lists the commands you can bind.

## Document styles

Format, Document Stylesheet opens the CSS editor for this document. Ctrl+Shift+F opens it too. Choose an existing style block or New Style Block, edit its CSS, then Apply Styles or press Ctrl+S. The change enters the document's Undo history. Cancel leaves the source unchanged. A warning explains CSS that the preview cannot apply; the source keeps what you wrote.

For example, a style block can define a class:

```markdown
{{style}}
.callout { border-left: 4px solid var(--doc-accent); padding: 0.75rem; }
{{/style}}
```

Format, Style lists the document's classes beside the stock classes. Apply one to selected words or use `{{class:callout}}` around blocks. Names may contain letters, digits, underscores and hyphens and start with a letter or underscore.

The stylesheet editor's Shared Stylesheet field links a local CSS file, such as `~/Styles/document.css` or `../Styles/document.css` relative to the document. Its styles apply before the document's blocks. Format, Edit Shared Stylesheet opens that file for editing; a missing home-folder file can be created there. Shared-file saves take effect in documents using it at this browser address. Each document still has its own style scope. Remote CSS files and resource-loading CSS are not supported. Fonts use those already available on your machine or in the site.

## Custom shortcodes

Format, Custom Shortcodes opens the definitions in this document. Choose New Definition, give it a lowercase name such as `card`, and enter a Markdown template. Each `param` line declares a field; `arg` inserts that field as literal text, and `content` inserts the body of a container shortcode.

```markdown
{{define:card}}
{{param:title default="A heading" help="Card heading"}}
## {{arg:title}}

{{content}}
{{/define}}

{{card:title="My card"}}
This body can contain **rich text**.
{{/card}}
```

The Insert menu lists the document's valid custom shortcodes and asks for their parameters. The Text view completes their names and parameters. In Visual and Split views, a container with `content` on its own template line has an editable rich body and a Parameters button. A template that puts `content` inside a line stays editable as source. Definitions remain in the Markdown and are hidden in the drawn page. Apply Definitions is one document edit covered by Undo; Cancel keeps the source unchanged.

Shared Definitions File links a local `.md` file, either under `~/` or relative to the document. That file holds ordinary definition blocks and can be edited in Editor. A document's definition overrides a shared definition with the same name. Duplicate names within one file, reserved names and dependency cycles are refused. Expansion stops at eight levels and a cumulative 256 KiB per rendering request. No custom shortcode executes code or reads a remote definitions file.

Insert, Glyph shows a searchable list of symbols beside their names. Use Tab or the arrow keys to reach a choice, press Space or Enter to select it, then choose Insert.

## Outline and section movement

View, Outline opens the document's heading tree beside Files. Click a heading to go to it in Text, Visual, Split or Preview. Arrow keys navigate the tree; its disclosure buttons collapse subsections. Ctrl+Alt+O switches the Outline pane, and Back to Document closes navigation on a narrow screen.

Go, Move Section Up or Move Section Down moves the selected heading and all its subordinate sections together. Alt+Shift+Up and Alt+Shift+Down do the same. You can also drag a heading before or after a sibling in Outline. A section can move among headings of the same level under the same parent. One Undo restores the complete move. Headings inside quotes, code and shortcode templates are excluded from the document outline.

## Quotes and table alignment

Format, Quote wraps the selected blocks or removes their enclosing quote. Lists within a quote retain their structure when you remove the quote. Text view adds or removes one explicit quote marker on the selected lines. Quotes containing unsupported rich content remain editable as source.

Select a table cell in Visual or Split view, then use Format, Table to align its column left, center or right, or restore default alignment. A selection spanning several columns changes them together. Alignment is stored in ordinary GFM table delimiters. Unchanged quote and table source keeps its original spelling.

## Where your files live

Your files are kept in this browser. Settings are shared by every address of the site, but files are kept per address, so a file saved on the desktop is not seen at `editor.yavc.app`, and the other way round. Download a file to keep a copy anywhere else. [Files Help](/help/files) says more about storage and its limits.

## Agents

An AI agent paired in [Settings](/help/settings) can open, read, change, search, save and close documents here through the site's MCP endpoint, as you would. The page [For Agents](/agents) has the details.

Your home folder has a sample document, `~/Howto/Editor.md`, which uses many of the things above and is there to open and change.
