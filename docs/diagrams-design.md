# Diagrams: an application for D2 and Mermaid diagrams

Status: designed on 2026-11-03; milestone D1 built on 2026-11-03, and the first parts of D2 and D3 on 2026-11-04. Paul asked for a Diagrams application at `diagrams.yavc.app` that sits on D2, Mermaid or both, as the Editor and Slides sit on Markdown. It has to create diagrams in a visual editor (placing and connecting elements for a given style of diagram), in a text editor, or in both side by side, and the diagrams have to embed in the Editor and in Slides. He left the choice of language to the designer. The decisions below were taken under that authority, each is marked, and he can overturn any of them.

In outline, a diagram is a text file, `something.d2` or `something.mmd`. Diagrams edits D2 visually and as text, and edits Mermaid as text with a live preview. Both draw through engines that run in the browser, so a diagram's text never leaves it. A document embeds a diagram with `{{diagram:path}}`, or with a fenced block when the source should travel inside the document, and either form draws the same way in the Editor, in Slides and in their exports.

## What the research found

The choice of language rests on what each one can do for an editor, so the facts were checked against the code. D2 version 0.7.2, the newest at the time of writing, was fetched through the Go module proxy and built.

- D2 is Go, under the Mozilla Public License 2.0, like this site's engine. Its package `d2oracle` creates, sets, moves, deletes, renames and reconnects objects by rewriting the D2 text, and the compiler reports every object's source ranges. Its own WebAssembly entry point (`d2js`) exposes compile, render, completions and those ranges, but not the oracle's edits.
- D2's oracle was run on a deliberately untidy sample. It kept the comments, updated the references when a shape moved into a container (`web -> cache` became `web -> web.cache`), and removed a deleted shape's connections. It also rewrote the whole file through D2's formatter, so `{ shape: cylinder }` became `{shape: cylinder}` and a comment after an opening brace moved onto a line of its own inside it.
- D2's WebAssembly build is 24.6 MB raw and 7.3 MB gzipped, as built from the pinned release with the flags the Dockerfile uses for the Markdown engine. An oracle-only program is 14.9 MB.
- In the browser build D2 runs its layout engines' JavaScript through the host's `eval`, which the site's security policy forbids on a page, so the engine needs a worker with a policy of its own (decision 3). Dagre's JavaScript is inside the WebAssembly and needs nothing else from the host. ELK is not: D2's own browser worker loads `elk.js` and a private `setup.js`, which replaces the worker's `setTimeout` so that ELK's asynchronous layout runs synchronously, and D2's Go code depends on that arrangement, which D2 does not document. Building the first milestone confirmed this: dagre drew in the browser, and ELK failed inside the engine without that setup.
- D2 compiles from an in-memory map of files that the host supplies, so the host decides what an `import` can read. It takes custom fonts, and it can report positions as UTF-16 offsets, which are the offsets CodeMirror uses.
- D2 reads the keywords `top` and `left` but refuses them with an error under its two bundled layout engines, dagre and ELK, because neither declares support for locked positions. Only TALA, a proprietary engine that is not bundled, accepts them.
- D2 has styles of diagram built in: sequence diagrams (`shape: sequence_diagram`), SQL tables, class shapes, grids and nested containers, plus boards (layers, scenarios and steps) and a `d2-config` block that a file can carry for its theme, layout engine and sketch mode.
- The language service in `d2lsp` produces completions and runs in the same WebAssembly.
- Mermaid is already vendored (3.5 MB) and drawn by the Editor with its strict security level. Its documented API parses and draws a diagram but offers nothing to edit one's source. The Editor recognises ` ```d2 ` fences but draws only ` ```mermaid ` ones, so D2 blocks show as placeholders today.

## Decisions

1. **A diagram is a text file, and nothing is kept beside it** (2026-11-03). `something.d2` is D2 and `something.mmd` is Mermaid, and `.mermaid` is also accepted on opening. The text is the whole of the diagram: no JSON model, no stored coordinates, no thumbnail. This is decision 1 of `docs/slides-design.md` applied to diagrams, and it keeps a diagram readable by the Editor, the Terminal, git and an agent. Files opens these suffixes in Diagrams, and the Editor opens them as text with colouring.

2. **D2 is the native language and Mermaid is the compatible one** (2026-11-03). D2 is chosen for the visual editor because the language's own Go packages edit its text and report where every object is written, which makes the editor a thin layer over the language. Mermaid has no such interface, so a visual editor over it would mean writing and maintaining a parser and writer for every one of its diagram grammars. D2 is also one grammar for most styles of diagram, where Mermaid has a separate grammar for each, so one palette mechanism and one inspector serve all of D2. Mermaid stays because people already have Mermaid in their documents, GitHub draws it, the Editor draws it today, and it has chart-like types that D2 lacks (Gantt, pie, timeline, mind map, git graph, user journey and quadrant charts, to the extent the vendored version supports them). Diagrams therefore opens a D2 file in Text, Visual and Split, and a Mermaid file in Text, Preview and Split. The cost is two renderers, loaded only when a diagram of their kind is drawn. Whether Mermaid flowcharts ever get a visual editor is open question 2.

3. **The D2 engine is D2 itself, compiled to WebAssembly and run in a worker** (2026-11-03). A new entry point, `cmd/yavc-d2`, is built in the image beside `yavc-md`, with its functions in `internal/d2api`, which takes and returns JSON text as `internal/mdapi` does and has no build tag, so the functions are tested natively. The functions are compile, render, the edit operations, format, completions and object ranges. The text of a diagram never leaves the browser (DESIGN.md, decision 11). The engine runs in a dedicated worker, as D2's own JavaScript package runs it, because a large layout would otherwise freeze the page and because D2 needs `eval`. The engine serves the worker's script with a security policy of its own, which allows `eval` and WebAssembly and nothing else: no host can be reached from the worker, not even this one, so the page compiles the engine and hands it over. A worker takes its policy from its own script's response, which CSP Level 3 specifies, and the page's policy is unchanged. The browser build lays out with dagre only (open question 7). A request that runs over its budget is cancelled by ending the worker and starting another, and a newer request for a diagram replaces an older one still waiting. The budget is set in the first milestone from measurements of diagrams of 10, 50 and 200 shapes, which have not been made yet. D2 is pinned to an exact version in `go.mod`.

4. **Only D2's documented packages are used, and a version is a deliberate change** (2026-11-03). D2 is below version 1.0 and promises no stable Go API, so the engine uses only exported packages (`d2lib`, `d2oracle`, `d2format`, `d2lsp`, `d2target` and `d2themes`), and takes every position from the compiled `d2target.Diagram` and none from the SVG that D2 draws. Golden tests in `internal/d2api` hold every operation the application uses to the text it must produce, so moving to a newer D2 shows up as a diff in a test. This follows the rule that nothing in the design may rest on undocumented behaviour of an outside system.

5. **The text is the only model, and a visual edit is a text edit** (2026-11-03). The canvas keeps no model of its own. Each gesture becomes one oracle operation on the current text, and the new text replaces the old as one CodeMirror transaction, so undo, redo, the cursor and the text pane stay a single thing. The canvas then redraws from a fresh compile. The oracle writes the whole file through D2's formatter, so the first visual edit of a hand-written file tidies its spacing, keeps its comments and may move a comment that trailed an opening brace onto its own line. Diagrams says so once per file, in the status line with an Undo beside it, and Diagram, Format Text applies the same tidying on request. Editing the text alone never reformats it. While the text has an error the canvas shows the last good drawing dimmed, the error is marked in the text and in a notice beside the canvas, and the visual editing commands are disabled with the reason on each, since an edit needs a valid diagram to edit. (They were to be absent; on 2026-11-04 they became disabled with a reason, as the Editor's and Slides' commands are when they cannot run, so the toolbar keeps its shape and says why.)

6. **Layout is automatic, and the visual editor places by meaning** (2026-11-03). The bundled engines cannot take coordinates (see the research), so the editor does not offer dragging a shape to a pixel. It is the choice Slides made for text boxes, for the same reason. A coordinate in the file would have to survive every later change, and it would contradict the layout engine that draws the rest. What placing means here is that dropping a new shape chooses its container and its place among the siblings, which decides where its line goes in the text. Direction, grid and layout engine are diagram settings, written into D2's `d2-config` block, which wins over anything the page asks for. Dagre is the engine in the browser; ELK, which handles sized containers and connections into a container's descendants better, waits on open question 7. Open question 1 asks whether Paul wants pinned positions anyway.

7. **A style of diagram is a template and a palette, and the style is read from the text** (2026-11-03). New Diagram offers the styles in the table below. A style supplies a starter text and decides which shapes, connection kinds and properties the palette and the inspector offer. The style is not recorded in the file. It is read from the text, so that a root `shape: sequence_diagram` makes a sequence diagram and a file edited by hand or by an agent is still the style it looks like.

8. **There are three views, and every operation has a keyboard path** (2026-11-03). Text, Visual and Split are the Editor's three, with the canvas docking where Slides docks its canvas (docs/slides-design.md, decision 10). For Mermaid, Visual is replaced by Preview. Each tab remembers its view. Selecting a shape selects its source ranges in the text, and placing the cursor in the text selects the shape written there. An Outline pane, a tree of the diagram's containers, shapes and connections, is the alternative to the canvas for a person who cannot use a pointer and the precise tool for a large diagram. Every gesture is also a command in the application's command table, which gives it a menu row, a key and an agent action. The canvas is arrowed through (the arrow keys move along connections), Enter edits a label, and C begins a connection.

9. **Embedding is by reference, and a fenced block is the portable form** (2026-11-03). The new shortcode `{{diagram:path}}` draws a diagram file where it stands. A diagram file is edited once and every document that embeds it follows. A fenced block (` ```d2 ` or ` ```mermaid `) keeps the source inside the document, which is the form that travels with it. The two draw identically. Both are described in the section on embedding.

10. **A drawn diagram is an image** (2026-11-03). D2's SVG is shown through an `<img>` element with a blob address, which browsers draw in a static mode where the image runs no script, loads nothing from outside and cannot restyle the page. The HTML cleaner's rule against a `<style>` element in markup therefore needs no exception for D2's output. The cost is that a link or tooltip inside the diagram cannot be pressed in a document, which the overlay of the visual editor and a later interactive mode can supply. The embed gets an accessible text alternative, the `alt` argument, and a generated outline of the diagram's connections in a disclosure under the figure. Mermaid keeps its present path (strict security level and the cleaner's scoped stylesheet) until a browser test in the second milestone shows that its output draws correctly as an image in the browsers the site supports.

11. **Icons, links and imports are the host's to allow** (2026-11-03). The compile is given an in-memory file map that contains only the `.d2` files in the diagram's own folder, up to a size limit, so an `import` cannot read anything else. After compiling, the engine reports each icon address in the diagram, and the page fetches the ones that are allowed (the site's own, the reader's home folder, and `data:` images), passes them back as `data:` addresses for the render, and shows a notice for the rest. A remote icon is therefore never loaded, since a shared diagram must not be able to make a reader's browser contact another host (DESIGN.md, decision 6). The site's own icon set for diagrams is PUDL's glyphs, to which the first milestone adds a small set of architecture icons under an open licence.

12. **The site's look is applied to diagrams** (2026-11-03; colours decided by Paul the same day). D2's palette is replaced by PUDL's: the page reads its own tokens where the diagram stands (the accent, the text, the muted text, the rules and the background, through a deck's own tokens on a slide) and gives D2 each colour of its palette by the role D2 uses it for, the text as N1, the background as N7, the accent as B1 and B2, and tints of the accent toward the background as B3 to B6. A diagram therefore follows the site's mode, its colour theme and a deck's theme. A file's own `theme-id` or `theme-overrides` in `d2-config` wins, and then the page changes nothing. The engine is given the site's font, in the form D2 takes, so that diagram text matches the page, if PUDL's font files are in a form D2 accepts (open question 5). The diagram redraws when the mode changes.

13. **The package, its addresses and its agents** (2026-11-03). `apps/diagrams` is a site-owned package, so it runs at `diagrams.yavc.app` and in a window, with its state in the address as `file=`, `view=` and `board=`. The shared code is a new folder, `apps/diagram-kit`, in the way `apps/md-editor` is shared: the worker and its client, the renderer used for embeds, the D2 colouring for CodeMirror and the cache. Its manifest declares the provider `yavc.diagrams` (docs/agents-design.md), with actions to read and write a diagram's text, to compile it and read its structure, to render it to an artifact, and one for each edit operation, so that an agent can draw a diagram by adding shapes and connecting them as well as by writing D2. The actions that return file content declare `files.read`. The package needs a help page (`pages/help/diagrams.md`) and an entry in the list of applications that documents may not embed (`apps/md-engine/safe-html.js`), both of which the checks enforce.

14. **Export is SVG, PNG and source** (2026-11-03). Download as SVG writes a self-contained file with D2's embedded fonts, Download as PNG rasterises at one, two or three times the size, and Copy as Embed puts the `{{diagram}}` shortcode or a fenced block on the clipboard. Download as PDF prints the diagram on one page sized to it, which keeps it as vectors, and Download as Word writes it as a picture in a document through the editing kit's Word export (docs/docs-design.md, decision 18; Paul, 2026-11-03). Slides' PowerPoint export and the Editor's Word export (docs/docs-design.md, decision 8) place a diagram as a picture at twice its size, since neither format has a native shape for one.

15. **Diagrams looks and works as the Editor and Slides do, and what is new is PUDL's** (2026-11-03, Paul). Wherever the Editor or Slides has settled something, Diagrams does the same: the toolbar and menus built from a command table, the document tabs shown only while more than one diagram is open, the view switch, the canvas docking as Slides docks its canvas, the status bar, the site's dialogs (`static/dialogs.js`), the editing kit's forms and right-click menus drawn from the command table. What has no precedent is built from PUDL's components and follows its rules: the palette is a toolbar of raised buttons, the inspector is a form of sunken fields, the Outline pane is PUDL's tree, the canvas's selection is the focus ring, a status has a glyph as well as a colour, and an error is a PUDL notice beside what failed. Each milestone that adds to what the site draws is checked against PUDL by the PUDL reviewer before it is reported.

    How Diagrams tells the person something follows PUDL's division (README, notices and toasts; the status area), as Paul reminded on 2026-11-03. A fault the person must deal with, such as a mistake in a diagram, is a notice beside it, through the site's shared `yavcUtil.notice`, and never a toast, because a toast goes away. Something taking a moment, such as the engine starting, is PUDL's loading state where the wait is, with words beside the spinner. A confirmation that passes (saved, copied as an embed, exported) goes in the status line, as it does in Slides and the Editor, which is the precedent this decision follows; PUDL's toast would also suit it, and moving all three applications to toasts together is a change for Paul to make if he wants it (2026-11-04, after the PUDL review of the first part of D2). Work that goes on in the background, such as an agent editing a diagram or a diagram changed in another window, would belong in the status area and in a notification list, which the site does not have yet; DESIGN.md open question 5 says when it would be worth building.

## Styles of diagram

| Style | How it is written | What the palette offers |
|---|---|---|
| Flowchart | Shapes and labelled connections, `direction: down` | Process, decision, start and end, data, document, sub-process |
| Architecture | Nested containers, cylinders, queues, clouds, packages, people | The same, with containers that take shapes dropped into them |
| Sequence | `shape: sequence_diagram`, actors, then messages in text order | Actors, messages, spans, groups and notes |
| Entity relationship | `shape: sql_table` with typed, constrained rows | Tables, rows, keys and connections between rows |
| Class | `shape: class` with fields and methods | Classes, members with visibility, inheritance and association |
| State machine | Oval states with labelled transitions | States, start, end and transitions |
| Org chart | Containers and people with `direction: down` | People, teams and reporting lines |
| Grid | `grid-rows` and `grid-columns` | Cells, in rows and columns |
| Mermaid chart types | Mermaid text, edited in Text and Preview | A starter and a short reference for each type the vendored Mermaid has |

## What the visual editor does

Each gesture is one operation on the text. The operations are D2 oracle functions except where the table says otherwise.

| Gesture | Operation |
|---|---|
| Choose a shape in the palette and click the canvas | Create the shape inside the container under the pointer and set its shape type |
| Drag from a connection handle to another shape | Create a connection between the two |
| Drag from a handle onto empty canvas | Create a new shape and a connection to it |
| Double-click a shape or connection | Edit its label in place (Set) |
| Drag a shape into or out of a container | Move, which also updates every reference to it |
| Drag the end of a connection to another shape | Reconnect |
| Choose Delete | Delete, which also removes its connections |
| Change the Name field in the inspector | Rename |
| Change fill, stroke, font, icon, link or tooltip in the inspector | Set on the matching key |
| Group the selected shapes | Create a container and Move each shape into it |
| Move a shape or message up or down among its siblings | Reorder, which the oracle does not provide and which is written over the ranges the compile reports |

Reordering is the one operation that is not an oracle function. It is needed for the order of messages in a sequence diagram, so it is scheduled with that style and has its own tests.

## Embedding in the Editor and in Slides

An embedded diagram is a figure drawn from a source, and it is drawn by the shared renderer in `apps/diagram-kit`, which the page view's block drawing (`drawBlocks`) calls for both forms.

**The shortcode.** `{{diagram:~/diagrams/arch.d2 alt="Request path" width=80% caption="The request path" board=deploy theme=auto}}` draws the file. The path follows the rule of the picture and code shortcodes: beside the document, under `~`, or a path on the site. The engine's part is the same as for `{{code}}`. It writes a placeholder with the path and the options in its attributes, and the page loads the file and draws it, since the engine in the browser has the document's text alone. The result is cached under a hash of the source and the options, and the cache supplies a figure's size to the placeholder before it is drawn, so that a page does not jump. `board` selects one of D2's boards. A later milestone adds `step`, which Slides uses to reveal a diagram's steps one at a time.

**Fenced blocks.** ` ```d2 ` and ` ```mermaid ` blocks both draw, through the same renderer, in the Editor's preview and Visual view and on a slide. D2 blocks begin to draw with the first milestone.

**Editing an embedded diagram.** Pressing a drawn diagram in Visual view opens a form like the picture dialog's, with its path or source, `alt`, width, caption and board. For a file it also offers Edit in Diagrams, which opens that file in the Diagrams window or page. For a fenced block it offers Move to a File, which writes the source to a new file beside the document, replaces the block with a `{{diagram}}` line and opens the file in Diagrams. Insert, Diagram offers an existing file (with Browse) or a new diagram of a chosen style.

**Staying current.** Saving in Diagrams sends the path and a fingerprint of the text over a `BroadcastChannel`, as Slides does for its presenter, and an embed that shows that path draws again. A page also checks its embeds' fingerprints when it comes back into view.

**The limit on files.** A reader's files are kept per address (DESIGN.md, decision 11). On the desktop at `yavc.app` every application is in one origin and embeds follow edits at once. A diagram saved at `diagrams.yavc.app` cannot be seen at `editor.yavc.app`, exactly as a picture cannot. The fenced block is the form that works everywhere, and a home on the server removes the limit for files.

## Safety

A diagram file is text that anyone may have written, and an agent may write it, so it is untrusted.

- The drawn result is an image, which runs nothing and loads nothing (decision 10).
- The compile reads only the files it is given, and only icons the host has fetched and allowed (decision 11).
- A source is limited to 256 KB and a diagram to a number of shapes and connections that the first milestone sets from the measurements, and a compile that overruns ends its worker (decision 3).
- An agent's edits arrive as the actions of decision 13 and go through the same oracle, under the same limits, and the person is asked before an agent writes a file (docs/agents-design.md, decision 6).
- Mermaid keeps its strict security level, which turns off its click handlers and sanitises labels, and its output goes through the cleaner as it does now.
- The engine's licences are shipped with it: D2 is under the Mozilla Public License 2.0, the ELK layout code bundled in D2 under the Eclipse Public License 2.0 and dagre under the MIT licence, according to D2's own notices. The first milestone audits every dependency of the build for a notice and adds a check that fails when one is missing, before the first release.

## What is left out, and why

Dragging shapes to pixels is left out (decision 6). Hand-drawn freeform shapes and images pasted onto the canvas are left out because they have no text form. Real-time collaboration needs accounts. D2's TALA layout engine is proprietary and is not included. Interactive diagrams, with working links and tooltips inside a document, are left for a later milestone that would sanitise D2's markup, since decision 10 is what makes the first version safe.

## What this means for the Editor

The Editor's design in `docs/docs-design.md` is to be built with Diagrams in view, in these ways.

- The `{{diagram}}` shortcode joins the shortcodes the Editor knows, with a form, an Insert entry and a place in the `/` menu, and the existing `{{caption}}` follows it, with figure and table numbering applying to diagrams too.
- The Document view's pagination (decision 6 there) treats a diagram as a block that stays on one page and takes its height from the cached size before it is drawn, then adjusts when it is measured.
- The Word export and the PDF are built from drawn diagrams as pictures (decision 8 there), and the HTML export inlines the SVG as an image.
- Custom shortcodes (decision 12 there) may wrap `{{diagram}}`, so a document can define its own figure with a diagram.
- The Text view colours D2 and Mermaid, both as files and inside fenced blocks, with a shared CodeMirror mode from `apps/diagram-kit`. D2 files get completions from `d2lsp`, which runs in the browser.
- That last point corrects decision 14 there. A language server for most languages is a process that needs a server, which decision 11 of DESIGN.md rules out until accounts exist. D2's language service is Go that compiles to the browser, so D2 is the first language with completions in the Editor, and it shows the shape a language service takes when it can run in the page.

## Order of work

Each milestone ends with the repository's checks, tests for what it adds, a check in Chromium, and a note in `docs/review.md`.

| Milestone | Work | Size and risk |
|---|---|---|
| D1. The engine and the renderer | `internal/d2api` with golden tests, `cmd/yavc-d2`, the worker, the image build, measurements and budgets, the licence audit and its check, `apps/diagram-kit` with the renderer and cache, and D2 fenced blocks drawing in the Editor and Slides | About 1,500 lines, 2 to 3 sessions. Medium risk: the worker and the build are new, and the measurements may force limits |
| D2. The application, text first | `apps/diagrams` with files, tabs, Text, Preview and Split, the D2 colouring and completions, Mermaid, the starters, export, the help page and actions for text, the `{{diagram}}` shortcode with its form, Insert entries and live update, and the Mermaid-as-image test | About 2,000 lines, 3 to 4 sessions. Low to medium risk |
| D3. The visual editor | The canvas drawn from the compile, selection tied to source ranges, the inspector, the palette for flowchart and architecture, create, connect, label, move, delete and rename through the oracle, the Outline pane, the keyboard paths, shared undo, the formatting notice and the error state | About 2,500 lines, 4 to 5 sessions. The highest risk, since interaction code is where it is hardest to be sure, and the repository has no JavaScript test suite |
| D4. Styles and depth | Sequence with reordering, entity relationship, class, state, grid and org chart palettes, boards and steps with Slides' reveal, themes, sketch mode and the icon set, and the agent actions for each edit | About 2,000 lines, 3 to 4 sessions. Medium risk, mostly in reordering |
| D5. Extensions | Whatever open questions 1 to 3 become, and interactive diagrams | To be sized when chosen |

The Editor's own milestones continue in parallel. The Editor's export and pagination work depends on D2 in the table above, since a diagram's size is known only once it is drawn.

## Progress

Milestone D1 was built on 2026-11-03 and checked in Chromium against a local build. It added these parts.

- The engine (`internal/d2api` and `cmd/yavc-d2`), with tests for drawing, repeatability, problems with their places, the size and shape limits, blocked icons, restricted imports, a diagram's own settings winning, and the page's background
- The worker (`apps/diagram-kit/worker.js`) with its own security policy, and a test in `internal/web` that keeps that policy to this one script
- The client (`apps/diagram-kit/d2.js`), which compiles the engine once, sends one request at a time, stops one that runs over 20 seconds, drops a request that a newer one for the same diagram replaced, keeps recent drawings, and draws again when the site's mode changes
- D2 fenced blocks drawn in the Editor's preview and Visual view and on slides, as images on the background behind them
- The licence notices beside the engine, and the rule that keeps them complete
- `golang.org/x/image` raised from 0.20.0 to 0.45.0, which removes nine known vulnerabilities that D2's requirement brought in

Measured in Chromium in the build container, a first diagram took 4.7 s from a cold start, almost all of it compiling and starting the engine, which is 22.0 MB, or 6.9 MB gzipped, and was downloaded from the same machine. Dagre took 0.13 s for 10 shapes, 0.35 s for 200, 0.75 s for 500 and 1.5 s for 1,000, growing about linearly, and the drawings were 16 KB to 660 KB of SVG. The 2,000-shape limit and the 20-second stop are set from those figures.

The milestone left four things for later.

- ELK in the browser waits on open question 7.
- Icons from the site and the home folder, which decision 11 lets the page allow, wait for milestone D2; until then only icons already written as data addresses are drawn and every other icon is left out.
- Imports work through the file map, but no page supplies files for them until the Diagrams application arrives in milestone D2.
- The site's own font waits on open question 5.

Milestone D2 is being built in two parts. The first part (2026-11-04) is the application itself, and it added these.

- `apps/diagrams`, at `diagrams.yavc.app` and in a window, with tabs, Open, Save and Save As, a reload that keeps unsaved diagrams, and Text, Preview and Split with the drawing docked on any side of the text, as Slides docks its canvas. Preview stands where Visual will stand once the visual editor exists.
- New Diagram with a starter for each of the eight D2 styles, and New Mermaid Diagram with eleven of Mermaid's kinds
- Colouring for D2 and Mermaid (`apps/diagram-kit/modes.js`), and completions in D2 from D2's own language service, which the engine now offers with `completions`
- A mistake in the text keeps the last good drawing dimmed, with the site's notice above it and the place marked in the text; the D2 client's `draw` and the editing kit's new `drawMermaid` both take this as an option and report their result
- Tidy the Text, through the engine's new `format`, as one change that Undo takes back
- Download as SVG, as PNG at one to three times the size, and as text, and Copy as Embed, which copies a fenced block
- The provider `yavc.diagrams` with twelve actions, including `outline@1`, which reads a D2 diagram's shapes and connections with where each is written, through the engine's new `outline`
- Files opens `.d2`, `.mmd` and `.mermaid` in Diagrams, the site's file system treats them as text, Diagrams is on the list of applications a document may not embed, and the stock home folder has a sample, `~/Howto/Diagrams.d2`
- The CodeMirror colours the Editor used moved into the editing kit (`codeTheme`), so the Editor and Diagrams share one copy

Two faults turned up while it was checked in Chromium, and both are fixed. Two requests to draw one place could reach the engine out of order, because a part already loaded was handed to a later caller as a new promise, which ran first; the older request then replaced the newer one and the status stayed at "Drawing…". Every caller now shares one promise per part. And all tabs drew into one element, so a D2 drawing that finished after a switch painted over the Mermaid tab in front; each tab now draws into an element of its own.

Milestone D3 began on 2026-11-04, ahead of the second part of D2, because Paul wanted to draw diagrams on the canvas first; the embedding does not depend on it. Its first part added these.

- The engine's `edit`, which runs D2's oracle on the current text (create, set, delete, rename, move and reconnect) and returns the text as D2's formatter writes it, with golden tests for each operation that pin what D2 0.7.2 writes
- Each shape's box and each connection's route in the compile's answer, in the drawing's own pixels, taken from the compiled diagram and D2's bounding box and never from the SVG (decision 4), with a test that the boxes lie inside the drawing and that a connection's key is one `edit` accepts
- The canvas (`apps/diagrams/canvas.js`), a layer of the site's own SVG over the drawing that takes clicks and keys and draws the selection as PUDL's focus ring; it goes back over the picture when the D2 client redraws it for a change of mode
- Selection both ways between the drawing and the text, through the outline's places
- The Shape menu and toolbar group: Add Shape (N), Add Shape Inside (Shift+N), Connect To (C, then a click or Enter on the other shape), Edit Label (Enter or a double click), Rename (F2, with the name checked in the dialog), Shape, and Delete, the keys working only while the drawing has the focus so typing in the text never changes the drawing; the view is called Visual for a D2 diagram
- The note in the status line the first time a change rewrites an untidy file (decision 5), and the action `edit@1`, so an agent can draw a diagram shape by shape

A new shape is called `item`, because `shape` is one of D2's keywords and D2 renames a shape given that name.

The second part of D3 (2026-11-04) added these.

- The palette, a toolbar of its own over the drawing, with Select and twelve kinds of shape, each a project glyph (`--glyph-yavc-shape-*`); a kind chosen is placed by the next click, inside the shape clicked or at the top on empty space, and the palette goes back to Select after each one. It is not in the main toolbar, because thirteen more buttons there folded every group into a menu.
- A handle on the selected shape, from which a connection is dragged to another shape, or to empty space, where it makes a new shape of the palette's kind
- Dragging a selected shape onto a container to move it inside, or onto empty space to move it to the top, through D2's move with its descendants, so every reference follows
- The engine's `create` taking the new shape's kind, so placing a shape of a kind is one change and one Undo; when the change is a connection, the kind is set on the far end only if the connection made it

A connection dragged out to empty space needs a free name for its far end, since D2 joins a connection to whatever shape already has the name in its key; the first version used `item` and joined an existing `item`, which the browser check caught. Still to come in D3 are the order of a new shape among its siblings (decision 6), the inspector for colours and other settings, the Outline pane, and the arrow keys moving along connections rather than in drawing order.

The second part of D2 is the embedding: the `{{diagram}}` shortcode with its form and Insert entries, live update over a `BroadcastChannel`, icons from the site and the home folder, imports from the diagram's folder, the colouring in the Editor's own text view, and the browser test of Mermaid drawn as an image. Download as PDF and as Word wait for the editing kit's exports (docs/docs-design.md, decision 18).

## Open questions

1. **Pinned positions.** Dragging a shape to a place would need its position stored somewhere (a comment block in the file is the likeliest), would fight the layout engine, and is refused by D2 itself. The recommendation is to leave it out. If Paul wants it, the cost is a layout of our own for pinned shapes and a convention that nothing else reads.
2. **Visual editing for Mermaid.** A flowchart-only editor over a subset of Mermaid's grammar, with every line it does not understand kept as written, is possible and would cover the commonest Mermaid diagram. It is a second visual editor to maintain. The recommendation is to wait until D3 is in use and see whether people ask.
3. **Editing in place.** The visual editor could be offered as a panel inside the Editor and Slides, as well as a window. The shared kit would allow it, and the window is simpler to build and to keep safe. The recommendation is the window first.
4. **The Mermaid suffix.** `.mmd` is the suffix proposed for new files, with `.mermaid` accepted on opening. A different choice changes only a table in Files.
5. **Fonts.** D2 takes TrueType fonts (its own bundled faces are `.ttf`), and PUDL ships Inter only as WOFF2, split by script. Decided on 2026-11-03 (Paul): PUDL is asked to ship Inter as TrueType as well, and diagrams draw with D2's own Source Sans Pro until it does; no conversion step is added to the image build.
6. **The size of the engine.** About 7 MB gzipped is loaded the first time a D2 diagram is drawn on a device, and is cached after that under an address that changes only with a release. The text editor does not wait for it. The recommendation is to accept this, since the alternative, a smaller engine, would lose the oracle.
7. **ELK in the browser.** Decided on 2026-11-03 (Paul): ELK stays out of the browser build until D2 documents a way to provide it there, since D2's own browser worker provides it only through a private setup that this design will not copy. A diagram that asks for ELK shows a notice saying so, and dagre draws everything else.
