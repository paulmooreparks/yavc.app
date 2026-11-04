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
- **Settings names** must be a plain word of letters, digits, `-` and `_`, and changes must be an object. Applets choose the name and it becomes a file name, so before this an applet could have written outside `~/.config` with a name such as `../bin/x`. A browser that ran an older build has a file called `[object HTMLDivElement].json` in `~/.config`, left by a caller that passed a page element as the name.
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
- **The relay's busy test** (`TestErrBusyAt32` in `internal/relay`) failed now and then, and every time with `-cpu 1`. The page's queue holds 32 events and the test sends exactly 32 invocations, then expected the page to have read them before it sent one more; with one processor the reading goroutine had not run yet, so the queue was still full and the hub rightly said the page was not keeping up. The test now waits until the page has read all 32 before it goes on, and passed 300 runs in a row with `-cpu 1` (2026-11-04). The relay itself was right.
- **The linear-time test** (`TestRenderIsLinear` in `internal/preview`) failed in CI on 2026-11-03 with a ratio of 5.19 against its limit of 5, though the renderer had not changed. Benchmarks show the renderer is linear: four times the sections take four times the memory and allocations and about 3.7 times as long. The test had timed five single renders, and in CI the other packages' tests, the D2 layout tests among them, run on the same cores at the same time. It now times each size with Go's benchmark runner, which averages over as many renders as fit in a second, and keeps the faster of two averages. Measured locally, the ratio went from anywhere between 2.5 and 4.9 to a steady 3.3. That was not enough: it failed again in CI on 2026-11-04 at 5.37, while the D2 engine's tests, longer by then, ran beside it, because each size's second fell under a different load. The sizes are now timed in nine alternating pairs a moment apart, each pair doing the same work for both, and the median ratio decides; run with the whole suite on two processors it came out at 3.5 to 4.1.

## PUDL compliance and UI

- **Menus** follow PUDL's menu-bar guidance. The site's identity menu holds Desktop, About yavc.app and Settings, Settings is no longer listed as an applet to launch, and the window and page layouts live in View. Files has one File menu, and the Editor contributes its view and go-to-line commands to the site's View and Go menus instead of repeating them under its own titles.
- **Glyphs** that rendered as black squares under a colour theme are defined for every palette, and project glyphs use the `--glyph-yavc-*` names.
- **Errors** appear as PUDL notices beside the control that failed, instead of `alert()` or text that vanished.
- **Empty states** use PUDL's empty-state component in Files, the folder picker and the desktop list when a filter matches nothing.
- **Labels** are the same for the same action everywhere: New Terminal Window Here, Create in the folder picker, Open as a page and Open in a window on the cards.

## Go engine

Each finding below is fixed, changed in scope, or deferred, with the test that guards it. The tests are in the package the finding is about; a fuzz target runs only its seeds under `go test` and runs for real with `go test -fuzz`.

| # | Finding | Status | Guard |
|---|---|---|---|
| 1 | Relay memory | Fixed | TestReportArtifactBudget, TestUnfinishedRecordsExpire, TestErrBusyAt32, TestInvokeValidation |
| 2 | Relay resubscribe | Fixed | TestResubscribeSamePage, TestSubscribeCapPerSession, TestCloseSession |
| 3 | Session budgets | Fixed | TestPutStateSessionBudget |
| 4 | Session store | Fixed | internal/session/store_test.go, including TestConcurrentUpdatesLoseNothing, TestDeleteRacesUpdate and TestFindAgentMissDoesNotScan |
| 5 | Pairing tokens | Fixed | TestTokenRoutesDesktopOnly, TestMutationRequiresSecFetchSite, TestMakeTokenFirstRequest, TestTokenExpires, TestDeleteSessionRevokesTokens |
| 6 | Open redirect | Fixed | TestPageRedirectStaysOnSite |
| 7 | The MCP endpoint | Fixed | internal/mcp/mcp_test.go, TestUnknownHostRoutes |
| 8 | Desktop requests | Fixed | TestDesktopOpenCapped, TestBudgets with BenchmarkAppletFile, BenchmarkDesktop3Win and BenchmarkTree |
| 9 | Server timeouts and shutdown | Fixed | TestHTTPServerTimeouts |
| 10 | Absolute addresses | Fixed | TestSiteURLIgnoresHostPortInProduction |
| 11 | File serving | Fixed | TestAppletDirNoListing, TestAppletSymlinkEscape |
| 12 | Answers written twice | Fixed | TestUnknownHostRoutes |
| 13 | Home seed | Fixed | TestHomeSeedKeys, TestHomeSeedDigest, TestHomeSeedHandler |
| 14 | Caching and compression | Changed in scope | TestStaticDigestAndCaching, TestRegistryAddress, TestCompression |
| 15 | Docker and govulncheck | Fixed | scripts/check.sh runs govulncheck |
| 16 | The Markdown engine's API | Fixed | TestFunctions, TestCallRecovers, TestSerializeNilChildren, FuzzWasmAPI, FuzzSerializeJSON |
| 17 | Front matter | Fixed | TestOtherLineBreaksAreProblems, TestSetKeepsAList, TestListWithCommaItemsNotEditable, TestVerifyKeepsKind, FuzzRead, FuzzSet |
| 18 | The page view's round trip | Fixed | TestEmptyContainersRoundTrip, TestColumnSeparatorsEitherForm, TestLineEnds, TestSerializeTypedIsShown, TestHeadingEscapes, FuzzDocumentRoundTrip, FuzzParse, FuzzSerializeTyped |
| 19 | One end of front matter | Fixed | TestFrontMatterAgrees |
| 20 | The preview's line numbers | Fixed | TestRenderIsLinear |
| 21 | Shortcodes | Fixed | TestNestedSameNameContainer, TestStrayCloserShowsItself, TestLabelsFromArguments, TestImageRuleShared, FuzzShortcodes, FuzzPreview |
| 22 | One way to write JSON | Fixed | TestPersistenceThroughHTTP, TestTokenRoutesDesktopOnly |

### What each fix is

1. The relay keeps an artifact of at most 4 MB and a record's artifacts to 16 MB, takes artifacts only with the report that finishes a record, runs at most 32 records for one session, and fails a record still running 660 seconds after it was sent (the longest wait, 600 seconds, and a margin). It sweeps on every Invoke, Report and Record and once a minute from the server. The MCP server refuses an action the catalogue does not list. The hub cannot know the catalogue, so that check is in `internal/mcp` rather than the hub.
2. A page that opens a second stream with the same id takes over the first: the old stream is closed, the events it had not written go down the new one, the records sent to the page stay with it, and the old stream's leave does nothing. One session keeps 8 streams, and a ninth closes the oldest and fails what it was running; the hub keeps 4096 in all and answers 503 beyond.
3. A session keeps at most 64 KB of applet state under one key and 1 MB in all, and the same for settings; a change beyond either is refused with 413 and not kept.
4. The store locks each session by one of 64 locks chosen by its id, keeps a copy of each session it has read or written and uses it while the file's modification time and size are unchanged, writes to a temporary file that is flushed, renamed and then followed by a flush of the folder (not on Windows, which has no way to flush a folder through the os package), and deletes under the session's lock, forgetting the session's tokens. The token index is built once when the store opens and kept current; a token it does not hold is never looked for in the folder. Sweep removes temporary files older than ten minutes, counts only sessions it removed, and logs a file that is not a session and leaves it alone.
5. A token is made and revoked only at the desktop's host. Every request that changes something is refused unless its Sec-Fetch-Site, when a browser sends one, is `same-origin` or `none`; the Origin check stays. The first token for a reader with no cookie now succeeds. A token lasts 90 days from when it was made, however often it is used. Deleting the session forgets its tokens and closes its pages' streams. Two points were considered and left: subdomains are not a security boundary for session state, since every subdomain shares the session cookie on the domain and any package can read and change the whole session; and rotating the session id when the first token is made was considered and deferred, because a reader's pages on other subdomains would lose their session until they reload.
6. `/page/{slug}` redirects only a page's slug and answers 404 for anything else, so `%2F%2F` and `%5C%5C` cannot lead off the site. The redirect from an applet's subdomain to the desktop's page is held to the same rule.
7. `/mcp` answers only on the site's own hosts. The server keeps 1024 MCP sessions, forgetting the one used longest ago, and forgets one unused for an hour. One token may have 4 calls waiting for their results; a fifth is refused unless it asks not to wait. The unknown-session answer sets its JSON type before its status. A body over 16 MB is answered 413.
8. An address opens each window once and no more than 20. A request builds its page data once, however many windows it draws. The skins and colour themes are read when the engine starts. The applet catalogue is looked at again no more than once a second, keeps its applets by name, and reads each actions manifest once for each state of the catalogue. `/api/site/texts` takes at most 50 slugs and reads a page's text without rendering it, and a rendered page is kept until its file changes. On my machine, without the race detector, an applet file takes about 0.2 ms, a desktop with three windows 0.8 ms, and the site tree 0.8 ms; the budgets in TestBudgets are 2, 25 and 15 ms.
9. The server has a 10-second header timeout, a 30-second read timeout and a 120-second idle timeout. Each answer must be written within two minutes, set through `http.ResponseController`, except the page's event stream and the MCP endpoint, which wait on the person's page and have no write deadline. The engine stops on SIGINT or SIGTERM: requests take their context from one that is cancelled when stopping begins, so the event streams end, and the server then waits up to 15 seconds for the rest.
10. An absolute address keeps the Host header's port only for a local run at `localhost`.
11. Package folders, shared folders and PUDL are served through `os.OpenRoot`, so a link inside a package cannot lead out of it, and a folder is answered 404, never listed. The embedded files are served the same way.
12. Every handler that checks the host returns at once when the host is not the site's, so the 404 body is written once.
13. The home seed keys each file by its path from the folder (`filepath.Rel`), so a folder given with a trailing slash or `./` gives the same keys; the digest includes each entry's kind; the seed is read once and again only when the folder changes; and the answer has the digest as its ETag, so a browser that has it gets 304.
14. A file whose address has the version of what it holds (`?v=` with the static digest, PUDL's version, or the package's version) is kept for a year as immutable; any other is revalidated. The embedded files have an ETag computed when the engine starts. The registry's address has a digest of the catalogue, which the page writes, and that address is kept as immutable; the registry without it is never kept. Text answers and WebAssembly are compressed with gzip from the standard library, as they are written, not from precompressed files; a request with a Range header is not compressed, and a compressed answer's strong ETag becomes weak. Two parts are not done. Brotli would need a module outside the standard library, which the brief ruled out. Linking only the active skin and colour theme would need browser changes: a colour theme is switched by setting `data-palette` (static/desktop.js) and PUDL's skin script registers every linked skin, so a stylesheet not linked would never load.
15. The build image is `golang:1.26.10-alpine3.24` and the runtime `alpine:3.24.3`. I kept Alpine rather than distroless: distroless's nonroot user is uid 65532, and the sessions already on the production volume belong to the Alpine image's user, so the engine could not have written them. The compose file makes the container read-only with a 16 MB tmpfs at /tmp, drops every capability, sets no-new-privileges and limits memory to 512 MB. The image was built and run under those restrictions, and stopped cleanly on SIGTERM. `scripts/check.sh` runs govulncheck v1.9.0 through `go run`.
16. The Markdown engine's functions are in `internal/mdapi`, which has no build tag, behind `Call(name, arg string) string`, which turns a panic into an error in JSON; `cmd/yavc-md` only puts them on the page. The serializers check for missing children.
17. Front matter holding `\r`, U+0085, U+2028 or U+2029 is reported as a problem with its line, and line numbers are clamped. A list is written back as a block sequence of its items; a list with an empty item or an item holding ", " is not editable; and a change that would alter an existing property's kind is refused.
18. A container or a column with an empty body comes back byte for byte, and the column separators are read whether they arrive as `[]any` or `[]string`. A document is written with CRLF only when every line ended in CRLF. The serializer escapes what a person types that Markdown would read as structure, including `{{` (written `\{{`), so a shortcode is made only through the menus and forms.
19. `frontmatter.End` is the one rule for where front matter ends (a line of `---`, ignoring spaces and tabs at its end), used by the front matter reader, the preview and the page view.
20. The preview builds a document's line starts once and finds a line by binary search. Rendering 1600 sections took 4.05 times as long as 400 in the last run, against a limit of 5.
21. A container inside one of the same name is closed by depth. A stray closer shows `{{/name}}`. `status` and `page` build their labels from the parsed arguments, so a quoted first argument works. A Markdown image and a figure share one classifier and escaper (`shortcodes.SafeImage`, `ImageTag`, `IsLocal`, `Esc`). Both now allow `data:image/` addresses: the page's sanitizer and the content security policy already allow them, and a reader's documents are in the reader's browser, where nobody can check whether taking them away would break one.
22. Every JSON answer of the web package goes through one `writeJSON`, with a charset and `no-store` unless the handler asks for something else. Settings must be a JSON object, and revoking a token never makes a session. The MCP package has its own one function for its answers, since it is a package of its own.

### Fuzzing

Each target ran for 30 seconds on 2026-11-02, after the last change to its package.

| Target | Executions | New inputs |
|---|---|---|
| FuzzSerializeTyped | 6,468,798 | 79 |
| FuzzParse | 4,298,474 | 689 |
| FuzzDocumentRoundTrip | 3,053,064 | 326 |
| FuzzSerializeJSON | 7,547,679 | 36 |
| FuzzRead | 10,137,288 | 222 |
| FuzzSet | 6,196,867 | 931 |
| FuzzPreview | 4,406,224 | 1,286 |
| FuzzShortcodes | 2,530,439 | 262 |
| FuzzWasmAPI | 3,919,776 | 767 |

FuzzSerializeTyped found seven failures, all fixed; their inputs are kept as seeds under `internal/pageview/testdata/fuzz`. Run the fuzzers with `-fuzzminimizetime=5s`, because with the default of 60 seconds the minimising of a failure can take the whole run and look like a hang.

## The D2 engine (2026-11-03)

The D2 engine (docs/diagrams-design.md, milestone D1) brought a third-party engine into the browser, so it was built with these guards, each with a test. They are verified in Chromium against a local build and not yet deployed.

- **`eval` is allowed in one worker only.** D2 runs its layout's JavaScript through `eval`, which the page's policy refuses. The engine's worker is served with a policy of its own that allows `eval` and WebAssembly and can contact no host, and `TestEngineWorkerPolicy` keeps the page's policy from ever allowing `eval`. A browser check showed a worker under the page's policy is refused `eval`.
- **Icons from other hosts are never drawn.** The engine removes every icon that is not a data address from the compiled diagram before drawing it, so a diagram cannot make a reader's browser contact another host. An image shape whose picture was removed gets a dashed frame, because D2's renderer crashed on an image shape with no picture.
- **Imports read only the files given.** The compile reads from an in-memory map containing the diagram and the files the page passes, and nothing else.
- **Limits.** A source over 256 KB and a diagram over 2,000 shapes are refused before layout, and a request that runs over 20 seconds stops its worker.
- **A diagram's own settings win.** D2 lets a caller's options override a file's `d2-config`, which would have ignored a file's own theme and layout engine; the engine passes the page's choices only where the file sets none.
- **ELK is refused in the browser,** because D2 provides it there only through a private setup in its own worker (open question 7 of the design).
- **Dependencies.** Adding D2 required `golang.org/x/image` 0.20.0, which had nine known vulnerabilities in code this site does not call; it was raised to 0.45.0, and the scan is clean. The rule `engine-licences` fails the build when a module compiled into the engine has no notice in `apps/diagram-kit/LICENSES.md`.

The Diagrams application (2026-11-04, the first part of milestone D2) found two faults in a Chromium check, and both are fixed. The repository has no JavaScript test suite, so nothing in CI would catch either coming back; the check that found them was run by hand.

- **Drawings arriving out of order.** The D2 client replaces a waiting request with a newer one for the same place. Diagrams loaded its parts through a helper that handed a part already loaded to each later caller as a new resolved promise, which runs ahead of an earlier caller still waiting on the load, so after a reload the newer drawing reached the engine first and the older one replaced it. The status line then stayed at "Drawing…". Every caller now shares one promise per part, and a newest drawing that is replaced all the same draws again.
- **One element for every tab.** Every tab drew into one element, so a D2 drawing that finished after a switch painted over the Mermaid tab in front, and the site's mode change would have redrawn old D2 text there. Each tab now has an element of its own, and only the front tab's is on the page.
- **A pinned exception to the undocumented-behaviour rule.** The canvas reads a curved D2 route's points as cubic Bezier control points, as D2's renderer does, which D2 does not document (Paul, 2026-11-04). `TestCurvedRouteMatchesDrawing` in `internal/d2api` holds the reading to D2's own drawing at the pinned release; if it fails after a D2 upgrade, the canvas's `pathOf` must change with it. Measured in Chromium, every click path lies within 2.2 drawing pixels of the drawn line, the difference being at the ends, which D2 shortens for the arrowheads.
- **A margin in the window.** On the desktop the Diagrams window had 16 to 18 pixels of padding inside its frame that the Editor and Slides do not have, because the site's stylesheet took the padding off by a list of applet names. It now takes it off for any page marked `data-applet-flush`, which Slides and Diagrams both are, so the next application of this kind matches by its own markup.
- **The same margin on the standalone page.** The standalone pages (diagrams.yavc.app and the rest) kept 12 pixels of padding around the application, which the window fix did not reach. A page marked `data-applet-flush` now meets the page's edges there too, and the Editor's page has the mark, so the Editor, Slides and Diagrams sit edge to edge in both places.
- **A redraw that never ended.** PUDL 0.97.8's skins write `data-skin` on the root again, unchanged, after any change anywhere in the page, and an unchanged write still reaches a mutation observer. The canvas, which redraws when the mode or skin changes, answered each write by drawing, which wrote it again, and the page froze. D2's own watcher had the same flaw, hidden only because its drawing is slower and is cached. The original workaround compared each record's old value with its current value. PUDL fixed this as paulmooreparks/pudl#33 in 0.97.9, included in the adopted 0.97.10 asset set, so both workaround checks have been removed. The C2 browser regression now exercises theme changes alongside editing.
- **The old text in a new tab.** Opening a diagram in place of a new one nobody had touched kept the replaced tab's editor, so the text pane showed the old diagram while the drawing showed the new one. The tab being replaced is now let go before the new one is shown, which was checked the same way.

## Canvas editing, C2

The canvas model tests in `apps/diagrams/test/canvas-model.test.mjs` cover validation, unknown-property preservation, snapping, anchored resizing, group membership, ID remapping, clipboard refusal and node/edge ID collisions. They run through `scripts/check.sh` with the existing renderer tests.

The browser regression script is `scripts/test-canvas.cjs`. Run it against a disposable local engine at `diagrams.localhost:8412`, with both WebAssembly engines and their matching `wasm_exec.js` built as for the normal application. Make Playwright available to Node, using `NODE_PATH` when it is installed elsewhere, then run `node scripts/test-canvas.cjs chromium firefox webkit`. Screenshots go to the temporary folder `yavc-c2-evidence`, or `CANVAS_TEST_OUTPUT`. The script refuses a non-local URL and uses fresh browser contexts. `node scripts/test-canvas.cjs --host chromium` checks the desktop host, keyboard dialogs, focus escape, tool choices and unchanged skin notifications.

The first browser pass exposed an old fit rule whose specificity overrode the editing camera's SVG dimensions. The visible picture and its hit layer then used different scales. The canvas viewport now overrides that rule for both SVGs, and the regression checks their bounds and view boxes before exercising gestures. The renderer also used to draw groups before all other nodes regardless of file order. It now follows node-array order for groups too, with a regression for both the SVG and its hit boxes.

The PUDL source review found clipboard and camera commands in the wrong menus and Select marked while Pan was active. The menus now follow PUDL's ownership rules, and Pan participates in the same tool choice. Canvas keyboard guidance replaces the D2 guidance when a canvas tab becomes active. Runtime checks cover keyboard movement and undo, pointer movement with and without snapping, anchored/proportional resize, connector sides, inspector validation, creation, duplication, ordering, groups, cancelled/source-invalidated gestures, delayed clipboard completion, content-bounded exports, and D2/Mermaid smoke checks. Native clipboard integration is checked in Chromium; the other engines exercise the model and delayed-completion path. The canvas viewport also paints its background beyond the content bounds, so panning does not expose a different-coloured rectangle, and its selected node carries the focus ring without a second ring around the stage.

The focused suites passed with Chromium 153.0.8010.12, Firefox 155.0 and WebKit 26.6. Chromium also passed the desktop-host suite, including the keyboard resize/connect dialogs and unchanged skin notifications. Light/dark, narrow and forced-colours screenshots are in the temporary `yavc-c2-evidence` folder. Repeated Firefox startup timeouts were traced to the layout loading `doc-tabs.js` after the applet loader and registry. Delaying that response reproduced the failure: Diagrams entered init before `yavcDocTabs` existed and failed at its guard call. The layout now puts PUDL tabs and document tabs before the loader, using the documented execution order of deferred scripts. `TestDocumentTabsPrecedeAppletStartup` guards the rendered desktop and standalone layouts. `node scripts/test-canvas.cjs --startup chromium firefox webkit` holds the dependency response and checks Diagrams, Editor and Slides startup after release. The original failure screenshots and timestamped JSON diagnostics remain in the evidence folder. The diagnostics also separated one aborted `/state/diagrams` request from page exceptions; the suite does not establish durable session persistence. These runs do not certify a production deployment.

## Connector endpoint follow-up

Diagrams 0.12.0 adds reattachment of either connector end, free endpoints, automatic side selection and live route previews during movement and resizing. The model and renderer tests now include point-node validation and ownership, cleanup after reconnect/delete, copying and ID remapping, target hit tolerance, automatic changes after movement and explicit-side preservation. The regular checks run all 30 module tests.

The focused browser command is `node scripts/test-canvas.cjs --endpoints chromium firefox webkit`, with the same disposable server and Playwright setup as C2. It checks actual endpoint drags between nodes, pinned sides, free points, one-step undo/redo, automatic route previews before the source text changes, Escape and source-change cancellation, keyboard reconnect commands, invalid-coordinate focus and PNG export. The endpoint suite passed in all three engines, and the existing C2 suite also passed in all three. Evidence remains in the temporary `yavc-c2-evidence` folder.

The PUDL review found an endpoint-button row that could overflow a narrow inspector and coordinate errors that did not focus or identify the affected field. The buttons now use PUDL's wrapping stack. Validation marks each invalid coordinate, follows the label's public control reference to focus the visible enhanced input, and clears corrected errors. The focused source re-review found no remaining issues.

Browser inspection also caught a one-pixel error in positive coordinates entered through number fields whose step base was the negative maximum safe integer. Position controls now omit that unnecessary minimum, using a zero step base and validating safe integer coordinates in the model. The free-point dialog regression checks that entering -80 and 220 saves those exact coordinates. Pointer tests use the SVG screen transform rather than a hover-stroked bounding box to obtain screen positions. No renderer relies on another application's behavior for the point-node convention; C4 interoperability checks remain outstanding.

## PUDL 0.97.10 adoption

The complete 183-file `dist` set came from the published `pudl-0.97.10.zip` archive, whose SHA-256 is `c87f04a61d496e0ba01e8be6231a0fd3009c2c2cac7a1f743aab45de0bfdc8d8`. The downloaded checksum matches, and each copied file matches the archive. The release includes the 0.97.9 skin-notification fix and the 0.97.10 window-selector changes. The canvas and D2 theme observers no longer carry the workaround for unchanged skin notifications. The focused browser regression runs against this complete asset set. This adoption makes no claim about the upstream streaming-performance measurements in yavc.app.

## Canvas source selection and standalone Help

Diagrams 0.13.0 links canvas selection with JSON object ranges from the existing JSON parser. It handles escaped keys and IDs, nested unknown properties and IDs shared by a node and an edge. Canvas selection scrolls the source without taking focus; source navigation reveals the drawing item without changing text. The duplicate palette was removed, leaving the existing Shape commands and ribbon. Text alignment remains shape-dependent and is documented in Help.

Standalone Help pages now use the existing PUDL window layer, dock and Window menu. About links stay on the application's origin and retain its query parameters, with Back and Forward opening and closing the dialog. Modified clicks retain normal browser behavior. Server tests guard local links, restored page and applet windows, and About addresses. The focused browser command is `node scripts/test-diagram-chrome.cjs chromium firefox webkit` against a disposable server on port 8412. It checks selection in both directions, unchanged text and focus, Help windows over the same applet instance, About history and reload in Diagrams, Editor and Slides. Evidence is saved in the temporary `yavc-diagram-chrome` folder.

The PUDL source review caught the missing Window menu, applet windows lost on reload and intercepted modified About clicks. Each was corrected, and the focused source re-review found no remaining issues. The new browser suite passed in Chromium, Firefox and WebKit, including source-driven camera reveal without focus loss. The existing canvas suite's resize test also exposed a measurement error: a hovered hit shape's bounding box includes its stroke in Firefox. Its scale now comes from the SVG screen transform, as the endpoint suite already does. The existing canvas suite passes in all three engines, and the full repository checks pass. PUDL's agent owns issue #32 for missing ribbon-choice glyphs; this change does not patch PUDL.

## PUDL 0.97.11 adoption

The candidate includes the complete 187-file `dist` set from the published `pudl-0.97.11.zip`. Its SHA-256 is `7f22d176d23104ce7bb3b6a8bc0f6694f830724f6b65995a1eeda5aadc9bd75e`, matching the published checksum. Every installed file matches the archive, with no extra files. No vendor files were patched locally.

The release fixes command-choice glyphs through `fillChoice`, but the Shape ribbon uses the separate `ribbonSeg` path, which still writes labels alone. Opening a canvas, enabling the ribbon and selecting Shape reproduces the missing glyphs in Chromium, Firefox and WebKit. Screenshots are retained as `yavc-ribbon-{engine}.png` in the temporary folder. The source and Help browser suite passes with the new assets in all three engines. The remaining ribbon defect belongs upstream.

## Drawing-tool picker and canvas text alignment

Diagrams 0.14.0 moves drawing tools into the Shape menu's Drawing Tool submenu, so PUDL creates a ribbon menu button rather than a fourteen-position segmented control. Following Paul's clarification, the commands retain glyphs and individual checked state without radio-choice metadata. Clicking an active shape tool again returns to selection mode. The browser suite checks both directions of that toggle and the absence of radio items. PUDL currently converts consecutive radio rows into segments without considering the number of choices; the host menu hierarchy and command choice metadata determine which rendering path is used.

Text nodes now expose independent horizontal and vertical alignment settings in the inspector and `canvas-edit@1`. The additive extension properties are validated and retained in JSON, with Shape Default removing the chosen override. Existing shape-dependent defaults remain. Live Markdown and SVG export use the resolved alignment within the same text inset. Module tests cover all nine combinations, export anchors and positions, round-tripping, validation, independent resets and preservation of unrelated properties. The focused browser suite passed in Chromium, Firefox and WebKit, covering inspector edits, undo, default restoration and the ribbon picker with glyphs and checked state. Chromium also passed the existing canvas editor suite. The PUDL review caught an unsupported empty picker for Mermaid; conditional menu construction and a browser absence check fixed it, and the re-review found no remaining issues.

## Combined Edit menu

Diagrams 0.15.0 combines the former Diagram menu with Edit. Copy as Embed joins the clipboard commands, while Tidy the Text and Draw Again share a group after Find. PUDL derives the ribbon tabs from this same menu description, so the separate Diagram tab disappears too. The ordinary toolbar also loses its Diagram group; formatting and embed copying join Edit, and exports join File. Existing command implementations and shortcuts are unchanged.

## Multiple selection and inspector controls

Diagrams 0.15.0 adds typed canvas selections, atomic movement/property/deletion operations and an inspector limited to properties supported by every selected item. Mixed values have separate UI state, so a literal `__mixed__` remains valid text. Group movement uses a union of members to avoid moving a selected child twice. The model tests cover shared-property support, atomic failure, typed node/edge IDs and group movement. The browser suite covers modifier selection, marquee, keyboard subset/all selection, movement/undo, shared properties, color presets/custom values/reset and inspector resizing in Chromium, Firefox and WebKit.

The PUDL review caught missing keyboard subset selection and a mixed-value sentinel collision. A shared Select Items dialog and explicit mixed-state attributes address those findings. The inspector uses PUDL's nested splitter and segmented alignment, Line Style and Route controls. Debugger inspection exposed a delayed splitter notification interacting with the host's size rewrite; the host now persists live geometry without changing layout in response to a notification. The regression resizes by keyboard and pointer before a marquee gesture. Pointer hit mapping uses the SVG screen transform. The endpoint regression allows one screen pixel of pointer quantisation at fractional viewport offsets, while keyboard-entered coordinates remain exact. Original failure images and the debugger capture remain in the temporary evidence folders.

## Shared browser-local LSP

Editor 45.16.0 and Diagrams 0.16.0 share the official CodeMirror LSP client, a browser worker wrapping Microsoft's JSON language service, and a bundled JSON Canvas/yavc schema. Slides 0.21.1 consumes the rebuilt shared editor bundle. `apps/md-editor/language-service/README.md` records the locked build, license provenance and artifact reproduction; module tests compare source/output hashes and exercise the actual generated worker.

The focused LSP browser suite checks completion acceptance, hover, diagnostic display/clearing, whitespace formatting and undo, late formatting after typing or a tab change, completion after close/reopen, worker failure/restart and automatic size-limit recovery in Chromium, Firefox and WebKit. A shared-boundary fixture starts with a document larger than the transport limit, then shrinks it and checks read-only formatting. No document or schema requests go to external hosts. The test supplies an empty inherited shortcode catalog and intercepts analytics. It does not claim Markdown catalog integration or cached offline application startup.

The independent source review found an initially silent size refusal with no recovery and startup continuing after disposal during language-service loading. The bridge now checks size before mounting document services, retains a watcher while suspended and opens a fresh URI when eligible. Both hosts check disposal immediately after loading. The final source re-review found no remaining issues. Browser diagnostic checks also exposed an idle-linter refresh gap; a StateEffect and the documented needsRefresh hook now schedule diagnostics that arrive after the ordinary idle check. These cases are covered by the focused suite. The full repository checks and shared consumer regression results accompany the candidate PR.

The Editor's existing asynchronous save-completion behavior still needs a separate correction before migration. The Dinah brief records that finding and the inherited shortcode catalog's missing host endpoint. This LSP round does not claim either fix.

## Drawing Tool placement and inspector glyphs

Diagrams 0.17.0 puts Drawing Tool first under Shape for D2 and Canvas. Canvas Route segments now show route previews. Start Head and End Head use the documented PUDL menu wrapper, button and popover panel, with endpoint previews, labels and checked state. The preview belongs to the option content, so it remains visible beside PUDL's selection tick. A project Save As glyph is added because PUDL 0.97.11 defines none for that command.

`scripts/test-diagram-pickers.cjs chromium firefox webkit` covers menu order, glyph presence, keyboard selection and focus return, checked and mixed values, batch arrowhead edits and undo. It retains light and narrow dark screenshots in the temporary `yavc-diagram-pickers` folder. Keyboard testing caught focus being lost when the inspector redrew after a choice. The host now returns focus to the trigger when the activating row still owned it, preserving a user's move into another control while an edit is pending. The PUDL source review required the documented `.menu` wrapper, which is now present.

## Inspector segment spacing and glyphs

Diagrams 0.18.0 gives every inspector segment a glyph and label, including horizontal/vertical alignment, Default, Canvas and D2 Line Style, and Route. The inline padding grows from space-1 to space-2. A container query stacks symbols above their labels in narrow inspector fields and leaves them beside the labels when wider. The focused picker browser suite checks glyph coverage, padding and overflow for the alignment and style groups, while retaining its existing route, arrowhead and keyboard coverage.

## Combined Canvas editing batch

Diagrams 0.19.0 combines inline Markdown text editing, independent node fill/outline overrides, diagram background/grid/snapping settings and four ordinary Canvas starter templates. Editor 45.17.0 and Slides 0.21.2 carry the updated shared schema assets. The format additions remain version 1 and retain the standard coordinated color when another reader drops the extension. The wider Inspector preserves its pixel width across main-divider changes and folds segments without splitting labels, including glyph-only buttons with names and tooltips at its narrowest width.

The focused regression is `scripts/test-canvas-batch.cjs chromium firefox webkit`. It covers the combined workflow, inline typing/undo/focus/reload/close prompts, independent color resets, diagram settings, template structure, immediate outer resizing after an Inspector keyboard resize, control folding, queued saves, inactive Save As and snapshot recovery. Model/renderer tests cover validation, reset preservation, explicit fill ink, exports and freely movable sequence lanes. Screenshots are retained under the temporary `yavc-canvas-batch` folder.

The existing canvas fixture now leaves room for actual-size corner grips beside the wider Inspector and uses the current arrowhead menu pickers. Group drag checks allow one screen pixel of pointer quantisation at fractional zoom, while relative group geometry and keyboard-entered coordinates remain exact.

Debugger inspection found that pointer capture retargeted double-click to the canvas place rather than its hit shape. The activation handler now resolves the element at the event position through the standard DOM hit test. Source review caught an opaque SVG background hiding the live grid/background, text ink resolved against an unpainted text-only fill, link ink ignoring its fill, a missing inactive-tab snapshot notification, skin radii overridden by a reflow rule and save acknowledgements lacking resource/order protection. The fixes retain transparent live SVG backgrounds, paint explicit text-only fills, resolve link ink, notify snapshots, preserve skin radii and serialize saves through a shared per-document queue. Browser regressions cover the save A/Save As B/buffer A case and ordered same-path writes. WebKit's native mouse-checkbox focus behavior required changing the focus test to exercise keyboard activation explicitly.

## README badges and image alignment

The shared Markdown pipeline accepts ordinary linked badge images and preserves recognized left/right alignment while normalizing local image attachments. Shared page CSS supplies float, margins and clearing for GitHub-style markup. The reader's Markdown remains unchanged. Go tests cover linked badge output, local alignment and rejected alignment values; `scripts/test-readme-images.cjs chromium firefox webkit` uses a fixture matching the six badge forms in the Dinah README, with mocked remote SVG responses and supplied attachment bytes. It checks intrinsic badge dimensions, links, right floats, clearing, class-based right alignment and source preservation across Preview/Visual/Text. It does not check live Shields service availability or Dinah's desktop resource adapter.

## Editing productivity and Inspector regressions

The productivity batch combines the Canvas Outline, selection alignment/distribution and F6 pane navigation with Editor save safety. The model tests preserve unknown data and group-relative positions and reject incompatible selections atomically. `scripts/test-editor-productivity.cjs` covers the assembled browser workflows, including intrinsic segment/menu widths, narrow glyph folding, stable Inspector sizing alongside the Outline, visible Theme Default restoration in light/dark themes with undo/redo, multiple selection, arrangement history, keyboard pane focus, ordered saves, newer-draft recovery, inactive rename, write failure and close/reopen acknowledgement guards.

The Inspector stretching came from local full-width and flex-grow declarations, which are removed for action controls. The broken background reset removed the JSON override but read the old live canvas paint as the theme default. Palette resolution now skips that document-painted surface. Adding the Outline exposed a sibling flex-basis feedback loop during Inspector resizing; a CDP breakpoint in the splitter showed the body's width changing after each key. The body now receives the remaining flex space independently of its contents. Independent PUDL review also caught F6 selecting a pointer-only grip and selected Outline rows painting their own focus cue. F6 focuses the drawing stage directly, and PUDL owns the row's pressed appearance.

The first fixture attempts retained failure screenshots. One assertion looked for an endpoint menu while a text node was selected, and another expected a restored Markdown source pane to be visible when its saved mode was Visual. Those fixtures now select a connector and explicitly select Text after restore. WebKit also reported a cancelled WASM load when the fixture reloaded during Visual startup; the fixture now awaits the Markdown engine before navigating. No page errors are filtered. The existing Canvas combined suite, C2 gestures/exports suite and shared LSP lifecycle checks supply regression coverage for the consumers affected by these changes.

The assembled candidate passed the full repository gate, including Go race tests, vet, vulnerability checks, engine/WebAssembly builds, 42 browser-module tests and repository rules. The new productivity fixture, existing combined Canvas fixture and C2 gesture/export fixture passed Chromium, Firefox and WebKit. The shared Editor/Diagrams LSP lifecycle fixture passed Chromium. Independent PUDL source review is clean after the recorded corrections. These checks use disposable local data and browser processes; they establish no desktop-webview acceptance or production deployment.

## Items for other projects

These problems belong to PUDL or to applets that are maintained elsewhere, so they were reported instead of patched here.

- The PUDL menu bar measures its items once and does not re-measure when content grows, which is why the top bar can cut off a menu.
- PUDL's confirm hook should pass the input being confirmed, so the permission dialog would not need to wrap the applet API to capture it.
- yavc.app moved from PUDL 0.96.7 to 0.97.7 on 2026-11-03. The one change it needed was a `title` on each place in the file browser's path bar, which 0.97.7 keeps to one line and shortens. PUDL 0.97.8 then fixed the gap 0.97.7 left after a short place such as "/" or "~" (reported as paulmooreparks/pudl#30), so nothing here overrides it.
- The sight-reader applet uses glyphs and a colour outside PUDL's set, the sudoku applet uses a hard-coded colour, and the dice applet has no minimum width.
- The barcode scanner applet uses `confirm()` and the host kit uses `alert()`. Both should use PUDL dialogs.
