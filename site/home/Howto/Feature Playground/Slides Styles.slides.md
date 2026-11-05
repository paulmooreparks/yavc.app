---
title: Slides styles playground
stylesheet: playground.css
theme: plain
size: 16:9
transition: fade
---

{{style}}
.deck-accent { color: #b04a35; font-weight: 700; }
.deck-panel { border-left: 4px solid #b04a35; padding: 0.75rem; }
{{/style}}

# Slides styles playground

{{class:deck-accent}}This rust-colored text uses whole-deck CSS.{{/class}}

- Switch between Visual, Text and Split.
- Click any editable paragraph on the canvas and change it.
- Use the filmstrip or Page Down to visit the next slide.

{{notes}}
Use this deck to try the styles released in v0.2.26. Save it before opening Presenter Window.
{{/notes}}

---

## Whole-deck styles

{{class:deck-panel}}
This panel and the rust-colored words below use the style block on the first slide.
{{/class}}

{{class:deck-accent}}One definition can style several slides.{{/class}}

Open **Deck > Edit Style Blocks**, select the existing whole-deck block and change its color. Apply the change and check this slide, the first slide and their thumbnails.

---

{{style:slide}}
.deck-accent { color: #167d9a; }
.deck-panel { border-left-color: #167d9a; }
{{/style}}

## A style for this slide

{{class:deck-panel}}
{{class:deck-accent}}This slide overrides the same classes with teal.{{/class}}

The rust-colored examples on the previous slides should stay rust-colored.
{{/class}}

Open **Deck > Edit Style Blocks** and edit this slide's block. You can also select **New Style Block (This Slide)** to add another override.

---

## Shared with the Editor sample

{{class:shared-panel}}
{{class:shared-accent}}This teal text comes from playground.css.{{/class}}

The Editor sample points at the same local CSS file.
{{/class}}

Edit `playground.css` in Editor, or through the document's **Edit Shared Stylesheet** command. Both samples should adopt the change when opened at the same browser address. Whole-deck and slide-specific CSS still apply after shared CSS.

---

## Present and export

1. Save this deck, then present it and inspect the styled examples.
2. Use **File > Download as a Page** and open the HTML file.
3. Check that the whole-deck, slide-specific and shared styles survived.

PowerPoint export does not carry custom CSS. Resize a tall window and scroll the filmstrip to check that the thumbnails settle without stuttering.
