# Editing follow-ups

Paul asked to finish the shared LSP round before discussing these ideas. This list records requests and tentative design directions, without authorising their implementation as part of that round.

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
