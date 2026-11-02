# Slides: a deck application driven by Markdown

Status: designed and prototyped on 2026-11-02 and 2026-11-03. Decisions taken under the design authority Paul delegated; each is marked, and he can overturn any of them.

Slides is yavc.app's first application written for the site rather than brought in. A deck is one Markdown file in the reader's home folder, and Slides edits it slide by slide, presents it full screen with speaker notes in a presenter window, and exports it as a page that presents itself anywhere. The aim Paul set is as much of what Google Slides and PowerPoint do as a Markdown document can carry; what they do by dragging boxes on a canvas, Slides does with layouts, so a deck stays a text file the Editor, the Terminal and git can read.

## Decisions

1. **A deck is a Markdown file** named `something.slides.md`. Markdown is the source of truth and nothing is kept beside it: no JSON, no layout coordinates. The same engine that draws the Editor's preview draws a slide, so everything a page can show, a slide can show, shortcodes and embedded applets included. A deck opens in the Editor as any Markdown file does, and the Editor offers Present for it.
2. **Slides are separated by `---`** on a line of its own, as Marp, reveal.js and Pandoc separate them, so a deck written elsewhere reads here and the other way round. The front matter at the top of the file is not a slide.
3. **A slide's settings are a shortcode** on its first line, `{{slide:layout=title background=#1b2a41 reveal=steps}}`, and speaker notes are a container, `{{notes}} … {{/notes}}`, anywhere in the slide. Both are in the Markdown engine (`internal/shortcodes`): on an ordinary page the settings render as nothing and the notes as an aside labelled "Speaker notes", and the Editor's Visual view keeps both as source blocks. The front matter gives the deck's own settings: `title`, `author`, `theme`, `size` and `transition`.
4. **Layouts stand in for the canvas.** A slide takes one of a small set of layouts, and its Markdown flows into the layout's regions in order: `title`, `section`, `content` (the default), `two-column` (the Markdown's `{{columns}}`), `image` (a figure fills the slide, with the heading over it), `quote` and `blank`. Dragging a text box to a pixel is the one thing from PowerPoint that is left out, on purpose: it is what makes a deck unreadable as text.
5. **A slide is a fixed canvas, scaled.** The canvas is 1280 by 720 logical pixels for 16:9 (960 by 720 for 4:3), drawn once and scaled with a CSS transform to whatever room it has, in the filmstrip, in the editing view, in the window and full screen, so a slide looks the same at every size and nothing reflows.
6. **Themes are PUDL's tokens plus a palette.** The `plain` theme follows the site's own theme, skin and colours, so a deck looks like the desktop it is shown on. `paper` and `midnight` set a light and a dark palette of their own, in the same token names, so every theme draws the same components. A theme never changes a layout. A theme remaps the page's own tokens; a PUDL component inside a slide, such as a notice or a badge, keeps the site's colours, so a dark deck on a light desktop shows light notices, which is accepted for now.
7. **Presenting is in the browser's full screen**, from the window or from `slides.yavc.app`, with the keys every deck tool uses: arrows, space, Page Up and Down, Home and End, a number then Enter, and Escape to leave. A presenter view opens as a second browser window and follows through a BroadcastChannel: the current slide, the next, the notes, a clock and a timer. Both can drive.
8. **Export is a page.** Download as HTML writes one file holding the rendered slides, PUDL's stylesheet with its fonts' addresses made absolute, the deck's styles and the presenting script, which presents itself in any browser without yavc.app, apart from the fonts, which it fetches from the site and falls back from. A diagram still being drawn when the file is written is exported as its source, and an applet in a slide as what it had drawn. Print writes one slide per page through a print stylesheet, which is how the deck becomes a PDF.
9. **The file stays in the browser** with the reader's other files (DESIGN.md, decision 11). Slides saves explicitly and keeps unsaved changes in a snapshot across a reload, as the Editor does.
10. **The canvas docks where the person puts it** (2026-11-03, Paul). In Split the slide's canvas sits beside the Markdown on the left, the right, the top or the bottom, through PUDL's splitter, or floats over the Markdown as a panel the person drags by its bar and resizes by its corner, where it stays. Paul's framing was that the preview floats, with the Markdown as the main area, which is why the canvas and not the editor is the thing that moves. The choice is kept with the applet's settings and is the `dock` field of `yavc.slides/view@1`. Direct editing of a slide on its canvas stays as it is; Paul may take it further towards WYSIWYG later.
11. **Every command is an action** (2026-11-03). Slides publishes `actions.json` under the provider `yavc.slides`, with pure actions to parse and make a deck and live actions for everything the open deck does, as `docs/agents-design.md` asks of every application.
13. **Decks open in tabs** (2026-11-03, Paul). Slides keeps a tab for each open deck, drawn by the site's document tabs (`static/doc-tabs.js`, which the Editor uses too) and shown only while more than one deck is open. A deck opened by its path comes to the front if it is already open; a new deck nobody has touched is replaced by the next deck opened rather than kept beside it. Closing a deck with unsaved changes asks first. Every tab survives a reload through the snapshot. The reason is the standalone page at slides.yavc.app, which has no windows, so a second deck would otherwise mean a second browser tab.
14. **PowerPoint and PDF, in the browser** (2026-11-03, Paul). A deck downloads as a PowerPoint file and as a PDF, and a PowerPoint file imports as a deck, all in the browser, since the file is there (decision 9). The PowerPoint export is structural: each slide is read back from what the Markdown engine drew, as headings, paragraphs, lists with levels, code, quotes, tables, pictures, videos and columns, and laid out in the layout's regions with PptxGenJS, so the result is editable in PowerPoint rather than a picture of each slide; a shortcode PowerPoint has no shape for becomes its text. The PDF is the opposite trade: each slide is drawn as the show draws it and rasterised at twice its size into a page with pdf-lib, so diagrams, applets and every shortcode look as they do here, and the text is a picture; Print stays as the route to a PDF with selectable text. The import reads the Office Open XML with JSZip: title placeholders become headings, bodies become paragraphs and lists with their levels and emphasis, tables become tables, two bodies side by side become columns, the notes page becomes {{notes}}, and the first slide becomes the title slide. A picture in an imported file is noted by its name and not kept, because a deck is a text file and the home folder keeps text (DESIGN.md, decision 11); when a home on the server arrives, pictures come with it. The three libraries sit under `apps/slides/vendor` with their licences, all MIT.
12. **Hosted videos are free; videos of your own are premium** (2026-11-03, Paul). A slide embeds a video by its link, YouTube or Vimeo, through the `video` shortcode, which Insert asks for; the services play them, YouTube in its privacy-enhanced mode and Vimeo with do-not-track, and the file holds a link. A video uploaded to yavc.app and played from it is a premium feature for later, when accounts and a home on the server exist (DESIGN.md, decision 11), since it needs storage and bandwidth the site would pay for.

## What the prototype has

| Area | In the prototype |
|---|---|
| Editing | A filmstrip of every slide, the current slide on the canvas, its Markdown in a pane beside it that redraws the slide as you type, and the notes under that. New slide (with a layout), Duplicate, Delete, Move up and down. Open, Save, Save As, New deck, Edit the whole deck in the Editor. |
| Slide settings | Layout, background colour, background picture, reveal steps, and a transition, from the Slide menu, written into the slide's `{{slide}}` line. |
| Deck settings | Title, author, theme, size and transition, from the Deck menu, written into the front matter. |
| Content | Everything the Markdown engine draws: headings, lists, tables, code, Mermaid diagrams, pictures, the notices, columns, figures, videos, status labels, keys, glyphs, and an applet running in the slide. |
| Presenting | Full screen from the window or the standalone page, slide transitions, step-by-step reveal of list items, a progress bar, the slide number, and a presenter window with notes, the next slide, a clock and a timer. |
| Export | Download as HTML, and Print to PDF. |

## What waits

Several things are left for later. Direct manipulation of boxes on the canvas is ruled out by decision 4, though Paul has said that fuller WYSIWYG editing of a slide may be tried later on. Pictures pasted into a deck need the file service to hold them, and the home folder to hold more than text. The filmstrip does not yet reorder slides by dragging, there is no thumbnail picker of layouts, and there is no autoplay with timings. Collaboration needs accounts.

## The deck format

```markdown
---
title: A deck
author: Paul Parks
theme: midnight
size: 16:9
transition: fade
---

{{slide:layout=title}}
# A deck
## Its subtitle

---

{{slide:reveal=steps}}
## Three points

- The first appears first
- The second next
- The third last

{{notes}}
Say why these three.
{{/notes}}

---

{{slide:layout=two-column background=#1b2a41}}
## Side by side

{{columns}}
Left.

{{column}}

Right.
{{/columns}}
```

The front matter's keys are `title`, `author`, `theme` (`plain`, `paper`, `midnight`), `size` (`16:9`, `4:3`) and `transition` (`none`, `fade`, `slide`). A slide's settings are `layout`, `background` (a colour), `image` (a picture's address, drawn behind the slide), `reveal` (`steps` shows each top-level list item in turn), `transition`, `class` (a class of the host's own for its styles).

## The package

`apps/slides/` is a site-owned applet package: `slides.js` (the applet), `present.js` (presenting, which the export also embeds), `slides.css` (the canvas, the layouts, the themes, the filmstrip and the print rules), `page.html` and `applet.json`. It wants `fs`, `snapshot` and `config` from the host. It serves the request `present` with `file`, which the Editor asks for from its Present command, and it opens a deck itself through the host's Open dialog. Its state is `file=` and `slide=`, so a window and a link reopen the deck at a slide.

The Markdown engine moved to `apps/md-engine/`, a shared folder beside the packages that the Editor and Slides both load (`loader.js`, `yavc-md.wasm`, `wasm_exec.js`), as a collection's shared folder is served.
