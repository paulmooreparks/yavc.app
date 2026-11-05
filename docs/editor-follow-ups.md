# Editing follow-ups

The installed local release is v0.2.20, including the shared customizable toolbar for Diagrams, Editor/Docs and Slides. The branch `codex/toolbar-dialog-layout` refines its customization form with aligned lists and central transfer arrows. Earlier requests below retain their context; completed work is described in the design decisions.

## Commands and Inspector

- Move Drawing Tool to the top of its menu.
- Discuss a general-purpose toolbar below the topbar, with a toolbar editor shared by Diagrams, Slides and Editor/Docs. Common commands could include drawing tools and undo/redo.
- Add glyphs beside Route, Start Head and End Head options where the PUDL control supports them. Check the upstream control contract before deciding whether this needs a PUDL change.
- Check whether PUDL defines a standard Save As glyph and use its documented name if available.
- Show diagram-level properties after a background click clears the selection. The initial proposal includes background, grid and snapping settings; page size belongs here if a page boundary is introduced.

## Canvas editing

- Retain coordinated shape color as the default and discuss optional separate outline and fill overrides. Each override should reset independently to the coordinated color.
- Discuss diagram templates when creating a canvas, including flowcharts and sequence diagrams. A template can supply an initial arrangement while keeping subsequent editing freeform. Guided layout or conversion would require a separate contract.
- Add direct editing of text inside a shape through the existing source transaction and undo history. Keyboard entry, commit/cancel behavior and Markdown treatment need decisions.

JSON Canvas remains the format. These discussions do not reopen the decision to retain it while implementing LSP support.

## Completed Canvas round

On 5 November 2026 Paul asked for substantive batches rather than a review and full test cycle for each small UI adjustment. The Canvas editing batch includes the following work in one candidate:

- Direct editing of shape text, with keyboard access, source/undo integration and safe tab, save and close behavior.
- Optional fill and outline color overrides, retaining the coordinated default and independent resets.
- Diagram-level Inspector settings after clearing selection, starting with background, grid visibility and snapping.
- Flowchart and basic sequence starter templates, remaining ordinary freeform JSON Canvas documents after creation.

The implementation should settle the file-extension and interaction contracts together, update schema assistance with any new document properties, and test the combined workflows. Focused checks may run during implementation, but the complete repository gate and combined browser/review pass belong to the assembled candidate. A concrete failure or subsequent code change can require another pass; cosmetic increments alone should not create separate candidates.

The shared customizable toolbar is a separate cross-app batch for Diagrams, Slides and Editor/Docs. Its design should consume the existing command tables and host configuration rather than introduce another command registry.

## Completed productivity round

Paul asked for the Inspector control-sizing and broken Theme Default corrections to join the substantive batch on 5 November 2026. This candidate combines the following work before one review and full check cycle:

- Editor saves retain newer edits, serialize writes per tab, guard late acknowledgements and reconfigure the originating tab after Save As.
- The Canvas Outline shares selection with the drawing/source and supports multiple selection and keyboard access.
- Canvas alignment and distribution move selected nodes and groups through the source history and agent action contract.
- F6 and Shift+F6 move between visible editing panes without trapping focus on pointer grips.
- Inspector segments and menu buttons keep their natural widths while retaining whole-label wrapping and glyph-only folding.
- Theme Default removes the background override and visibly restores the host theme color.

Desktop packaging, the documented host adapter, desktop-webview acceptance and revision conflict handling remain migration gates. Finishing these browser features does not establish desktop integration readiness by itself.

## Completed toolbar round

The toolbar controller consumes each applet's existing command table through an optional host capability. It replaces the default toolbar on yavc.app and retains the old toolbar on hosts without the capability. Preferences belong to each app within the reader's session; Editor and Docs use the same key. The toolbar remains visible with the ribbon by default, with visibility controls and a shared editor for command order and separators. `docs/command-toolbar-design.md` records the interface, draft/Apply behavior and validation limits.

## Separate recovery and history work

- Slides has no published Undo/Redo commands. Its current slide-text history and cross-slide behavior need a contract and regression coverage before those buttons can safely be offered. The common toolbar uses its existing commands.
- The toolbar fixture exposed an Editor recovery case where a fresh named tab restores its draft but the missing file named in the URL also opens an empty tab. The toolbar persistence fixture now saves its named resource before reloading. The separate recovery case needs regression coverage and correction before desktop replacement.
