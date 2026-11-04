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
- **The linear-time test** (`TestRenderIsLinear` in `internal/preview`) failed in CI on 2026-11-03 with a ratio of 5.19 against its limit of 5, though the renderer had not changed. Benchmarks show the renderer is linear: four times the sections take four times the memory and allocations and about 3.7 times as long. The test had timed five single renders, and in CI the other packages' tests, the D2 layout tests among them, run on the same cores at the same time. It now times each size with Go's benchmark runner, which averages over as many renders as fit in a second, and keeps the faster of two averages. Measured locally, the ratio went from anywhere between 2.5 and 4.9 to a steady 3.3.

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

## Items for other projects

These problems belong to PUDL or to applets that are maintained elsewhere, so they were reported instead of patched here.

- The PUDL menu bar measures its items once and does not re-measure when content grows, which is why the top bar can cut off a menu.
- PUDL's confirm hook should pass the input being confirmed, so the permission dialog would not need to wrap the applet API to capture it.
- yavc.app moved from PUDL 0.96.7 to 0.97.7 on 2026-11-03. The one change it needed was a `title` on each place in the file browser's path bar, which 0.97.7 keeps to one line and shortens. PUDL 0.97.8 then fixed the gap 0.97.7 left after a short place such as "/" or "~" (reported as paulmooreparks/pudl#30), so nothing here overrides it.
- The sight-reader applet uses glyphs and a colour outside PUDL's set, the sudoku applet uses a hard-coded colour, and the dice applet has no minimum width.
- The barcode scanner applet uses `confirm()` and the host kit uses `alert()`. Both should use PUDL dialogs.
