---
title: Editor styles playground
stylesheet: playground.css
---

{{style}}
.local-callout {
    color: #b04a35;
    border-left: 4px solid #b04a35;
    padding: 0.75rem;
}
.quiet {
    font-size: 0.9em;
    font-style: italic;
}
{{/style}}

# Editor styles playground

Switch between **Visual**, **Split** and **Preview**. The styled examples should keep the same appearance in all three views. Split shows the Markdown alongside the result.

## 1. Change a document style

{{class:local-callout}}
This rust-colored callout gets its appearance from the style block in this document. Its text remains editable in Visual view.
{{/class}}

Open **Format > Document Stylesheet** or press **Ctrl+Shift+F**. Change both occurrences of `#b04a35` to `#7855a5`, then choose **Apply Styles**. The callout should become purple. Focus the document and use Undo to restore the previous style in one step.

## 2. Apply a named style

Select some words in this paragraph in Visual view. Open **Format > Style** and choose `quiet`. The selected words should become smaller and italic. The list also contains `local-callout`, the shared classes and the stock styles. Split view shows the class shortcode written around your selection.

{{class:quiet}}
This is an example of the quiet style.
{{/class}}

## 3. Edit the shared stylesheet

{{class:shared-panel}}
{{class:shared-accent}}This teal text uses playground.css.{{/class}}

The Slides sample uses the same file. The stylesheet path in this document's front matter is relative to this document.
{{/class}}

Open **Format > Edit Shared Stylesheet**. Change `#167d9a` to `#7855a5` in both rules and choose **Save Stylesheet**. This panel and the shared example in the Slides sample should change. Keep both samples at the same browser address for this test.

## 4. Check cancellation and isolation

Open **Format > Document Stylesheet**, change the CSS and choose **Cancel**. Nothing should change. Open another document without these styles; its appearance and the Editor's menus should stay unchanged.

## 5. Try CSS assistance

In the stylesheet dialog, start a declaration such as `color:` and try completion. Invalid or unsupported rules produce diagnostics. The current styling subset supports typography, colors, spacing and ordinary layout; it refuses resource loads and at-rules.

This sample demonstrates custom styles. Open `Editor Shortcodes.md` in this folder to try user-defined shortcodes.
