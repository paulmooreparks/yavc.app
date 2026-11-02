# The stem-to-stern review

The review of 2026-11-03 had six reviewers: server and browser security, duplication, performance, robustness, and PUDL and the interface. This document records what each finding became and the check that keeps it fixed. `scripts/check.sh` runs every check, and CI runs it on every push.

## The Go engine

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
