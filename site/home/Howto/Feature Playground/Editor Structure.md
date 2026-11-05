---
title: Editor structure playground
---

# Editor structure playground

Open this file in Editor and choose Split view. Open View, Outline and select a heading to jump to it. The text and page should follow together.

## Move this section

Focus this heading in Outline and press Alt+Shift+Down. This section and its child should move below the Quotes section. Undo restores both in one step. You can also use the move buttons or drag between sibling headings in Outline.

### This child moves with its parent

This paragraph belongs to the section above. A child section cannot move into another parent through the move commands.

## Quotes

> This **rich quote** has a lazy continuation line.
This line belongs to the same quote.
>
> - This list should remain a list.
> - Place the caret here and use Format, Quote to remove the enclosing quote.

Use Undo to restore the quote. In Text view, select several lines and choose Format, Quote to add or remove their quote markers.

## Table columns

| Left | Center | Right |
| :------ | :------: | ------: |
| One | Two | Three |
| Four | Five | Six |

Click a cell and choose Format, Table, Center Column. Every cell in that column should change alignment. Undo restores the previous alignment. Split view shows the GFM delimiter change.

## Check the outline

Collapse and expand the section with a child. Use the arrow keys to navigate the tree. On a narrow window, Outline fills the work area until you select a heading or choose Back to Document.

```markdown
# This example is excluded from Outline
```
