# Site-wide dialog review and overhaul

Paul reported the Slides Text Style, Text Color and Deck Stylesheet dialogs on 2026-11-08 while the source-preservation and routing batch was in progress. He then requested a consistent review and fix of every dialog in yavc.app, allowing that larger effort to follow the current batch. The scope includes shared forms, site-level dialogs and every applet-specific dialog. His screenshots identify examples, not the boundaries of the work. Source preservation and routing remain primary. The overhaul starts with a complete inventory, reviews shared patterns and then every use of those patterns and every applet-specific form. Its review includes control choice, labels, layout, current values, validation, file browsing/upload, previews, removal/default behavior and keyboard use. Shared controls must agree wherever their operations agree.

## Requirements

- Value selection must use PUDL form controls rather than grids of immediate-action buttons. Applying a value uses one consistent Apply action; Cancel leaves the resource unchanged.
- Text Style must identify its target, show the current or mixed value, distinguish text styling from paragraph layout and provide explicit removal. Styles from another slide must not appear as applicable choices.
- Text Color must use a labeled color control with a clear automatic/default choice. Theme colors can remain choices without acting as immediate-apply buttons.
- Every file-path field must retain direct entry and offer Browse through the shared file browser, including selection from the user's computer.
- A computer file used as a lasting stylesheet, shortcode or image reference must be imported through the host's VFS before its path is stored. A transient file object or browser-local filename is not a durable document dependency.
- Forms must retain their opening resource, selection and lifetime. Changed source, a changed target or disposal must prevent stale application.
- Shared changes require focused rendered review in the affected applications, keyboard and narrow-width checks, and independent PUDL review.
- Diagrams item selection must use a searchable, scrollable multiple-selection list with one item per row, readable labels, a clear node/connector distinction and selection count. Inline wrapping checkbox piles are not an acceptable list layout.
- Inventory the dialogs and review their interaction designs before implementing the overhaul. Record the value being edited, its target/scope, the appropriate control and validation, commit/cancel/removal behavior and keyboard flow for each form. Approval by a source-only check does not establish rendered usability.
- Every inventory entry must receive its own usability, consistency and PUDL review. Entries cannot be accepted merely because a shared implementation or one example passed. Record each dialog's rendered verification, including keyboard and narrow-layout checks, before marking it complete.
- Include site-level and non-content applet dialogs. The work is not limited to Slides, Diagrams, Editor, Docs or the dialogs shown in the screenshots.

## Initial source findings

The shared Text Style picker applies a CSS class as an inline mark. Its stock choices include block alignment and pagination classes that cannot perform that operation correctly. It initializes a blank class field instead of showing the selection's current state. Removing a class works differently in source and rich modes, and the completion handlers lack resource/selection ownership checks.

Slides combines classes from every slide's stylesheet, so a style belonging to another slide can appear where it has no effect. Both Text Style and Text Color immediately apply a pressed value button while also offering a second footer action. Deck Stylesheet uses a bare text prompt without file selection. The stylesheet and shortcode forms already contain ownership patterns that the replacement controls can reuse.

The Diagrams Select Canvas Items dialog packs checkbox labels inline until they wrap. Multiple selection is appropriate, but the layout provides no row structure, search, selection count or readable distinction between nodes and connectors. This example extends the overhaul beyond the Markdown editing kit and must be included in its rendered acceptance corpus.

## Implemented review

The inventory is recorded in `dialog-inventory.md`. Text Style and Text Color now use labeled selections, scoped previews, current and mixed values, explicit defaults and Apply. Canvas selection and Sight Reader use searchable PUDL list boxes. Canvas dimensions have separate numeric fields; connection and container choices show available targets. Source formatting checks the Markdown parser before changing ordinary text and refuses ambiguous source markup.

Every filesystem field has direct entry and host-owned Browse. Computer dependencies receive a separate create-only Import destination, with cancellation checked through the VFS authority transaction. `file-fields-contract.md` defines the optional host capability and its fallback when unavailable. The full-width color value remains usable where a browser does not implement the native color picker; its redundant unsupported swatch input is hidden.

The authored-dialog pass covers all non-content applets, including populated barcode results, invalid layout JSON, score selection, part selection, generated share addresses and game score empty states. It corrects missing dialog bodies and names, duplicate identifiers, navigation buttons, unassociated errors and game keys that intercepted dialog Escape. Generated and authored native dialogs share a keyboard boundary that excludes disabled fieldset descendants.

The content pass exercises every listed document, slide, diagram and shortcode form, with light and dark layouts at 1200 and 360 pixels, keyboard containment and cancellation. Dedicated suites also check applying and removing source/rich formatting, current values, six block-argument variants, picture removal, file operations, create races, stale targets, disposal and recovery. The table distinguishes this rendered sweep from the deeper behavior checks. Operating-system pickers and physical camera permission remain native platform boundaries; the headless fixtures do not claim those manual environments were exercised.

The installed release remains unchanged while this candidate is reviewed. The independent package extraction and Docs/Editor split retain their existing gates; this work adds a documented optional host capability rather than transferring file authority into applets.
