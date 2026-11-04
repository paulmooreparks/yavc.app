# The site's Markdown dialect, version 1

Status: written on 2026-11-04 from the engine as it stands, at Paul's request, so that the dialect the Editor, Slides and the site's pages share is a stated one rather than one implied by the code. When the engine and this page disagree, one of them is wrong, and `TestDialectCatalogue` in `internal/shortcodes` keeps the catalogue below in step with the engine.

The site writes its documents, decks and pages in Markdown with one addition, shortcodes written in double braces. A file in the dialect is still Markdown: any Markdown reader shows its words and structure, and shows each shortcode as the text it was written as. This page defines that addition and the two document profiles built on it.

## The base

The base is GitHub Flavored Markdown as the engine's parser, goldmark, implements it: CommonMark with tables, strikethrough, task lists and links found in plain text. A document may begin with front matter, a block of YAML between two lines of three dashes, which is read with a real YAML parser and must be a mapping of names to values with no name repeated (`internal/frontmatter`).

## Shortcodes

A shortcode is written `{{name}}` or `{{name:arguments}}`. A name is a lowercase letter followed by lowercase letters, digits and hyphens. The arguments run to the first `}}`.

The arguments are words separated by spaces or tabs. A word written `key=value` is a named argument, whose key is a letter followed by letters, digits and hyphens; any other word is a positional argument. A value in double quotes may hold spaces, and `\"` inside the quotes is a quote. Each shortcode says which arguments it reads; an argument it does not read is ignored.

Every shortcode is one of four kinds.

- An **inline** shortcode stands in a line of text, such as `{{kbd:Ctrl+C}}`.
- A **block** shortcode stands alone as its own paragraph, such as `{{toc}}`.
- A **container** shortcode opens on a line of its own, `{{name}}` or `{{name:arguments}}`, and closes on a line holding `{{/name}}`, with up to three spaces before either. The Markdown between them is its content. Containers of the same name pair by depth, as brackets do, so one may hold another.
- A **span** shortcode opens in a line of text and closes with `{{/name}}` later in the same block, such as `{{mark}}these words{{/mark}}`. Spans pair with their closers innermost first. A span left unclosed, or a closer with no span open, is shown as written.

Text that should read as a shortcode and not act as one is written with a backslash before it, `\{{kbd:Ctrl+C}}`, or inside a code span. Shortcodes are not read inside code spans or code blocks.

A shortcode the engine does not know, or one written wrongly, is drawn as the text it was written as, marked as a problem, with the reason as its title. A mistake therefore shows on the page instead of vanishing, and nothing a document says can make the engine run code or load from another host; what a shortcode may draw is limited by the site's HTML cleaner (`apps/md-engine/safe-html.js`).

## The catalogue

These are the shortcodes of version 1, in the order the Insert menu lists them. The engine also reads `colour` as `color`. Each one's arguments and an example are in the engine's table (`internal/shortcodes`), which the Editor's Insert menu and the help pages show.

| Shortcode | Kind | What it draws |
|---|---|---|
| `info` | container | A notice of information, blue, with an i. |
| `note` | container | A notice to take note of, amber, with a warning sign. |
| `tip` | container | A helpful tip, green, with a tick. |
| `warning` | container | A warning, red, with a stop sign. |
| `expand` | container | A section the reader opens and closes, with its title showing while closed. |
| `status` | inline | A small coloured status label, with a glyph so colour isn't the only sign. |
| `toc` | block | A list of the page's headings, linked, for a long page. |
| `anchor` | inline | A place in the page a link can go to, as #name. |
| `page` | inline | A link to one of the site's pages, by its slug, with text of its own or the slug. |
| `figure` | block | A picture with an optional caption, centred. |
| `applet` | block | One of the site's applications, running in the page. |
| `video` | block | A hosted video, by its link or by its service and id: YouTube (played without tracking until it is played, in its privacy-enhanced mode) or Vimeo (with do-not-track). A video of your own, uploaded to this site, is a feature to come. |
| `code` | block | A file, shown as a listing with Copy and Download, fetched as the page loads: a path on the site from /, or one of your own files under ~. |
| `color` | span | Words in a colour: one of the site's (ink, muted, accent, danger, warn, positive), or any CSS colour such as #c0392b or tomato. Markdown works inside it. |
| `class` | container | A class of the deck's or the page's stylesheet, on words in a line ({{class:name}}words{{/class}}) or around blocks on lines of their own, given as the class itself in the HTML. |
| `style` | container | CSS for a deck or a page, kept with it: in Slides it styles every slide, or with {{style:slide}} the slide it is in. It is never shown. |
| `kbd` | inline | Keys to press, each drawn as a key, joined by +. |
| `glyph` | inline | One of PUDL's glyphs, the small symbols the site's controls use. |
| `columns` | container | Content side by side, divided by {{column}} lines; the columns stack on a narrow screen. |
| `column` | block | Inside {{columns}}, starts the next column. |
| `draft-note` | container | A note while writing, shown in the editor and never on a published page. |
| `slide` | block | A slide's layout, background and reveal, on the first line of the slide in a deck. |
| `notes` | container | Notes for the presenter, shown in the presenter view and not on the slide. |
| `mark` | span | Words highlighted, as with a marker. Markdown works inside it. |
| `sup` | span | Words raised above the line, as in a footnote number or a power. Markdown works inside it. |
| `sub` | span | Words lowered below the line, as in a chemical formula. Markdown works inside it. |
| `page-break` | block | Ends the page here: what follows starts on a new page when the document is printed or shown as pages. |
| `caption` | container | The words under a figure or a table, on lines of their own after it. A document may number them. |

## The profiles

Two kinds of file add rules of their own on top of the dialect. A file of either kind is still a file in the dialect, and any other part of the site reads it as one.

**A deck**, `something.slides.md`, is front matter followed by slides divided by lines of three dashes outside fenced code. A slide's first line may be `{{slide}}` or `{{slide:arguments}}` with its layout, colours, background and reveal, and its speaker notes are a `{{notes}}` container. The front matter's `theme`, `size`, `transition`, the deck's colours and `stylesheet` set the deck's look (`docs/slides-design.md`).

**A document**, `something.docs.md`, is a Markdown file that the Editor opens for writing as a word processor does (`docs/docs-design.md`). It adds no syntax of its own in version 1; its page breaks, captions, styles and classes are the shortcodes above.

## Versions

This is version 1. A change that makes an existing file read differently, such as a shortcode removed or an argument whose meaning changes, needs a new version, written here with what changed and how a file is read under each. A new shortcode or a new argument that changes nothing already written does not, and is added to the catalogue.
