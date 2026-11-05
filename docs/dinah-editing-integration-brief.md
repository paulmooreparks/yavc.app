# Editing integration with Dinah Desktop

This brief was requested by Paul on 4 November 2026 for the cousin agent working in this repository with the Dinah Team Lead. It proposes a route for sharing the editing features, without authorising implementation, replacement of Dinah's editor or a storage migration. The released source baseline is yavc.app `v0.2.14`, commit `2555ef7`. The shared LSP round is a subsequent candidate described separately below.

The [shared-editor platform proposal](shared-editor-platform-proposal.md) retains the earlier host, save and compatibility requirements. Its implementation inventory predates the current Diagrams work. This brief supplies a current starting point and does not amend the signed joint-plan record. The canonical architectural principles remain in `C:\Users\paul\OneDrive\Documents\Architectural Principles.md`.

## Recommended approach

Integrate through a bounded host adapter first, then establish one maintained editing package consumed by both hosts. A permanent copy of the current application scripts would restart divergence. Moving the whole yavc.app shell into Dinah would also transfer storage, navigation and lifecycle responsibilities that Dinah already owns.

Diagrams is a useful first proof because it exercises source editing, a visual editing surface, workers, WebAssembly, commands and exports without first replacing Dinah's document editor. The Markdown work needs a comparison against Dinah's current implementation: yavc.app's page view and parts of its Go engine originally came from Dinah, and returning improvements should reconcile those implementations rather than install another independent copy. The Dinah checkout has not been audited for this brief.

## What exists today

| Surface | Reusable implementation | Limits to preserve in the plan |
| --- | --- | --- |
| Editor 45.15.0 | `apps/editor`, `apps/md-editor` and `apps/md-engine` provide CodeMirror source editing, ProseMirror Visual editing, Split and Preview, source-preserving blocks, rich shortcode containers and shared insertion forms. | The full paginated Document view, review workflows and other remaining work in [Docs design](docs-design.md) are planned. The `.docs.md` entry point does not establish those capabilities. |
| Slides 0.21.0 | `apps/slides` consumes the shared Markdown editor and engine for slide content, layouts, speaker notes, presenting and HTML export. | Slides is a consumer of the shared package and should participate in compatibility tests even if its Dinah integration comes later. |
| Diagrams 0.15.0 | `apps/diagrams` and `apps/diagram-kit` provide D2 visual/source editing, Mermaid source with preview, and editable JSON Canvas. Canvas supports multiple selection, shared properties, geometry, groups, connectors with reattachable or free ends, automatic anchors, inspectors, text alignment, source-selection linking and SVG/PNG exports. | Mermaid has no visual editing model. Canvas outline, multiple-selection alignment/distribution, D2 conversion, canvas embedding and Obsidian interoperability checks remain unfinished. See [canvas design](canvas-design.md) and [extension](canvas-extension.md). |

These are working application components, not a released editor SDK. Their globals, DOM assumptions and site-relative asset paths need an explicit integration contract. Relevant host dependencies include `internal/web/static/yavc-util.js`, `dialogs.js`, `doc-tabs.js` and the applet host kit, plus the CodeMirror, ProseMirror, PUDL, Markdown and D2 asset sets. PUDL is currently 0.97.11.

## Where the boundary should sit

| Shared editing package owns | Dinah owns |
| --- | --- |
| Parsing, serialization, sanitised rendering, source mapping, selection, undo and edit transactions | Resource identity, loaded baseline/revision, workspace access and read-only policy |
| Editor surfaces, diagnostics, command contributions and complete disposal | Windows, navigation URLs, menus/ribbon integration, dialogs, notices and focus restoration |
| Requests to resolve images, styles, diagram references and imports | Capability checks, attachment identity, permitted roots/schemes and durable storage |
| Change notifications carrying document identity and text revision | Draft recovery, revision-checked saves, conflicts, publication and approval policy |

Prefer Dinah's documented host interfaces where they already cover these needs. The cousin agent should inventory the gaps with the Team Lead before introducing new interfaces. Do not install yavc.app's browser-local guest filesystem or snapshot store as Dinah's document authority. Existing content, unsupported constructs and native external-storage baselines must remain recoverable.

The shared-toolbar candidate introduces the optional `commandToolbar.attach` host capability described in [the toolbar design](command-toolbar-design.md). It consumes the applet's command table and returns command contributions and disposal. Dinah can provide its own controller and preference service; a host without that capability receives the existing toolbar descriptors. This keeps toolbar customization and storage in the host's adapter inventory.

The save contract needs particular care. A completion acknowledges only the submitted document instance and text revision. Typing during a save remains unsaved; switching documents or closing and reopening one must make stale completions harmless. Conflicts retain the local draft. The earlier proposal specifies these cases in detail.

## Readiness before replacing a desktop editor

The adapter inventory and an isolated proof can start now. Production replacement should wait for the following gates; completing every planned editing feature is unnecessary.

| Gate | Required result |
| --- | --- |
| Save and recovery correctness | Submitted document identity, open-instance generation, text revision and loaded resource revision survive every save. Newer edits remain unsaved. Late responses cannot alter another tab or a reopened document. Conflicts and failures retain the draft. |
| Supported host boundary | Mount, open, change notifications, baseline acceptance, resource resolution, commands and disposal have documented contracts. The desktop owns storage, attachments, recovery, policy and approvals. Application globals and site-relative paths do not become accidental SDK requirements. |
| Reproducible package | One pinned artifact includes the editing code, parser/serializer, cleaner, workers, fonts, schemas and licenses. It starts offline and has a tested rollback. |
| Host acceptance | Synthetic documents pass in the actual desktop webview, including source preservation, unknown content, paste sanitation, keyboard/focus, concurrent windows, worker failure and document lifecycle. The host's prior useful editing behavior remains covered. |

The `codex/editor-productivity-batch` candidate corrects the Editor save-completion finding. Writes capture their originating tab's text and run in a queue per tab. Acknowledgements require the same open tab object; newer edits and failed saves remain modified. A rename updates language/read-only configuration on the originating state, including inactive tabs, without reconfiguring the foreground document. Snapshot recovery retains newer drafts after a delayed acknowledgement. The regression fixture is `scripts/test-editor-productivity.cjs`. This fixes browser save ordering and acknowledgement; resource-revision conflict detection and the desktop host's storage contract remain migration gates.

PR #20 is merged and installed locally as v0.2.14. It adds canvas multiple selection, shared properties, movement together and the revised inspector. The LSP implementation uses a shared Editor/Diagrams integration; its initial scope and current limits are recorded in [the language-services design](language-services-design.md).

The Editor's inherited shortcode catalog request also targets `/api/admin/editor/shortcodes`, an endpoint this host does not serve. It falls back to an empty catalog. The migration inventory should make catalog provision an explicit host capability before promising those completions in Dinah.

Pagination, comments, track changes, advanced diagram layout, conversion and additional export formats can follow the first migration unless a host already requires them. The teams should use a behavior comparison to identify actual replacement gaps rather than make the whole roadmap a prerequisite.

## Suggested handoff and acceptance

1. The cousin agent and Dinah Team Lead compare both implementations and agree on the first surface, ownership, host API and preserved behavior. They should choose the common code's home before extraction.
2. The cousin agent proves open, edit, undo, save and reopen through Dinah's resource services in an isolated build with copied documents, preserving the installed build and original data.
3. Both hosts test one pinned artifact with synthetic documents. Cover untouched-source equality, unknown content, delayed saves, conflicts, focus/keyboard behavior, disposal, sanitation and diagram edits/exports. Include Dinah's actual embedded engine.
4. The teams extract the proven seams and pin assets, revision, digest, licenses, formats and host/PUDL compatibility. Ship workers, fonts and WebAssembly for offline use, and retain the prior complete package and adapter for rollback.

The repository checks are `bash scripts/check.sh --since HEAD`. The focused Diagrams checks are `scripts/test-canvas.cjs` and `scripts/test-diagram-chrome.cjs`, run with Playwright against disposable local data. They supply useful fixtures, but their passing here does not prove Dinah integration. No Dinah migration or integration test was performed for this brief.

The cousin agent should bring the Team Lead a short implementation proposal with the comparison, first proof, required adapter changes and acceptance evidence. Any broader GK platform cutover should retain its existing priority and acceptance gates; sharing these editors does not by itself require replacing the temporary editor adapter in that cutover.
