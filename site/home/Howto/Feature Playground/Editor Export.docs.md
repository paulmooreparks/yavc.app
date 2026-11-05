---
title: Export playground
author: Sample author
page: letter
orientation: portrait
margins: 1in
---

{{style}}
.accent { color: #2355a0; }
{{/style}}

# Export playground

Choose **File, Download as Word** to create an editable Word document, or **File, Download as PDF** for a PDF with selectable text. Both files should omit the working notes marked below.

{{toc:min=2 max=3}}

## Text and structure

This paragraph contains **bold**, *italic*, <u>underlined</u>, ~~struck out~~ and {{mark}}highlighted{{/mark}} words. Here is {{class:accent}}a named color style{{/class}} and a [web link](https://example.com).

> This quotation remains editable text in the exported file.

1. This is the first numbered item.
2. This is the second numbered item.

| Item | Result |
| :--- | ---: |
| Tables | Editable in Word |
| Text | Selectable in PDF |

## Inline exclusion

The next word is before{{no-export}} INTERNAL INLINE NOTE {{/no-export}}after, with no added space between those words in either export.

{{no-export}}
## Internal working section

INTERNAL BLOCK NOTE. This heading must not appear in the exported contents, and this section must leave no blank paragraph or page.

{{page-break}}
{{/no-export}}

{{draft-note}}
INTERNAL DRAFT NOTE. A note to self must also be omitted.
{{/draft-note}}

## Keep the source

Open the exported files and confirm that the internal notes are absent. The original Markdown retains them for editing, so sharing this source file also shares those notes.
