# Shared language services and LSP

Status: feasibility assessment requested by Paul on 4 November 2026. This document proposes shared support for the Editor and the Diagrams source pane. The implementation target is provisional pending his answer about which surface should come first. No LSP client, server or transport is installed by the current inspector changes.

## What already exists

Diagrams has syntax colouring, renderer diagnostics, source-to-diagram selection and D2 completions. Its CodeMirror completion provider calls `internal/d2api` through the browser's D2 worker; that API uses the pinned D2 package's `d2lsp.GetCompletionItems`. Ctrl+Space requests completions explicitly, and a dot or colon triggers them while typing. This is an in-browser language-service call, without a JSON-RPC LSP connection. The Editor also has shortcode completion and hover support. These features should survive a later LSP integration.

The bundled CodeMirror build does not currently include an LSP client. CodeMirror supplies an [official LSP client](https://github.com/codemirror/lsp-client), whose maintained source has moved to [the author's CodeMirror forge](https://code.haverbeke.berlin/codemirror/lsp-client). Its documented transport interface supports connecting to a server; the project describes both proxied server processes and language servers running in the browser as JavaScript or WebAssembly. A compatible client is therefore available. The choice of language server and its lifecycle remain host responsibilities.

## Recommended first implementation

Use one shared module under `apps/md-editor` for document identity, revision tracking, completion, hover and diagnostic integration. Editor and Diagrams should supply their open document and language rather than build separate clients. Keep the host/transport seam usable by Dinah, as described in the [shared-editor proposal](shared-editor-platform-proposal.md).

Start with JSON Canvas schema assistance in a browser worker. Microsoft's [JSON language service](https://github.com/microsoft/vscode-json-languageservice) is a reusable implementation of completion, hover, validation and formatting; its [JSON language-server documentation](https://github.com/microsoft/vscode/blob/main/extensions/json-language-features/server/README.md) distinguishes that library from the LSP server wrapper. Adopt a pinned service and an actual protocol adapter if the delivered feature is called LSP. A direct library integration should be described as language-service support instead.

The canvas schema must include both JSON Canvas 1.0 and the [documented yavc extension](canvas-extension.md). Property/value completion, documentation on hover and structural diagnostics are useful initial features. The existing canvas reader remains authoritative for cross-reference, ownership and size checks. Resolve only bundled or explicitly host-supplied schemas, with no automatic network fetches from document content.

D2 should retain its existing completion service while the integration evaluates additional supported `d2lsp` entry points. Mermaid needs a separate server evaluation against the version already used for rendering. The presence of a syntax highlighter or parser does not establish completion, rename or definition support. Advertise only capabilities the selected service actually implements and has passed in this host.

## Required lifecycle and acceptance

- Each open document needs a stable virtual URI, an open-instance generation and a monotonically increasing text revision. Untitled documents and independent windows must not collide.
- Requests must identify the originating document and revision. Late completions and diagnostics must not attach to a different document after switching tabs or closing and reopening one.
- Service edits must use the existing CodeMirror transaction and undo history. Workspace edits must pass host resource permissions and revision checks before applying.
- Workers and clients must be disposed with the application. Cancellation, restart and unavailable services must preserve the buffer and ordinary editing.
- Tests must cover completion acceptance, hover, diagnostic ranges, formatting/undo, stale replies, cancellation, tab switching, close/reopen and offline startup in the actual supported browser engines.

The first deliverable should pin the dependency/asset manifest and prove the JSON worker in both consumers. A later authenticated host may provide a server-process transport through the same boundary. The current browser-local document policy in `DESIGN.md`, decision 11, still applies; this assessment does not authorise sending guest source to an engine or third-party service.
