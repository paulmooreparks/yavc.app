# Shared Editor and Diagrams Integration Proposal

The 2026-11-07 `applet-portability-design.md` and `content-applications-design.md` refine package portability and fixed Docs/Editor identities. They retain this proposal's resource/save/dependency contracts and do not amend the signed platform plan or authorize migration. The inventories below record their original checked baselines rather than the current release.

This proposal contributes the editor inventory and adoption contract to the joint Dinah platform plan requested by Paul on 4 November 2026. Dinah Team Lead owns the consolidated plan in GK's private repository at `docs/proposals/dinah-platform-plan.md`. This public document contains generic contracts only. It is a proposal for review, and it does not authorize extraction, implementation or publication.

Paul clarified the priority in group message 4737. Building GK Companion on Dinah to stop runtime divergence comes first, while preserving the useful behavior GK already has. The editor and Diagrams contracts below are future-direction constraints. Their implementation, extraction and feature completion do not gate the first Dinah-based product. The immediate integration must preserve the existing document experience through supported host interfaces and keep a later shared-editor adoption possible.

The implementation inventory was checked against local yavc.app `main` at `8293692`. After Paul supplied the canonical designs, their source was fetched without changing the working tree: [Docs](https://github.com/paulmooreparks/yavc.app/blob/b8cdd467adcb153d0a94a3c8d2044ea2ea5ba297/docs/docs-design.md) at `b8cdd467adcb153d0a94a3c8d2044ea2ea5ba297`, and [Diagrams](https://github.com/paulmooreparks/yavc.app/blob/16a1553eb8553ca2a55b303bb18981989b1e53de/docs/diagrams-design.md) at `16a1553eb8553ca2a55b303bb18981989b1e53de`. Both designs say their new behavior is planned, not yet built. The architectural principles remain in `C:\Users\paul\OneDrive\Documents\Architectural Principles.md`. Existing decisions in `DESIGN.md`, `docs/page-view-design.md` and `docs/slides-design.md` remain authoritative until an approved decision changes them.

## Current Source Inventory

| Component | Current Location | Contract and Extraction Work |
| --- | --- | --- |
| Editor application | `apps/editor`, manifest version `45.10.1` | PUDL applet using snapshot, file-system and configuration services; application version alone does not version its shared dependencies |
| Editing kit | `apps/md-editor/kit.js` | Shared commands, forms, pictures, block drawing and properties for Editor and Slides; currently depends on site utilities and dialogs |
| Visual editing | `apps/md-editor/page-view.js` | ProseMirror view with source-preserving blocks, rich containers, inline shortcodes and marks; currently exposed through `window.yavcPageView` |
| Markdown engine assets | `apps/md-engine` | Loader, HTML sanitizer, stylesheet, Go runtime support and WebAssembly binary; loader currently depends on `window.yavcUtil` and site-relative asset locations |
| Markdown engine source | `cmd/yavc-md`, `internal/mdapi`, `internal/pageview`, `internal/preview`, `internal/shortcodes`, `internal/frontmatter` | Go implementation compiled to WebAssembly; `internal` packages cannot serve as an external Go module API without extraction |
| Styles | `apps/md-editor/kit.js`, shortcode engine and Slides | Class discovery and class marks exist; style blocks remain source blocks in Visual view; this does not establish the forthcoming extension format |
| Diagrams | Mermaid dependencies and existing block rendering | Existing diagram rendering does not establish the planned Diagrams tool's editable model, API or storage format |

The loader exposes `preview`, `doc`, `markdown`, `blocks`, `source`, `container`, `inline`, `glyphs`, `front` and `frontset`. These are observed implementation entry points, not a promised external API. Parser and serializer behavior, rendering, sanitation and source-unit mapping must be released together.

The current page-view design preserves untouched blocks byte for byte, including their gaps and container delimiters. Container bodies support rich editing; standalone shortcodes use shared forms; inline shortcodes are atomic pieces; colour and class shortcodes use marks. Slides already consumes the shared kit. These are useful extraction boundaries, but no independent editor SDK release has been proven in this inventory.

## Canonical Docs and Diagrams Contracts

The missing design-source question is resolved. The following table records the formats the integration must adopt. It adds no competing syntax.

| Area | Canonical Design | Host Integration Requirement |
| --- | --- | --- |
| Documents | `.docs.md` opens in Document view; other Markdown can use the same view | Preserve the suffix and view selection; retain Text, Visual, Split and Preview alongside Document view |
| Page setup | Front matter holds `page`, `orientation`, `margins`, headers, footers and typography | Validate and preserve these properties; supply fonts and viewport/print lifecycle; leave measured page bands out of serialized Markdown |
| Styles | Stock `theme`, referenced `stylesheet`, then local `{{style}}` blocks; `{{class}}` applies styles | Resolve theme and CSS resources through host policy; share scoped, contained styling across editing, preview and export |
| Macro libraries | Local `{{define:name}}` blocks and a file referenced by `shortcodes`; themes may supply libraries | Load the selected library as data, retain provenance and revisions, and reject collisions under the documented definition rules |
| Macro arguments | `{{param:name default="..." help="..."}}`, escaped literal `{{arg:name}}`, at most one `{{content}}` | Use the same declarations for forms, hover and expansion; never evaluate definitions as code |
| Expansion limits | Names match `[a-z][a-z0-9-]*`, cannot replace built-ins; depth eight, direct self-reference refused, expansion capped at 256 KB | Test direct and indirect cycles, escaping, malformed definitions and cumulative growth; preserve undefined uses with diagnostics |
| Diagram source | `.d2`, `.mmd` and accepted `.mermaid`; D2 visual editing, Mermaid text with preview | Keep source as the sole durable model; apply D2 operations as undoable source transactions; do not add coordinate sidecars |
| Diagram embeds | `{{diagram:path}}` with alt, width, caption, board and theme options; fenced `d2` or `mermaid` for inline source | Resolve referenced files relative to the containing resource; retain source and options alongside any publication derivative |
| Diagram execution | D2 WebAssembly in a dedicated worker; shared `apps/diagram-kit`; bundled ELK and exact dependency pins | Ship worker/runtime/layout assets offline; enforce cancellation, source/import limits and stale-result rejection |
| Review markup | CriticMarkup is planned for portable changes and comments | Preserve host threads, external references and verified human approval independently of text markup and front-matter authorship |

The Docs design adds underline, highlight, superscript, subscript, page breaks and captions, then footnotes and references in later milestones. These features must be declared in each release's capability table so a host does not claim support merely because it can display the file as Markdown. Planned Word import/export and printed pagination require their own parity evidence.

Styles use `@scope` and a paint-contained document surface. The host must supply permitted stylesheet images through the existing image policy and rewrite browser-local references; `@import` is removed. Scoping alone is insufficient. Tests must cover a fixed-position overlay, selectors that escape a block, hostile URLs and two open documents styling each other. Pagination depends on fonts and measured diagram dimensions; its release gate must record the actual browser engine and fonts used for view/print comparison.

The Diagrams design compiles only an explicit in-memory map of `.d2` files from the diagram's folder. The host must resolve and authorize that map, bound its total size, fetch only permitted icons and pass approved image data to the renderer. D2 output is displayed as an SVG image through a blob URL. Mermaid retains its existing strict sanitized rendering until the design's cross-browser image test passes. Worker termination and generation-bound replies must prevent an obsolete compile from replacing a newer diagram or a different open file. D1 still has to establish shape/connection limits and time budgets; this proposal invents no values for them.

The design's BroadcastChannel notification is a refresh hint. Each host checks saved resource identity and revision through its adapter before treating a diagram as current. Browser-local files remain per origin until shared storage exists; embedding inline source is the portable path today. A desktop adapter must not reproduce those origin restrictions as an artificial storage model.

The diagram release gate includes a dependency-license audit and shipped notices for D2, its layout engines and other bundled code. The SDK must use documented external interfaces; golden tests measure compatibility but do not make undocumented behavior contractual. D2's first visual edit may reformat source as the canonical design describes, so the formatting notice, one-transaction undo and source-only editing behavior belong in the common corpus. D2 completion support is browser-side in this design and does not require a server language process.

## Proposed Package Boundary

1. The editor owner publishes a shared editing library with a documented host interface. Editor and Slides remain consumers of it. A standalone PUDL Editor applet may wrap that library, but desktop hosts can embed it without adopting yavc.app's file system, session service or site shell.
2. One immutable release contains the matched browser library, parser/serializer, renderer, sanitizer, styles, dependencies, licenses and WebAssembly runtime assets. A Go API may also be published for native execution from the same source revision. Cross-runtime tests must establish equivalent results before a host chooses the native implementation.
3. A separate Diagrams package supplies its documented model and editing interface once its design is available. The Editor integrates through that interface. Diagram source and asset references remain recoverable independently of generated SVG or raster output.
4. Dinah consumes a pinned editor release. A product built on Dinah normally inherits that version. Product-specific definitions and bridges remain outside the editor. An override requires an explicit tested compatibility combination, so two copies of the editor do not enter one window through separate dependency paths.
5. Extraction preserves source history and licensing. The repository location and package names remain decisions for the joint plan. Tagged release archives are the browser delivery mechanism; a Go module is useful only after supported public interfaces exist.

## Host Interface to Specify and Prove

The following responsibilities are the required scope of a future documented API. They are not names of APIs already available.

| Responsibility | Shared Editor | Host |
| --- | --- | --- |
| Document editing | Parsing, serialization, selection, undo, diagnostics and source preservation | Resource identity, loaded revision and durable draft record |
| Changes and saving | Change notifications with a text revision; explicit acceptance of a newly loaded baseline | Revision-checked saves, conflicts, recovery, read-only policy and publication |
| Attachments | Resolve display references through the host; release temporary resources on disposal | Read/import policy, attachment identity, access control and persistent storage |
| Styles and shortcodes | Validate supported definitions and sanitize rendered output | Supply explicitly selected, versioned definition packs and their provenance |
| Comments and suggestions | Documented anchors, decorations and edit transactions | Thread persistence, authorship, external references and approval policy |
| Diagrams | Open source through the diagram interface and apply an accepted edit as a document transaction | Save source and attachments together with conflict and recovery handling |
| Application integration | Mount, focus, command contribution and complete disposal | Window lifecycle, navigation URLs, dialogs, notices, settings and accessibility context |

The editor cannot grant itself a read or write capability through a document, extension definition or agent request. The host validates resource access at the boundary. File paths and URLs use the host's resolver, which enforces its storage roots and schemes. Private host credentials never enter extension definitions or document exports.

The consolidated plan should adapt existing resource snapshot, revision-write and attachment interfaces before creating another document-home abstraction. A snapshot must retain the native baseline needed by an external storage adapter even when the editor works on Markdown. Editor text alone is insufficient for a lossless external write-back.

Every save request and completion must identify the submitted document, its open-instance generation and its text revision. A successful save acknowledges only that submitted revision. Edits made while the save was pending remain in the buffer and remain unsaved; the host must not mark them saved or replace them with the submitted text. A completion for a document that has since been closed, reopened or replaced cannot alter the active document. Conflict responses retain the local buffer and recovery data while the host offers its conflict-resolution actions.

## Formats and Extension Compatibility

The release manifest must record the editor version, source revision, archive digest, host API range, document-format versions, definition-schema versions, diagram-format range, supported PUDL versions and dependency inventory. Hosts record the manifest they adopted in their own build. Applet, document format and host API versions remain separate quantities.

Custom styles and shortcode definitions follow the canonical Docs syntax above. Definitions from a document remain untrusted. The canonical macro mechanism substitutes escaped arguments and Markdown content before normal parsing and sanitation; it executes no author code. A product pack supplies those definitions through the same mechanism. Any request for executable extensions would change this design and requires separate review.

Style rules must remain within the document surface. They must not change application chrome, capture input over host controls, load arbitrary remote resources or bypass HTML and SVG sanitation. Preview, Visual view and export apply the same security policy. A renderer-specific exception requires a documented contract and a regression fixture.

An unknown shortcode, unavailable style pack or unsupported diagram remains recoverable as source with a visible diagnostic. A host may allow a safe edit elsewhere only if it can preserve the unsupported content. Otherwise it offers read-only/source recovery and refuses a destructive write. Opening a document must never silently upgrade its format.

The macro name is its canonical identifier and cannot replace a built-in. The extracted API must document precedence or refusal for duplicate names across document, referenced and theme libraries, and characterize existing host shortcodes before adoption. Release manifests identify library revisions separately from their macro names. A portable export must retain the referenced styles, definitions, diagrams and allowed imports, or inline them through a documented export operation while keeping the original editable source recoverable. The host's dependency manifest can record revisions without introducing another document syntax.

## Release and Adoption Procedure

1. The editor owner freezes a candidate revision and publishes a reviewable manifest and compatibility report. Release validation covers both its source and the immutable built artifact.
2. Each host runs the common synthetic corpus against that artifact in its actual embedded UI, plus its own integration suite. Tests include Text, Visual and Preview, source equality without edits, undo, focus, keyboard behavior, attachments, unknown definitions, sanitized styles and diagram edit/reopen behavior. Browser and desktop-engine coverage is recorded explicitly.
3. A host adoption change updates its pin, digest, compatibility record and any adapters together. A package update never fetches a floating editor at runtime. All required assets ship with desktop builds for offline use.
4. A candidate is exercised on copied state, then adopted through the host's normal reviewed release process. Failed compatibility gates retain the old pin. Rollback uses the previous complete asset set and adapter version.
5. A document-format migration requires an explicit backed-up operation and report. Rolling back executable assets after new-format edits requires a verified reverse migration or an export/reconciliation procedure; merely reinstalling an older build is insufficient.

The common host-integration corpus must exercise a delayed save while typing continues, a document switch before save completion, closing and reopening the same document before completion, and a revision-conflict response. It must prove that only the submitted revision is acknowledged, newer edits keep their unsaved state, late responses cannot replace the active document, and conflicts preserve recoverable local work.

## External Publication and Future Native Storage

The Confluence bridge remains through the first usable platform cutover. Its adapter preflights constructs it cannot represent and reports proposed conversions before a write. It retains the editable local source, native baseline, attachment mapping and remote revision. Lossy publication requires a defined policy and explicit approval rather than silently replacing an unsupported construct with rendered HTML.

The host's parity corpus must cover native-storage preservation, conflicts and merge, inline comments, suggestion anchors and approval fingerprints. A shared editor upgrade cannot make a stale approval appear current. Preserved approval records must remain verifiable after identity or credential-store migration, or the host must require fresh approval.

A review snapshot must bind document identity and text revision to its transitive presentation dependencies. These include theme and stylesheet content, shortcode libraries, linked diagram source, imported D2 files, relevant images, and definition/renderer versions used to produce the reviewed result. The host retains this snapshot for recovery, offline use and publication preflight. A dependency change requires renewed review even when Markdown text is unchanged. Publication checks the same dependency revisions and reports a mismatch before writing. Existing text-only approvals cannot silently acquire this broader meaning; migration must mark their limited coverage or require fresh approval. A front-matter author or CriticMarkup comment never substitutes for authenticated approval identity.

Confluence publication of an expanded macro or diagram picture produces a derivative. The original macro definitions, styles and diagram source remain recoverable with their dependency snapshot. Compatibility tests must include the current host's shortcode names, argument grammar, nested content, unknown uses and native-storage round trips against the new engine's expansion and naming rules.

A native document store is a separate project behind the same resource boundary. It needs identity, permissions, concurrent-edit handling, durable history, search, comments, review, attachment storage, backup, export and browser access for colleagues. Editor and diagram adoption can proceed while those services are designed; retiring Confluence requires their own acceptance evidence.

## Implementation Sequence and Exit Gates

| Phase | Proposed Owner | Required Exit Evidence |
| --- | --- | --- |
| Reconcile canonical designs | Editor owner and canonical design author | Pinned Docs/Diagrams designs, agreed library collision rules, existing-host shortcode compatibility and a release capability table |
| Establish public seams | Editor owner with Dinah host maintainers | SDK contract, dependency inventory and an isolated host harness with no site globals or private data |
| Extract without feature changes | Editor owner | Editor and Slides pass the same corpus against the extracted artifact; source-preservation evidence and reproducible release contents |
| Integrate Dinah | Dinah maintainers and Quality | Real host verification, recovery and document integration parity; a reviewed pinned release |
| Integrate derived products | Product maintainers and Quality | Domain workflows, native baselines, suggestions, comments, approvals and bridge gates pass on copied state |
| Enable Diagrams and new definitions | Editor/Diagrams owners with each host | Source edit, save, close, reopen, export and unsupported-host recovery tests in every supported host |
| Cut over user data | Product lead and Quality | Migration report, separate state stores, daily-work rehearsal and rollback proof including new edits |

These phases describe dependencies, not duration estimates. The joint plan must reconcile its feature ownership rulings before moving flows or domain document types into the public platform. No phase permits private templates, customer examples or bridge credentials to enter the shared release corpus.

## Review Status

The editor contribution supports a common Dinah platform and explicit editor release adoption using the pinned canonical Docs and Diagrams designs. The missing design-source blocker is resolved. Final sign-off on the consolidated plan still requires its documented host interfaces, dependency-aware review and migration gates. The extracted API and implementation must then be proven through their phase exits. This inventory used source and design inspection only. It made no implementation changes, ran no rendered checks and deployed nothing.

### Joint Plan Draft 1 Review

The complete joint plan was reviewed at commit `32baeb34a4c52728622aaaf75bbd2ac7cfb31f33`. Its guarded downstream source build is a reasonable first stage while the public module interface is established. Future editor work is represented at the intended priority, and the retained document behavior and later adapter-removal criterion are present. Sign-off is pending these corrections, sent to the plan editor for consolidation:

1. Section 2 must replace its guarantee that separate files can never conflict with a bounded claim. Upstream API changes, new paths and registration changes can still require adaptation. The guard prevents unreviewed inherited-source edits; the rehearsal and contract tests prove that one tested update preserves behavior.
2. Sections 2, 4 and 6 must make the inherited-file guard auditable. The downstream records the exact upstream tag and commit plus inherited paths and hashes, checks additions, deletions, renames and modifications against that base, and records every allowed delta as an exact reviewed patch with its reason. A path-only exception must not permit arbitrary edits. Upstream additions colliding with product files stop the update. Vendored dependencies, module metadata and embedded/generated assets need an explicit reproducible provenance policy. A new seam lands upstream before downstream use.
3. Phase 3's temporary Editor adapter must pass its existing-behavior tests before acceptance, including delayed saves while typing, document switching, close/reopen and conflicts. Moving those requirements only into Future Direction leaves the current integration without the same protection. Current text-bound approval verification remains required immediately; the broader dependency-aware approval gate applies before rich external dependencies are introduced.

This review changes no other team's files and claims no build or migration execution.

### Joint Plan Draft 2 Sign-Off

yavc.app Development signs the plan at `a825ff4aa5f7efd6ac78cf29f327d358d8b71e60`. The revised plan incorporates all three requested changes. Its input snapshot of this proposal matches the reviewed local proposal, and all eight snapshot digests match their manifest. The signature approves the design and staged acceptance gates from this contribution's scope. It does not certify implementation, migration execution or release readiness, and implementation still waits for Paul's plan decision. The immutable snapshot in the plan remains the signed input; this later review note does not amend it.

### Joint Plan Draft 3 Carry-Forward

The signature carries forward to `b4f5d5c950e2dfc7ebb359a5eb123490b0c15649` after review of the complete diff from Draft 2. Only the plan changed. The public-module rationale is corrected, internal dependencies are limited to reviewed seams, workflow/kind/redaction contracts are explicit, and the example product must run beside stock Dinah with isolated state and startup identities. The prior editor and migration requirements remain intact. The signature retains the same design-only scope and approval boundary.

### Joint Plan Draft 4 Carry-Forward

The signature carries forward to `df2742856db2b9f63c4b3b03ec3a37f09fcfb15d` after review of the complete diff from Draft 3. Only the plan changed. Rehearsal isolation now covers writable workspace roots and run records, with original-data preservation checks and a single-writer cutover; credential failures have an explicit supported path without silent identity substitution. The corrected scope references preserve the prior requirements. The signature retains its design-only scope and approval boundary.

### Joint Plan Draft 5 Carry-Forward

The signature carries forward to `11d9d7740b97d036fc53f75268b56ca450ea6dd0` after review of the complete diff from Draft 4. Only the plan changed. Page registries reject duplicate identifiers, product contributions use prefixed identifiers and the host's PUDL, allowed page globals receive documented contracts, and frontend rules cover the product contribution root. These changes preserve the prior requirements and strengthen the temporary Editor adapter boundary. The signature retains its design-only scope and approval boundary.
