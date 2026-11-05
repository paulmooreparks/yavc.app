---
title: Custom shortcode playground
shortcodes: shared-shortcodes.md
---

{{define:card}}
{{param:title default="A heading" help="The card's heading"}}
{{note:{{arg:title}}}}
{{content}}
{{/note}}
{{/define}}

{{define:badge}}
{{param:text default="A label" help="Text to emphasize"}}
**{{arg:text}}**
{{/define}}

# Custom shortcode playground

These examples use definitions stored in this document and in `shared-shortcodes.md` beside it. Open Split view to see the invocations alongside the result.

## 1. Edit a rich body

{{card:title="An editable card"}}
Click in this body and type. You can **format words**, add paragraphs or insert a list. Hover over the card to find its Parameters button, which changes the heading without replacing the body.
{{/card}}

## 2. Change an inline shortcode

This sentence contains {{badge:text="an editable label"}}. Click the label to change its Text field. Try punctuation such as `<strong>` in the field; it should appear as literal text.

## 3. Change a definition

Open **Format > Custom Shortcodes**, select `badge` and change the two asterisks around its argument to one asterisk. Choose **Apply Definitions**. The label above should become italic. Use Undo to return it to bold.

Choose **New Definition** to make another shortcode. The Insert menu offers valid definitions and generates their parameter fields. In Text view, type `{{ba` and request completion to find `badge`.

## 4. Change a shared definition

{{shared-label:text="This label comes from the shared file"}}

Open `shared-shortcodes.md` in Editor and change its emphasis. Save it, then return to this document. The shared example in `Shortcodes.slides.md` uses the same definition when both are opened at the same browser address.

## 5. Try glyph previews

Open **Insert > Glyph**. Filter the list with `che`, select a glyph beside its name and choose Insert. The dialog keeps names visible when the window narrows.
