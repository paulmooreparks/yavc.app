# Content application UI review

This review continues the Editor work into Slides and Diagrams at Paul's request on 2026-11-07. The first batch aligns common controls and command placement. It does not declare the three applications complete.

## Design basis

The canonical Architectural Principles at `C:\Users\paul\OneDrive\Documents\Architectural Principles.md` and PUDL govern the UI. The research and accessibility references in [the Editor review](editor-ui-review.md) apply to common menus, dialogs and toolbars here.

Microsoft places [PowerPoint slide sizing under Design](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides), with settings applying to a presentation. Slides therefore retains its existing Deck menu for themes, colors, stylesheets and slide size. Document Page Setup moves to Editor's Format menu alongside Typography and Header and Footer. Diagrams keeps Shape for drawing tools and selected-object operations; its Inspector supplies object and diagram properties.

## Findings and changes

| Area | Finding | Treatment |
| --- | --- | --- |
| Editor document formatting | Page Setup remained in File after the other document settings moved. | Move it into Format beside Typography and Header and Footer. |
| Slides editing | Keyboard text history existed without discoverable menu commands. | Add Edit with Undo and Redo, using the current rich or source editor. Synchronize pending rich edits before applying history. Keep source editor states per slide so navigation cannot undo another slide into the current slide. |
| Slides insertion | Links, inserted content and boxes were mixed into Format. | Add Insert and remove those duplicate entries from Format. Table remains available through Insert. |
| Slides file commands | Save As and Print lacked glyphs. | Reuse shared Save As and move the existing Print glyph into the shared site stylesheet. |
| Visible terminology | Slides still displayed Colours in menus, dialogs and helper text. | Use American English Color consistently while retaining existing internal command identifiers. |
| View switching | Slides and Diagrams displayed a View dropdown where Editor displayed its supported modes directly. | Use the existing shared customizable toolbar choice control. Order Visual, Text and Split; Mermaid labels its rendered mode Preview. |
| Status bars | Long paths could wrap or crowd the status strip. | Shorten the location with an ellipsis and preserve it in a tooltip. Keep slide position and diagram kind/state separate and visible. |
| Toolbar customization | Preferences must survive the new control representation. | Keep the existing view-mode command identifier, preferences and removable toolbar item. Existing customized lists are not reset. |
| App-specific controls | A diagram's shapes and a presentation's slides need different tools. | Retain Shape, Slide, Deck and Show rather than introducing document-only modes or Page Setup into those apps. |

## Verification

The new `scripts/test-content-ui-cleanup.cjs` uses synthetic documents and fresh headless browser contexts against a disposable local server. It covers Page Setup placement and cancellation; Slides Edit/Insert/Format placement; Color labels; rendered Save As/Print glyphs; source and rich Undo/Redo; separate slide histories; actual Edit-menu history targeting in Split; color/property dialog labels; shared view selection for Canvas, D2 and Mermaid; long status locations; and ribbon screenshots. Evidence is retained under `%TEMP%/yavc-content-ui-evidence`.

Existing Editor UI and command-toolbar fixtures cover shared dialogs, customization, removal, reset, persistence, ribbon coexistence, desktop instance isolation and keyboard overflow behavior. Results and any remaining limitations are recorded in `docs/review.md`.

## Remaining work

| Area | Remaining work |
| --- | --- |
| Clipboard and search | Editor's explicit clipboard commands remain outstanding. Slides also needs a complete search and clipboard command surface, with clear current-slide versus whole-deck scope. |
| History | History availability needs to reflect actual undo/redo state. Slides' new commands expose text-editing history; slide insertion, deletion, reordering, deck properties and cross-slide history need a separately specified deck-wide undo model. Delete confirmation remains in place. |
| Dialog lifecycle | Audit every Slides metadata/style dialog for tab switches, closure and disposal before treating the entire dialog surface as verified. This batch checks labels and cancellation for the color and properties dialogs. |
| Diagrams | Continue the Inspector, Outline/navigation and keyboard selection review across Canvas, D2 and Mermaid, including source-based formats' differing edit capabilities. Existing Canvas editing tests remain applicable. |
| Presentation | Presenter-window and full-screen behavior need their own cross-browser review. This batch does not claim those modes were tested. |
| Accessibility | Headless focus, label and rendering checks do not replace manual assistive-technology testing. |

The next cleanup should address behavior and command completeness together, rather than release isolated spacing adjustments.
