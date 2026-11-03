# Documents: the Editor as a word processor over Markdown

Status: designed on 2026-11-03, not yet built. Paul asked for the Editor to become a fully fledged editor, on a par with a Word-style word processor, with Markdown as the substrate, keeping its code editing, and with the custom styles and shortcodes that Slides has. The decisions below were taken under the design authority he delegated; each is marked, and he can overturn any of them.

The one-line shape is this. A file named `something.docs.md` is a document, as `something.slides.md` is a deck. It opens in the Editor in a Document view, which draws it as pages and edits it in place, and everything the document says about its own look is in the file: its properties in the front matter, its stylesheet in `{{style}}` blocks or a CSS file of the person's, and its own shortcodes in `{{define}}` blocks. The Markdown engine, the page view and the editing kit the Editor and Slides already share do most of the work; this design fills the gaps between what they do today and what a word processor does, and it says where the line is drawn, since some things a word processor does would make a document unreadable as text.

## What is there already

The Editor edits Markdown in four views: Text (CodeMirror, with syntax colouring, line wrapping, find and replace, JSON linting, and shortcode completion and hover help), Visual (the page view, ProseMirror over a document the Markdown engine builds and writes back block by block), Split and Preview. The page view edits paragraphs, headings, bulleted, numbered and task lists and tables as rich text, container shortcodes as boxes with rich bodies, a column set as a row of columns, a standalone shortcode through its form, and a span shortcode as a mark. Code, diagrams, quotes, pictures, rules and HTML are source blocks, drawn as the preview draws them and edited as their Markdown in place. The marks are link, bold, italic, strike, code, colour and class. The front matter is edited through Properties with a real YAML parser. Pictures live in the browser's database and are inserted and changed through the picture dialog. The `{{style}}` and `{{class}}` shortcodes exist in the engine, and Slides scopes a deck's CSS to its slides with `@scope`, lists the stylesheet's classes under Format, Style, and reads a shared CSS file from the front matter's `stylesheet` line.

Three gaps matter most. The Editor does not apply a document's `{{style}}` CSS at all; only Slides does. The page view has no notion of a page, so there are no page sizes, margins, breaks, headers or footers (DESIGN.md, open question 4). And the engine's shortcodes are fixed in Go, so a person cannot add one.

## Decisions

1. **A document is a Markdown file named `something.docs.md`, and it is the Editor's** (2026-11-03). The suffix is the one Paul suggested, and it holds up for the same reason `.slides.md` does: the word before `.md` is the name of the thing the file is treated as, and "Docs" is what the view and the help page are called. The alternative, a separate Docs application beside Slides, was weighed and set aside. The Editor already changes its command table by the open tab, offering Format only for Markdown, so a document's menus fit the same mechanism; a second application would duplicate the Editor's files, tabs, explorer, find and settings for one more view of the same files; and Paul asked for the Editor. A document therefore opens in the Editor, on the desktop, at `yavc.app/editor` and at `editor.yavc.app`, and Files opens a `.docs.md` file there directly in Document view, with the suffix's own icon. The suffix chooses only the view a file opens in and the menus it starts with. Any Markdown file can be opened in Document view from View, Open Markdown As, and a document can be opened as Text, since it is Markdown.

2. **Document view is a fifth view, and the rich editing goes into the page view every view shares** (2026-11-03). Visual stays what decision 15 of DESIGN.md made it, the page drawn for reading and wrapped to the pane. Document view is the same page view laid out as sheets of a page size with margins, with a header and a footer on each, a page count in the status bar, and zoom. Everything that is not about pages, which is most of what a word processor does (the Table menu, the styles pane, underline and highlight, footnotes, captions, the outline), is added to the page view itself, so Visual, Split and Document view all gain it, for every Markdown file. Only paging is Document view's own.

3. **What Markdown cannot say, a shortcode says, and what a shortcode would say badly, a style says** (2026-11-03). Markdown has no underline, highlight, superscript, subscript, alignment, page break, footnote reference beyond the GFM extension, or font. The rule for filling that in is the one Slides took with layouts (docs/slides-design.md, decision 4): add the few things every document needs as shortcodes that still read as text, and put everything else behind named styles, so that a document never says "12 point Garamond, centred" in its text. The shortcodes added are span ones, `{{mark}}`, `{{sup}}` and `{{sub}}`, drawn as the HTML elements of those names so an export can map them, a block one, `{{page-break}}`, and a container, `{{caption}}`, whose body is rich text. Underline is not a shortcode: the page view already reads and writes the HTML element `<u>`, so it stays that (amended while building milestone 1, since a second spelling would have split documents in two). Alignment, indentation, spacing, fonts, sizes and colours beyond the six state colours are styles: a class in the document's stylesheet, applied with the existing `{{class}}`. A base stylesheet ships the common ones (`center`, `right`, `justify`, `indent`, `small`, `lead`, `no-break`), so a person who never writes CSS still has them under Format, Style. Direct font and size controls on a run of words, as Word has, are left out on purpose, as dragging boxes was left out of Slides.

4. **A document's look is a stylesheet in three layers, and the Editor applies it at last** (2026-11-03). The layers are those of Slides' decision 17, with the same mechanics moved into the editing kit so both applications use one implementation (the `one-shared-implementation` rule): a theme, which is a stock CSS file of the site chosen by the front matter's `theme` line (`plain`, which follows the site's own look, `manuscript`, `report` and `letter` to begin with); a CSS file of the person's from the front matter's `stylesheet` line, for styles shared across documents; and `{{style}}` blocks in the document itself. All three are scoped with `@scope` to the pages of that one document, so two documents open in two tabs never style each other or the Editor, and they apply in Visual, Split, Preview and Document view, in print and in the exports. The base stylesheet defines the tokens a theme and a document set, `--doc-font`, `--doc-font-heading`, `--doc-size`, `--doc-leading`, `--doc-ink`, `--doc-muted`, `--doc-accent`, `--doc-rule` and `--doc-page`, which every element on the page reads, so a theme or a document restyles a whole document by setting a few of them; the page's existing `--dinah-*` tokens become aliases of these. Document, Typography… is the quick path, as Colours… is in Slides: it offers the body and heading fonts, the size and the line spacing, and writes the front matter's `font`, `heading-font`, `size` and `spacing` lines, which the base stylesheet reads into the tokens. Fonts are the reader's machine's or PUDL's own; no page ever loads a font from another host (DESIGN.md, decision 6), and uploading a font file of one's own waits for a home on the server, as videos do.

5. **A document's CSS is contained as well as scoped** (2026-11-03). Scoping keeps a document's selectors inside its pages, but it does not keep what they draw inside: a rule such as `.x { position: fixed; inset: 0 }` inside a scope still paints over the whole window, so a document someone sent could draw a false dialog over the Editor's own. The page surface therefore has `contain: paint`, which CSS Containment defines as making the element the containing block for its fixed and absolute descendants and clipping them to it, so nothing a document styles can be drawn outside its own page. The kit also refuses a stylesheet that would load anything: `@import` is dropped, and `url()` is kept only for an address `SafeImage` admits, with a home-folder path rewritten to the picture's address in this browser as a slide's `image=` is. The same `:scope` parsing trick Slides uses stays, so CSS that closes its block early to reach the rest of the page is dropped rather than applied. This applies to Slides too, which today scopes but does not contain.

6. **Pages are measured, not simulated** (2026-11-03). Document view breaks the document into sheets by measuring it, since nothing in the browser paginates an editable document for us. The page size and margins come from the front matter (`page`: `a4`, `letter`, `legal` or `W×H`; `orientation`; `margins`, one to four lengths), the base stylesheet sets the content column to that width, and the view measures where the content crosses each page's height and puts a band there, a widget decoration in the ProseMirror document, which draws the footer of the sheet above and the header of the sheet below with the page numbers. The bands are decorations, not content, so the Markdown never holds them. Breaking is done in two stages. The first build breaks only between blocks, pulling a block that would cross a page onto the next unless it is taller than a page. The second, a later milestone, breaks inside a block at a line, measured with `Range.getClientRects`, keeping two lines together at each end (orphans and widows), keeping a heading with the block after it, and honouring `{{page-break}}` and the `no-break` style. The measurement runs when the browser is idle after an edit, a page at a time from the first page the edit touched, so typing is never slowed by it. Print and PDF use the same break positions (decision 8), so what the view shows is what prints, to the line, because both are laid out by the same engine at the same width with the same fonts.

7. **Headers, footers and page numbers are front matter** (2026-11-03). The front matter's `header` and `footer` lines give the text of each, with `{page}`, `{pages}`, `{title}`, `{author}` and `{date}` filled in, and `header-first: none` leaves the first page's header out, as a title page wants. Each may be one text or a mapping of `left`, `center` and `right`. Markdown inside them is drawn, so a footer can hold a link or a styled word. Document, Header and Footer… edits them. The site's base stylesheet draws them in `--doc-muted`; a theme or a document restyles them as `.doc-header` and `.doc-footer`.

8. **Print, PDF, HTML and Word, in the browser** (2026-11-03). Print draws the sheets the view measured, each as one page of exactly the page size with `break-after: page` and `@page { margin: 0 }`, so the browser's print engine has nothing of its own to decide and the PDF the reader saves from the print dialog is the view, with selectable text. Download as HTML writes one self-contained page as Slides does, with PUDL's stylesheet, the document's three style layers and the pictures inlined. Download as Word builds a `.docx` with the `docx` library (MIT, vendored under `apps/md-editor/vendor` beside the others) from the page view's structure, as the PowerPoint export is built from a deck's: headings, paragraphs and runs with their marks, lists with levels, tables, pictures with captions, footnotes, page breaks, the page size and margins, the headers and footers with page number fields, and a table of contents field for `{{toc}}`. A custom style goes into Word by sampling: the kit draws one element with the class, reads its computed font, size, colour, alignment and spacing, and writes those as a named Word style, so the document's styles appear in Word's style gallery under their own names. A shortcode Word has no shape for becomes its text. Import reads a `.docx` with mammoth (BSD-2) into HTML and through the page view's paste path into Markdown, keeping its pictures in the browser's database (DESIGN.md, decision 14). Pasting from Word or Google Docs goes the same way, with the kit mapping their markup (`mso-` classes, `b` and `i`, font tags) to marks and styles before the page view reads it.

9. **Tables get a menu and keep GFM's limits** (2026-11-03). The Table menu, in the menu bar while the cursor is in a table and in the right-click menu, offers rows and columns added before or after and deleted, a column's alignment, a row or column moved, a header row toggled and the table converted to text. GFM tables have one header row, no merged cells and one line of text per cell, and a document stays inside that, because a table outside it is HTML in the file and no longer readable as text. Such a table is still drawn, as a source block, as today. A caption for a table is `{{caption}}` on the line after it (decision 3), as it is for a figure.

10. **Footnotes, captions and cross-references** (2026-11-03). The engine turns on goldmark's footnote extension, so `[^1]` and `[^1]: …` are footnotes, which the page view edits as an inline reference opening its text in a popover and writes back as the definition at the end of the document; print draws them at the foot of the page their reference is on, and Word gets real footnotes. Figures and tables are numbered by CSS counters in the base stylesheet, `Figure 1` and `Table 1`, which a theme may restyle or turn off. `{{ref:name}}` draws the number of the figure, table or heading that `{{anchor:name}}` marks, as a link to it; the engine counts them in document order when it draws the whole document, which it already does. These are a later milestone (see the order of work).

11. **Review marks are CriticMarkup** (2026-11-03). Word's comments and tracked changes, and Google Docs' suggestions, are the first Word feature people ask for when a document goes to someone else. The convention chosen is CriticMarkup (`{++added++}`, `{--removed--}`, `{~~old~>new~~}`, `{>>a comment<<}` and `{==highlighted==}`), which stays readable as text, which Pandoc and several editors already read, and which fits the engine as a goldmark extension and the page view as marks and an inline atom. The page view draws insertions and deletions in the state colours, a comment as a margin note on wide pages and a popover on narrow ones, and Review, Accept and Reject resolve each. Until accounts arrive there is no second person to sign a comment, so a comment is signed with the front matter's `author`. This is the last milestone; it is designed now so that nothing earlier closes the door on it.

12. **A custom shortcode is a macro over Markdown, and so it can do nothing Markdown cannot** (2026-11-03). Paul asked for custom shortcodes if they can be made safe. They can, by making them text substitution before parsing and nothing else. `{{define:name}}` … `{{/define}}` declares one, in the document or in a Markdown file of definitions that the front matter's `shortcodes` line points at (`~/shortcodes/mine.md`, or a stock library of the site's), and a theme may bring a library of its own. The body is Markdown. In it, `{{param:title default="…" help="…"}}` lines declare the parameters, in order, which the Editor shows as the shortcode's form and hover help exactly as a built-in's; `{{arg:title}}` is replaced by the argument's value as literal text, with Markdown's punctuation escaped, so an argument can never open a shortcode, a tag or a link; and `{{content}}`, at most once, is replaced by the body the author wrote between `{{name}}` and `{{/name}}`, which is their own Markdown. The engine expands a use into Markdown, then parses the result with the same parser, renderer and HTML cleaner as everything else. A custom shortcode may use the built-ins and other custom ones; expansion stops at a depth of eight, refuses a definition that uses itself, and refuses an expansion past 256 KB, so a definition cannot be made to run away. A name must be `[a-z][a-z0-9-]*` and may not be a built-in's; a use of an undefined name is drawn as the engine draws any shortcode it cannot read, marked, with the reason. In the page view a custom container (one whose template has `{{content}}`) is a box with a rich body, like a notice, and a custom block or span one is a form or a mark, as decision 3 and 4 of docs/page-view-design.md already provide; the definition block itself is hidden, as `{{style}}` is, and reached through Document, Shortcodes…, which lists the document's definitions and opens one in the text. Nothing here runs code of the author's or anyone else's, so the engine stays what decision 11 of DESIGN.md promised, a thing that turns the person's text into HTML in their own browser.

13. **The page view is a word processor in its keys and its chrome** (2026-11-03). Ctrl+U underlines, Ctrl+Shift+H highlights, Tab and Shift+Tab indent and outdent a list item, typing `- `, `1. ` or `# ` at the start of a line makes a list or a heading, Enter at the end of a heading starts a paragraph, Ctrl+Enter inserts a page break, Ctrl+Shift+F opens the styles pane and Ctrl+Alt+O the outline. An Outline tab joins Files in the explorer pane, listing the headings as a tree that a click goes to and dragging reorders, which moves the sections' text. The status bar shows the page and the page count in Document view, and the words, characters and reading time in every view, for the selection when there is one. Browser spellcheck is on in the page view, as it is in any editable text. An autocorrect setting, off unless chosen, turns straight quotes, dashes and ellipses into their typographic characters as they are typed, writing those characters into the Markdown, so what the page shows is what the file holds; the engine never changes quotes at render time, because the page view writes back what it shows.

14. **Code editing stays as it is, and a language server is a design of its own** (2026-11-03). The Editor keeps CodeMirror for code, with its colouring, and nothing in this design takes anything from it; a `.docs.md` file is still Markdown in Text view, with the shortcode completion and hover help the Text view has. A CSS mode is added to the vendored bundle for the stylesheet pane. The Editor has no language server today, only JSON linting. A language server needs a process, on the engine or in the browser as WebAssembly, and one on the engine would have to see the document's text, which decision 11 of DESIGN.md keeps in the browser; so a language server depends on accounts and a home on the server, and is to be designed then, not here. The exception is a language service that compiles to the browser, as D2's does: D2 files get completions in the Editor from `d2lsp` running in the page (`docs/diagrams-design.md`).

15. **Every command is an action** (2026-11-03). The Editor's `actions.json` grows to cover the new command table under the provider `yavc.editor`, as docs/agents-design.md requires: `format`, `style`, `table` (one action with an operation), `insert`, `page-setup`, `header-footer`, `typography`, `outline`, `word-count`, `define` (the shortcodes of a document, read), `export` (which returns the file as an artifact, Word, HTML or Markdown) and `import`. An export returns file content, so it declares `files.read` (docs/review.md).

16. **Diagrams are embedded by reference and drawn as images** (2026-11-03, Paul asked for a Diagrams application whose diagrams embed in the Editor and Slides, and for the Editor's design to keep that in mind). The shortcode `{{diagram:path}}` draws a D2 or Mermaid file where it stands, and fenced `d2` and `mermaid` blocks draw the same way, through a renderer shared with Slides and Diagrams (`docs/diagrams-design.md`, decisions 9 and 10). In a document a diagram is a figure: it takes the figure numbering and the `{{caption}}` that follows it, it stays on one page, and in Document view it takes its height from the size cached when it was last drawn, so that pagination (decision 6) does not wait for the drawing and corrects itself when the size is measured. The Word export and the PDF place a drawn diagram as a picture, and the HTML export inlines its SVG as an image (decision 8). A custom shortcode (decision 12) may wrap `{{diagram}}`. The Text view colours D2 and Mermaid, as files and inside fenced blocks.

17. **`docs.yavc.app` is the Editor started for documents** (2026-11-03, Paul created the address and asked whether it should simply show the Editor). It serves the Editor, which the engine maps from the address as it maps `editor.yavc.app`, but it starts the way a word processor does: File, New makes a `.docs.md` file, a Markdown file opens in Document view once that view exists (until then, Visual), and the window's title and the page's are "Docs". It stays one application with one command table, so nothing is maintained twice. Its files are its own until accounts arrive, as every address's are (DESIGN.md, decision 11), which is the one cost of a second address and is the same at `editor.yavc.app`. Until the engine maps it, the address leads to the desktop, as an address with no application does.

18. **One export path for documents, decks and diagrams** (2026-11-03, Paul asked for Editor documents to export to PDF and Word, for diagrams to export, and for decks to export to Word; designed, not yet built). The Word, HTML and PDF exports of decision 8 are written once, in the editing kit, and every application uses them. The Word export takes a run of blocks as the page view has them and writes them with the `docx` library: headings, paragraphs and their marks, lists, tables, pictures, captions, footnotes and page breaks, with a drawn diagram placed as a picture at twice its size. The Editor gives it the document with its page settings. Slides gives it the deck as a handout (docs/slides-design.md, decision 18). Diagrams gives it one diagram. A document's PDF is the print of Document view's sheets, which keeps its text as text and is exact to the line, because both are laid out by the same engine; a PDF made by drawing each page as a picture, as Slides does for decks, is the fallback only where print cannot serve, since its text cannot be selected. Every export first takes out what is marked not for export (decision 19), through one function, so no export can forget to.

19. **`{{no-export}}` keeps words out of every export** (2026-11-03, Paul asked for a shortcode that wraps text and marks it as not exportable; designed, not yet built). It wraps words in a line, `{{no-export}}these words{{/no-export}}`, or blocks on lines of their own, as `{{class}}` does. The engine draws it with `data-export="omit"`, and the one function every export calls removes each element so marked, so it leaves the Word file, the PDF, the HTML export, the PowerPoint file, a printed page, a page the site publishes and the Markdown a document is copied out as. While the person edits, the words show, marked as not exported: a dashed edge and PUDL's eye-off glyph on a box, and a dashed underline on words in a line, with "Not exported" as their tooltip and accessible name. A note to self (`{{draft-note}}`) is omitted from every export by the same rule. In Slides the show is treated as an export, since the audience sees it, so marked words are left off the slide and shown in the presenter view. The words are still in the file itself, so a person who shares the `.md` file shares them, and the help page says so plainly.

## What a document looks like

```markdown
---
title: A report
author: Paul Parks
date: 2026-11-03
theme: report
page: a4
margins: 25mm 20mm
header: { left: "{title}", right: "{date}" }
footer: { center: "Page {page} of {pages}" }
header-first: none
stylesheet: ~/themes/parks.css
shortcodes: ~/shortcodes/reports.md
---

{{style}}
.callout { border-left: 3px solid var(--doc-accent); padding-left: 0.6em; }
h1 { page-break-before: always; }
{{/style}}

{{define:decision}}
{{param:number help="The decision's number"}}
{{param:date help="When it was taken"}}
{{class:decision}}
**Decision {{arg:number}}** ({{arg:date}})

{{content}}
{{/class}}
{{/define}}

{{class:center}}
# A report
{{/class}}

{{decision:number=1 date=2026-11-03}}
The suffix is `.docs.md`, and the Editor opens it in Document view.
{{/decision}}

A sentence with a footnote[^1] and <u>underlined</u> words, {{mark}}highlighted{{/mark}} words and H{{sub}}2{{/sub}}O.

{{figure:~/Pictures/chart.png alt="Sales by quarter" width=80%}}

{{caption}}
Sales by quarter, 2026.
{{/caption}}

See {{ref:sales}} on the next page.

{{page-break}}

[^1]: The footnote's text.
```

The front matter's keys, all optional, are these.

| Key | What it sets |
|---|---|
| `title`, `author`, `subject`, `keywords`, `lang`, `date` | The stock properties the Properties dialog already edits; `lang` also sets hyphenation and spellcheck |
| `theme` | A stock stylesheet of the site: `plain`, `manuscript`, `report`, `letter` |
| `stylesheet` | A CSS file of the person's, shared across documents |
| `shortcodes` | A Markdown file of `{{define}}` blocks, shared across documents |
| `page`, `orientation`, `margins` | The sheet: `a4`, `letter`, `legal` or `210mm×297mm`; `portrait` or `landscape`; one to four CSS lengths |
| `header`, `footer`, `header-first`, `footer-first` | The running text, as one text or `left`, `center` and `right`, with `{page}`, `{pages}`, `{title}`, `{author}` and `{date}` |
| `font`, `heading-font`, `size`, `spacing` | The typography tokens, which Typography… writes |
| `columns` | The number of text columns on every page, 1 to 3 |
| `numbering` | `headings` numbers the headings 1, 1.1, 1.1.1 by CSS counters; `figures` and `tables` number those |

## The stylesheet's reach

Everything the page draws is reachable from a document's CSS, as it is from a deck's. The tokens of decision 4 come first, then the elements as Markdown draws them, then the parts the kit adds: `.doc-sheet` (one page), `.doc-header` and `.doc-footer`, `.doc-columns`, `figure` and `figcaption`, `.footnotes`, `.sc-*` for the shortcodes, and the review marks `ins`, `del` and `.critic-comment`. A page of the site, `/docs-styles`, says the same for a reader, as `/slides-styles` does for decks, and the two stock libraries, themes and shortcodes, are documented there with their source.

## Safety

A document is the person's own, in their own browser, so the main threat is a document someone else made, opened here, or later a page published from one. Everything that reaches the page goes through the HTML cleaner (`apps/md-engine/safe-html.js`), which drops scripts, frames, forms and `<style>` elements, keeps only the web's schemes and a picture's data address, and keeps only the style properties that change how an element looks. The additions here keep to that line. A document's CSS is scoped, contained and stripped of loads (decision 5). A custom shortcode is substitution before parsing with its arguments escaped, bounded in depth and size (decision 12). A shared stylesheet or shortcode file is read from the home folder or the site, never from another host, through the same path rule the `code` shortcode uses. The Word import is HTML through the cleaner, and the Word export writes a file from the document's structure, so nothing in a document can put anything into the `.docx` that the structure does not say. A shared definition or style file changes what a document shows; a note at the top of Document, Shortcodes… and Document, Stylesheet… says which file is in use, so a person can see where what they are looking at came from.

## What is left out, and why

Dragging boxes to a point on the page, text boxes and floating shapes have no readable form in Markdown and are left out, as in Slides; a picture floats left or right by a style. Merged table cells and multi-line cells are outside GFM and are left out, with HTML tables still drawn as source blocks. Direct font, size and colour controls on words beyond the six state colours are left out in favour of styles (decision 3). Macros that run code are left out for good (decision 12). Equations are not in this design; KaTeX, vendored and drawn in the browser as Mermaid is, is the likely shape when they are wanted, with `$…$` and `$$…$$` as the text form. Collaboration, with several people in one document, needs accounts. A language server is decision 14's.

## Order of work

1. **The kit's depth, for every Markdown file.** The document stylesheet applied in the Editor, scoped and contained, with Slides moved onto the shared implementation (decisions 4 and 5); the span and block shortcodes of decision 3 with their marks and forms; the base stylesheet's tokens and stock classes; quotes as rich blocks, since today they are edited as source; the Table menu; list indenting and the input rules; the styles pane and the stylesheet pane with the CSS mode; the Outline tab; word counts in the status bar.
2. **Documents.** The `.docs.md` suffix in Files and the Editor, Document view with sheets broken between blocks, the front matter's page, header and footer keys with their dialogs, Typography…, the four stock themes, print from the sheets, the help page and `/docs-styles`, a sample document in `~/Howto` and templates under `~/Templates` and File, New from Template.
3. **Custom shortcodes.** `{{define}}`, `{{param}}`, `{{arg}}` and `{{content}}` in the engine with its limits and tests, the shared definitions file, the forms and Insert entries built from the declarations, and Document, Shortcodes….
4. **Export and import.** Word out and in, HTML out, pasting from Word and Google Docs, drawn diagrams placed as pictures in each export (decision 16), and the Editor's actions manifest brought up to the command table.
5. **Pages to the line.** Breaks inside blocks, orphans and widows, keep-with-next, `{{page-break}}` and `no-break`, footnotes drawn at the foot of their page, and page columns. A diagram's height is known only once it is drawn, so this milestone follows the Diagrams renderer (`docs/diagrams-design.md`, milestone D2).
6. **Scholarly and review.** Footnotes in the page view, numbered captions and `{{ref}}`, heading numbering, and CriticMarkup review marks with Accept and Reject.

Each milestone ends with the checks in `scripts/check.sh`, the engine's round-trip tests holding an untouched block to byte-for-byte output (docs/page-view-design.md), a new rule or test for anything that broke on the way, and a note in docs/review.md.

## Progress

Milestone 1 is being built in two pull requests, and the first holds everything that does not touch how a document's CSS is contained.

The first pull request (2026-11-03) added these.

- The shortcodes `mark`, `sup`, `sub`, `page-break` and `caption`, with page view marks for the first three, tested to write back byte for byte and fuzzed
- Underline (Ctrl+U), Highlight (Ctrl+Shift+H), Superscript and Subscript in the Format menu and keys of the Editor and Slides, working on the page and in the Markdown text, with CodeMirror's own Ctrl+U removed so that it cannot shadow Underline
- A Table menu under Insert and Format and in the right-click menu, with Insert Table everywhere and the row and column commands only while the cursor is in a table
- The page's tokens (`--doc-font`, `--doc-font-heading`, `--doc-size`, `--doc-leading`, `--doc-ink`, `--doc-muted`, `--doc-accent`, `--doc-rule` and `--doc-page`), with the existing `--dinah-*` tokens mapped onto them
- The stock classes `center`, `right`, `justify`, `indent`, `small`, `lead` and `no-break`, listed by Format, Style
- A word count with the reading time in the Editor's status bar, which also counts the selection
- A rule in `scripts/check.mjs` that reads the kit's FORMATS table for glyphs nobody defined

The rest of milestone 1 waits for the following reasons.

- Quotes as rich blocks wait because a quote's lazy continuation lines make byte-for-byte writing back the hard part, so they go with their own round-trip tests and a second reader.
- The shared and contained application of a document's `{{style}}` CSS in the Editor, with Slides moved onto it (decisions 4 and 5), waits because containment is where a mistake looks fine in testing and leaves a hole.
- The styles and stylesheet panes with a CSS mode wait for a rebuild of the CodeMirror bundle, and the Outline tab waits with them.
- Table column alignment waits because the engine cannot yet represent it: the page view treats a table with any alignment as source, so supporting it means reading and writing GFM's alignment row in `internal/pageview` as well as a cell attribute in the page.

## Open questions

1. **Autosave.** Documents keep explicit Save with the snapshot across a reload, as the Editor and Slides do. Word and Google Docs autosave. A setting that saves a document a few seconds after each change is cheap; whether it should be on by default for `.docs.md` is Paul's call.
2. **A comment's signature before accounts.** Decision 11 signs a comment with the front matter's `author`. If a document goes between two people before accounts exist, both comments will say the same author unless each changes the line. A `reviewer` setting in `~/.config/editor.json` would do until then.
3. **The stock themes' look.** Four themes are proposed by name. Their actual typography is design work to do with Paul when milestone 2 starts, and the base stylesheet's defaults (the `plain` theme) are the Editor's page as it is today.
