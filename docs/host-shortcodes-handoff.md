# Host shortcode integration handoff

## v0.2.63: the show's page asks the host for the deck's folder

The receiving host's check of v0.2.62 found that a diagram referred to by a relative path was refused on the show's page. [v0.2.63](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.63), tagged at `e89aae8517322c50aea0104b21aa292db69e1553` ([PR #91](https://github.com/paulmooreparks/yavc.app/pull/91)), asks `contentWorkspace.directory` for the deck's folder there, and makes show mode fill its window whatever height its mount has. Pin this release in place of v0.2.62.

| Item | Value |
| --- | --- |
| Tag | `v0.2.63` |
| Tagged commit | `e89aae8` |
| Archive | yavc-content-v0.2.63.zip |
| Archive SHA256 | `3235fae19ac188258b0210075b9f21090769a29568f7ba70fb404ed44a7ef8f1` |
| Manifest SHA256 | `b91a147326d3398f897ffc1170ada714dd7a1ace5f02c2f7ce6ef013c4abd03d` |
| Content digest | `4e8bed529a85fc1924a6a15e077847cfb80ebc5d48fd272bcdd10984f8805578` |
| Files | 484 |

The content digest is the one the suites ran against before the tag.

## v0.2.62: a slide show in a window of the host's own

[v0.2.62](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.62), tagged at `58685da6d632926b03819c4cec4c0aef223be132` ([PR #89](https://github.com/paulmooreparks/yavc.app/pull/89)), adds version 2 of the presentation capability, which Paul approved on 10 November. A host may offer `presentation.openShow`, and Slides then leaves the editing window as it is and drives a show the host runs elsewhere, on a page mounted with `show=1`. The whole contract is [presentation-contract.md](presentation-contract.md), and DESIGN.md decision 121 records the reasons. A host at version 1, or one with no other display, presents as before.

| Item | Value |
| --- | --- |
| Tag | `v0.2.62` |
| Tagged commit | `58685da` |
| Archive | yavc-content-v0.2.62.zip |
| Archive SHA256 | `19c98f562367c2260e1cb3c9de998f1aa00721ce48711fa17ec6a4e672b41889` |
| Manifest SHA256 | `74203b5b8eaba8402ddce26181b09da17375ad97233d40e896f4427e747f42ba` |
| Content digest | `95e490ac334d657b3a332a04c3c6416b0962b638b2c09d67405c7fe635b61fb2` |
| Files | 484 |

The content digest is the one the suites ran against before the tag. The receiving host verifies what the applets' test cannot: its relay between the two windows, the display the show opens on, keyboard focus there, and pictures, diagram files and host shortcodes drawn in the show's page.

## v0.2.61: bracketed text, Save without a location, and a host's cell colour shortcode

[v0.2.61](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.61), tagged at `aef3ddd2344784394b7e0539479e6989019ff913` ([PR #87](https://github.com/paulmooreparks/yavc.app/pull/87)), has two fixes and two seams. DESIGN.md decisions 118 to 120 record them. Pin this release in place of v0.2.60.

| Item | Value |
| --- | --- |
| Tag | `v0.2.61` |
| Tagged commit | `aef3ddd` |
| Archive | yavc-content-v0.2.61.zip |
| Archive SHA256 | `84ca61c92a6fa7453700d180dc84da944aaf93f3e6339eeb1edc4281cc2a963a` |
| Manifest SHA256 | `634785dd040940adbae320c111d763036e650c0efaca8560da3bb35bfe7fc45e` |
| Content digest | `a6d749c8b46a1f6b86b7f1c45d5aa7ff74609143dad4caa4358a144eabecc938` |
| Files | 484 |

The content digest is the one the three-engine suites ran against before the tag.

What a receiving host does with it:

1. Nothing, for bracketed text. A paragraph with text such as `[S2]` is edited in Visual view where the document defines no link reference or footnote, and its brackets are written as they were.
2. Return `needsLocation: true` from `contentResources.read` and `write` for a document that has no file to be saved to yet, such as a draft the host keeps for a new blank document. Save then calls the host's `saveAs` in Editor, Docs, Slides and Diagrams, and writes nothing to the draft. Leave the field out of the `saveAs` result and of every placed resource. Without the field, Save writes the resource as before (docs/content-creation-contract.md).
3. Read `options.document` in `pudlHost.fs.readText(path, options)`. It is the resource of the document that refers to the file, or null for one not yet saved (docs/content-workspace-contract.md).
4. Set `cellColor: true` on the one inline catalogue entry that keeps a table cell's colour, and give it `form` and `build`. On a pipe table, Table, Cell Color opens that form and writes the shortcode first in each selected cell, and the table stays a pipe table. While a cell has it, a command that needs an HTML table is refused with a message. An HTML table keeps `colorAttribute` and `colorClassPrefix` (docs/host-shortcodes-contract.md).

## v0.2.60: a cell's colour classes, and the reader for referenced files

[v0.2.60](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.60), tagged at `c71e76817c638214034abdcd85dfccc30b8e1e23` ([PR #85](https://github.com/paulmooreparks/yavc.app/pull/85)), adds `colorClassPrefix` on a literal catalog entry: when Cell Color changes or clears a cell's colour, the classes that begin with the prefix are removed, and the class attribute with them when none is left (DESIGN.md decision 117, docs/host-shortcodes-contract.md). Pin this release in place of v0.2.59.

| Item | Value |
| --- | --- |
| Tag | `v0.2.60` |
| Tagged commit | `c71e768` |
| Archive | yavc-content-v0.2.60.zip |
| Archive SHA256 | `07d01c4e1b98f9f5f6e49c7a3210c56ca557309bb7bcf982ccc8a1c8a2b0ed2a` |
| Manifest SHA256 | `003ff5d05c3a9e3a62655d4acb81bb706f27429d1ac3a9e87a57e46bef042e80` |
| Content digest | `6297ef3e2b7035b46bc4fb471e7336ebc702927cd622669d484770d4d518b830` |
| Files | 484 |

The content digest is the one the three-engine suites ran against before the tag.

A receiving host still has work of its own before a document can show a file it refers to. An embedded diagram, `{{diagram:path}}`, is read only through `pudlHost.fs.readText(path, options)`, which the host supplies; the table in docs/content-workspace-contract.md now lists it, with the optional `contentWorkspace.directory(resource)` for relative paths and `pudlHost.fs.onChange` for following a file. A host without the reader draws a notice that says so. This release passes the reader its `signal` and `maxBytes`, which the applets dropped before.

## v0.2.59: speaker notes have no presence on the slide

Paul rejected the collapsed notes bar of v0.2.58. In [v0.2.59](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.59), tagged at `046a925a5afb365004cc91fda18a81c55728f702` ([PR #83](https://github.com/paulmooreparks/yavc.app/pull/83)), a deck's speaker notes are not on the slide in any form, and they appear only in the pane at the bottom of the window. They are written and changed in Text view. Nothing else changed; pin this release in place of v0.2.58.

| Item | Value |
| --- | --- |
| Tag | `v0.2.59` |
| Tagged commit | `046a925` |
| Archive | yavc-content-v0.2.59.zip |
| Archive SHA256 | `1186de484e92d5b5a0f00672631f4bf8867efe73d64a4f9e587b00d347276b75` |
| Manifest SHA256 | `8b57afd0ba97feec71bc5b7fe0868f24ab17a7518752419081ffe4a3cffdd66c` |
| Content digest | `d955562596eb459eb3e239fe7fcfdffa503a5f20ce4d01c69c29597d101acce9` |
| Files | 484 |

The content digest is the one the three-engine suites ran against before the tag.

## v0.2.58: a cell colour's host attribute and collapsed speaker notes

[v0.2.58](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.58), tagged at `df817fab80849ba7953c35a89a8deaa07a48e846` ([PR #81](https://github.com/paulmooreparks/yavc.app/pull/81)), adds one catalog field and one change to Slides. A literal entry may say `colorAttribute`, the name of the attribute the host keeps equal to a cell's colour beside its style; in that container's tables Cell Color writes, changes and removes it with the colour and reads it as the current colour (DESIGN.md decision 115, docs/host-shortcodes-contract.md). A deck's speaker notes are no longer drawn on the slide, since the window's notes pane shows them; on an editable canvas the notes box is collapsed to its bar, a disclosure button that opens it for editing (decision 116). Pin this release in place of v0.2.57.

| Item | Value |
| --- | --- |
| Tag | `v0.2.58` |
| Tagged commit | `df817fa` |
| Archive | yavc-content-v0.2.58.zip |
| Archive SHA256 | `88c7f183e2a703ff15db13e7bebbf37cccc1ddda51ccf69c89a7eeac63a13925` |
| Manifest SHA256 | `de9ccd6f6f7c1b6f87b4bf8b785c7d8be945c839457664f142f12e6d44d054d8` |
| Content digest | `552c8ba7d38deaa2ace2e86fda608ac1112d0b230b70dc2e5299079c6cc68d32` |
| Files | 484 |

The content digest is the one the three-engine suites ran against before the tag. The receiving product should set `colorAttribute: "data-highlight-colour"` on its literal entry and check a pulled coloured cell recoloured and cleared in Docs against the wiki's own record of the colour.

## v0.2.57: the page scrolls to the kept place

The receiving product's check of v0.2.56 found that Text to Visual selected the right block but left the page's scroller at the top. [v0.2.57](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.57), tagged at `3b4c6cf165670d6cc447d73d99d67a75ec5cf8b2` ([PR #79](https://github.com/paulmooreparks/yavc.app/pull/79)), brings the selection into view once the page is shown. Nothing else changed; pin this release in place of v0.2.56.

| Item | Value |
| --- | --- |
| Tag | `v0.2.57` |
| Tagged commit | `3b4c6cf` |
| Archive | yavc-content-v0.2.57.zip |
| Archive SHA256 | `6da6cadfebc22826104566ef4c1ebc8dfe41d6b90f2927d41850922c9e7d6989` |
| Manifest SHA256 | `47d09e4d0f72211ea24f8a78062e31185d771650542ae475f37b50300ad0daaf` |
| Content digest | `6982b5fb844d5f4a99bc76af9cda8c1445f606f659bc4b732b6346b90328fc3c` |
| Files | 484 |

The content digest is the one the three-engine suites ran against before the tag.

## v0.2.56: HTML tables, the reader's place and the contents list

Paul's three requests of 10 November are in [v0.2.56](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.56), tagged at `82bcb7f0af1820051736fcd9a39073b8868e0d62` ([PR #77](https://github.com/paulmooreparks/yavc.app/pull/77)). DESIGN.md decisions 112 to 114 and docs/review.md record them. A receiving product that has pinned v0.2.55 moves to this release the same way; the shortcode contract of v0.2.55 is unchanged, with one addition.

| Item | Value |
| --- | --- |
| Tag | `v0.2.56` |
| Tagged commit | `82bcb7f` |
| Archive | yavc-content-v0.2.56.zip |
| Archive SHA256 | `7037191d52701f64af5719a4507b0b201f265afd4bec411a5316fc3b39196674` |
| Manifest SHA256 | `24e2d8bb9144ff24f3081ed5eceeeca9d4885275c585ee81e077c76f3f314d6a` |
| Content digest | `2f8b7de3eb3d24047bd7e6eff5814211dd7884b1bca13a35a8944e2ba8fc6b66` |
| Files | 484 |

The addition is a catalog field. A container entry may say `literal: true`, which makes the engine read its body as markup, whole, blank lines and all, and edit one strict table in it as a table with no box (docs/host-shortcodes-contract.md). A product whose wiki markup arrives in such a container should mark that entry literal. Without the field, a literal body with a blank line is still split at the blank line, as before.

The receiving product should check, on its own pages: a wiki table with merged and coloured cells edited in Visual and Document view and written back with every attribute and untouched cell as it was; a cell colour, merge, split or heading change on a pipe table turning it into an HTML table its converter accepts; a change of view in each direction landing on the same block; and a contents list inside its container listing the page's headings with `minLevel`, `maxLevel`, `type` and `outline` left as written. The table export checks of v0.2.55 still apply: Office export refuses merged cells explicitly, and exports a table's cells without their colours.

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
