# Content application design review

This review was completed on 2026-11-07 against `content-applications-design.md`, installed source baseline `b710bb5`, the current package manifests, host FS/configuration/snapshot services, PUDL's documented request routing, and the existing document/deck/diagram designs. It is a design and source review. It does not establish runtime acceptance of an unimplemented split.

## Findings and dispositions

| Finding | Evidence and consequence | Disposition |
| --- | --- | --- |
| Docs is an alias, while the desired product has two applets. | `internal/web/server.go` resolves `hostAliases` before package lookup. A Docs package alone would still lose to the alias. | The design replaces the alias deliberately and preserves Docs URLs. Docs and Editor gain independent identities over shared modules. |
| Automatic title switching contradicts fixed applet identity. | PR #46's temporary change renamed Editor when its active tab changed. Pins, settings and actions still identified Editor. | The runtime change and temporary fixture are withdrawn. Identity stays with the applet; filename detail describes its resource. |
| Generic open dispatch would become registration-order dependent. | `pudl-applets.js` returns the first matching verb/kind. Existing `open` serves Editor and Sight Reader's score kind. | A host resolver chooses first, Docs receives `document`, and explicit Editor `open` remains source editing. Domain requests remain distinct. |
| Syntax, applet identity and visual capability were conflated. | Files special-cases suffixes, while Editor exposes a broad Markdown Format menu. Mermaid renders without the D2/Canvas mutation model. | Resource type, association, language and view are separate. Compound suffixes retain their domain owners. Mermaid offers Text/Split/Preview with an old-URL alias. |
| A text-backed file is not necessarily an ordinary document. | Parsing `.slides.md` as ordinary rich Markdown or saving converted document content over `.txt` can alter structural meaning. | Docs declines decks as native content, Editor offers raw source, and imports create new native drafts. Viewing `.md` as pages adds no metadata by itself. |
| Broad text support is gated by unrelated heuristics. | `sitefs.js` has a server extension whitelist; upload selection also uses MIME/text decoding heuristics. | Bounded bytes, validated decoding, encoding/BOM/line-ending preservation and a text fallback become independent of associations and highlighting. |
| Dirty handoff by saved path can lose the current draft. | Existing applet requests normally carry paths, while the current tab can be unsaved or unnamed. | Save and Open waits for acknowledgement, Open Saved Version is explicit, Cancel preserves the tab, and new drafts require Save As. |
| Notifications do not prevent concurrent overwrites. | Editor observes FS changes and orders its own saves, but the inspected write call passes no expected revision. Separate buffers can race. | Documented authority-wide compare-and-write or exclusive-writer enforcement gates the writable split. The review rejected guessing the first writer from in-page state. |
| Shared preferences do not make guest files cross-origin. | Configuration is session-shared; guest files and snapshots are origin-local. DESIGN.md's State section incorrectly included guest home in the server store. | Identity includes origin/workspace. Standalone handoff uses a same-origin window or explicit transfer. The stale State sentence is corrected. |
| State migration can erase work or mix unrelated preferences. | The alias uses Editor's implementation/settings; snapshots can hold unsaved rich drafts, and toolbar IDs include document commands. | Original snapshots remain until acknowledged adoption. Destination namespaces are separate. Applicable preferences migrate only into unset values. Editor pins remain Editor. |
| Shared controls can conceal incompatible history scopes. | Slides has per-slide history/search and no deck-wide structural Undo. Diagram mutations are format-specific. | Domain adapters retain their history and search scopes. Sharing controls does not imply deck-wide Undo or generic writable Visual support. |
| Old Office-import rationale is stale. | `import-pptx.js` says pictures are dropped because home stores text, but `sitefs.js` already has browser-local binary upload storage. DOCX import exists only in design prose. | Existing PPTX conversion and planned DOCX import are distinguished. Image preservation does not depend on account storage. Office originals remain unchanged. |
| PUDL packaging does not establish actual applet portability. | Editor directly loads `pcSiteFs` and site utilities; Diagrams loads shared engines through `/applets` paths. Both have host/navigation assumptions. | `applet-portability-design.md` requires a documented capability audit, host adapter, complete asset manifest and minimal unrelated-host proof, prioritizing Editor/Docs and Diagrams. |
| A separate editing plugin runtime would duplicate PUDL's boundary. | The user clarified that every PUDL applet is supposed to be portable, with these applets first. | Ordinary PUDL packages remain the integration unit. Shared modules sit behind them, and another application's resource authority replaces the yavc.app adapter without source patches. |

The independent source/PUDL reviewer reported one concrete design finding: read-only secondary openings cannot establish an authority-wide writer guarantee. Sections 7, 12 and 13 now require a documented concurrency primitive and remove that fallback. A final independent reread found no remaining design contradictions. The author also preserved Docs' existing New behavior and made Mermaid's read-only view semantics explicit.

The user then reaffirmed standard PUDL applet portability and included actual extraction/reintegration of Editor/Docs and Diagrams in the upcoming effort. Slides is included because it consumes the same editing and host infrastructure. The expanded portability design was independently reviewed against the content design and existing Dinah briefs, with no findings. It keeps resource identity, writer/creator, save acknowledgements, attachment resolution, recovery, navigation and policy in the receiving host, and distinguishes proposed capabilities from current interfaces. Completion now requires the reintegrated yavc.app build to load the same portable artifacts as the harness, with legacy runtime copies removed after parity and rollback checks. No extraction or downstream migration has yet occurred.

## Scenario walkthrough

The following results are contract walkthroughs rather than executed browser tests.

| Scenario | Required result |
| --- | --- |
| Double-click `README.md` in Files. | Docs opens Visual without renaming it or adding document metadata. |
| Use Editor's File, Open for that README. | Editor opens source; global defaults do not redirect an explicit choice. |
| Switch Docs from Visual to Text and back. | The same Docs tab, source revision, supported content and history remain. |
| Open `.slides.md` with generic Markdown MIME. | Slides edits the deck; Editor remains an explicit whole-source alternative. |
| Open Mermaid using an old Visual URL. | Diagrams maps it to read-only Preview with a notice and no shape mutation commands. |
| Choose Open in Editor with unsaved changes. | Save acknowledgement or explicit Open Saved Version precedes handoff; Cancel preserves the draft. |
| Edit a resource from Docs, Editor and Terminal. | The storage authority rejects stale writes or enforces one writer. Notifications alone cannot pass. |
| Open a standalone Docs resource in Editor. | A same-origin window receives its resource capability. Another origin's `~/` path is not equivalent. |
| Open an unfamiliar UTF-8 source suffix. | Editor opens text without requiring an association or language provider. |
| Open an Office file. | A supported importer produces a native draft, reports losses and preserves the original. |
| Associate a game/theme tool without a file handler. | Settings refuses unsupported capabilities; generic JSON does not establish a native type. |
| Restore an old rich Editor draft. | Recovery preserves source and the original snapshot until acknowledged adoption. |

## Implementation gates

The design is ready for implementation planning, with two mandatory safety audits before the writable split. Storage adapters need documented atomic revision or exclusive-writer guarantees covering every writer. Markdown adapters need evidence that unsupported syntax is preserved or protected from unsafe visual edits. Neither gate is satisfied by this review.

The registry, Docs package, resolver, text decoding improvements, migration and revised UI are future work. Browser checks, recovery migration, encoding round trips, conditional-save races, host adapter acceptance and rendered review must accompany implementation. PR #46 contains the independent Slide glyph correction and this design, not the split.

The same exact package/dependency release must pass a minimal unrelated PUDL host without site globals and the receiving application's actual webview before portability is claimed. That gate covers asset resolution, offline WASM/workers, security policy, multiple instances, stale replies and host-owned persistence. Existing PUDL registration alone does not satisfy it.
