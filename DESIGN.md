# yavc.app design

yavc.app is a PUDL desktop of applications, each of which also runs on its own at `{slug}.yavc.app`. The name stands for "Yet Another Vibe-Coded", said with a straight face; the applications are developed agentically, with specifications and review, and the name is the joke. This document records the decisions taken so far and the shape they imply. The architectural principles that apply to every one of Paul's projects are in `C:\Users\paul\OneDrive\Documents\Architectural Principles.md` and are not restated here.

## Decisions

Each decision is dated and numbered so that later documents and cards can refer to it.

1. **One application, two addresses** (2026-11-02). Every application runs in a window on the desktop at `yavc.app` and as a standalone page at `{slug}.yavc.app`, from the same files and with the same data. The standalone page has no desktop chrome. A reader who wants only the RSS reader links to `rss.yavc.app` and never sees the desktop.
2. **State lives in the engine, identified by a site-wide session cookie** (2026-11-02). Because each subdomain is its own browser origin, local storage cannot be shared between the desktop and a standalone page. The engine sets an anonymous session cookie with `Domain=yavc.app` on first visit, which RFC 6265 says is sent to every subdomain, and every host page loads and saves application state through the engine. Applications never touch local storage or the address except on their own page, as the PUDL applet contract already requires; the host answers `pudl:applet-state` and listens for `pudl:applet-change`. When accounts arrive, the anonymous session becomes a signed-in one and the applications do not change.
3. **A fresh Go engine** (2026-11-02). The parkscomputing.com engine (ASP.NET, SQL Server, Docker) is not reused. The new engine is written in Go. What carries over from parkscomputing.com is the design of four things, reimplemented: the desktop shell with Classic and Windowed views, the virtual file system with a guest home and server mounts, live editing of any page in the on-site editor, and site navigation driven by an XferLang file.
4. **XferLang over JSON inside the site** (2026-11-02). Configuration, navigation and the engine's own representations are XferLang. Where another system needs JSON, the engine translates at the edge, by HTTP content negotiation (`Accept: application/json` gets JSON, the default gets Xfer). A Go XferLang library is a sub-project of the engine; see open question 1.
5. **PUDL at its current tag, copied in** (2026-11-02). The site has its own copy of PUDL `dist/` from a tagged release, 0.96.2 at the time of writing, with skins and themes switchable by the reader.
6. **No third-party scripts, and no cookie but the session** (2026-11-02). PUDL ships its own fonts, so no page loads anything from another host. The only cookies are the anonymous session and, for the administrator, the sign-in session.
7. **Apache-2.0** (2026-11-02). The repository's own code is under the Apache License 2.0, matching PUDL, PUDL Desktop, the package format and the terminal code that parkscomputing.com relicensed for reuse. Installed packages keep their own licences beside them; Sudoku's is MIT.
8. **Package manifests stay JSON** (2026-11-02). The applet package format is shared with parkscomputing.com and PUDL Desktop, so decision 4 applies to the engine's own files and representations, not to `applet.json`.
9. **PUDL Desktop's package scanner and host-kit wiring are lifted, not rewritten** (2026-11-02). The engine as a whole is fresh (decision 3); the code that reads manifests and builds `window.pudlHost` is the same job and comes from PUDL Desktop under Apache-2.0, with its header.

10. **About is a dialog with an address** (2026-11-02). Paul asked for About yavc.app and About PUDL as modal dialogs. The architectural principles keep modals for confirmations, so this is an explicit exception, on the pattern parkscomputing.com settled for its sign-in dialogs: each dialog has an address of its own (`/about`, `/about/pudl`) that draws the page with the dialog open, and a link to it opens the dialog in place with the address following.

11. **A guest's files stay in the browser** (2026-11-02). Paul ruled that guests get no space on the server. The virtual file system's home for a reader without an account is kept in the browser's local storage, as parkscomputing.com keeps it, under the quota that site uses, and it is therefore per origin: a file saved on the desktop is not seen at a subdomain, and the other way round. Decision 2 still applies to the small state it names, an applet's continuity string, its settings and the appearance choices, which the engine keeps under the session. A home on the server, shared by every origin, arrives with accounts, and with it the administrator's mounts.

12. **Every application's commands are an API, discoverable without the source** (2026-11-03). Paul set this as a requirement: each application publishes a manifest of its actions, the engine serves the catalogue of them and an MCP server, and because the files and the applications are in the browser (decision 11) an agent's invocation is relayed to a page the person has open and run there, as the person, with the person asked before an action does more than the agent's token allows. The design, with its own numbered decisions, is `docs/agents-design.md`.

13. **A home folder starts with stock files, kept as files on the site** (2026-11-03, Paul). A reader's home begins with `README.md`, a `Howto` folder of guides (a deck about Slides, and notes on Slides and the Editor, with screenshots served from the site), a `Documents` folder that the Save As dialogs start in, `bin` with a first script, and two sample files. They live under `site/home` in the repository, which the engine hands to the browser at `/api/site/home`; the browser seeds each file once and remembers what it seeded, so a reader who deletes a guide keeps it deleted, and a guide that changes on the site replaces the reader's copy only while that copy is still as it came. Pictures stay out of the home folder until it can hold more than text (decision 11).

14. **A home folder holds pictures, in the browser's database** (2026-11-03, Paul asked for a picture dialog that finds or uploads a picture, and for a click on a picture to edit it). The home record in local storage keeps text files as before; a picture, or any other file that is not text, is kept as bytes in the browser's IndexedDB under an id the home record points to, so the 2 MB record is not spent on it. Such a file is uploaded, downloaded, renamed, moved, copied and deleted as any other, but the Editor and the Terminal do not open it as text. A picture in a document is written as a path, `cat.png` beside the document or `~/Pictures/cat.png`, which the preview marks as an attachment and the page reads from the home folder; pictures from the site (`/static/…`) and the web load as they are. The dialog itself is the kit's (`apps/md-editor`), shared by the Editor and Slides: Insert, Picture and the `/` menu open it, with Browse for a picture already in the home folder or on the site and Upload for one from the computer, and a click on a picture in Visual view opens it on that picture to change its address, description, width and caption or to remove it. Decision 11 still holds: the pictures live in this browser, per origin, and a deck's PowerPoint and PDF exports draw them from there.

15. **A page wraps to its pane** (2026-11-03, Paul asked whether text should wrap to the widest element or to the window). The Editor's Visual view and Preview are Markdown drawn for reading, not a printed page, so text wraps to the width of the pane, with the page's own margin, and nothing in the document makes the page wider: a picture scales down to the column, and a code block or a wide table scrolls within itself. A view sized to a printed page, for documents that will be printed or exported as pages, is open question 4.

## Addresses

`yavc.app` serves the desktop. `yavc.app/{slug}` is an application's page on the main origin, which is what a window fetches and what a link from an article opens. `{slug}.yavc.app` serves the same application standalone. The engine answers both from one deployment: a wildcard DNS record points every subdomain at it, and the engine reads the host header to choose the standalone layout for the application whose slug matches. A subdomain whose slug matches no application redirects to the desktop.

The PUDL applet definition's `page` field for each application is its subdomain address, so Open as a page from a window goes to `{slug}.yavc.app`, and `ownsUrl` is true only there.

## State and identity

The engine keeps a key-value store of application state per session. A session is an opaque random identifier in a cookie on `.yavc.app`, `HttpOnly`, `Secure`, `SameSite=Lax`, created on the first request that needs one. The store holds, per session, each application's state string as the applet contract defines it, the virtual file system's guest home, the open windows of the desktop, and the reader's theme and skin.

PUDL keeps theme and skin in local storage under `pudl-theme` and `pudl-skin`, per origin. The host page seeds those keys from the session before `pudl-theme.js` runs, so a skin chosen on the desktop is the skin on every subdomain.

Quotas and retention are settings, to be fixed when the store is built. A session that has not been seen for the retention period is deleted with its state. The privacy page says so in plain words.

The administrator signs in to a separate session. Privileged operations use the pattern parkscomputing.com settled on, passkeys with a fresh tap for a change to the live site, reimplemented in Go.

## The engine

The engine is one Go binary. It serves static files for the desktop, PUDL and each application; the session store; the site tree from the navigation file; the virtual file system's server mounts for the administrator; the page editor's read and write endpoints; and, for the RSS reader, a fetch proxy for feeds whose origins do not allow cross-origin reads.

Representations follow the REST principles in the architectural document. An illegal action is absent from the representation rather than refused. Every state the desktop can show has an address.

The parkscomputing.com engine's endpoints that the carried-over designs expect are the starting inventory for the Go engine: the site tree, the texts of pages by slug, and the administrator's mount for reading, writing, moving and deleting files. Their shapes are reimplemented, not copied.

## Applications are packages, and the engine is a host

Every application is a PUDL applet package in the format defined by the pudl-applet-packages repository (`C:\Users\paul\source\repos\pudl-applet-packages`). A package is a folder with an `applet.json` manifest, a script that calls `pudlApplets.register`, a stylesheet, a page body and optional actions, help and vendored libraries. The engine installs a package by having its folder under `applets/`, scans the manifests at startup, and generates from them what parkscomputing.com's `js/applets.js` writes by hand: each applet's `define()`, its standalone page, its window size, its launcher entry and its continuity. Adding an application is copying a folder.

The engine gives packages the host interface, `window.pudlHost`, built with the host kit from that repository. The members and what yavc.app provides for each:

| Member | yavc.app |
|---|---|
| `identity`, `action`, `pages`, `pudl` | From the kit, with pages at `{slug}.yavc.app` and `/{slug}` |
| `snapshot` | parkscomputing.com's snapshot script as it is, per browser tab in session storage; a snapshot is what a reload loses and no link should carry, so it belongs to the tab, while continuity and settings belong to the session |
| `fs` | The virtual file system, with a guest's home in the browser's local storage (decision 11) and, with accounts later, a home on the server and the administrator's mounts; Open and Save as dialogs |
| `config` | Per-applet settings in the session store |
| `service(name)` | A map of the engine's services; `rss-fetch` for the feed reader, `score-library` for the sight reader, others as applications need them |
| `actions.run` | PUDL's action broker |
| `fetch` | Same-origin fetch with the engine's forgery token on writes |

The games, the tools and the barcode applets already exist as packages in their own repositories, each released as a `dist/` folder: pudl-sudoku, pudl-conway, pudl-dice, pudl-sight-reader, pudl-poker, pudl-barcodes (tool, scanner, flash cards) and pudl-tools (diff, theme studio). PUDLSplash is the arcade collection, where Space Invaders and Asteroids belong. None of these is ported; each is installed at a tagged release. A package written for yavc.app alone may live in this repository under `apps/`, in the same format, and moves to a repository of its own when another host wants it.

Manifests stay JSON, since the package format is shared with parkscomputing.com and PUDL Desktop and is not this project's to change. Decision 4 applies to the engine's own files and representations.

## Inventory

| Application | Where it comes from | Needs from the host |
|---|---|---|
| dice | pudl-dice | Nothing |
| sudoku | pudl-sudoku | snapshot, continuity |
| conway | pudl-conway | Nothing; its presets use `data-applet-param` |
| sight-reader | pudl-sight-reader | snapshot, config, the `score-library` service, a vendored score renderer |
| poker | pudl-poker | A `poker` service that runs the language-model players |
| barcodes, barcode-scanner, flashcards | pudl-barcodes | fs, the `barcode-products` service for lookups |
| diff, theme-studio | pudl-tools | fs; theme studio must be brought up to 0.96 skins |
| arcade games | PUDLSplash | To be read when installed |
| terminal, files, editor, settings | parkscomputing.com's own applets, installed as site packages under `apps/` (done 2026-11-02) | The virtual file system with its browser-kept guest home, the session store, and later the administrator's mounts; these four are the site's own |
| slides | New, in `apps/slides` (prototype 2026-11-03; design in `docs/slides-design.md`) | fs for decks as Markdown files, snapshot and config; the Editor's page view on the slide canvas; full-screen presenting, a presenter window, export as a page |
| rss | New, in `apps/rss` | config for subscriptions and read state, the `rss-fetch` service |

parkscomputing.com's other applets (account, comments, moderation, logs, visits, pins) are that site's plumbing and are not carried over.

## Appearance

The reader's appearance has three independent choices, as Dinah Desktop implements them: the skin (`data-skin`, from the PUDL release's catalogue in `pudl-skins.json`), the colour theme (`data-palette`, PUDL's companion themes and any of the site's own), and the mode, light, dark or system (`data-theme`). The engine owns all three in the session store, and the page is drawn on the server with the choices already on the root element and `data-pudl-persistence="host"` set before PUDL's scripts load, so there is no wrong-skin flash and no second store in local storage. Every admitted skin's stylesheet is linked in the head. The Settings applet offers the three choices and View offers mode and theme, as Dinah's menus do. The list of skins is read from the release, never written into the engine.

A theme editor of the site's own, with personal themes as Dinah has them, is not in the first release; the theme studio package covers editing a palette until then.

## As built, 2026-11-02

The proof of concept runs. The engine (`cmd/yavc`, `internal/web`, `internal/session`) serves the desktop at the domain, each package standalone at its subdomain with only the applet's own menu bar above it, a window per package by its name, the registry written from the manifests, PUDL 0.96.2 with its seven admitted skins and three colour themes, and the session's state, settings and appearance at `/state/{key}`, `/config/{name}`, `/appearance` and `/session`. Dice, Sudoku and Conway are installed from their repositories; Settings is the site's own under `apps/`. A session is one JSON file under the data folder until the XferLang library exists. Verified in Chromium: windows open from the list and the Applets menu with the packages' menus in the bar, a Sudoku move reaches the engine and is drawn into the next page, the standalone page shows the same board, three appearance changes sent at once land in one session, and a cookie set at the domain is sent to a subdomain. Production runs in Docker on port 8400 behind the cloudflared tunnel, whose configuration routes the apex, www and the wildcard there; the wildcard DNS record is Paul's to add.

The file system, Files, the Editor and the Terminal arrived on the same day, later. They are parkscomputing.com's own scripts installed as site packages under `apps/` with only their site references changed, and the engine serves what they ask of a server: the site tree at `/api/site/tree` (the applications, the site's pages and the scripts under `site/bin`), a page's text, and the pages themselves, Markdown files under `pages/` served at `/{slug}` and in windows. The host interface gives every package the file service and the dialogs, so the arcade games keep their scores. A reader's home is this browser's local storage (decision 11). PUDL is 0.96.7 (0.96.3 at the time, whose documented `data-win-icon` replaced the taskbar picture workaround). The privacy policy, the terms and the author's page are pages, linked from the site and Help menus.

The Editor gained Dinah Desktop's page view the same evening: Visual, Split and Preview beside Text, with find and replace on the page, tables, checklists, the slash menu, blocks edited in place as their Markdown, and Mermaid diagrams. Paul chose to run the Markdown engine in the browser rather than on the engine, so the preview renderer and the page view's parser and serializer (`internal/preview` and `internal/pageview`, lifted from Dinah) are compiled to WebAssembly (`cmd/yavc-md`, built in the image) and the document's text never leaves the browser, as decision 11 promises. parkscomputing.com's shortcodes came across the same night, ported from its C# into `internal/shortcodes` as a goldmark extension inside the same engine: the four notices, expand, columns, figure, applet, video, code, toc, status, kbd, glyph, page, anchor and draft-note, written as `{{name:args}}`. The page view keeps a shortcode and any paragraph holding one as its Markdown, drawn as the preview draws it, so the Visual view shows notices, columns and an applet running in the page and edits them in place. The four that need the site's pages or files (include, children, tagged, latest) and score are not in the browser engine.

Slides, the first application written for the site, arrived as a prototype on 2026-11-03, designed in `docs/slides-design.md`: a deck is a Markdown file of slides divided by `---`, with a `{{slide}}` line for each slide's layout and background and `{{notes}}` for the speaker; the current slide is edited on its canvas with the Editor's page view or as its Markdown in CodeMirror; the deck presents full screen from the window or `slides.yavc.app`, with a presenter window following over a BroadcastChannel; and it exports as a page that presents itself. The Markdown engine moved to `apps/md-engine`, a shared folder with its loader, the HTML cleaner and the page's stylesheet, which the Editor and Slides both use.

Right-clicks answer PUDL's `pudl:contextmenu` with rows from each application's own command table (Files: the row's commands; Slides: the slide's or Format; the Editor: Edit and Format, or Open in the file pane; the shared tab row: Close and Close the Others), so a context menu never has a command of its own (Paul, 2026-11-03). The editing layer the Editor and Slides share lives in `apps/md-editor` (docs/slides-design.md, decision 16). The Editor shows its tab row only while more than one document is open (Paul, 2026-11-03); the same rule applies to Slides when it gains tabs.

## Order of work

1. **Proof of concept.** The Go engine serving the desktop at `yavc.app` and standalone pages at `{slug}.yavc.app`, PUDL 0.96.2 with skins and themes, the session store, and three applications: dice (the smallest package, proving install and both addresses), sudoku (proving snapshot and continuity through the session store on both addresses) and settings (proving appearance kept in the engine and followed across subdomains). Conway is added if cheap, for `data-applet-param` and presets.
2. The XferLang library in Go, and navigation from an Xfer file.
3. The virtual file system, terminal, files and editor, with the administrator's mounts and live page editing.
4. The remaining packages, then slides and rss.

## Open questions

1. **XferLang version.** No Go implementation exists; the repository has the C# library and a Rust port. The parkscomputing.com navigation file is in the 0.15 form, and a 1.0 reboot is under way. The Go library should implement 1.0 if its grammar is settled; confirm with the XferLang Reboot work before starting.
2. **Untrusted previews.** If the editor previews HTML written by a reader, or the RSS reader renders feed content, that content needs an origin of its own. A single sandbox origin, or a sandboxed iframe, is the intended answer; decide when the editor is ported.
3. **Session cookie and consent.** The anonymous session exists only to keep state the reader asked the site to keep, which is the strictly-necessary case, so no consent banner is planned. The privacy page must still describe it, with the retention period. Revisit if the session is ever used for anything else.
4. **A page-sized view.** Paul raised sizing the Editor's page to a printed page, as a word processor does, when the Visual view's wrapping was settled (decision 15). It would be a view of its own beside Visual, with the page size and margins from the document or the settings, and it bears on the PDF export of documents. Not designed yet.
