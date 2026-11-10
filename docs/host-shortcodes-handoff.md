# Host shortcode integration handoff

The yavc.app side of the Dinah and GK Companion shortcode integration is merged in [PR #74](https://github.com/paulmooreparks/yavc.app/pull/74) and published as [v0.2.55](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.55). The local site at `http://localhost:8401` serves the same tested content. The receiving product can now pin this release and perform its Confluence acceptance checks. Neither maintained receiving checkout was changed by this work.

## Release identity

| Item | Value |
| --- | --- |
| Tag | `v0.2.55` |
| Tagged commit | `2490845` |
| Archive | [yavc-content-v0.2.55.zip](https://github.com/paulmooreparks/yavc.app/releases/download/v0.2.55/yavc-content-v0.2.55.zip) |
| Archive SHA256 | `4ed3a1a5239b909d6a25456b3902a5de805a2d94c850b9df970cd41fa8a0b3e1` |
| Manifest | [yavc-content-v0.2.55.manifest.json](https://github.com/paulmooreparks/yavc.app/releases/download/v0.2.55/yavc-content-v0.2.55.manifest.json) |
| Content digest | `598c24f0fcb6b0ed9e6b11f0e8e5d3e7b2702560b101184010bbbbf08c2074bc` |
| Checksum file | [yavc-content-v0.2.55.sha256](https://github.com/paulmooreparks/yavc.app/releases/download/v0.2.55/yavc-content-v0.2.55.sha256) |

The downloaded archive, external and internal manifests, and all 484 listed file sizes and hashes were verified. The archive includes the earlier print-image proportion fix as well as host shortcode support.

## Host integration

Register `contentWorkspace.shortcodes(context)` and `contentWorkspace.shortcodeHost` before mounting the workspace. The service has `version: 1`, `render(request)`, optional `form(source)`, and optional `build(kind, values)`. The applet also passes a final context argument containing the captured resource, workspace root, abort signal and `current()`. Existing Dinah wrappers that ignore additional arguments remain compatible. The complete contract is in [host-shortcodes-contract.md](host-shortcodes-contract.md).

Document, Visual and Preview now draw catalogued host shortcodes through that service. A clicked inline or opaque block opens the host form. Container Arguments and rich-span Change controls preserve editable bodies. Insert and slash menus include non-managed host entries. Argument validation and shortcode serialization remain host-owned. Built-ins and document-defined macros retain their precedence.

For every paired occurrence, including managed ones, the render request contains the opening shortcode as `source`. The body stays in the applet and is placed in the drawing's single `<slot name="content"></slot>`. No separate `content` argument is supplied. Managed paired content stays opaque to rich editing; the host must use its own resource-editing mechanism to replace its body. This clarifies the release's initial contract prose, which incorrectly described managed container requests as containing their complete source.

Print and Office export currently refuse host-rendered placeholders. Screen HTML is not an export representation. The integration does not alter the ruling that double-click views a document while Edit or opening in Docs edits it.

## Validation and receiving-product acceptance

The repository gate passed, including Go parsing and source-round-trip tests, vulnerability checks and package rules. Chromium, Firefox and WebKit passed the independent-host shortcode suite, portable workspace regressions, existing host image and review-overlay checks, and command-state notification checks. The shortcode suite covers host defaults, field errors, Undo, paired-body retention, delayed drawings, keyboard activation, typed atoms and slash insertion. PUDL review findings were fixed. The installed candidate also passed Chromium typing stability and paper-control and printing checks in both themes.

An isolated hidden Dinah WebView2 proof verified the final content digest, resource saves, native review, rendering, language workers, pagination and disposal. That pinned receiver predates the product's new shortcode wrappers, so it establishes general desktop compatibility. It does not establish actual GK Confluence rendering.

The receiving agent should complete these checks after pinning v0.2.55:

1. Verify the archive checksum and manifest before replacing the installed content package.
2. Open representative GK documents containing `{{jira:AOY-123}}`, Confluence page references, prefixed mentions and paired macros in Document, Visual and Preview.
3. Compare each product drawing with the intended Confluence output, including missing or inaccessible references.
4. Change, remove, cancel and insert shortcodes through the host forms and slash menu, then verify source and Undo.
5. Check that paired bodies survive argument changes and that managed content uses the product's editing tool.
6. Exercise navigation or edits while a host response is delayed and verify that no late result overwrites newer work.
7. Confirm that unsupported host shortcode export produces the explicit refusal and that double-click still views the document.

Report any mismatch with the document source, registered catalog entry, host request and response, view mode and pinned content digest. Product rendering changes belong in the receiver; parser, form, source-retention and drawing-placement defects belong in yavc.app.
