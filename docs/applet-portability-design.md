# PUDL applet portability, editing applets first

Paul confirmed on 2026-11-07 that portability is a requirement for every PUDL applet, with Editor, Docs and Diagrams taking priority. He then included actual extraction and reintegration in the upcoming effort, including Slides where shared infrastructure requires it. Slides is included because it consumes the same source/rich/Markdown and host services. The work must produce portable packages and make yavc.app consume them again. It does not create another plugin runtime or authorize a downstream application migration. `content-applications-design.md` defines their product identities; this document defines extraction and reintegration acceptance. The earlier `dinah-editing-integration-brief.md` and `shared-editor-platform-proposal.md` retain their source-preservation, resource, save, dependency and adoption requirements. Their old version inventories are historical.

## 1. Portable packages and shared modules

The deliverables are ordinary PUDL applet packages for Editor, Docs, Diagrams and Slides, with versioned shared editing/diagram dependencies. Each uses the documented package, mount, state, command, menu and disposal contracts. The public host boundary remains PUDL and its documented host capabilities. There is no independent editing-specific applet framework, universal profile runtime or permanent downstream copy of application scripts.

| Layer | Responsibility | Host requirement |
| --- | --- | --- |
| PUDL runtime and host kit | Applet registration, lifecycle and documented capability negotiation | A compatible supported PUDL environment |
| Shared editing/diagram modules | Parsing, serialization, sanitation, source maps, source/rich surfaces, diagnostics, transactions and domain engines | Resolved package assets and the declared host capabilities |
| Editor, Docs and Diagrams shells | Stable identity, supported views, domain commands and presentation | An applet mount, not the yavc.app desktop |
| Host adapter | Resource identity/access, revisions, saving, recovery, preferences, navigation, assets, dialogs/notifications and optional windows | The receiving application's existing authorities |
| Receiving application | Product workflow, authentication, publication, approval, external storage and workspace policy | Its own implementation and acceptance gates |

Shared implementation remains a maintained upstream dependency consumed by both yavc.app and another host. Packages and their dependency manifest form one tested release set. A thin host adapter can differ per application. Editing fixes return upstream and do not accumulate in copied downstream folders. The artifact source owner and downstream adapter owner must be named before a proof begins; the cousin agent and the receiving host's lead coordinate those assignments without changing the signed platform plan here.

Portability means a browser/webview PUDL applet can run in another application. It does not mean the HTML UI becomes native WPF, WinUI or another toolkit's controls. A native application supplies a supported webview and a bounded host bridge. A receiving host may render command contributions in its own chrome, but resource mutations still execute through the same applet command/transaction contracts.

## 2. Standard capabilities first

The first audit maps every dependency to a documented PUDL/host-kit capability, a package-private implementation dependency, or a missing contract. Existing documented interfaces are reused. A missing public capability is recorded as a gap, specified and versioned before consumers rely on it; a working `pc*` global or a probed PUDL internal is not a substitute. Proposed resource/revision requirements below are not claims that today's host kit already supplies them.

| Capability need | Applet behavior | Host ownership and fallback |
| --- | --- | --- |
| Resource read and identity | Open a supplied resource/draft with an opaque host ID, content revision, encoding and permitted operations | Existing filesystem/document authority; missing resource access prevents opening and never falls back to yavc.app storage |
| Revision-safe write/create | Submit captured content with open-instance identity, edit revision and expected persisted revision | Existing writer/creator or filesystem adapter; unsupported conflict-safe writes make the surface read-only |
| References and attachments | Resolve authorized styles, images, shortcodes, diagrams and imports relative to their owning resource | Existing resource/attachment resolver; missing dependencies show a recoverable placeholder and diagnostic |
| Preferences and recovery | Request scoped applet preferences and draft recovery through documented services | Existing host stores; absent preferences permit defaults, absent recovery is disclosed before editable work begins |
| Navigation and opening | Report addressable view/selection state and request opening a resource in another applet | Host navigation/router and association policy; absent cross-applet opening disables the handoff command |
| Command UI and notifications | Contribute commands, supported menu/toolbar descriptors, dialogs and errors | PUDL UI or the supported host command/dialog adapter; no applet creates another desktop or global Start menu |
| Language services | Start supported bundled workers scoped to the current resource and revision | Host-approved worker/assets policy; failure leaves source editing usable with a diagnostic |
| Import/export and clipboard | Produce bounded converted content or derivatives and use permitted user-gesture APIs | Host asset/file picker and download/export policy; missing optional capabilities are disabled with a reason |
| Slides Show and Presenter | Request presentation/full-screen or an external presenter surface explicitly | Supported browser primitives or a documented host presentation capability; absent external-window/full-screen support has a visible reason and leaves deck editing available |

Optional windows, shared toolbars, configuration customization, file pickers, printing and host language providers are negotiated separately. A host may supply a resource directly and its own Save command without a Files applet or browser picker. It may embed one document surface rather than the full tabbed workspace. That embedding uses a documented package contribution/mount contract after the capability audit, not access to an internal CodeMirror or ProseMirror object. The first proof can use the full standard applet mount; a smaller surface API is added only if the receiving host needs one and its contract is reviewed.

A host without durable recovery can deliberately support a transient editing session, but the user must know edits will not survive closure, the host must provide unsaved-close protection, and the applet must not silently persist them in its own browser store. A host that cannot supply that protection receives read-only mode. Optional capability failure does not weaken file grants or create an undocumented save path.

## 3. Resource and save authority

Resource identity is an opaque reference from the host, scoped to its authority and workspace. The web adapter includes the browser-origin boundary in that scope. A desktop adapter can use its existing document/workspace IDs without inventing browser subdomains or another document-home model. A display path or asset URL is not the resource's universal identity.

The existing shared-editor proposal's resource snapshot/save-acknowledgement contract remains applicable. Where the receiving host already has snapshot, document writer and creator interfaces, its adapter maps those interfaces rather than installing the site's FS or inventing a parallel store. Loaded native baselines, attachment identity, permissions and revisions remain in the host. Document source, presentation dependencies and their revisions must remain recoverable together where the host's review/publication workflow requires that binding.

A save request captures resource ID, open-instance generation, exact submitted content/edit revision and expected persisted revision. The host acknowledges that request or reports a conflict/error. A late completion cannot mark newer edits clean, rebind a reopened resource, change another window, or restore focus after the user moved elsewhere. Accepted writes that finish after disposal remain host operations; their result is retained by the host even though the disposed surface cannot consume it. Cancellation of a UI request is not proof that a write was cancelled at the storage authority.

Read-only policy, concurrent-write protection, draft recovery, publication and approval stay in the receiving application. Applet actions cannot grant themselves file writes or publication rights. Import/export creates a derivative or draft through the host's declared route, preserving originals and native external baselines. Direct resource submission is still validated and sanitized as untrusted input.

## 4. Assets and offline execution

The release includes a complete asset manifest with exact dependency versions, hashes and licenses: applet code/styles, PUDL compatibility, CodeMirror/ProseMirror, parsers/serializers, sanitizers, Markdown and D2 WASM with matching Go runtime loaders, worker entries, JSON language server/schemas, Mermaid, import/export libraries, fonts and referenced stock templates/styles. Entry points and shared resources resolve from a host-provided package asset base or documented resolver. `/applets`, `/static`, yavc.app domains and `document.currentScript` timing cannot be host requirements.

Package assets and editable resource references use separate resolvers and authorities. A theme stylesheet from the package is different from an attached stylesheet belonging to a document. Both are versioned dependencies, but resolving an image or D2 include cannot escape an allowed root or switch resource authority because its URL looks local. Remote resolution follows host policy and never silently uploads document source for parsing or language assistance.

The adapter proof must load WASM and workers under the actual webview's custom scheme, content types, CSP, module/worker support and resource resolver. A browser-only run does not establish that these work in the desktop host. Missing or incompatible assets fail visibly and leave drafts recoverable. The adapter must not enable broad unsafe-eval, arbitrary schemes, network fallback or unrestricted native bridges to make a package load. Features that cannot work under the host's documented policy are reported as gaps.

Offline packaging is a reproducible artifact with an explicit compatibility manifest and rollback target. A named branch or applet version alone is insufficient to identify the code/assets being adopted. Extracting Go helpers as external Go packages would additionally require a supported public module API; the current `internal` package layout does not provide one. Browser/WASM artifact consumption is the first supported route and does not promise a Go SDK.

## 5. Lifecycle and multiple instances

Every mount receives an instance-scoped host context. Immutable parser/module assets may be shared, but mutable source, selections, diagnostics, history, dirty state, listeners, worker requests and pending dialogs belong to one instance/resource generation. Mounting Docs beside Editor or two diagrams must not share a global active resource. DOM queries, keyboard shortcuts, styles and portals stay inside their declared mount/host overlay boundaries.

Disposal unsubscribes listeners, closes owned dialogs, cancels or invalidates pending analysis, releases worker references and temporary URLs, and makes stale replies harmless. Process-wide caches must have an explicit owner and reference-counted or otherwise documented lifetime. Commands always resolve their owning instance; a host's focus change cannot make a save/format action mutate another mounted document.

The host owns navigation history and addresses. An embedded applet emits its state through the documented callback; it does not directly rewrite the application's `location`, browser title, top bar or window collection. The yavc.app adapter maps those contributions to its URLs/PUDL windows. A desktop host maps them to its supported navigation and shell. Application identity and state remain independent of the rendering engine.

## 6. Priority implementation and extraction proof

1. Inventory Editor/Docs, Diagrams and Slides dependencies against documented PUDL/host-kit contracts. Include current `yavcUtil`, `pcSiteFs`, `pcConfig`, snapshot, dialogs, asset paths, presentation and navigation assumptions. Record supported seams and missing capabilities before extracting code.
2. Introduce the shared host boundary and an isolated minimal PUDL host harness containing no yavc.app server, cookies, FS, topbar, Files/Settings applets or site globals. Use synthetic resources and a deliberately different asset base. Keep the same artifact in yavc.app so it remains a real consumer of the portable path.
3. Prove Diagrams first in the receiving host, following the earlier Dinah brief. This exercises source/visual state, workers, WASM, resource references, Canvas preservation and commands without replacing that host's document editor. The Docs/Editor workspace extraction uses the same host contracts.
4. Extract the shared workspace and all four applet packages, including Slides' domain shell, into one maintained portable source/dependency release. Use the same host contracts and minimal harness. Reconcile existing downstream rich editor improvements before any downstream replacement. Keep domain behavior unchanged during the extraction except for separately specified Docs/Editor identity and capability changes.
5. Reintegrate those built package artifacts into yavc.app through its host adapter. The deployment and browser fixtures must load the extracted artifact, rather than an old implementation still served from a legacy path. Existing wrapper entry points may register/mount packages but cannot retain a second editing implementation or bypass the adapter. Remove obsolete implementation copies after parity and rollback checks pass; Git retains their history.
6. Freeze an exact proof artifact, complete manifest, source owner and adapter exit criteria with the receiving host's maintainers. Run actual-webview acceptance on copied synthetic state before any downstream installation or real-data migration. The temporary adapter exits when both hosts consume the same maintained release without inherited-source edits; it does not become a permanent fork.

The extraction has its own reproducible build artifact and versioned dependency manifest even if its authoritative source initially stays in this repository. Moving it to another repository is optional and must not create a second source owner. Build/container inputs, package discovery, applet-version checks, asset hashing, licensing and CI must follow the new authoritative source/output paths. A successful build that still serves the old application source does not count as reintegration.

The split and portable host boundary can be delivered in bounded stages, but the upcoming effort is not complete until extraction and yavc.app reintegration pass. Other applets follow the same audit/harness as subsequent work; this design does not claim they already pass it. New features must not add direct site dependencies while extraction is in progress.

## 7. Acceptance evidence

The first portable release must pass source/format preservation tests, the full repository gate, shared-consumer fixtures and host-specific acceptance. It must demonstrate these outcomes:

- The same exact applet/dependency artifact mounts in yavc.app, a minimal unrelated PUDL host, and the receiving application's real browser/webview without source patches.
- Editor source/preview, Docs rich/source/page views, D2/Mermaid/Canvas and Slides authoring/source/export capabilities match their declarations. Missing optional capabilities, including presentation windows, are explicit and safe.
- A changed asset base, offline execution and the real host's security/resource policy load the complete required workers, schemas, fonts and WASM, with retained failure evidence.
- Multiple simultaneous instances keep commands, dialogs, diagnostics, undo, clipboard targeting and source revisions isolated through tab/window changes and disposal.
- Save, Save As/create, edits during save, conflicts, read-only resources, failed saves, cancellation and close/reopen acknowledge only the captured resource generation and revision.
- Styles, shortcodes, images, referenced diagrams and imports resolve through the host and remain bound to the proper document/dependency revisions. Unknown Canvas properties and Markdown syntax are preserved or protected from unsafe edits.
- No document text, draft or setting is persisted through site-specific browser storage when the receiving host owns that authority. Publication/approval and remote credentials remain outside applet authority.
- The receiving host's prior useful editing behavior passes its own parity corpus, and rollback recovers edits made during the proof rather than only restoring an old executable.
- The yavc.app release and minimal-host proof report the same extracted artifact/dependency hashes. Runtime loading and deployment inputs show no legacy implementation fallback, and the final integration preserves guest files, snapshots, associations, commands, applet identities and existing pins through its recorded migration policy.

The host harness, yavc.app reintegration and actual receiving-webview tests are separate gates. The current design/source review establishes none of those implementation results. Public package publication, downstream editor replacement and data migration remain separate release/adoption decisions.
