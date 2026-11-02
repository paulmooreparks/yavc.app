# Slides

Slides makes a slide deck out of a Markdown file. The file is the deck: there is no other document, no layout data kept beside it, and anything that can open a text file can read it. This guide goes through the file, the editor, presenting, colours and styles, the exports and the agent actions. `Howto/Slides.slides.md` is a short version of it as a deck.

## The file

A deck is a file named `something.slides.md`. It starts with front matter between two lines of three dashes, and then holds slides divided by a line of three dashes:

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

The front matter's keys are `title`, `author`, `theme` (`plain`, which follows the site's own look, `paper` or `midnight`), `size` (`16:9` or `4:3`), `transition` (`none`, `fade` or `slide`), the colour overrides `ink`, `heading`, `muted`, `accent` and `background`, and `stylesheet`, a CSS file of yours.

A slide's first line may be `{{slide:…}}` with its settings: `layout`, `background` (a colour), `image` (a picture's address, drawn behind the slide), `color` and `heading` and `accent` (this slide's colours), `reveal=steps` (its top-level points appear one by one), `transition`, and `class` (classes from the stylesheet). `{{notes}}` … `{{/notes}}` anywhere in a slide is for the speaker and is never shown on the slide.

Everything else is Markdown as the Editor draws it, shortcodes included: pictures (`{{figure:…}}`), columns, tips and notes, tables, code, Mermaid diagrams, a hosted video (`{{video:https://youtu.be/…}}`), an applet (`{{applet:dice}}`), keys and status labels.

![Slides in Split view](/static/shots/slides.jpg)

## Editing

Slides opens with the deck's slides down the left (the filmstrip) and the current slide on its canvas. Three views, under View:

- **Visual** edits the slide on its canvas. Type, select, format; headings, lists, pictures and the rest are drawn as they will show. A block the canvas cannot draw as rich text, such as a column set, is edited as its Markdown in place.
- **Text** edits the slide's Markdown.
- **Split** shows both. View, Canvas puts the canvas left, right, above or below the Markdown, or lets it float over the Markdown as a panel you drag by its bar and resize by its corner.

The formatting commands under Format, and on the toolbar, work in either view: Bold, Italic, Strike Through, Code, Link, Text Colour, Style, lists, and Paragraph Style, which is Paragraph or Heading 1 to 4 (Ctrl+0 to Ctrl+4). On an empty line, typing `/` opens a menu of everything Insert offers; typing narrows it.

Insert, Picture opens a dialog for a picture: its address, with Browse for one in your home folder or on the site and Upload for one from your computer, what it shows, its largest width and a caption. An uploaded picture goes beside the deck when the deck is saved under `~`, else into `~/Pictures`. On the canvas, a click on a picture opens the same dialog to change it or remove it.

Between slides: Page Up and Page Down, or the filmstrip, or Slide, Previous Slide and Next Slide. Slides are added, duplicated, deleted and moved from the Slide menu and the toolbar.

Open decks sit in tabs across the top once there is more than one. Save is Ctrl+S; a new deck asks where to go, starting in `~/Documents`. Unsaved changes survive a reload.

## Right-click

A right-click on a slide in the filmstrip gives the Slide menu for that slide; on the canvas or the Markdown, Format with the slide's layout and colours after it; on a tab, Close and Close the Others. Shift+F10 and the Menu key open the same menus from the keyboard.

## Presenting

Show, Present from the Start (Ctrl+Enter) presents full screen from the first slide, Present from This Slide (Ctrl+Shift+Enter) from the current one. In the show, the arrow keys, Space, Page Up and Down, Home and End move; a number followed by Enter jumps to that slide; Escape leaves. A slide marked `reveal=steps` shows its points one by one.

Presenter Window opens a second browser window with the current slide, the next, the notes, a clock and a timer.

![The presenter window](/static/shots/slides-presenter.jpg) Both windows follow each other, and either drives. Show, Presenter Window on Present opens it whenever a show starts. The window opens on the same address as the show, which matters because your files live per address.

## Colours

Colours come in three layers, each with presets and any colour you type or pick:

- **Deck, Colours** sets the deck's text, headings, secondary text (a title slide's subtitle, captions, the notes), accent (the rule under a heading, links, words coloured `accent`) and background, over the theme's. Each field says what it reaches, and an empty field means the theme's own.
- **Slide, Slide Colours** does the same for the current slide.
- **Format, Text Colour** colours the selected words: one of the site's six colours as swatches, or any CSS colour. The words become `{{color:…}}…{{/color}}` in the Markdown and stay editable as rich text on the canvas.

![The Text Colour dialog](/static/shots/slides-colours.jpg)

## Styles

For everything the colour dialogs do not reach, a deck carries its own CSS:

- `{{style}}` … `{{/style}}` anywhere in the deck holds CSS for every slide; `{{style:slide}}` for the slide it is in. Deck, Add a Style Block starts one.
- `stylesheet: ~/themes/mine.css` in the front matter (Deck, Stylesheet File) uses a CSS file of yours, shared across decks.

The CSS is scoped to the deck's slides and weighs as much as the theme's own rules, so `h2 { … }` restyles headings outright. A class the CSS defines is applied to words with Format, Style (which lists the classes), to blocks with `{{class:name}}` on lines of their own around them, and to a slide with Slide, Slide Style. Help, Styling a Deck lists every token, element and layout a deck can reach.

## Out, and in

- **Download as PowerPoint** writes a .pptx with real title and body placeholders, so PowerPoint can edit it: headings, text, lists, code, quotes, tables, pictures, notes and columns carry; a stylesheet does not.
- **Download as PDF** writes one page a slide, each drawn as the show shows it, diagrams and styles included.
- **Download as a Page** writes one HTML file holding the deck and the presenting script, which presents itself in any browser.
- **Print** goes through the browser's print dialog, one slide a page.
- **Import from PowerPoint** reads a .pptx into a new deck: titles, text with its levels and emphasis, tables, two bodies as columns, notes, video links. Pictures are noted by name and not kept, since a deck is a text file.

## Agents

Every command above is an action an AI agent can call through the site's MCP endpoint: reading the deck, going to a slide, adding, changing and colouring slides, saving, presenting, exporting, importing. You pair an agent in Settings, under Agents, with a token; it works on the page you have open, and the page asks you before it does more than you allowed. Help, For agents has the details.

## Where the file lives

Your files are kept in this browser, under the address you made them at. The desktop at yavc.app and the standalone page at slides.yavc.app each keep their own. Download a deck to keep it anywhere else.
