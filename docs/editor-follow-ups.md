# Editing follow-ups

Paul asked to finish the shared LSP round before discussing these ideas, then authorised starting the follow-ups on 5 November 2026. The LSP and the subsequent Drawing Tool/glyph changes are merged. The installed local release is v0.2.17. The branch `codex/canvas-editing-batch` implements the combined round below, including the later Inspector-width and segment-folding corrections.

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

## Next combined round

On 5 November 2026 Paul asked for substantive batches rather than a review and full test cycle for each small UI adjustment. The Canvas editing batch includes the following work in one candidate:

- Direct editing of shape text, with keyboard access, source/undo integration and safe tab, save and close behavior.
- Optional fill and outline color overrides, retaining the coordinated default and independent resets.
- Diagram-level Inspector settings after clearing selection, starting with background, grid visibility and snapping.
- Flowchart and basic sequence starter templates, remaining ordinary freeform JSON Canvas documents after creation.

The implementation should settle the file-extension and interaction contracts together, update schema assistance with any new document properties, and test the combined workflows. Focused checks may run during implementation, but the complete repository gate and combined browser/review pass belong to the assembled candidate. A concrete failure or subsequent code change can require another pass; cosmetic increments alone should not create separate candidates.

The shared customizable toolbar is a separate cross-app batch for Diagrams, Slides and Editor/Docs. Its design should consume the existing command tables and host configuration rather than introduce another command registry.
