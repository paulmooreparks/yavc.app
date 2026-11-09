# Content applications and file opening

This design was prepared on 2026-11-07 after Paul chose separate Docs and Editor applets, with direct source access in Docs and Markdown opening in Docs by default. It defines the intended system. The installed release is v0.2.47, where Docs remains an Editor subdomain alias. The implementation candidate now extracts a shared workspace and registers separate Editor and Docs packages, as recorded in `content-workspace-contract.md`. The pure association resolver foundation is implemented in `file-resolution-contract.md`; the candidate activates routing and the separate applet split. Office import improvements remain pending. This design supersedes the launch-profile proposal in `file-associations.md`, the one-Editor choice in decisions 1 and 17 of `docs-design.md`, and PR #46's withdrawn automatic title switching.

The cross-project Architectural Principles remain at `C:\Users\paul\OneDrive\Documents\Architectural Principles.md`. This design applies their addressable state, progressive enhancement and PUDL requirements without introducing another frontend framework or document store. PUDL applet portability applies to every applet. The candidate includes extraction of Editor/Docs and Diagrams, consistent extraction of Slides, and reintegration of those portable packages into yavc.app, as detailed in `applet-portability-design.md`.

## 1. Applications follow the work

Each applet has a stable identity and an explicit editing purpose. Selecting another view or tab does not rename the application. A source view is a representation of the current resource inside that application; it does not turn the application into Editor.

| Applet | Primary work | Native content | Default view | Other views |
| --- | --- | --- | --- | --- |
| Docs | Write and format documents | Ordinary Markdown and `.docs.md` | Visual for Markdown; Document for `.docs.md` | Text, Split and Preview; Document is available for either Markdown kind |
| Editor | Edit general-purpose text and code | Decodable text, including Markdown, diagram source and configuration | Visual for Markdown, Text otherwise | Editable Markdown Split and read-only Preview |
| Slides | Author and present decks | `.slides.md` | Visual editing | Text, Split and Preview, with separate presentation commands |
| Diagrams | Author and inspect diagrams | Canvas, D2 and Mermaid | Visual for Canvas; Split for D2 and Mermaid | Text and supported rendered views |
| Files | Browse and manage resources | Directories and file metadata | Directory listing | Open, Open With, preview and download where supported |
| Terminal | Run explicit commands | Working directories, commands and text streams | Terminal | Its existing shell behavior |

Docs and Editor are separate registered packages and launcher destinations, backed by shared editing code. They have separate windows, settings, snapshots, command tables and action namespaces. There is no user-configurable launch-profile framework in this design. Their application IDs are `docs` and `editor`; the existing `slides`, `diagrams`, `files` and `terminal` IDs remain unchanged.

Docs accepts ordinary Markdown and `.docs.md`. Opening `.md` there does not rename it, add front matter, set paper size or convert it to `.docs.md`. File, New in Docs preserves the existing document-launch behavior and creates a `.docs.md` draft in Document view. New Markdown creates an ordinary `.md` draft in Visual. In Editor, File, New creates a plain-text draft. Dedicated file-type commands can choose another suffix explicitly. Changing to Document view changes a viewing preference, while applying Page Setup or typography changes authored document settings and participates in Undo.

The desktop and standalone titles remain Docs or Editor for the life of their applet instances. The active filename appears in tabs and can use PUDL's documented title-detail field. A `.docs.md` source opened explicitly in Editor still belongs to Editor. A document's Text view remains Docs. Error states, unsaved markers and filenames never determine application identity.

## 2. Views have shared meanings and declared capabilities

Text edits the backing source. Visual edits the domain representation. Split shows source beside a rendered representation; that representation is editable only when the applet and format support it. Preview is read-only with respect to the owning resource. Document is the paginated rich editing surface offered by Docs. Show and Presenter are Slides workflows, with their own explicit actions, rather than extra generic editor modes.

Controls use the common order Document, Visual, Text, Split, Preview, omitting unsupported entries. Docs offers all five. Editor offers Visual, Text, Split and Preview for Markdown and Text for other source types. Slides omits Document. Diagrams omits Document and offers writable Visual only where its format supports it. Canvas and D2 have visual mutations; Mermaid currently has source editing with rendered inspection. Mermaid therefore offers Text, Split and Preview. Its legacy `view=visual` address maps through a documented compatibility alias to Preview, with a notice; it does not expose D2/Canvas mutation commands. A diagram engine's ability to render a format does not imply that it can edit that format visually.

Opening chooses an explicit requested view first, then an applicable remembered view, then the association's initial view, then the applet/format default. A newly opened resource with no applicable choice uses the defaults in section 1. An unsupported explicit view leaves the file unopened and offers valid views beside the failed control. An obsolete saved preference falls back with a notice. Explicit requests never silently change applets. State addresses the applet, resource, view and relevant selection. View state contains no document text, secrets or pending tasks.

Docs and Editor pair editable flowing Visual Markdown with source in Split view. Document is the separate paginated workspace; a future paginated split must have a declared addressable state before it is added. Selection synchronization and source mapping remain capabilities of the format adapter; missing mappings disable the corresponding navigation affordance.

Preview may retain navigation, selection and safe document links, but an embedded applet or shortcode must not gain authority to change the owning document. It must not execute arbitrary source. Existing interactive embeds require a capability review before Editor offers them in its read-only preview. An unavailable or unsafe renderer leaves Text available and explains why Preview is unavailable.

## 3. Menus expose the applicable authoring vocabulary

| Context | Main commands | Commands omitted from the normal UI |
| --- | --- | --- |
| Editor text/code | File operations, editing/history, search, language assistance, wrapping and source navigation | Rich formatting, page setup, headers/footers and Office document export |
| Editor Markdown | Editor commands plus safe preview and Open in Docs | Rich formatting and document-layout forms |
| Docs Markdown | Paragraph styles, emphasis, links, lists, tables, images, colors, named styles, stylesheet/shortcode tools and exports | Code-oriented commands for unrelated languages |
| Docs Document view | Docs commands plus page setup, headers/footers, page zoom and applicable document layout | Unsupported word-processing features |
| Slides | Shared text/rich commands plus Slide, Deck and Show commands | Document paper, document headers/footers and diagram shape manipulation |
| Diagrams | Shared source commands plus diagram navigation, shape/connector editing and Inspector capabilities | Word-processing typography and deck presentation controls |

Markdown benefits from rich editing and styles without being paginated. Docs' Visual view therefore retains paragraph styles, typography, stylesheet support and custom shortcodes. The typography form separates shared text properties from page-specific properties. Page Setup and Header and Footer are available from Document view, with an addressable Switch to Document entry for a person looking for them elsewhere. They remain under Format, as previously agreed. A file with existing page metadata keeps it when edited in another view.

Docs' Text view retains document-level forms such as Stylesheet and Properties. Formatting commands can operate on mapped source selections when an adapter supports them; otherwise they are unavailable with a reason. Selecting Text is not permission to show every Editor language command. Editor can change Markdown stylesheet source as text but does not need a visual typography dialog.

Editor preview honors supported authored styling through the existing sanitizer. Any preview-only appearance preference belongs under View and does not modify document CSS. Changing authored typography through a form belongs in Docs, while changing that same source explicitly as text remains available in Editor.

Shared command IDs keep their meanings across applications. Save saves native content to its current native resource; Save As creates another native resource; Export creates another representation without rebinding the working document. Open With selects a handler for one opening; Always Use changes an association. Toolbar customization can surface applicable registered commands, but cannot enable commands outside the applet's capabilities. Unavailable selections are disabled; commands that cannot apply to the format are absent. Menus and agent actions enforce the same restrictions.

The same Save, Save As, Open, Find, clipboard, Undo/Redo, source-view and navigation glyphs are reused where the actions agree. Domain menus have distinct glyphs, including Slide's panel and Insert's plus. Shared dialogs, keyboard focus rules, contextual errors, toolbar folding and customization remain PUDL controls. Domain-specific Inspectors and presentation windows keep their existing purposes.

## 4. File identity is separate from associations and language

A resource has an opaque host-authority/workspace-bound identity, a path or draft ID, a storage revision, bytes/encoding where applicable, and available capabilities. The browser adapter includes origin in that scope; a desktop host can retain its existing document IDs. A document type describes its structure. An association chooses an installed applet and operation. A language selects highlighting and language assistance. A view selects a representation. These facts are related but must not be encoded in one filename regular expression.

The host's existing FS/document and configuration services remain authoritative. Shared editing sessions adapt those resources; they do not create another home or copy of persisted files. A draft receives a stable private ID until it is saved. Display paths such as `~/notes.md` are insufficient as global identities because another origin or workspace can contain an unrelated path with the same spelling. A portable applet never installs yavc.app's guest FS as the receiving application's resource authority.

| Resource | Shipped default | Initial view/operation | Explicit alternatives |
| --- | --- | --- | --- |
| `.md`, `.markdown` | Docs | Visual editing | Docs Text/Document; Editor source |
| `.docs.md` | Docs | Document editing | Docs Text/Visual; Editor source |
| `.slides.md` | Slides | Visual editing | Slides Text/Split; Editor raw source |
| `.canvas` | Diagrams | Visual editing | Diagrams Text/Split; Editor JSON source |
| `.d2`, `.mmd`, `.mermaid` | Diagrams | Split | Supported diagram views; Editor source |
| `.go`, `.cpp`, `.json`, `.html`, `.css`, `.xfer`, other decodable source/text | Editor | Text | Supported read-only preview or user-installed handlers |
| `.docx` | Docs importer when installed | Convert to a new `.docs.md` draft | Download; installed Office handlers |
| `.pptx` | Slides importer | Convert to a new `.slides.md` draft | Download; installed Office handlers |
| Safe raster images | Existing file preview | View | Insert into a document, deck or diagram through an explicit command |
| PDF | Available safe viewer or download | View | Explicit installed converter |
| SVG | Editor source or download under current safe-file policy | Text | A future sandboxed image viewer |
| Directories | Files | Browse | Terminal at this directory |
| Unknown binary data | Download or supported Open With choice | No text decoding by default | Explicit diagnostic Open as Text |

HTML opens in Editor as source. A public page URL remains a navigation destination and is not confused with its editable HTML source resource. Opening a command file never runs it. Files' explicit Run remains a separate action. Source text containing a deck or diagram does not become an ordinary document merely because it is text; compound suffix rules precede generic Markdown/JSON rules. Docs declines `.slides.md` as native rich content and offers Slides or Editor, since interpreting a deck as an ordinary document can change its structural separators.

Opening a `.txt` file in Docs is an explicit Import as Document operation creating a Markdown draft, with the original untouched. It is not an invisible format change followed by Save over `.txt`. Editor remains the direct editor for plain text. Renaming, conversion and association changes are separate operations with separate consent and Undo behavior where applicable.

## 5. Resolve opening once, in the host

Files, recent resources, launcher file links, desktop URLs, standalone windows and agent file-open actions use one host resolver. File, Open inside an applet is an explicit choice of that applet: it opens native supported resources there, offers a supported importer, or offers Open With for an incompatible resource. It does not apply the global default again and bounce the user elsewhere. For example, Editor's Open can edit `.md` as source even though double-clicking it in Files defaults to Docs. Insert Image and similar domain pickers remain constrained asset selections.

The resolver takes a resource reference, an intent (`edit`, `view`, `import`, `compare`, `insert` or `run`), an optional explicit applet/view, and the current host capabilities. Its result identifies the selected applet, operation, initial view, winning rule, resource-access requirement and any conversion. It can instead return a choice, unsupported result, or access failure. Resolution has no opening, execution, mutation or cross-origin side effect. Execution revalidates availability and access before acting.

Selection follows these rules:

1. An explicit applet/view or Open With choice wins if it supports that resource and intent. Unsupported explicit choices produce an explanation and alternatives.
2. A user filename association wins over a shipped filename association. Within a tier, the longest matching suffix wins; matching is case-insensitive. Exact special filenames may have explicit rules. Conflicting same-specificity user rules are invalid rather than order-dependent.
3. Specific filename rules precede MIME-only rules. An explicit MIME override applies where filename rules do not identify the type; generic `text/plain` and `application/octet-stream` never erase a compound-suffix convention.
4. Verified text fallback opens Editor with its detected or selected encoding and optional known language. It does not require a recognized suffix or language provider.
5. Other resources offer supported handlers or download. A malformed file still reaches the selected format parser, which may refuse it and offer raw source or download without executing content.

All alternatives are filtered by intent, availability, resource access and conversion support. A read-only resource can open in a read-only editing surface with Save a Copy. A text source association never grants write access, parser success, or script execution. An explicit Open With choice does not alter defaults unless the person selects Always Use. Missing preferred applets remain visible in settings as unavailable; ordinary opening offers available alternatives without silently rewriting the preference.

MIME is an untrusted supporting hint, not an authority or security decision. Byte inspection determines decodability and import-container validity. Filename conventions determine authored intent where meaningful. Neither a library returning `text/plain` nor an HTTP Content-Type establishes that a binary resource can safely round-trip through Editor.

## 6. Configuration and dispatch contracts

Each installed applet registers a host-readable capability description containing its stable ID, native type IDs/suffixes/MIME hints, supported intents, source/visual/preview capabilities per type, import/export conversions, and documented dispatch operation. The host's bundled catalog supplies shipped associations. Applet capabilities are executable-package facts; user configuration can choose among them but cannot invent a supported importer or turn on rich editing in Editor.

The first implementation stores capability descriptions and defaults in a versioned yavc-owned JSON registry, served with the installed applet catalog. It uses JSON as a package-adjacent interoperability contract under DESIGN.md decision 8. It does not add unrecognized fields to shared `applet.json` or patch PUDL. The existing `~/.config/file-associations.json` view uses the configuration service's established JSON preference contract under decision 22. Future shared package-schema adoption can replace the registry without changing association semantics. A new engine-wide configuration language is outside this work.

Preferences contain versioned stable type/applet/operation/view choices and bounded filename rules, with no script, executable path or arbitrary URL. Settings exposes File Associations with Edit, Reset and an explanation of the effective rule. Existing installed packages are the available choices. Rendering a configuration file in Editor must not let its text inject UI or privileged commands. Unknown versions are retained and reported; invalid entries leave the last valid configuration active and are reported beside the offending preference.

PUDL's documented request broker selects the first applet matching a verb and kind. Registering Docs and Editor for the same generic `open` verb would therefore be incorrect. The host resolves first, then invokes an unambiguous documented operation. The initial design gives Docs a distinct host-defined `document` request verb, keeps Editor's `open` request for explicit source editing, and retains Slides' `present`, Diagrams' `diagram`, Files' `browse` and Terminal's `shell`. The host file-open service is the sole generic file-association entry point. Slides' `present` request is legacy naming; it opens editing unless an explicit presentation parameter requests a show. No registration-order priority is allowed.

Exact operation selection is validated against the registered catalog and the caller's file grant. Agents discover separate Docs and Editor namespaces and supported operations through the existing action catalog. Existing `yavc.editor` text actions keep their semantics. Rich/document actions move to `yavc.docs`; deprecated callers receive an explicit migration error with the new action reference before any mutation. They do not silently open or edit a different application. Versioned action manifests and desktop adapters must change together.

## 7. Preserve bytes and unsaved work

Broad text support needs a bounded byte-read/identify/decode path. The current server suffix whitelist and browser MIME heuristic cannot provide it. UTF-8, UTF-8 BOM, and BOM-labelled UTF-16 are initial supported encodings; malformed sequences are refused by default. An explicit encoding choice can add supported decoders without pretending the format has rich editing. The first release must declare which encodings it can save without loss. Unsupported encodings can be inspected read-only or converted through Save As, with disclosure before mutation. Line endings and BOM follow an untouched source through save. File-size limits apply before loading, rendering or language analysis, with separate lower limits for expensive renderers.

An unchanged source must not be reformatted merely by opening it in Docs, Slides or Diagrams. Rich mutations must preserve unsupported source spans or decline an unsafe edit with a reason. Editor offers the full original source for unsupported constructs. The preservation promise concerns untouched content; formatting that a user explicitly changes can produce the documented canonical source for that construct. Render/source synchronization keeps a resource revision and validates stale asynchronous results.

Open in Docs or Open in Editor refers to the current resource, not merely its last saved path. A modified tab offers Save and Open, Open Saved Version, or Cancel. A new draft requires Save As before a cross-applet opening in the first implementation. Cancel retains the source tab and its history. Save and Open waits for save acknowledgement before resolving the destination. The source tab remains open; the destination is raised only after it is ready, and later user focus choices win over delayed completion. This avoids transferring private undo stacks or cloning unsaved buffers as an implicit feature.

Two applets may open the same saved resource, but cannot silently overwrite each other's edits. All write paths, including Files, Terminal and agents, need an expected-revision check through the existing FS authority. Clean views can reload external changes; dirty views retain local drafts and offer Reload, Save a Copy, or an explicit reviewed overwrite against the current revision. The host must provide atomic compare-and-write at the actual storage authority. A timestamp, broadcast, in-page queue or observed update event is not an atomic conflict guarantee. Implement this documented host capability before enabling the writable split on that host. A host with a documented exclusive-writer capability may instead offer other openings read-only; detecting other tabs through broadcasts is insufficient to establish exclusivity. Without either guarantee the writable split is gated, rather than claiming a safe second-opening fallback. There is no automatic merge in this design.

## 8. Origins, snapshots, preferences and migration

The desktop's Docs and Editor windows share its existing FS origin. Their standalone subdomains have separate guest file stores today. An association must keep the current host's resource capability. A file path is not transported by navigating to another subdomain. A standalone host with a window layer can open the destination applet in a floating window on the same origin. Where a host cannot do that, it offers explicit download/import and explains the storage boundary. Accounts or a native desktop host may expose a genuinely shared filesystem later through the same host capability. This work does not add cloud storage or a cross-origin file bridge.

Settings are shared by the existing configuration service across site addresses, but snapshots and guest documents retain their current origin boundary. A restored remembered path must be revalidated in that origin. Separate Docs/Editor snapshot namespaces prevent their tab sets from overwriting one another. Old Editor snapshots are initially restored into the legacy Editor shell with recovery-only access to former rich tabs until Save/Save As succeeds. Nothing splits or deletes an unsaved snapshot based on a suffix. A migration ledger records successful adoption before any namespace is retired, and a failed migration leaves the original snapshot intact.

Editor preferences retain source settings such as wrapping and key bindings. Docs receives document defaults, shared style/shortcode choices and Document zoom. The first load copies applicable legacy settings only when the destination has no value; it never repeatedly overwrites later choices. Toolbar command IDs are migrated by capability: source-safe items remain in Editor, rich/page items are offered in Docs, and unavailable legacy items are retained for recovery but not rendered as live commands. A migration report explains filtered items and Reset remains available.

`docs.yavc.app` becomes the real Docs package, replacing the alias that currently precedes applet lookup. Existing Docs URLs retain their hostname, paths and resource query. `editor.yavc.app` remains Editor; old Document/Visual view links there offer Open in Docs instead of silently displaying a different applet. Open/placement keys for Editor remain stable. Docs gains `docs`, `docs-2` and subsequent instance keys. The launcher and taskbar provider expose independent Docs and Editor destinations; existing Editor pins remain Editor. The user may add Docs, but migration does not create an extra pin automatically. Existing launcher filters, taskbar ordering and unrelated applet settings remain intact.

## 9. Slides, Diagrams and other consumers

Slides and Diagrams keep their domain identity and own the source-to-domain mapping, domain selection, native parser/serializer, history scope and validation. They reuse source editing, language assistance, safe rendering, shared clipboard adapters, file operations and toolbar infrastructure where those contracts apply. Docs does not become the editor for every text-backed format, and a Markdown suffix does not absorb a deck into Docs.

Slides' Text view edits the current slide, while Edit Whole Deck opens the entire `.slides.md` in Editor. Diagrams' Text view edits the full native diagram source. These scopes must be labelled in the UI and actions, including whether search and Undo are per slide or whole resource. Existing Slides per-slide history is not a deck-wide structural Undo implementation. Show/Presenter remains explicitly initiated and unavailable capabilities produce a reason. Docs' rich history rules cannot be projected onto deck structure or Canvas shape operations without a domain implementation.

Embedded diagrams in Docs and Slides use the diagram rendering contract. Editing a fenced diagram changes source within its owning document; editing a referenced file opens Diagrams at that resource and preserves the container document. Image insertion remains an asset operation and does not change the global image association. Canvas diagram embedding remains unfinished work and must not be advertised as a consequence of this applet split.

Diff Viewer is an explicit comparison destination requiring two resources or revisions; it does not claim all text files as their default editor. Settings owns preferences and File Associations. Theme Studio owns theme editing and remains an explicit operation until it declares a validated native theme type. Sight Reader's existing `score` kind remains a domain request and is not replaced by Editor's generic text fallback. Barcode tools, games, Sudoku and Conway keep their domain requests; optional future saved formats must declare a specific type and import validation before claiming associations. A generic JSON or Markdown container alone does not justify a domain handler claiming every file of that syntax.

Files' existing safe raster preview and SVG download restrictions remain in effect. A future image or PDF applet can register a viewer capability without changing the resolver. Terminal execution, asset insertion, comparison and import use separate intents. The launcher lists real applications whether or not they handle files; tools without file handlers need no artificial extension mapping.

## 10. Office opening means conversion first

DOCX import remains planned. The first implementation converts in the browser through a bounded Office reader, sanitized HTML and the shared rich-to-Markdown path, producing a new unsaved `.docs.md` document. PPTX already has a text-oriented importer that notes pictures rather than preserving them. Direct Open can route to that importer and produce an unsaved `.slides.md` deck with a conversion report. Conversion warnings precede save and remain available afterward. Input ZIP expansion, XML and image limits apply before expensive conversion.

Imports preserve original Office files and provenance without rebinding Save to them. Save writes native Markdown, Save As names the native copy, and Export creates a new DOCX/PPTX. Unsupported images, layout, themes, charts, fields and animations are reported according to the importer. Password-protected and macro-bearing variants are refused unless an explicit importer contract supports them. Neither PDF export nor Office export implies native Office save-back fidelity. Full-fidelity Office editing remains outside the split.

## 11. Shared code and host boundaries

The implementation extracts the current Editor workspace into shared implementation modules under `apps/md-editor`, leaving small standard PUDL applet shells under `apps/editor` and `apps/docs`. The modules share tab lifecycle, source state, language assistance and document adapters; saving/recovery calls go through documented host capabilities. Each shell supplies its fixed command set and supported views. Slides and Diagrams keep their domain models. A runtime user setting cannot turn one shell into another application. The host owns association policy, storage/revision authority, window lifecycle and grants; applets own their domain behavior.

Browser and desktop hosts expose the same documented capability needs: resource read/write with revision checking, applet catalog and explicit dispatch, preferences, snapshots, optional windows and safe file selection. Host adapters can report unsupported capabilities. Core resource access is not implemented by having every applet reach into another applet's global variables. Each host's existing FS/document service remains the persistence authority, and extraction must not replace its storage backend as a side effect. The portable packages may not require yavc.app globals, session storage, site-relative asset paths, topbar, Files or Settings applets. They use the ordinary PUDL contract, with missing capabilities explicitly specified before reliance. `applet-portability-design.md` defines the host inventory, release artifact, minimal-host harness and actual-webview gates; it creates no parallel applet runtime.

Progressive enhancement applies to the server-rendered application catalog, links, supported navigation and accessible error states. Browser-local editing already requires JavaScript/WASM; without it, the shell must explain the unavailable editor rather than invent a server copy of guest content. Installed applets remain locally bundled and usable offline where the host supports offline resources. New package/configuration contracts must be documented and tested rather than inferred from incidental PUDL internals.

## 12. Implementation order and acceptance

The immediate implementation target after the byte-preservation and picker candidate is the shared-workspace extraction and separate Docs/Editor registration. The resource-authority and recovery groundwork is installed; the byte reader is prepared in PR #55. Further encoding coverage is not a separate prerequisite release. The extracted packages must enforce their supported-format boundaries, keeping unsupported writable encodings and unsafe edits unavailable with a reason. Snapshot migration, independent identities, shared code and reintegration remain part of the split itself. This follows the acceptance gates below without claiming that every source format is writable.

1. Remove automatic identity switching from PR #46, retain the independent Slide glyph correction, and land the reviewed design. Do not implement the split in a design-only release.
2. Audit the priority applets against documented PUDL/host-kit capabilities, establish the portable host boundary and minimal unrelated-host harness, and prove Diagrams with synthetic resources. Keep yavc.app on the same portable artifact. Reuse the receiving host's existing resource/writer contracts.
3. Add the pure resolver, versioned host-owned capability registry, explanations and File Associations settings. Preserve current routing through adapters, add a bounded byte-read/text-decoding capability, and provide documented revision-checked writes or documented exclusive-writer enforcement before enabling the writable split.
4. Extract the shared workspace and portable Editor, Docs, Diagrams and Slides packages. Register Docs with fixed identity, menus, source/preview limits, URL behavior, independent launcher/taskbar entries and conservative preferences/snapshot migration. Migrate capability/action manifests and host adapters with it.
5. Reintegrate the built portable artifacts into yavc.app, removing the old implementation path after parity/rollback checks. Route Files, applet Open/Open With, recent files, Edit Whole Deck, diagram source links and agent operations through the shared contracts. Keep explicit applet choices explicit and verify same-origin handoff and artifact identity.
6. Add DOCX import and improve PPTX image handling as a separate fidelity batch. Do not hold the identity split for Office fidelity work.

Each implementation batch must pass the full repository gate, focused three-engine fixtures, independent source/PUDL review and rendered checks in desktop/standalone contexts. No browser/native test is claimed by this design document. Acceptance must include these scenarios:

- Markdown defaults to Docs Visual, `.docs.md` to Docs Document, code to Editor Text, decks to Slides, and each diagram type to a supported view.
- Explicit Editor Open can edit Markdown and specialized source without redirecting or invoking presentation; Docs declines unsupported native types and offers conversion or Open With.
- Switching views or tabs preserves applet identity, file text, unsupported constructs and applicable history. Preview cannot mutate its owning resource.
- Compound suffixes, unknown text, absent MIME, misleading MIME, unavailable handlers and obsolete preference schemas resolve deterministically with truthful explanations.
- Encoding, BOM and line endings survive supported text saves; invalid decoding and oversized resources are refused before mutation.
- Dirty/new drafts, cancellation, concurrent writers, storage failures, Save As, delayed loads and disposed windows preserve acknowledged and unacknowledged work.
- Desktop and standalone handoffs retain origin/workspace identity and never reinterpret another origin's `~/` path as the same file.
- Existing unsaved snapshots, toolbar choices, URLs, applet pins and agent actions migrate without silent deletion or cross-target mutation.
- Slides search/history scopes, Mermaid read-only rendering, D2/Canvas editing, embedded diagram ownership, terminal execution and comparison intents retain their domain contracts.
- Import reports expose conversion losses, preserve Office originals and never save Markdown bytes over an Office container.
- The same exact priority applet artifacts run in yavc.app and a minimal unrelated PUDL host with no site globals/storage. Actual receiving-host webview checks prove offline assets, workers/WASM, isolation and host-owned save/recovery before adoption.
- Editor, Docs, Diagrams and Slides are loaded from the extracted release artifacts in the reintegrated yavc.app build. Shared-consumer tests and artifact identity checks exclude a hidden legacy-source fallback.

## 13. Boundaries and implementation gates

The design fixes the application boundary and native file routing. Default rich editing does not require copying every Word control into Docs. Fine pagination, document templates, broader Office fidelity and deck-wide structural Undo retain their existing backlog and contracts.

Two implementation details need evidence before their final API is frozen. The existing storage adapters must be audited for a documented atomic revision or exclusive-writer primitive; where neither exists, implementing one gates the writable split. The Markdown parser/serializer must be audited for preservation of unsupported syntax so Docs never silently loses content on a visual edit. These are implementation gates, not permission to assume that watchers or a passing round-trip sample establish correctness.
