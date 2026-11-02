---
title: How to use Slides
author: yavc.app
theme: plain
size: 16:9
transition: fade
---

{{slide:layout=title}}
# How to use Slides
## A deck is a Markdown file, and this deck is one

---

## What a deck is

- One Markdown file, named `something.slides.md`, kept in your home folder
- Slides divided by a line of three dashes
- A `{{slide}}` line at the top of a slide for its layout, colours and transition
- `{{notes}}` … `{{/notes}}` for what you will say, shown only to you
- Front matter at the top for the title, author, theme, size and transition

{{notes}}
Open this deck as its Markdown (View, Text) to see all of this in the file you are presenting.
{{/notes}}

---

{{slide:layout=image}}
## Editing

{{figure:/static/shots/slides.jpg alt="Slides in Split view: the filmstrip, the canvas and the Markdown" width=88%}}

---

## Three views

- **Visual** edits the slide on its canvas, as it will look
- **Text** edits its Markdown
- **Split** shows both; the canvas docks left, right, top or bottom of the Markdown, or floats over it (View, Canvas)
- Page Up and Page Down move between slides; the filmstrip on the left does too
- Ctrl+1 to Ctrl+4 set a heading level, Ctrl+0 a paragraph, and Ctrl+B, Ctrl+I, Ctrl+K are bold, italic and link

---

## Layouts

{{columns}}
- **Title**: a title and a subtitle, centred
- **Section**: one heading, centred
- **Content**: a heading and what follows, the usual slide
- **Two Columns**: `{{columns}}` … `{{column}}` … `{{/columns}}`

{{column}}

- **Picture**: a heading over a picture that fills the slide
- **Quote**: one quotation, large
- **Blank**: whatever you put there

Choose one from Slide, Layout, or write `{{slide:layout=quote}}`.
{{/columns}}

---

## Everything a page can show

- Pictures, columns, tips and notes, tables, code, diagrams
- A hosted video by its link: {{color:accent}}YouTube or Vimeo{{/color}}
- An applet running on the slide
- Type `/` on an empty line to insert any of them, or use Insert

{{tip:For instance}}
This is a tip, drawn on a slide exactly as it is on a page.
{{/tip}}

---

{{slide:layout=image}}
## Colours

{{figure:/static/shots/slides-colours.jpg alt="The Text Colour dialog, with the site's six colours and a picker" width=88%}}

---

## Colours and styles

- **Deck, Colours** sets the deck's text, headings, secondary text, accent and background over the theme's
- **Slide, Slide Colours** does the same for one slide
- **Format, Text Colour** colours the words you selected, from six swatches or any colour
- For everything else, a `{{style}}` block holds CSS for the deck, and **Format, Style** applies the classes it defines
- Help, Styling a Deck lists what a deck can reach

---

## Presenting

- **Present from the Start** is Ctrl+Enter; **Present from This Slide** is Ctrl+Shift+Enter
- Arrows, Space, Page Up and Down, Home and End move through the show; a number then Enter jumps; Escape leaves
- A slide with `reveal=steps` shows its points one by one
- **Presenter Window** opens a second window with the current slide, the next, your notes, a clock and a timer; Show, Presenter Window on Present opens it every time

---

## Out, and in

- **Download as PowerPoint** writes a .pptx that PowerPoint can edit
- **Download as PDF** writes one page a slide, as the show shows it
- **Download as a Page** writes one HTML file that presents itself anywhere
- **Print** goes through the browser, one slide a page
- **Import from PowerPoint** reads a .pptx into a new deck

---

## Agents

- Every command here is also an action an AI agent can call
- Pair an agent in Settings, under Agents; it works on the page you have open
- The page asks you before an agent does more than you allowed
- Help, For agents has the details

---

{{slide:layout=quote}}
> Now open this deck's Markdown and change something.

Howto/Slides.md has the longer version of all of this.
