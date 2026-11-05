# Slides Help

[Slides](/slides) makes a slide deck out of a Markdown file. The file is the whole deck, with no layout data kept beside it, so anything that can open a text file can read it. Slides runs in a window on the desktop and on its own at `slides.yavc.app`.

## The file

A deck is a file named `something.slides.md`. It starts with front matter between two lines of three dashes, and then holds slides divided by a line of three dashes.

```
---
title: A deck
author: Me
theme: plain
size: 16:9
transition: fade
---

{{slide:layout=title}}
# A deck
## Its subtitle

---

## The first point

- One
- Two

{{notes}}
What I will say here.
{{/notes}}
```

The front matter's keys are `title`, `author`, `subject`, `keywords`, `lang` and `date`; `theme`, which is `plain` (the site's own look), `paper` or `midnight`; `size`, which is `16:9` or `4:3`; `transition`, which is `none`, `fade` or `slide`; the colours `ink`, `heading`, `muted`, `accent` and `background`; and `stylesheet`, a CSS file of yours. Deck, Properties edits the title, author, subject, keywords, language and date, and any property of your own. It changes the front matter line by line and keeps everything else in it as you wrote it.

A slide's first line may be `{{slide:…}}` with the slide's settings. They are `layout`, `background` (a colour), `image` (a picture drawn behind the slide), `color`, `heading` and `accent` (the slide's own colours), `reveal=steps` (its top-level points appear one at a time), `transition`, and `class` (classes from the deck's CSS). Anything between `{{notes}}` and `{{/notes}}` is for the speaker and never shows on the slide.

Everything else is Markdown as the [Editor](/help/editor) draws it, shortcodes included, so a slide can hold pictures, columns, tips and notes, tables, code, Mermaid diagrams, a hosted video, an applet, keys and status labels.

![Slides in Split view](/static/shots/slides.jpg)

## Editing

Slides opens with the deck's slides down the left, in the filmstrip, and the current slide on its canvas. The site's View menu offers three views.

- **Visual** edits the slide on its canvas, where headings, lists, pictures and the rest are drawn as they will show. A tip, a note, a set of columns or the speaker notes is a box on the canvas, edited inside as any text is, with a bar at its top for its title, for removing it and for editing it as Markdown. A video, an applet, keys or a status label opens a form when clicked, and a block the canvas cannot draw as rich text, such as a code block, is edited as its Markdown in place.
- **Text** edits the slide's Markdown.
- **Split** shows both. View, Canvas puts the canvas to the left, right, top or bottom of the Markdown, or lets it float over the Markdown as a panel you drag by its bar and resize by its corner.

View, Show the Filmstrip hides and shows the filmstrip. The Format menu works in every view and offers Bold, Italic, Strike Through, Code, Link, Text Colour, Style, the two kinds of list, Box, and Paragraph Style, which is Paragraph or Heading 1 to 4 (Ctrl+0 to Ctrl+4). Any of these commands can be added to the toolbar. On an empty line, typing `/` opens a menu of everything Insert offers, and typing more narrows it.

View, Customize Toolbar edits the common-command row below the topbar. Add, remove or reorder commands and separators, then Apply to save or Cancel to discard the draft. Restore Defaults restores the initial choices in the form. Show the Toolbar controls visibility; Keep Visible with the Ribbon keeps the row available beside any ribbon tab.

Insert, Picture opens a dialog for a picture. It asks for the picture's address, with Browse for one in your home folder or on the site and Upload for one from your computer, and for what it shows, its largest width and a caption. An uploaded picture goes beside the deck when the deck is saved under `~`, and into `~/Pictures` otherwise. On the canvas, a click on a picture opens the same dialog to change it or remove it.

Page Up and Page Down move between slides, and so do the filmstrip and Slide, Previous Slide and Next Slide. The Slide menu adds, duplicates, deletes and moves slides, and sets the slide's layout (Content, Title, Section, Two Columns, Picture, Quote or Blank), its colours, its style, a background picture and its transition. The toolbar starts with common slide commands and can include the others. Reveal Points One by One marks the slide `reveal=steps`.

Open decks sit in tabs across the top once there is more than one. File, New Deck starts a deck, and Save is Ctrl+S; a new deck asks where to go, starting in `~/Documents`. Unsaved changes survive a reload. File, Edit the Whole Deck in the Editor opens the file itself in the Editor.

A right-click on a slide in the filmstrip gives the Slide menu for that slide. On the canvas or the Markdown it gives Format, with the slide's layout and colours after it, and on a tab it gives Close and Close the Others. Shift+F10 and the Menu key open the same menus from the keyboard.

## Presenting

Show, Present from the Start (Ctrl+Enter) presents full screen from the first slide, and Present from This Slide (Ctrl+Shift+Enter) presents from the current one. In the show the arrow keys, Space, Page Up, Page Down, Home and End move through the slides, a number followed by Enter jumps to that slide, and Escape leaves.

Show, Presenter Window opens a second browser window with the current slide, the next one, the notes, a clock and a timer. The two windows follow each other, and either one drives the show. Show, Always Show Presenter Window opens it whenever a show starts. The presenter window opens on the same address as the show, which matters because your files are kept per address.

![The presenter window](/static/shots/slides-presenter.jpg)

## Colours

Colours come in three layers, and each offers presets as well as any colour you type or pick.

- Deck, Colours sets the deck's text, headings, secondary text, accent and background over the theme's own. Secondary text is a title slide's subtitle, the captions and the notes, and the accent colours the rule under a heading, links and words coloured `accent`. Each field says what it reaches, and an empty field leaves the theme's colour.
- Slide, Slide Colours does the same for the current slide.
- Format, Text Colour colours the selected words with one of the site's six colours or any CSS colour. The words become `{{color:…}}…{{/color}}` in the Markdown and stay editable as rich text on the canvas.

Deck, Theme chooses Plain, Paper or Midnight, Deck, Slide Size chooses widescreen or standard, and Deck, Transition for Every Slide sets the deck's transition.

![The Text Colour dialog](/static/shots/slides-colours.jpg)

## Styles

A deck can carry its own CSS for everything the colour dialogs do not reach.

- `{{style}}` and `{{/style}}` anywhere in the deck hold CSS for every slide, and `{{style:slide}}` holds CSS for the slide it is in. Deck, Add a Style Block starts one.
- `stylesheet: ~/themes/mine.css` in the front matter uses a CSS file of yours, shared across decks. Deck, Stylesheet File sets it.

The CSS applies only to the deck's slides and weighs as much as the theme's own rules, so `h2 { … }` restyles headings outright. Format, Style applies a class from the CSS to the selected words, `{{class:name}}` on lines of its own around some blocks applies it to them, and Slide, Slide Style applies it to the slide. [Styling a Deck](/slides-styles), which is also under Help while Slides is in front, lists every token, element and layout a deck's CSS can reach.

## Downloading and importing

- File, Download as PowerPoint writes a .pptx with real title and body placeholders, so PowerPoint can edit it. Headings, text, lists, code, quotes, tables, pictures, notes and columns carry over, and a stylesheet does not.
- File, Download as PDF writes one page for each slide, drawn as the show draws it, with diagrams and styles.
- File, Download as a Page writes one HTML file holding the deck and the presenting script, which presents itself in any browser.
- File, Print goes through the browser's print dialog, with one slide on each page.
- File, Import from PowerPoint reads a .pptx into a new deck, keeping titles, text with its levels and emphasis, tables, two bodies as columns, notes and video links. Pictures are noted by name and left out, since a deck is a text file.

## Editing styles

Deck, Edit Style Blocks opens a CSS editor for the current slide's style declarations. Ctrl+Shift+F opens it too. Choose an existing declaration or add a new block for the whole deck or just this slide. Apply Styles or Ctrl+S writes the result back to the Markdown. Format, Style lists classes from accepted CSS.

Set a local CSS file under Deck, Stylesheet File to share styles across decks, then use Deck, Edit Shared Stylesheet to edit a home-folder file. Relative paths resolve beside the saved deck. Shared CSS applies before the deck's style blocks. Thumbnails, presenting and exported HTML use the same compiled styles and slide scopes. Unsupported CSS produces a warning and remains in the source. CSS escapes, at-rules and resource-loading declarations are not supported in this release.

## Where the file lives

Your files are kept in this browser, under the address you made them at. The desktop at yavc.app and the standalone page at slides.yavc.app each keep their own, so download a deck to keep it anywhere else.

## Agents

Every command above is also an action an AI agent can call through the site's MCP endpoint, from reading the deck and going to a slide to adding, changing and colouring slides, saving, presenting, exporting and importing. You pair an agent in [Settings](/help/settings) with a token. The agent works on the page you have open, and the page asks you before it does more than you allowed. The page [For Agents](/agents) has the details.

Your home folder has a sample deck, `~/Howto/Slides.slides.md`, which you can open, change and present, and a sample document about decks, `~/Howto/Slides.md`.
