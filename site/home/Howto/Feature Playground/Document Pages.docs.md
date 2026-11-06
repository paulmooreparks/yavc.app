---
title: Document Pages
author: Paul Parks
page: letter
orientation: portrait
margins: 1in
---

# Document pages

This document opens as physical sheets. Click into a paragraph and edit it. You can select text across a page gap, apply formatting and undo the change without adding page layout to the Markdown.

## Try page setup

Choose **File, Page Setup**. Search for A4, select it, then change the orientation to Landscape. Change Units to Millimeters, turn off **Use the Same Margin on All Sides**, and enter a separate value for each side. Apply the change, then use Undo to restore these settings.

Choose **Custom Size** to enter your own Width and Height. The margin presets provide common starting points, and the linked **All Sides** field sets one margin everywhere.

Document, Visual, Split and Preview keep this document's physical page width. Try Text, Preview and Visual in sequence; the paper layout returns after Text. Ordinary `.md` files wrap to the pane in their rendered views.

## Text, lists and tables

The editor keeps these blocks together on a page. Long paragraphs, lists, tables and boxes cannot split across pages yet. A warning identifies a block that is too tall for the page.

- Edit a list item.
- Select a word and make it bold.
- Switch to Text to inspect the page settings above the content.

| Setting | Current Value |
| :--- | :--- |
| Paper | Letter |
| Orientation | Portrait |
| Margins | One inch |

{{no-export}}
This working note is visible while editing. It disappears before printing and Office export, including the space it occupied.
{{/no-export}}

{{page-break}}

# A new page

The explicit page break places this heading on the next sheet. Automatic page gaps also appear whenever a whole block would cross the bottom margin.

## Try printing

Choose **File, Print**. Select Letter paper, use 100% scaling and turn off the browser's headers and footers. You can save a PDF through that dialog. The working note on the previous page must be absent.

**Download as Word** creates an editable Word document. **Download as PDF** uses the existing structural PDF writer, whose line wrapping can differ from the browser's printed sheets. All three use these page dimensions and margins.

Headers, footers, document zoom and typography controls are planned for subsequent batches.
