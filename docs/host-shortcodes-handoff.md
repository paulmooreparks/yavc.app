# Host shortcode integration handoff

## v0.2.68 to v0.2.70: one menu bar, a host's commands, and actions that change a document

Three releases followed on 2026-11-11, each for something Paul asked of the receiving product.

[v0.2.68](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.68) ([PR #102](https://github.com/paulmooreparks/yavc.app/pull/102)) bundles PUDL 0.107.1, whose menu bar a host's page can set to one application bar. No applet changed.

[v0.2.69](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.69) ([PR #103](https://github.com/paulmooreparks/yavc.app/pull/103)) adds `pudlHost.documentCommands` version 1 to Editor and Docs, so that a host can put a command such as Publish in the File menu (`docs/document-commands-contract.md`).

[v0.2.70](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.70) ([PR #104](https://github.com/paulmooreparks/yavc.app/pull/104)) lets such a command stand in Review, be offered on a right-click, and be given the selection. Every action of Editor, Docs, Slides and Diagrams now has `"changes": "document"` or `"changes": "none"` in its manifest (`docs/agents-design.md`, decision 10). A host that lets agents propose changes and not make them refuses an agent's call to an action marked `document`, and should treat an action without the member as one. The Go toolchain moved to 1.26.11 for GO-2026-6859.

| Item | v0.2.68 | v0.2.69 | v0.2.70 |
| --- | --- | --- | --- |
| Tagged commit | `55e8eba` | `4258d03` | `d2e1418` |
| Archive SHA256 | `ad55755999dd1cf6b6211b42b244034465c8ed993835a96cec2d30256448270f` | `74ecdc6e164afebd84d75b7860d679d665d2967a1dcb7e7d900543b31349a365` | `bcef6ae817a6795a458180bbb2bfe9301f187b0d5d0ebca465ae5a5406e218b2` |
| Manifest SHA256 | `a3b61559f8ea383510919796b1359c84eeea6a2e3f5dab546d68c6f0f00a06e7` | `57823d7194ac9d862e26e90412044405f3190d09aea70694882a0c55fc93ee50` | `7ddc1b3c7eb58d2384da10f378ec67e7b415b1ca3fd93f54ac26050edc69b889` |
| Content digest | `7e8ae406a4f6060162c6f9b53e133cdc1b0391db298311108a0935cbff2f4f60` | `d437d4b86db6e14512bdec72fafe67b54b0214ea988269128c7c3f481f0be6be` | `5caafe36f9f7fe36584359d0527916c52e34e9bea6c678562c862fdee99dbac7` |
| Files | 488 | 488 | 488 |
| Editor, Docs | 46.27.0, 1.27.0 | 46.28.0, 1.28.0 | 46.29.0, 1.29.0 |
| Slides, Diagrams | 0.56.0, 0.36.0 | 0.56.0, 0.36.0 | 0.57.0, 0.37.0 |
| PUDL | 0.107.1 | 0.107.1 | 0.107.1 |

Each content digest is the one the package tests ran against before its tag. The Diagrams package test crashed the Firefox page on one navigation in about half its runs that day, on v0.2.69's package as well as v0.2.70's, and passed when run again; the cause is not traced.

## v0.2.67: attribute blocks, site-path pictures and the standalone host

Paul opened pages of his own web site in Dinah's standalone Editor and saw `{#top}` as words in his headings and no pictures. [v0.2.67](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.67), tagged at `d017c2787249c96cfb5856381ab736eb6d43f989` ([PR #100](https://github.com/paulmooreparks/yavc.app/pull/100)), reads attribute blocks after a heading, a link or a picture, and offers a picture at a site path to the host's picture resolver (DESIGN.md, decision 123). It also fixes two Editor defects that the standalone host exposed and adds `scripts/test-standalone-editor.cjs`, which proves the Editor in that host.

A receiving host has two things it may do. Its `contentWorkspace.resources.resolve` is now asked for a reference that starts with one `/`, and it returns null unless it keeps the document's web site somewhere of its own. When the place of a document's pictures changes, it calls the listeners of `pudlHost.fs.onChange`, and Editor and Docs resolve the pictures in view again. A host that does neither behaves as it did.

| Item | Value |
| --- | --- |
| Tag | `v0.2.67` |
| Tagged commit | `d017c27` |
| Archive | yavc-content-v0.2.67.zip |
| Archive SHA256 | `0d0dce79dba92759ca20236f70b090c80149e318ca54c676a77ee05284cf852e` |
| Manifest SHA256 | `4a6f9da7776af1c4c2121cde54e799acf7c48cea436ddf6ee488965d1f585dca` |
| Content digest | `ef604a3dbfbb32d6a9347253d0997a5489bf238a73218ef287834db45c6a3817` |
| Files | 488 |
| Applets | Editor 46.27.0, Docs 1.27.0, Slides 0.56.0, Diagrams 0.36.0 |
| PUDL | 0.106.2 |

The content digest is the one the suites ran against before the tag.

## v0.2.66: PUDL 0.106.2 in the package

Paul asked for stacked taskbar buttons in GK Companion, and a receiving host cannot take a new PUDL until the content package bundles the same one. [v0.2.66](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.66), tagged at `88220c83e6ef247bcda2de8534a311ed1ad6f914` ([PR #98](https://github.com/paulmooreparks/yavc.app/pull/98)), replaces the package's `pudl/` whole with the verified PUDL v0.106.2 distribution. No applet changed, so the applet versions are those of v0.2.65. A host takes this release together with PUDL 0.106.2 and does nothing else for it; `docs/pudl-upgrade-0.106.2.md` has the evidence.

| Item | Value |
| --- | --- |
| Tag | `v0.2.66` |
| Tagged commit | `88220c8` |
| Archive | yavc-content-v0.2.66.zip |
| Archive SHA256 | `56bcd780a6a8b8ab1e67a323d5318c1c6a3fc4e7ce3a97a226570aa4c0d22426` |
| Manifest SHA256 | `39bccc4e2d7783aaf135df3dd946c61ec111ef857cfc544c1feb4676ed78b357` |
| Content digest | `88c6f0c20eb9bf4b6efb055f27c53c5130a1470d70cf1901edd55e80c5fbf8db` |
| Files | 488 |
| PUDL | 0.106.2, tag commit `a6e0d43` |

The content digest is the one the suites ran against before the tag.

## v0.2.65: a canvas drawn as a screen looks

Paul wants a point-of-sale screen recreated in Diagrams down to its buttons, fonts, colours and symbols. [v0.2.65](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.65), tagged at `f6d4b61ab4fff1f76cc8bf39c8389e44873d643e` ([PR #95](https://github.com/paulmooreparks/yavc.app/pull/95)), adds picture nodes with a fit and a tint, a colour, size, weight, font and padding for text, a corner radius and a choice of outlined sides, and named styles. `docs/canvas-extension.md` defines them and DESIGN.md decision 122 gives the reasons.

A receiving host has three things to do for a faithful screen. Its `contentWorkspace.resources.resolve` must be offered to Diagrams as well as to the document applets, and it is asked with the canvas file as `resource` and the picture's path as `href` (`docs/document-host-overlays-contract.md`). The pictures must be files the host can serve on its own origin, each at most 1 MiB. A brand font must be loaded by the host's own page, since a canvas gives a font by its family name and the applet fetches none. An exported PNG and a canvas shown in a document use only the fonts installed on the reader's machine.

| Item | Value |
| --- | --- |
| Tag | `v0.2.65` |
| Tagged commit | `f6d4b61` |
| Archive | yavc-content-v0.2.65.zip |
| Archive SHA256 | `c289ec1628e82ebefbfeeea46794b7aa1410346523cf87bcf4b56da5f3eadce1` |
| Manifest SHA256 | `a56862b4c8cfc52577018ffe31f59f4469cb70e47cc50c75c9f0090d0a569e0f` |
| Content digest | `f570540d1b49aee7461ff7e4ff65980f32b492700738db768bd3cec0070ebfbd` |
| Files | 485 |

The content digest is the one the suites ran against before the tag.

## v0.2.64: a slide change no longer rebuilds the show

Paul saw each slide in a show elsewhere fade in, vanish and grow back. [v0.2.64](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.64), tagged at `0fcb59601865ad0255eddc27dc5d530e62bf4928` ([PR #93](https://github.com/paulmooreparks/yavc.app/pull/93)), sends the deck to the show only when its text has changed, and the show's page keeps its stage for a deck it already shows. The change is in Slides alone, and a host does nothing but take the release in place of v0.2.63.

| Item | Value |
| --- | --- |
| Tag | `v0.2.64` |
| Tagged commit | `0fcb596` |
| Archive | yavc-content-v0.2.64.zip |
| Archive SHA256 | `89774868d6bf623ecc74f67974f5dbe029d8efc9eaf3e503e0a7352e17ac0d35` |
| Manifest SHA256 | `bbd858a2d69965a4fefbfc21702111c1ad4526a3c082b3f97830c5353db2c89e` |
| Content digest | `a312f5087807d245bbc406bcb657d4abd1f6dd71d600d2418c0bb4c4d9dea945` |
| Files | 484 |

The content digest is the one the suites ran against before the tag.

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
