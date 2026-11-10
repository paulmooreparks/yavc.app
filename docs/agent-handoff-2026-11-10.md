# yavc.app agent continuation handoff

This handoff captures the work completed through November 10, 2026, in Asia/Singapore. It is for the next agent maintaining yavc.app. The separate [host shortcode handoff](host-shortcodes-handoff.md) is for the Dinah and GK Companion integration agent.

## Start here

The working checkout is `C:/Users/paul/source/repos/yavc.app`, on `main` at `6df7f2553d840851e98452d68b6b666c6304b400`. The application work is committed, pushed and merged. The checkout was clean before this continuation document and its index link were written. Those two documentation edits are uncommitted at handoff; no application patch is pending.

The latest published release is [v0.2.55](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.55), tagged at `24908450f9b571dd77e1cc4792443672e2a0ce5b`. The later main commit adds the receiving-agent handoff and clarifies the paired-source contract. It changes no packaged runtime bytes. Release check, content-download and container-image workflows all passed. The documentation PR's checks passed before its merge.

The local installation at `http://localhost:8401` runs the tested host-shortcode candidate. Its content digest matches the published archive. It was built from the implementation branch commit before GitHub squashed the PR, so its image label differs from the tagged commit. This is expected; all 275 served content assets were checked against the final package.

Read `AGENTS.md`, `DESIGN.md` and the relevant contract before structural changes. `docs/handoff.md` contains historical material below its new pointer. Its older installation, branch and next-work claims are superseded by this document. The completion plan also contains historical paragraphs that must not reopen completed work.

## Operating boundaries

- Paul authorized continuous implementation and automatic local installation of verified fixes. Preserve his data and retain rollback material.
- A package build and a published release are separate operations. Publish another release when requested; do not infer release authorization from a request to build a package.
- Production Linode deployment and changes to maintained Dinah, Studio, GK Companion or extension checkouts need their own authorization.
- Preserve unrelated work, stage exact paths and check the current index and HEAD before committing.
- Do not take shared desktop focus. Use owned headless browsers or the established isolated hidden native proof. Ask before bringing Paul's native applications forward.
- Do not create new subagents unless the user or applicable instructions authorize delegation. PUDL UI changes still require the applicable PUDL review.
- Use no em dashes in new prose, code, comments or commit messages.
- Keep decisions in DESIGN.md and regression findings in docs/review.md. Use documented external APIs and shared PUDL dialogs and utilities.

Before every commit, run the full required gate from the repository root:

```powershell
& 'C:/Program Files/Git/bin/bash.exe' scripts/check.sh --since HEAD
```

Bare `bash` can select the broken WSL installation on this machine. Some Git writes, network operations, Go execution, Docker operations and browser subprocesses require sandbox escalation. Use the normal approval mechanism and explain any actual rejection. Do not misdiagnose an approval failure as requiring the user to sign out of an unspecified application.

## Recent completed work

| PR | Main commit | Result |
| --- | --- | --- |
| #62 | `f6c4214` | Opt-in Files panes |
| #63 | `b212a7c` | Plain Sight Reader score list |
| #64 | `ee94cdb` | Save As stem selection preserving compound extensions |
| #65 | `3f9230a` | Dinah adoption fixes and immutable release downloads |
| #66 | `fb3ff12` | Stable pagination furniture while typing |
| #67 | `c189e4e` | Cached shortcode menus and command-state change notifications |
| #68 | `7c5ac88` | Host-resolved document pictures and transient suggestions |
| #69 | `fb78c2e` | Per-file IndexedDB byte storage and quotas |
| #70 | `cd30a46` | Editable Markdown Visual mode restored to Editor |
| #71 | `822d377` | Readable paper controls and sample printing |
| #72 | `d5a96fb` | Mermaid printing and Save As downloads |
| #73 | `3354e09` | Responsive image proportions in browser printing |
| #74 | `2490845` | Host-owned shortcode rendering, forms and insertion |
| #75 | `6df7f25` | Receiving-agent handoff and paired-source clarification |

Editor offers Visual, Text, Split and Preview for Markdown, with configurable Markdown defaults and Visual as the initial default. Other source types default to Text. Docs retains physical Document layout and access to backing text. Do not restore the earlier source-only Editor restriction.

Guest VFS authority is now the `yavc-vfs` IndexedDB database with `entries`, `contents` and `state` stores. Both text and binary files reference immutable byte contents, currently ArrayBuffers. Defaults are 100 MiB per stored file, 1 GiB of live file contents and 10 MiB of editable source, subject to browser storage availability. Migration retains the older stores and localStorage. Do not delete legacy data or repeat migration as cleanup. Account-backed roaming storage remains a proposal in [account-storage-proposal.md](account-storage-proposal.md).

Paper content retains its document palette in either site theme. Controls restore a complete host foreground/background pair; source-block editing uses paper ink and code shading together. Browser print expands disclosures and renders engine-declared Mermaid diagrams through the strict shared renderer. Arbitrary authored SVG and Office diagrams retain explicit refusals. Printed images preserve responsive proportions instead of receiving Office's fixed pixel dimensions.

Save As offers Download instead through the resource host. It captures source bytes, encoding and BOM, writes no VFS file, issues no resource acknowledgement and does not mark the source saved. Keep the explicit codec policy bounds that support the UTF-16 regression beyond the codec's default size limit.

## Current host shortcode implementation

The latest work reviewed four commits from a private `host-shortcodes` branch, applied them to current main and corrected integration defects before release. The private checkout was not modified or pushed. The imported objects remain available at `refs/remotes/integration/host-shortcodes`; the original commits were `a02afa6`, `b502a43`, `e15d0ed` and `30b9708`.

The engine reads host catalog entries and emits placeholders. The shared editing kit calls `contentWorkspace.shortcodeHost`, sanitizes its drawing, and presents host-supplied argument fields through the shared dialog. The host builds the shortcode source. Insert and slash menus include non-managed host entries. Typed host inline occurrences can become atoms. Built-ins and document-defined macros retain precedence.

Paired render requests carry the opening shortcode as `source`, including managed occurrences. The applet retains the body and places it in exactly one `<slot name="content"></slot>`. The service does not supply a separate `content` argument. Managed bodies stay opaque to rich editing. Screen drawings do not authorize print or Office conversion; those exports explicitly refuse host placeholders.

Review added catalog, form, queue and drawing-cache bounds; call deadlines and abort signals; document and insertion-target checks; and stripping of delegated action attributes from host HTML. It fixed insertion after Undo, retained bodies when forms return only a replacement opening, initialized Insert defaults, retained span controls after delayed drawing, and kept keyboard activation inside the editor working. DESIGN.md decision 111 and [host-shortcodes-contract.md](host-shortcodes-contract.md) hold the contract. The receiving handoff contains the acceptance checklist.

## Release and local installation evidence

| Item | Value |
| --- | --- |
| Release | `v0.2.55` |
| Archive SHA256 | `4ed3a1a5239b909d6a25456b3902a5de805a2d94c850b9df970cd41fa8a0b3e1` |
| Content digest | `598c24f0fcb6b0ed9e6b11f0e8e5d3e7b2702560b101184010bbbbf08c2074bc` |
| Packaged file count | 484 |
| Published image | `ghcr.io/paulmooreparks/yavc.app:v0.2.55` |
| Published image digest | `sha256:fc43b07355c6cb880a27290963190c07e4d60305e8a6d114bae36e3c42da98b1` |
| Installed container | `yavc-app-candidate` |
| Installed image tag | `yavc-app:candidate-host-shortcodes` |
| Installed image identity | `sha256:61b169845073a8b639907650f89f6ef9ecbc808f05bea1c29b23a25cc8cd886f` |
| Installed revision label | `d23673fd85ec04a76ed64cf7f1f419520ff33ec7` |
| Binding | `127.0.0.1:8401:8400` |
| Data volume | `yavc-candidate-data-v0.2.27-20261105-174752` |
| Rollback container | `yavc-app-rollback-print-aspect-20261110-113124` |

The final portable artifact is `%TEMP%/yavc-host-shortcodes-final`. Published downloads and their verification receipts are in `%TEMP%/yavc-v0.2.55-verified-download`. The archive checksum, external/internal manifests and all 484 listed sizes and hashes were verified.

The backup directory is `%TEMP%/yavc-host-shortcodes-backup-20261110-113124`, also located through `%TEMP%/yavc-host-shortcodes-backup-path.txt`. It contains the volume archive, SHA256, installation receipt and validation receipt. The archive hash is `8d1e183fc0d0154172eb4068c694c96659b439253a4538d315f0bacead6cb414`.

The installer `%TEMP%/install-yavc-host-shortcodes.ps1` is evidence and a template, not a reusable command without review. It expects the previous image and the current HEAD label captured for that installation. Re-running it after the squash merge will fail those guards. Reinspect the live container before adapting it. Retain its sole-volume-consumer checks, read-only backup, loopback binding, health check and rollback path.

## What passed

- The full repository gate passed before the implementation and documentation commits.
- The host shortcode suite passed Chromium, Firefox and WebKit for views, sanitization, defaults, forms, Undo, insertion, paired bodies, delayed keyboard editing, typed atoms and slash insertion.
- Portable workspace and host image/review-overlay regressions passed all three engines.
- Installed command-state checks passed all three engines, including cached Insert identity and suppressed unchanged typing notifications.
- All 275 installed content asset hashes matched the final manifest.
- Installed Chromium checks passed document typing stability and sample control contrast and printing in both themes, including responsive image proportions.
- PUDL source review passed after its default-value and delayed-control findings were corrected. An owned headless screenshot of the host form was also inspected.
- The final artifact passed the isolated hidden Dinah WebView2 proof for resources, rich saves, review, Canvas/D2, language workers, pagination, conflict refusal and disposal.

The native receiver proof is `%TEMP%/yavc-dinah-native-proof` at `ba2b8b72008e53fc1b8601f5d903ce95fa53558d`. Its extension checkout is `%TEMP%/yavc-dinah-extension-proof` at `444129580fb6f8f8d3ce3248a09f8df97c6699ac`. The final prepared proof is `%TEMP%/yavc-dinah-host-shortcodes-final-proof`; the passing run is `run-b903b13a-bc04-4dd4-b9c8-bb5461c94946`. This pinned receiver predates the product's new shortcode wrappers. It proves general native compatibility, not GK's actual Confluence rendering.

## Useful verification commands

Browser tests use Playwright from the PUDL checkout without changing this repository's dependencies:

```powershell
$env:NODE_PATH='C:/Users/paul/source/repos/pudl/node_modules'
$artifact=Join-Path $env:TEMP 'yavc-host-shortcodes-final'
node scripts/test-host-shortcodes.cjs $artifact
node scripts/test-portable-workspace.cjs $artifact
node scripts/test-host-overlays.cjs $artifact
node scripts/verify-installed-content.cjs $artifact
```

For installed-site regressions, set the port explicitly:

```powershell
$env:YAVC_CHROME_TEST_PORT='8401'
node scripts/test-workspace-command-state.cjs
node scripts/test-document-typing-stability.cjs chromium
node scripts/test-markdown-control-print.cjs chromium
```

Build a fresh portable package into a new output directory with `go run ./cmd/yavc-content -out <new-directory>`. Native proof construction uses `scripts/build-dinah-content-proof.ps1` and `scripts/test-dinah-content-native.cjs`; read their source and baseline guards before running them. Temporary evidence paths can disappear after cleanup, so recreate evidence when needed rather than treating a missing temporary file as a product defect.

## Remaining work and next action

The immediate receiving-team task is to pin v0.2.55 and validate real Confluence shortcodes, forms, paired bodies, delayed responses and view/edit navigation. The user ruled that double-click views a document while Edit or opening in Docs edits it. Keep that behavior. No receiving-team acceptance result has been reported here yet.

There is no unfinished application patch from this batch. If the receiving team reports a problem, use its source, catalog entry, request/response, view and content digest to reproduce it in the independent fixture. Product argument rules and Confluence rendering belong in the receiver. Parser, placement, source preservation and generic dialog defects belong here.

Host-shortcode export needs a separate design if requested. Other desktop platforms and production-shell adoption remain external acceptance work. Independent numeric wheel increments remain an upstream PUDL requirement; do not change `step="any"` merely to obtain fractional spinning, because that changes typed precision. Additional language-server providers and account-backed storage remain separate efforts. Review their current designs before choosing the next implementation batch.

The old completion plan records features that were subsequently completed. Pagination, footnotes, review, encoding-aware writes, Office import and isolated Windows acceptance must not be restarted just because an older paragraph calls them pending. Their remaining format and layout limits are documented in the relevant designs and review record.
