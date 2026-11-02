# Styling a deck

A deck is a Markdown file, and the colour dialogs in Slides reach the few things most decks change. For everything else a deck carries its own stylesheet, written in plain CSS and kept in the file, so the deck stays one text file that says everything about itself.

## Where the CSS goes

Put a `{{style}}` block anywhere in the deck. It applies to every slide:

```
{{style}}
.deck-body h2 { letter-spacing: 0.02em; text-transform: uppercase; }
.callout { background: #fff3b0; padding: 0.2em 0.5em; border-radius: 6px; }
{{/style}}
```

Write `{{style:slide}}` instead and the block applies to the slide it is in alone. The block is never shown on a slide; in the Visual view it is edited as its source.

For styles shared by several decks, give the front matter a `stylesheet` line with a CSS file of yours, such as `stylesheet: ~/themes/mine.css`, or choose Deck, Stylesheet File. The file is read when the deck opens and again whenever it is saved.

Both are scoped to the deck's slides, so nothing in them reaches the desktop or another deck open beside it. Inside the CSS, a selector such as `h2` means a heading on a slide; `:scope` is the slide itself. The deck's CSS weighs as much as the theme's own rules for the same element and comes later, so `h2 { … }` restyles headings outright; a layout's rules, such as the title slide's subtitle, are more specific, and a selector that names the layout, `:scope[data-layout="title"] h2`, matches them.

## What there is to style

The tokens the colour dialogs set, which every element on a slide reads:

| Token | What reads it |
|---|---|
| `--deck-ink` | paragraphs, lists, tables, and headings with no colour of their own |
| `--deck-heading` | every heading |
| `--deck-muted` | a title slide's subtitle, captions, the speaker notes |
| `--deck-accent` | the rule under a heading, links, words coloured `accent` |
| `--deck-bg` | the slide's background |
| `--deck-rule` | borders and rules |
| `--deck-code` | the background of code |

The elements, as Markdown draws them: `h1` to `h4`, `p`, `ul` and `ol` with `li`, `blockquote`, `pre` and `code`, `table`, `img`, and the shortcodes' parts: `.sc-figure`, `.sc-columns` and `.sc-column`, `.notice` with `.notice-title` and `.notice-body`, `.sc-video`, `.sc-colour`.

The layouts, on the slide itself: `[data-layout="title"]`, `section`, `content`, `two-column`, `image`, `quote` and `blank`; so `:scope[data-layout="title"] h1` is a title slide's title.

## Your own styles

A class the stylesheet defines is applied in three places:

- to words in a line, with `{{class:callout}}these words{{/class}}`, or from Format, Style, which lists the classes the stylesheet defines;
- to one or more blocks, with `{{class:callout}}` and `{{/class}}` on lines of their own around them;
- to a whole slide, with `class=callout` on its `{{slide}}` line, or from Slide, Slide Style.

A class is given as written, so a class with the name of one of the site's own styles takes that style too, which is sometimes what you want.

## What the exports keep

The PDF is a picture of each slide, so it keeps everything. The PowerPoint file is built from the slides' structure and the colour tokens; a stylesheet and a class do not carry into it.
