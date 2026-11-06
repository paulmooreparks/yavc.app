# Editor UI review, 2026-11-06

This review covers Editor's command organization, document views, editing and navigation, dialogs, keyboard operation, accessibility, responsive layout and output workflows. Paul requested the review after the first Typography dialog presented document settings as five empty text fields. The installed baseline is v0.2.35, with Editor 45.27.0. The review work is isolated from the installed candidate and from unrelated root-checkout edits.

## Research and review criteria

The [Windows font dialog](https://learn.microsoft.com/en-us/windows/win32/dlgbox/font-dialog-box) exposes font family and point size as choices. [LibreOffice's Font dialog](https://help.libreoffice.org/latest/en-GB/text/shared/01/05020100.html) combines family and size with a preview. Its [paragraph spacing dialog](https://help.libreoffice.org/latest/en-US/text/shared/01/05030100.html) distinguishes line spacing from space between paragraphs and offers named line-spacing presets. These support a font picker, explicit units and a live sample rather than requiring CSS knowledge.

[Microsoft's menu guidance](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus-and-context-menus) groups related commands. Editor uses Format for document typography and running text, as Paul requested; this is the product's organization even where another word processor chooses Insert. File retains file and output operations. [WAI's modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) supplies the focus, cancellation and accessible-name criteria; its [toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) supplies keyboard and grouping criteria. PUDL's documented combo, number-field, segmented control, dialog and toolbar contracts govern implementation.

## Design for this batch

The dialog uses PUDL's surface, input-bg, text, text-muted, border and accent tokens, so skins and light/dark modes keep their own palette. It adds no hard-coded host colors or decorative visual system. Controls use PUDL's normal interface font. A separate document sample demonstrates the selected body and heading faces against a paper surface.

Font and spacing groups are left aligned. A searchable editable combo offers familiar local family names while allowing another local family. Point-size and paragraph-space inputs use PUDL number fields with units beside them. Line spacing offers common named presets and a custom multiplier. Defaults are explicit controls, and the dialog shows a sample before Apply. The preview is contained within the dialog and cannot change the open document. A short scope statement replaces the paragraph of instructions; font availability and PDF substitution remain concise secondary help.

## Coverage and findings

| Area | Baseline finding | Treatment |
| --- | --- | --- |
| Command organization | Typography and Header and Footer are in File. | Move both to Format and group document-level settings. |
| Typography | Blank text fields conceal choices, units and defaults; there is no sample. | Replace the form with pickers, numeric controls, presets, defaults and preview. |
| Views | Document is physical; Visual, Split and Preview are fluid; Text retains the source. | Verify the distinct modes and preserved settings. |
| Editing and selection | Source and rich editing share document history. | Exercise formatting, Undo/Redo and mode transitions. |
| Navigation | Files and Outline share a resizable navigation pane. | Check keyboard access, narrow layout and document return. |
| File lifecycle | Unsaved tabs and browser-local recovery are existing contracts. | Exercise cancellation and reload without writing user files. |
| Dialogs | Controls must retain visible labels, errors and usable actions at narrow widths. | Review common dialogs and keyboard focus behavior. |
| Toolbar and ribbon | Both derive commands from the same catalog. | Check classification, customization, folding and command availability. |
| Output | Word and PDF have documented pagination/font limits. | Keep clear output labels and verify that dialog changes preserve export behavior. |

## Verified fixes and results

The rendered review reproduced a recovery defect beyond the original Typography complaint. A named unsaved document was restored correctly from the snapshot, but reopening its Outline URL checked disk existence first and created a second blank tab. Open now finds an existing tab before requiring its file to exist. The fixture reloads the draft's heading URL, verifies the retained source and resumes the same document.

Typography now shows PUDL font combos, point-based number fields, named line spacing, per-field and whole-dialog defaults, and a contained sample. It derives defaults from the document's actual styles, preserves untouched source units and writes only on Apply. Tests cover inherited heading fonts, stylesheet overrides, invalid source repair, repeated invalid submissions and resetting an invalid draft. Shared modal dialogs explicitly wrap Tab and Shift+Tab, preserving handled editor and combo keys. The keyboard test traverses both directions rather than checking only Escape.

The review also corrected shared visible Color/Gray spelling, supplied Editor's Save As glyph, and prevented narrow status metadata from wrapping into a tall column. The full file path remains available as a tooltip when shortened. Typography and Header and Footer are verified in Format and absent from File and Insert.

| Verification | Scope and result |
| --- | --- |
| Complete UI fixture | Chromium, Firefox and WebKit exercise plain text/JSON/HTML defaults; menu organization; ten dialogs and their labels; all views; Outline links; unsaved-close cancellation; draft reload; ribbon; narrow dark layout; read-only behavior; and Editor in a desktop window. |
| Typography fixture | Chromium, Firefox and WebKit exercise combo selection, preview isolation, point units, custom spacing, defaults, untouched-source preservation, Undo, invalid input/source repair, forward/backward Tab wrapping and combo Escape. |
| Visual inspection | Light and dark layouts, narrow Typography, and a Chromium forced-colors rendering were inspected. This does not claim a manual screen-reader audit or formal contrast certification. |
| Existing editing fixtures | Chromium checks Outline/section history, rich quotes, table column alignment, Unicode source edits, shared styles and dialog/save disposal. Existing three-engine furniture/export tests verify that dialog changes retain output semantics. |

Evidence is retained under `%TEMP%/yavc-editor-ui-review` and `%TEMP%/yavc-typography-dialog-evidence`. The repository includes `scripts/test-editor-ui-review.cjs` and `scripts/test-typography-dialog.cjs` so these contracts can be repeated. JSON language-service completion and diagnostics retain their existing module tests; this review did not introduce another language server or claim an interactive code-completion audit.

## Remaining Editor work

| Priority | Finding | Next action |
| --- | --- | --- |
| P2 | Edit has no explicit Cut, Copy, Paste or Select All commands. The existing keyboard paths do not provide menu discovery. | Define shared selection/clipboard operations for source and rich editing, including browser permission failures and read-only Copy, then add the commands and shortcuts. |
| P2 | Undo and Redo availability follows Editor readiness rather than actual history. | Expose documented history availability and account for pending rich-to-source synchronization before changing enabled states. |
| Planned feature | Word-processor gaps include finer pagination, themes/templates, import and review features. | Keep them in the document roadmap; they are not represented as existing controls that passed this review. |

The review establishes the current UI baseline; it does not declare Editor complete while these findings remain. Clipboard/history affordances are the next Editor UI batch. Recovery beyond the exercised snapshot and existing save-lifecycle tests, native Word rendering, arbitrary third-party styles and assistive-technology user testing remain separate acceptance work.

## Cross-application sequence and consistency

Paul set the order as Editor, then Slides, then Diagrams. Shared operations should use the same names, glyphs, dialog layout, keyboard contracts, validation and toolbar behavior. Differences must follow the content model: document pages and running text, slide/deck presentation, and diagram shape/connector tools each need their own controls. A shared helper or command should be preferred for common behavior; app-specific commands should not be forced into another application's arrangement. The later reviews must record each necessary difference and reuse the verified common patterns.

On 2026-11-07 Paul directed the cleanup to continue into Slides and Diagrams while the remaining Editor findings stay recorded. Page Setup now joins Typography and Header and Footer in Format. The continuation and its remaining work are tracked in [the content UI review](content-ui-review.md).
