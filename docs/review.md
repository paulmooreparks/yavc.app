# Stem-to-stern review, November 2026

This document records the review of yavc.app that began on 2026-11-02: what was found, what was changed, and which check now stops each problem from coming back. Paul asked for the review with security first, then duplication, shared libraries, data structures and algorithms, performance, PUDL compliance and sensible UI. Six reviewers covered the server, the browser, duplication, performance, robustness and tests, and PUDL and the UI.

Any change to the repository should leave `scripts/check.sh` passing. A fix that has no check guarding it is recorded below with the reason a check was not practical.

## How fixes are kept

`scripts/check.sh` runs every check in one command and stops at the first failure. It runs gofmt, `go vet` for the server and for the WebAssembly build, the Go tests (with the race detector when a C compiler is present), both builds, and `scripts/check.mjs`. With `--since REF` it also runs the checks that compare against a git ref. CI runs it on every push through `.github/workflows/check.yml`, passing the commit before the push as the ref.

`scripts/check.mjs` holds the project's own rules for browser code, stylesheets and text. A line can opt out of one rule with a comment of the form `check-ignore(rule-id): reason`, and the reason is required so that a reader can judge it.

| Rule | What it stops |
| --- | --- |
| js-syntax | A browser script that does not parse. |
| no-em-dash | Em-dashes anywhere in the project's own text. |
| glyph-defined | A glyph used by a command or menu that neither PUDL nor a project stylesheet defines, which renders as a black square. |
| glyph-namespace | A project glyph outside the `--glyph-yavc-*` names, which could collide with a later PUDL glyph. Applets are exempt. |
| window-open-noopener | A `window.open` call that lets the opened page reach back through `window.opener`. |
| pudl-script-loaded | A page using a PUDL component whose script the layout does not load. |
| action-reads-declare | An applet action that returns file content without declaring `files.read`, which would let an agent read files through it without asking. |
| grant-all | A permission grant that covers every capability at once. |
| not-embedded-complete | An applet under `apps/` missing from the list of the site's applets that a Markdown document may not embed. |
| one-shared-implementation | A second copy of something the shared modules already provide: HTML escaping, script loading, downloads, dialogs, shortcut labels, Mermaid rendering, error notices. |
| applet-version-bump | An applet whose files changed since the ref while its `applet.json` version stayed the same. Needs `--since`. |

## Browser security

The browser holds the user's files in IndexedDB and runs applets and agents against them, so most of the serious findings were here. All of the following are fixed, deployed and verified on yavc.app.

- **Terminal commands run by an agent** now run as the agent's owner with no grants of their own, so an agent cannot borrow the Terminal's access to reach files it was never given.
- **Actions that return file content** in the Editor, Slides and the Terminal declare `files.read`. Before the fix an agent could read any document through them without a permission prompt. The `action-reads-declare` rule guards this.
- **The permission dialog** now shows the input an agent is passing, always asks for commands, dotfiles and anything under `~/bin`, keys remembered grants by capability, reference and folder, and keeps its buttons disabled for 700 ms so a click aimed at something else cannot approve it.
- **Sanitised HTML** drops every `<style>` element except Mermaid's own rules, which are kept only when scoped under the diagram's SVG id. Style attributes are filtered against an allowlist that refuses `url()`, and `ping` and `srcset` attributes are removed.
- **Deck stylesheets** are parsed with `CSSStyleSheet` and only rules scoped to the deck survive. Exported CSS escapes `<` so it cannot close the style element.
- **SVG pictures** are downloaded instead of opened, because an SVG opened directly runs its scripts with the site's origin.
- **PPTX import** reads through JSZip's streaming interface with limits of 16 MB per part, 64 MB in total and 1000 slides, so a crafted file cannot exhaust memory.
- **Creating and loading through agents** refuses a path that already exists, so an agent cannot overwrite a file by asking to create it.
- **Settings merges** skip `__proto__`, `constructor` and `prototype`, which closes prototype pollution through an imported settings file.
- **Response headers** now include a Content Security Policy, `X-Frame-Options`, `Cross-Origin-Opener-Policy` and HSTS. The Plausible snippet moved to its own file so the policy needs no inline script, and it strips query strings and fragments before anything is sent.
- **The site's own applets** (Editor, Files, Settings, Slides, Terminal) cannot be embedded in a Markdown document, because an embedded copy would act on the reader's files with the document author's choice of inputs. The `not-embedded-complete` rule fails the build when an applet under `apps/` is missing from the list.
- **Framing by other sites** is refused by `X-Frame-Options` and the policy's `frame-ancestors`.

## Duplication and shared libraries

Two shared modules replaced the copies that had grown in each applet. Both load in the layout before any applet.

- `internal/web/static/yavc-util.js` provides HTML escaping, versioned URLs, script and global loading, the site file system handle, downloads, shortcut labels, error notices and the version string.
- `internal/web/static/dialogs.js` provides one dialog builder with text, choice, confirm and save prompts. Every `prompt()`, `confirm()` and hand-built `<dialog>` in Files, the Editor, Slides and Settings now goes through it.

The Markdown kit used by the Editor and Slides gained one implementation each of the figure, shortcode and properties forms and of block drawing, so both applets render pictures, diagrams and applet embeds the same way. The `one-shared-implementation` rule fails a build that adds another copy.

## Performance

- **Block drawing** reuses a rendered block when its HTML has not changed, so typing in one paragraph no longer re-renders every Mermaid diagram and picture in the document. On a test document a keystroke reused the same diagram element and created no new object URLs.
- **Picture URLs** are cached by path, blob, modification time and size, and the old object URL is revoked when a picture changes.
- **The page view** re-parses only the blocks a change touched, with one block either side, instead of the whole document. A one-character edit in a large document parsed 73 characters and re-synced one node. Untouched blocks are kept as their original Markdown, so a round trip reproduces the source byte for byte.

## PUDL compliance and UI

- **Menus** follow PUDL's menu-bar guidance. The site's identity menu holds Desktop, About yavc.app and Settings, Settings is no longer listed as an applet to launch, and the window and page layouts live in View. Files has one File menu, and the Editor contributes its view and go-to-line commands to the site's View and Go menus instead of repeating them under its own titles.
- **Glyphs** that rendered as black squares under a colour theme are defined for every palette, and project glyphs use the `--glyph-yavc-*` names.
- **Errors** appear as PUDL notices beside the control that failed, instead of `alert()` or text that vanished.
- **Empty states** use PUDL's empty-state component in Files, the folder picker and the desktop list when a filter matches nothing.
- **Labels** are the same for the same action everywhere: New Terminal Window Here, Create in the folder picker, Open as a page and Open in a window on the cards.

## Go engine

The Go review (server security, robustness, performance and tests) is being merged separately, and its findings will be added here when it lands.

## Items for other projects

These problems belong to PUDL or to applets that are maintained elsewhere, so they were reported instead of patched here.

- The PUDL menu bar measures its items once and does not re-measure when content grows, which is why the top bar can cut off a menu.
- PUDL's confirm hook should pass the input being confirmed, so the permission dialog would not need to wrap the applet API to capture it.
- PUDL 0.97.1 is available. yavc.app is on 0.96.7.
- The sight-reader applet uses glyphs and a colour outside PUDL's set, the sudoku applet uses a hard-coded colour, and the dice applet has no minimum width.
- The barcode scanner applet uses `confirm()` and the host kit uses `alert()`. Both should use PUDL dialogs.
