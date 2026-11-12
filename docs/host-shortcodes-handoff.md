# Host shortcode integration handoff

## v0.2.81: the toolbar a person can change, and text and fonts in Diagrams

[v0.2.81](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.81) ([PR #125](https://github.com/paulmooreparks/yavc.app/pull/125)) followed on 2026-11-12 from what Paul found in GK Companion that morning. The package now has the controller of the shared toolbar as `support/command-toolbar.js` with its rules in `support/command-toolbar.css` (DESIGN.md decision 133), and a host offers `pudlHost.commandToolbar` by passing that controller its config service (`docs/command-toolbar-design.md`, decision 9). The control at the end of the bar is a pencil. In Diagrams the Inspector's Text field and the editor over a shape grow with their text, and the Font fields are PUDL combo boxes whose list starts with the fonts the canvas uses (decision 134). A host should load `pudl/pudl-combo.js` where Diagrams runs; without it the browser draws the list.

| Item | v0.2.81 |
| --- | --- |
| Commit | `bf1a4aaae99278783b15ed1701187eb90bb58259` |
| Archive sha256 | `f1f14f73aac120940d497c32aa56d938a7ee7b97be0955a3f1be3ecc34b6de07` |
| Manifest sha256 | `2bac8545069b051fe55e99137903dd28228117fc28394dee8b642a884d20da95` |
| Content digest | `64c3b9e6e3065f9883ea321117d120622b6cd78e0a3a35c05524c0b44b8339b8` |
| Files | 492 |
| Applets | Editor 46.37.0, Docs 1.37.0, Slides 0.65.0, Diagrams 0.44.0 |

## v0.2.79 and v0.2.80: the Editor as a text editor, and Browse writing a reference from the document's folder

[v0.2.79](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.79) ([PR #121](https://github.com/paulmooreparks/yavc.app/pull/121)) followed on 2026-11-12 from Paul's proposal to sharpen the split between the two applications (DESIGN.md decision 131). The Editor shows every file as text and has no Visual, Split or Preview. A Markdown document chosen in the Editor is handed to Docs through `fileResolution.open`, and one sent to the Editor by name opens there as text. A receiving host has to open `.md` and `.markdown` files in Docs before it takes this release, which the receiving product did first. The standalone Editor application loses Visual for Markdown until its host does the same.

[v0.2.80](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.80) ([PR #122](https://github.com/paulmooreparks/yavc.app/pull/122)) writes a file chosen with Browse from the document's folder where the two share a folder (decision 132, `docs/file-fields-contract.md`), so that a host's `fileFields.choose` can return a full path without making documents that lose their files when saved elsewhere.

| Item | v0.2.79 | v0.2.80 |
| --- | --- | --- |
| Commit | `95792672ec68b858792e8aa2a52e454adae6fe15` | `a34270f894ef92d0b61aa237e6b832f35ea7a211` |
| Archive sha256 | `14c444caaaf2d410782bc525dba878f6c22b8be1b1e43be912dc059d5c5f2f34` | `80860150c42730f15128be570df3260041beb4c2b40dcddfbfa654cb50d8fbdb` |
| Manifest sha256 | `cc8888d01f77f8f5d3d15408cfad0956fb541c0166835295b6e02728407cf0f5` | `ab1ef059fb4ba2f8b54d236de51045f65afcfdd10a2133d9f79c6a91d56ee48b` |
| Content digest | `2799b0d14cb6ca7e6bf952158896c4b712cf2d788a0995348e3d1bd4c36c4309` | `544ae0314d379d1e48eed05abe3f37c8051b0ef1520e016c21f7d7eb6e90b718` |
| Applets | Editor 46.35.0, Docs 1.35.0, Slides 0.63.0 | Editor 46.36.0, Docs 1.36.0, Slides 0.64.0 |

Each published archive and manifest passed its checksums, and each digest equals a local build of the tagged commit.

Site tests left failing, none caused by these releases as far as was checked: `test-content-preservation-routing.cjs` (a deck's text loses its byte order mark) and `test-document-gallery.cjs` (a template window check) fail the same way on v0.2.78. `test-dialog-overhaul.cjs` crashed the browser in a phase about a cancelled commit and was not checked against an earlier release.

## v0.2.78: a shared definitions file in a host, and a host's own resolving of references

[v0.2.78](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.78) ([PR #119](https://github.com/paulmooreparks/yavc.app/pull/119)) followed on 2026-11-12 (DESIGN.md decision 130). A document's `shortcodes` file is read through the host's `fs.readText` from any local path, and a file that is missing leaves the page drawn. A host may offer `contentWorkspace.resolvePath` (`docs/content-workspace-contract.md`) to say where a document's reference to a diagram, a stylesheet or that file is. The Browse buttons in the applets' forms need `pudlHost.fileFields` (`docs/file-fields-contract.md`), which the receiving host does not offer yet.

| Item | Value |
| --- | --- |
| Commit | `059576adb3b22bb38cb8ff97059769849b9ba2f3` |
| Archive sha256 | `413670bc48f6b0dc3f35d37c24bd91e8d8e34b2a336aae02e4007af7316929fd` |
| Manifest sha256 | `97a164155bc083f6cc78ec4d415f93ae848a18d9f6f3e2a3526decddca8848e1` |
| Content digest | `db890c2afb91a9676e3c322079281e893d0353a56f9c03bae0dd715c8277706e` (490 files) |
| Applets | Editor 46.34.0, Docs 1.34.0, Slides 0.62.0, Diagrams 0.43.0 |

The published archive and manifest passed their checksums, and the digest equals a local build of the tagged commit. `scripts/test-portable-workspace.cjs` timed out once at a page wait in seven runs before the release and passed in the other six; the cause is not known.

## v0.2.77: Diagrams takes a host's document commands

[v0.2.77](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.77) ([PR #117](https://github.com/paulmooreparks/yavc.app/pull/117)) followed on 2026-11-12, after Paul approved editing a diagram kept on a wiki page from the page (DESIGN.md decision 129). Diagrams takes `pudlHost.documentCommands` as Editor and Docs do, so a host's Publish can stand in place of Save there (`docs/document-commands-contract.md`). A host's shortcut that CodeMirror also uses, such as `Mod+Shift+U`, does not reach its command while a text pane has the keyboard, and the contract now says so.

| Item | Value |
| --- | --- |
| Commit | `a2740e367182beb89a063fed85fd5f502ea8ca90` |
| Archive sha256 | `699c3f052af69f117b0df1f2b7e5b63046449a4281f906afe9a7638aee5e82b9` |
| Manifest sha256 | `90630b6e586094e331062cb24a2396548bfd08fde3c9d0510b2146dbec374fe6` |
| Content digest | `12bbc128ec306f6ceb9de6993792ed45420c6a9c89858fdf1af34ffeb9abde45` (490 files) |
| Applets | Editor 46.33.0, Docs 1.33.0, Slides 0.61.0, Diagrams 0.42.0 |

The published archive and manifest passed their checksums, and the digest equals a local build of the tagged commit.

## v0.2.76: a picture in a canvas file, and a radius for each corner

[v0.2.76](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.76) ([PR #115](https://github.com/paulmooreparks/yavc.app/pull/115)) followed on 2026-11-12 and closes the last two gaps the receiving product counted on the canvases its screen viewer writes (DESIGN.md decision 128). A picture node may keep its picture in the file as `picture`, a data address of at most 256 KiB that is checked when the file is read. `radiusCorners` gives each corner of a rectangle its own radius. `docs/canvas-extension.md` defines both. `radiusCorners` can be set through the agent's edit action; `picture` is written by whatever makes the file.

| Item | Value |
| --- | --- |
| Commit | `3ae2cf8f828009d4739a0c52e23bd610840e0236` |
| Archive sha256 | `afae90fa297a504b49d42db0d843ac1c5f707b84703a11522a5d241f6ebd3492` |
| Manifest sha256 | `da7f22a923d266adf5a394906ebce2303e98916074fa7b1c96a79f075c25ac58` |
| Content digest | `62424e152d62423f4cbfd73d40e53adc89654027aef96bb77b9cce3e4d1d3790` (490 files) |
| Applets | Diagrams 0.41.0; the others as in v0.2.75 |

The published archive and manifest passed their checksums, and the digest equals a local build of the tagged commit.

## v0.2.74 and v0.2.75: the baseline from the font, and a document's own shortcodes expanded

Two releases followed on 2026-11-12 from the receiving product's second measurement and from its publisher's need.

[v0.2.74](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.74) ([PR #112](https://github.com/paulmooreparks/yavc.app/pull/112)) places a canvas's text from the font's own ascent and descent where a page gives them, trusts an estimated width only beyond a fifth for a new line, and adds `paddingSides` (DESIGN.md decision 128, `docs/canvas-extension.md`). A host may offer `contentWorkspace.openDiagram`, which Edit Diagram asks before PUDL's `diagram` verb (`docs/content-workspace-contract.md`).

[v0.2.75](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.75) ([PR #113](https://github.com/paulmooreparks/yavc.app/pull/113)) adds `expand` to the engine, which returns a document's Markdown with every use of a shortcode the document or its shared file defines replaced, and the definitions removed (`docs/shortcode-destinations.md`).

| Item | v0.2.74 | v0.2.75 |
| --- | --- | --- |
| Commit | `1f72ce414643f6345a3807bc56d9177a2bfa6cfc` | `78ed616d0715fdf1e2779a8a7fb2eba256dbce20` |
| Archive sha256 | `8596657ddfbdda5ecdf2f1de60357116a13f333876aa4306b6e2f1de339a4136` | `211c931c84e7b5e0a0812cda4514beced9fe2ac1bf4a9fc39d9fd31d1666f4fb` |
| Manifest sha256 | `c70638ca6fe096a829395a6debf7733bd3ef7e11fed437453c4ee481f0584700` | `1997bf8abef332f0eb00f9a4c5d23d5818e09d2e6341c631001af3c1a42dd19f` |
| Content digest | `9625599b53e61b51d55cf9174db605a60d93175ca3f56e3ec5e976d302c9fa72` | `4a98901493dea4166d41ce54bb7b1dbe6533d0be34067ed7873eddccf330e8c6` |
| Applets | Editor 46.32.0, Docs 1.32.0, Slides 0.60.0, Diagrams 0.40.0 | unchanged |

Each published archive and manifest passed its checksums, and each digest equals a local build of the tagged commit. A picture inside a canvas file and a radius for each corner are the next two pieces the receiving product asked for.

## v0.2.73: a canvas written from a screen, drawn closer to the screen

[v0.2.73](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.73) ([PR #110](https://github.com/paulmooreparks/yavc.app/pull/110)) followed on 2026-11-12 from the receiving product's pixel comparison of 72 canvases written by its screen viewer (DESIGN.md decision 128). Font families are quoted in a drawing, and a picture's lines are broken by measured width where there is a page. A node may have `lineHeight`, `outlinePosition` and `noFill` (`docs/canvas-extension.md`). A picture inside the file, a radius for each corner and padding for each side were counted and left for later.

| Item | Value |
| --- | --- |
| Commit | `e87022efe45f710591a0c091cd4e286817d44d15` |
| Archive sha256 | `0f73d7fd729a785c7c5428396eb2d81c02b4bac2f40a9d5a354b3f4b9bbf0c21` |
| Manifest sha256 | `1ae33ad34c0ec123ca6cbad70c817a3ba0b2cd502267117ed057de47f10d7d11` |
| Content digest | `503ce0274773937f4315ef928fdcc3caf4f17ed89b9fc8e317ea330e36affe0d` (490 files) |
| Applets | Diagrams 0.39.0; the others as in v0.2.72 |

The published archive and manifest passed their checksums, and the digest equals a local build of the tagged commit. The receiving product is to measure again with the new properties written.

## v0.2.72: the shortcode table, a diagram's picture, and Edit Diagram

[v0.2.72](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.72) ([PR #108](https://github.com/paulmooreparks/yavc.app/pull/108)) followed on the night of 2026-11-11, when Paul asked the two teams to make shortcodes work as general-purpose codes and to make an embedded diagram editable (DESIGN.md decision 127). PUDL stays at 0.107.1. `docs/shortcode-destinations.md` is the contract for all three parts.

- `content/shortcodes.json` lists every built-in shortcode with its kind, arguments, meaning, plain form, whether a picture stands in for it and whether it is published. A receiving host reads it and keeps no list of its own.
- `content/diagram-kit/picture.js` gives a host's page `yavcDiagramPicture.draw`, which makes an SVG or PNG of a canvas, D2 or Mermaid diagram from its text with no applet on the page.
- Editor and Docs offer Edit Diagram for a diagram drawn from a file. It asks PUDL for the `diagram` verb with the file's resolved path, so the receiving host has to open that request in Diagrams.

| Item | Value |
| --- | --- |
| Commit | `568a96a597a7f0fa9f279585d51e8976254c60f5` |
| Archive sha256 | `fe825b6a53fc797d733b8e993f3f14896ab1ba05c4eb96ce1b2d675b0b22b027` |
| Manifest sha256 | `0ad7bd26fec529478aa24429d563b16b8723da22ac54b231b2ee601cad82f64f` |
| Content digest | `ccdf7e66142e20c8f0429323ab52d1ca1c86f4b1d50eb482726507bc728dba1d` (490 files) |
| Applets | Editor 46.31.0, Docs 1.31.0, Slides 0.59.0, Diagrams 0.38.0 |

The published archive and manifest passed their checksums, and the digest equals a local build of the tagged commit. All seven package tests passed in Chromium, Firefox and WebKit. Paul approved the shortcode rule in his own words; Edit Diagram was built as part of the diagram thread he opened and is his to confirm.

## v0.2.71: a host command in place of Save, and suggestions marked by what they change

[v0.2.71](https://github.com/paulmooreparks/yavc.app/releases/tag/v0.2.71) ([PR #106](https://github.com/paulmooreparks/yavc.app/pull/106)) followed on 2026-11-11 from two things Paul met in the receiving product (DESIGN.md decision 126). PUDL stays at 0.107.1.

A declaration in `pudlHost.documentCommands` may say `replaces: 'save'`. For a document the command is present for, Save takes its label, glyph and state, and runs the host's command only (`docs/document-commands-contract.md`). The applet does not clear its modified mark after that run, so the host's command has to write the text through the resource.

A host suggestion is marked no wider than what it changes, from a comparison of `before` with `after` that the applet makes. A table has only its changed rows tinted, changed words are struck where their place is sure, and the card shows the difference (`docs/document-host-overlays-contract.md`). The host publishes nothing new.

| Item | Value |
| --- | --- |
| Commit | `951f0f9f9caf2a01ef05ae85717b30efd0724653` |
| Archive sha256 | `717efa29042133082b419e5d630610cba143c41c11b1b222e8764e20a497f6dd` |
| Manifest sha256 | `7e6075343c473192826d71b005fba088abaabd1fc7219b4965e2a722bafa7950` |
| Content digest | `15351bddf286c1af7c9e4e8fbe7b10f7c485695a9565e94e366581651d90357a` (488 files) |
| Applets | Editor 46.30.0, Docs 1.30.0, Slides 0.58.0 |

The published archive and manifest passed their checksums, and the digest equals a local build of the tagged commit. The package tests for the workspace, host overlays and HTML tables passed in Chromium, Firefox and WebKit. The Diagrams package test hit its known Firefox crash on navigation; the release does not touch Diagrams. The card for a suggestion still sits after its table, so on a long table it is far from the changed row.

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
