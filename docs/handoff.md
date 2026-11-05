# Handoff: Diagrams and the canvas editor

Updated on 2026-11-05. PR #35 is merged at `a767593`, and `v0.2.29` is installed locally as `yavc-app-candidate` on port 8401, with Editor 45.23.0, Diagrams 0.21.3, Slides 0.26.0 and PUDL 0.98.0. Installed Chromium Editor export, Slides exclusion and artifact-content checks pass. Paul has authorised the local pull, next-version tag/push, Docker build and candidate run process after future merges. Keep his running candidate intact until its replacement is ready. Paul still authorises merges. Conversion, embedding and Obsidian checks remain C4 work.

The styles, custom-shortcode, structure and initial Office export batches are merged. The root checkout is on main and retains the unrelated Linode upgrade helper and the user's DESIGN.md header edit. No desktop integration has been performed.

The Feature Playground includes `Editor Export.docs.md`. Candidate v0.2.29 reuses the named data volume from v0.2.27 after taking an offline tar backup and SHA-256 manifest. The backup location is recorded in `%TEMP%/yavc-v0.2.29-backup-path.txt`. The running image is `sha256:c7b62e9989ff3f1a0c6c1ef5640a24a87526333c60f892ee1d7df131aab0d3c7`. Other disposable servers and installed containers were left intact.

The source-linking, Help, text-alignment, drawing-tool picker and multiple-selection changes described in the historical sections below are already merged. Those sections retain their original implementation notes; their old versions and palette descriptions are superseded by this opening status. PUDL's agent owns issue #32; do not patch its vendored controls locally.

Originally written on 2026-11-04 for whoever picks this work up next, human or agent. It describes where the Diagrams work stands, how this repository expects work to be done, and what comes next. Read `CLAUDE.md`, `DESIGN.md` and the design documents it points to before changing anything structural.

## Next Editor batch and export request

The paper-color follow-up is on `codex/export-background` in `%TEMP%/yavc-export-background`, with its disposable server on port 8420. It writes explicit DOCX/PDF paper colors and lets authored root color tokens override export defaults. Editor is 45.23.1, Slides 0.26.1 and Diagrams 0.21.4. The installed release remains v0.2.29. The exact playground and color precedence pass Chromium, Firefox and WebKit, the repository gate passes, and independent review is clean. A corrected playground file is `%TEMP%/yavc-export-paper-evidence/Editor Export - White Paper.docx`. LibreOffice renders white and authored cream paper correctly. Native Word confirmation of the user's original black rectangle remains pending.

PR #35 completed the initial Word/PDF exports and zero-footprint exclusions. Its worktree remains at `%TEMP%/yavc-editor-export`, with an isolated development server on port 8419. Decision 26 in `docs/docs-design.md` records the supported formatting and explicit refusals. The remaining Documents milestone includes paginated Document view, page setup, headers/footers, typography/themes, templates and print parity. No implementation of that next milestone has started. Separate recovery/history work and the host adapter/offline package remain migration gates.

PR #34 completed Outline navigation, sibling section movement, rich quotes and GFM table alignment. Its development worktree remains at `%TEMP%/yavc-editor-structure` on port 8418. The installed Feature Playground includes `Editor Structure.md`.

Word/PDF exports and zero-footprint exclusions were planned in decisions 8, 18, 19 and 24 of `docs/docs-design.md`. Decision 26 now specifies the initial implementation. Full editable page layout, headers/footers, footnotes, desktop adapters and offline packaging remain separate work.

## Connector endpoint follow-up

The merged endpoint follow-up adds draggable start/end tips, automatic attachments on interior drops, live connector previews during node movement and free endpoints. Decisions 18 and 19 in `docs/canvas-design.md` and the additive `yavc.anchor` property in `docs/canvas-extension.md` state the contracts. The keyboard commands are E and Shift+E; `canvas-edit@1` adds `reconnect`. `scripts/test-canvas.cjs --endpoints chromium firefox webkit` covers the behavior.

## How work is done here

- Run `bash scripts/check.sh --since HEAD` before every commit. CI runs the same script. It covers Go formatting, vet, tests with the race detector, govulncheck, the WebAssembly builds, the Node tests of browser modules (`node --test 'apps/*/test/*.test.mjs'`) and the project's own rules in `scripts/check.mjs`.
- Any change to an applet's files needs a new version in its `applet.json`. Diagrams is 0.10.0, Files 32.7.0, Editor 45.15.0.
- Browser code uses the shared modules: `internal/web/static/yavc-util.js` for escaping, script loading, downloads and notices, and `internal/web/static/dialogs.js` for every dialog. Never use `alert()`, `confirm()` or `prompt()`.
- Glyphs must exist in PUDL or be defined on `:root`; project glyphs are `--glyph-yavc-*`.
- A rule wrong for one line takes `check-ignore(rule-id): reason` on that line.
- Anything a file, an agent or a Markdown document supplies is untrusted. Sanitise it with the existing helpers and keep the size limits.
- The visual layer follows PUDL (raised is pressable, sunken is input, flat is display; status is a glyph and a colour; errors are PUDL notices beside what failed). A problem that belongs to PUDL is filed on `paulmooreparks/pudl` rather than patched here.
- No design may rest on undocumented behaviour of an external system unless Paul approves an exception. One exception is pinned: Diagrams reads a curved D2 route's points as cubic Bezier control points, held by `TestCurvedRouteMatchesDrawing` in `internal/d2api`.
- Prose rules (from Paul): no em-dashes anywhere, complete sentences in prose, a heading is never the subject of the paragraph under it, and no "the file names its board" style of verb. Decisions go into the design documents as numbered decisions, not only into chat.
- Record a fix that could come back in `docs/review.md`, with the rule or test that would catch it.
- Paul merges. Open a draft pull request, keep CI green, and merge only when he says so.

## Running and testing locally

- Build the engine with `go build -o /tmp/yavc ./cmd/yavc` and run it with `/tmp/yavc -data /tmp/yavc-data`. It serves `http://localhost:8400`, and each applet's standalone page at `http://<applet>.localhost:8400/`, for example `http://diagrams.localhost:8400/`.
- Rebuild the D2 engine after changing `internal/d2api` with `GOOS=js GOARCH=wasm go build -o apps/diagram-kit/yavc-d2.wasm ./cmd/yavc-d2`.
- The focused C2 browser suite is `scripts/test-canvas.cjs`; `docs/review.md` records its setup. It drives the applet through its agent actions: `window.pudlActions.run('yavc.diagrams/new@1', { kind: 'canvas' }, { grant: 'all' })` returns the action's output directly. `set-text@1`, `diagram@1`, `format@1` and `render@1` are the useful ones.
- Deploying is Paul's: he tags `vX.Y.Z` on main, then on the server runs `cd /opt/yavc && sed -i 's/^YAVC_TAG=.*/YAVC_TAG=vX.Y.Z/' .env && sudo docker compose pull && sudo docker compose up -d`. The last tag was v0.2.7; v0.2.8 carries the canvas.

## Where Diagrams stands

Diagrams (`apps/diagrams`) opens three kinds of file in tabs, with the text in CodeMirror beside the drawing. `docs/diagrams-design.md` is its design.

- **D2** (`.d2`) is drawn by D2 v0.7.2 compiled to WebAssembly (`internal/d2api`, `cmd/yavc-d2`, run in a worker by `apps/diagram-kit/d2.js`). It has a visual editor (milestone D3, mostly done): selection tied to the text, a palette of shapes, handles on four sides for dragging connections, moving shapes into containers, and an inspector. Every change on the drawing is one of D2's own edits to the text, so Undo covers it. D2 lays the diagram out itself, so shapes cannot be placed by hand. That is why the canvas exists.
- **Mermaid** (`.mmd`, `.mermaid`) is drawn by the vendored Mermaid and is text only.
- **Canvas** (`.canvas`) is JSON Canvas 1.0 with the site's extension. C1 is merged. C2 now provides editing on the drawing, ready for review after the recorded checks.

The remaining D3 items are the Outline pane, arrow keys that follow connections, and choosing a new shape's place among its siblings. They wait behind the canvas work.

## The canvas

`docs/canvas-design.md` holds the numbered decisions and the milestones; read it first. `docs/canvas-extension.md` is the specification of the `yavc` extension, version 1. The short version follows.

- The file is valid JSON Canvas 1.0, so it opens in Obsidian. Shapes, routes, line styles and richer line ends live in one `yavc` property on a node or an edge. The writer keeps `fromEnd` and `toEnd` in agreement with the extension's heads, so a file stripped of the extension still draws sensibly.
- `apps/diagram-kit/jcanvas.js` is a DOM-free module (UMD; `window.yavcCanvas` in the browser, `require` under Node). It has `read(text)` (validation, refusals, problems with offsets), `write(doc)` (the stable form: keys in the specification's order, two spaces, extension last), `route(edge, nodes)` (elbow, straight or curve, computed and never stored) and `render(doc, opts)`, which returns `{ svg, width, height, boxes, edges, origin }`. `boxes` gives each node's box in drawing coordinates and, for text nodes, the box its text fills. `origin` converts file coordinates to drawing coordinates. Its tests are `apps/diagram-kit/test/jcanvas.test.mjs`.
- In `apps/diagrams/diagrams.js`, `drawCanvas` reads, renders and puts the SVG in the tab's place. `richText` then replaces each text node's SVG text with the Markdown drawn as HTML in a `foreignObject`, through the Markdown engine (`apps/md-engine/loader.js`, `source()`) and the HTML cleaner. Links and applets inside are reduced to plain content, because the drawing is one labelled picture. `canvasPalette` reads the page's tokens and the background behind the drawing. Exports use the plain SVG with SVG text.
- Tidy the Text and `format@1` rewrite a canvas in the stable form. C2 shows the palette and inspector for canvases; only Mermaid keeps them hidden.

Two traps were found while building C1, and both are fixed.

- PUDL 0.97.8 writes `data-skin` on the root again, unchanged, after any DOM change (paulmooreparks/pudl#33). The original workaround compared each record's `oldValue` with the current value. PUDL 0.97.10 now includes the upstream fix, and both workaround checks have been removed.
- A canvas draws so fast that its result can arrive before CodeMirror's linter asks for it. The tab keeps its last result (`t.settled`) and the linter uses it.

## C2 implementation scope

Paul agreed that C1 is a viewer and that editing comes next. The implementation covers the following four parts of the original proposal together on `codex/canvas-c2`.

1. **Select, move and resize, with pan and zoom.** Put a hit layer over the canvas SVG, as `apps/diagrams/canvas.js` does for D2, but built from `render().boxes`, which are exact because the site drew them. Click and Tab select; the selection is PUDL's focus ring. Drag moves; handles on corners and sides resize, Shift keeps proportions. While dragging, snap to an 8-pixel grid and to the edges and centres of nearby shapes, with a guide line for each match; Alt turns snapping off. Arrow keys move by 1 pixel, by 8 with Shift. Pan and zoom while editing; export and embed use the contents' bounds (open question 3 of the canvas design). Each gesture is one replacement of the text, made with `write()` and dispatched as one CodeMirror transaction through `replaceText`, so Undo and the text pane stay one history (decision 4).
2. **New shapes and connectors.** A palette of the extension's thirteen shapes; a click or N places one. Connectors are dragged from a handle on one of a shape's four sides to a side of another, which sets `fromSide` and `toSide`. New ids must not collide with existing ones.
3. **The inspector, delete, duplicate, copy and paste, and order.** The inspector edits text, colour (hex or the six presets), shape, line style and width, route and the two heads. The array order of `nodes` is the drawing order, so Bring Forward and Send Back move a node in the array.
4. **Groups.** Membership is by area (decision 9): moving a group moves the nodes inside its box, and a node dragged out leaves it.

Every gesture needs a command with a menu row and a key (decision 14), and the matching agent actions are now `canvas-edit@1` and `canvas-view@1` (`edit@1` remains D2-only). Run the PUDL review on each step: it checks the selection, handles, toolbar and inspector against PUDL's rules. Milestones C3 (keyboard paths, Outline pane, align and distribute) and C4 (conversion to and from D2, the `{{diagram}}` embed, and checking a round trip through Obsidian) follow.

## Open items outside the canvas

- A D2 upstream issue was drafted for Paul to file; it is not in the repository.
- pudl#32 (the segmented control needs glyphs) remains outside this work. PUDL 0.97.10 includes the fix for pudl#33, and this branch adopts it with both observer workarounds removed.
