# Shared Docs and Editor workspace

Editor and Docs are separate PUDL packages. Their entry scripts mount `apps/text-workspace/workspace.js` with a fixed `application` value. Their styles import the same workspace stylesheet. The old Editor entry contains no editing implementation. The wrappers return a synchronous lifecycle object with a readiness promise, retain the latest state received during startup and stop initialization after disposal.

Docs accepts ordinary Markdown and `.docs.md`. It declines decks, code and Office containers before opening a writable document. Ordinary Markdown defaults to Visual, while `.docs.md` defaults to Document. Editor defaults to Text and offers read-only Split/Preview for Markdown. Its preview never starts embedded applets. Rich document actions retain migration errors in the Editor namespace; their implementations and descriptors are available in `yavc.docs`. Markdown source editing, outline operations and language assistance remain available in Editor where applicable.

Page Setup and Header and Footer belong to Docs Document view. Format offers Switch to Document View from other Markdown views. Typography and stylesheet authoring remain Docs operations. Both applets retain Files as an optional outer pane, with tabs and Outline inside the document workspace.

All drawn Docs views and Editor Markdown previews use the shared paper palette before authored styles. Host appearance changes the surrounding workspace and page gutters, while document ink, links, borders, table/code shading and semantic shortcode colors remain unchanged. Mermaid diagrams on these surfaces use their light rendering theme. Slides retains its own deck palette and rendering policy. Hidden stylesheet node views retain their original Markdown but contribute no visible selection box.

Inline export exclusions use the `no_export` rich mark; block exclusions remain editable containers. Serialization retains whitespace within the exclusion boundary before export pruning. The engine and rich schema must come from the same release set. Rich insertion captures the source view, document, selection and load generation before parsing. A stale result is refused, and live insertion acknowledges only after its rich source has synchronized.

Key Bindings is an application-owned preferences dialog. It uses host `config.set` to save a validated override map rather than routing a JSON preference file through Docs or bypassing revision-safe resource writes. Rich shortcut lookup consults current bindings without replacing editor state or Undo history. Field errors stay in the dialog with accessible associations. Ordinary command failures use the shared toast helper; ongoing source/recovery problems remain inline.

## Host capabilities

The resource, creation and recovery contracts remain in `content-resource-contract.md`, `content-creation-contract.md` and `content-recovery-contract.md`. They retain storage authority in the host. Opaque resource IDs are not treated as filenames; native-format checks use the returned display name. The optional Save As name check runs before a destination is committed.

`pudlHost.contentWorkspace.version` is 1. A host can provide the following optional services without replacing its resource authority:

| Service | Contract |
| --- | --- |
| `directory(resource)` | Returns a dependency base understood by that host's file resolver, or null. The workspace does not derive a base from opaque IDs. |
| `shortcodes()` | Returns the host's accepted shortcode metadata as `{shortcodes:[]}`. Absence supplies no site-specific shortcode catalog. |
| `openPage(href)` | Handles an explicit public-page navigation request and returns whether it was handled. Absence uses the ordinary safe external-page link. |
| `split.of(handle, changed)` | Adapts documented PUDL split events and width preferences. Absence retains the workspace's default layout. |
| `browser()` | Provides the existing yavc browser adapter `{F,FB}`. This optional compatibility adapter is implemented by yavc.app through its existing VFS and browser. Other hosts can omit it and offer their own `fs.open`; the editing and recovery paths do not require the adapter. |
| `legacySession` and `legacyWork` | Provide old host-owned recovery inputs. Other hosts omit them. The workspace never reads browser storage itself. |

PUDL's host kit supplies the identity/menu helpers. The host supplies resource/snapshot services and may supply `config`, `fs`, `commandToolbar` and `fileResolution`. Missing optional file selection, toolbars or browsing does not install yavc.app's filesystem. A host without revision-safe resources cannot write through the old server-mount path. Its legacy source can be inspected or downloaded, and old drafts remain retained.

## Preference and recovery migration

The host's `config.stored(name)` returns persisted keys without implicit defaults. Docs adopts applicable legacy Editor settings once; it never mistakes Editor's new default Text preference for an old user choice. Existing Docs settings always win. Applicable toolbar preferences are copied into Docs once, while unavailable command IDs remain retained in preferences and are omitted from the rendered toolbar. Editor's original settings and toolbar record are retained.

The yavc host implements `config.adopt(name, defaults, marker)` through `POST /config/{name}/adopt`. The server checks the marker and fills absent keys while holding the existing session update lock. Explicit nulls count as existing choices. It records the marker with the completed update, enforces the normal settings budgets and changes nothing when the merged result is refused. Concurrent adoption attempts retain one complete migration. Ordinary settings writes use the same authority lock. Repeated adoption does not reinsert removed defaults after completion.

Docs and Editor use separate snapshot and action namespaces. An existing Editor workspace stays in Editor, including document drafts that formerly opened as rich pages. They reopen as source with their saved baselines and conflict protection. No snapshot is partitioned, moved or deleted according to its filenames. Save and Open waits for acknowledgement; Open Saved Version retains the source draft. An unsaved new draft requires Save As before handoff.

## Dispatch and packaging

The version 2 content catalog adds declared `dispatch.command` identifiers. The pure resolver still only returns plans. `pudlHost.fileResolution.open` executes a validated plan on the current origin. On the desktop it waits for the documented PUDL window/open and applet readiness contracts, then invokes the declared command against the returned mount. Standalone hosts use the documented request operation at that same origin. No guest resource is transported to another subdomain. Explicit applet choices bypass default associations while retaining native-format and access checks.

`go run ./cmd/yavc-content -out <new-directory>` builds the release set. It copies the priority packages, shared engines, licenses, support modules and unrelated-host fixtures, compiles matching WASM and emits a SHA-256 asset manifest. It refuses existing outputs, output inside the source checkout and source symlinks. The older `build-portable-diagrams.mjs` entry calls this same builder. Docker consumes the builder's content directory and serves its manifest at `/applets/content-kit/release.json`. It does not deploy another Editor implementation.

One exact release set is supported per host document. The unrelated-host fixture checks Editor, Docs and Slides together under another asset prefix, without site filesystem/configuration globals or browser storage. The Diagrams fixture exercises the same release set separately. Browser proofs and Docker asset identity are independent of receiving-application webview acceptance; no downstream desktop installation or real-data migration is performed here.
