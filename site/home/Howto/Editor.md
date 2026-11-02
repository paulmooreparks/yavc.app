# The Editor

The Editor edits text and Markdown files: your own under `~`, and the site's pages read-only. For a Markdown file it also draws the page as it will look and lets you edit it there. This guide goes through files and tabs, the views, formatting, the slash menu, shortcodes, find and replace, keys, and the agent actions.

![The Editor on the desktop](/static/shots/desktop.jpg)

## Files and tabs

File, Open opens one of your files or a page of the site; New starts an untitled document; the Files button shows the file pane on the left, where a click opens a file. Open documents sit in tabs across the top once there is more than one; a tab with unsaved changes says so, and closing it asks. Save is Ctrl+S; Save As asks where, starting in `~/Documents`. Unsaved changes survive a reload.

A file of the site opens read-only; Save As keeps an editable copy under `~`. A file named `something.slides.md` is a deck, and File, Present the Deck opens it in Slides.

## Views

Under View, for a Markdown file:

- **Text** is the Markdown, in a code editor with syntax colouring, line wrapping and the usual keys.
- **Visual** is the page as it will look, edited in place: type, select, format, and the Markdown follows. A tip, a note, an expand section or a column set is a box on the page, edited inside as any text is; a bar at its top changes its title, removes the box or edits it as Markdown, and Enter on an empty last line leaves it. Format, Box wraps the selected paragraphs in one. A picture, a video, an applet, a code listing or the contents opens a form when clicked, and so does a shortcode inside a sentence, such as keys or a status label. A block the page cannot draw as rich text, such as a code block or a diagram, is drawn as it will show and edited as its Markdown in place.
- **Split** is both side by side, kept in step.
- **Preview** is the page as it will look, read-only.

Layout, Open Markdown As chooses which view a Markdown file opens in. Each tab remembers its view.

## Formatting

Format, and the toolbar, give Bold (Ctrl+B), Italic (Ctrl+I), Strike Through, Code, Link (Ctrl+K), Text Colour, Style, Bulleted and Numbered List, and Paragraph Style: Paragraph (Ctrl+0) or Heading 1 to 6 (Ctrl+1 to Ctrl+6). In Text view a format wraps the selection in its Markdown, or takes it off again; a heading or a list marks each selected line. In Visual view the page is formatted directly.

Text Colour wraps the selected words in `{{color:…}}…{{/color}}`, with one of the site's colours (ink, muted, accent, danger, warn, positive) or any CSS colour; Style wraps them in `{{class:…}}…{{/class}}`, a class from a `{{style}}` block in the document. Both stay editable as rich text in Visual view.

## The slash menu and Insert

On an empty line in Visual view, type `/` for a menu of everything Insert offers: headings, lists, a quote, a checklist, a table, a code block, and the shortcodes. Typing narrows it, Enter inserts. Insert, on the toolbar and under Format, offers the same list.

## Pictures

Insert, Picture opens a dialog for the picture: its address, with Browse for one already in your home folder or on the site and Upload for one from your computer, what it shows, its largest width and a caption. An uploaded picture is kept beside the document when the document is saved under `~`, and otherwise in `~/Pictures`; either way it lives in this browser, as your files do. In Visual view, a click on a picture opens the same dialog to change it or remove it.

## Shortcodes

A shortcode is `{{name:args}}`, or `{{name}}` … `{{/name}}` around content. The Editor draws them in Visual view and Preview as the site does. The ones most used:

- `{{figure:cat.png alt="What it shows" width=60% caption="…"}}`, a picture: one beside the document, one in your home folder (`~/Pictures/cat.png`), one of the site's (`/static/shots/desktop.jpg`) or one on the web
- `{{columns}}` … `{{column}}` … `{{/columns}}`, content side by side
- `{{tip:A title}}` … `{{/tip}}`, and `note`, `info`, `warning`, notices
- `{{expand:The title}}` … `{{/expand}}`, a section that opens and closes
- `{{video:https://youtu.be/…}}`, a hosted video from YouTube or Vimeo
- `{{applet:dice}}`, one of the site's applications on the page
- `{{code:~/bin/hello}}`, a file shown as a listing
- `{{color:accent}}words{{/color}}` and `{{class:name}}words{{/class}}`, coloured and styled words
- `{{style}}` … `{{/style}}`, CSS for the document
- `{{kbd:Ctrl+S}}`, `{{status:green Done}}`, `{{glyph:check}}`, `{{toc}}`, `{{page:author}}`, `{{anchor:name}}`

A shortcode written wrongly shows a marked problem in its place, with the reason on hover.

## Right-click

A right-click on the text or the page gives Undo, Redo, Find and the Format menu; on a tab, Close and Close the Others; on a file in the pane, Open. Shift+F10 and the Menu key open the same menus from the keyboard.

## Find and replace

Edit, Find and Replace (Ctrl+F) opens a bar with the two fields, Match Case, Whole Word and Regular Expression, and Replace and Replace All, working in Text view on the Markdown and in Visual view on the page.

## Keys

Edit, Key Bindings opens `~/.config/editor.json`, where each key is bound to a command by name; a key set to null does nothing, and saved changes apply at once. The file lists the commands.

## Agents

An AI agent paired in Settings can open, read, change, search, save and close documents here through the site's MCP endpoint, as you would. Help, For agents has the details.
