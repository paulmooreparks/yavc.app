---
title: Custom shortcode slides
shortcodes: shared-shortcodes.md
size: 16:9
---

{{define:badge}}
{{param:text default="A label" help="The emphasized label"}}
**{{arg:text}}**
{{/define}}

## A definition for the deck

This slide declares `badge`. It can be used on every slide.

{{badge:text="A custom label on the first slide"}}

Open **Deck > Custom Shortcodes** to edit the declaration stored here.

---

## Use it on another slide

{{badge:text="The same definition works here"}}

Click the label to change its parameter, or use **Insert** to add another instance. The definition stays on the first slide. Check both thumbnails after changing it there.

---

## A shared definition

{{shared-label:text="This comes from shared-shortcodes.md"}}

The Editor shortcode sample uses the same shared file. Edit and save that file in Editor at the same browser address, then return here.

---

## Present and export

Save the deck and present it. The custom labels should keep their formatting.

Use **File > Download as a Page** and open the HTML file. The labels should be rendered without exposing the hidden definitions.
