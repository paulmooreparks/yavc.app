# Downloading a portable content release

Tagged releases publish the portable applet set as GitHub release assets. The ZIP contains the complete output of `cmd/yavc-content`, including its root `manifest.json`, shared engines, workers, fonts, licenses, support files and independent-host fixtures. It does not contain the yavc.app server or guest filesystem.

Each release supplies these assets, where `VERSION` includes the leading `v`:

- `yavc-content-VERSION.zip`
- `yavc-content-VERSION.manifest.json`
- `yavc-content-VERSION.sha256`

The download prefix is `https://github.com/paulmooreparks/yavc.app/releases/download/VERSION/`. A receiving build should pin the immutable source tag/commit, ZIP SHA-256 and manifest digest in its own dependency configuration. The published checksum file helps verify a download; it does not replace a trusted dependency pin. After extraction into a new directory, compare the internal and external manifests, verify the aggregate digest and every listed file length/hash, and reject duplicate or escaping paths before serving assets. Preserve the prior package and adapter for rollback.

`go run ./cmd/yavc-content -out <new-output> -zip <new-archive.zip>` creates the same package locally. The archiver validates the sorted manifest, paths, sizes and source hashes, refuses symlinks and existing archives, and writes only listed files plus the manifest. Entry timestamps and modes are fixed so identical inputs produce identical ZIP bytes with the same Go toolchain. The output directory and archive must be separate. An invalid package leaves no partial ZIP.

The `content-release.yml` workflow runs the repository gate, builds the package and uploads those assets without replacing existing downloads. The image workflow publishes the site image separately. A release is ready for receiving-host adoption only after both required workflows and the actual receiving-host acceptance succeed. Download availability alone is not desktop acceptance.

The initial unblock release includes the opt-in Files default in Editor/Docs, the removal of host-specific workspace comments, the corrected Save As compound suffix selection and the updated Sight Reader score list. Host-supplied review suggestions, explicit selection actions and expanded syntax support are the subsequent integration batch.

## Profiles: a package of one applet

`cmd/yavc-content` takes an optional `-profile NAME`. Without it, or with `-profile full`, the output is the package described above and is byte for byte what it was before profiles existed, including `manifest.json`, with no new member in it. Only `docs` is promised besides `full`; another profile is added when someone needs it.

A profile is a fixed list in `cmd/yavc-content`. It names the applets and shared code a package holds and the features it leaves out.

### What `docs` contains

| Group | In `docs` |
| --- | --- |
| Applet | Docs only. Editor, Slides and Diagrams, their folders and the two independent-host fixtures (`lab`, `workspace-lab`) are left out. |
| Shared code Docs needs | `content-kit`, `text-workspace`, `md-editor`, `md-engine` with `yavc-md.wasm`, `support`, `pudl` (the whole verified PUDL release, unchanged), `shortcodes.json`, `LICENSE`, `go.mod` and `go.sum`. |
| Printing | All of `export.js`, since printing prepares a document through it. Only the libraries that write Word and PDF files are left out. |

### What `docs` leaves out, as named features

| Feature | Files left out | What a person loses |
| --- | --- | --- |
| `export-word` | The vendored docx library | Download as Word |
| `export-pdf` | The vendored pdfmake, fontkit and pdf-lib libraries and `pdf-notes.js` | Download as PDF |
| `import-office` | `import-word.js`, its worker, `office-input.js`, `import-images.js`, `import/` and the vendored mammoth | Import Word |
| `mermaid` | The vendored Mermaid | A Mermaid block cannot be drawn |
| `diagrams` | All of `diagram-kit` (D2 and its 22 MB engine, the Canvas reader and `canvas-embed.js`) and the Diagrams applet | A `{{diagram}}` reference or a D2 block cannot be drawn, so no diagram code is present at all |
| `language-service` | `language-service/worker.js`, its schemas and licences, but not `bridge.js` | Diagnostics and completion for JSON, CSS and HTML text, where a tab has them |

A feature is left out whole or not at all. The list is in the manifest, so a host reads it and does not discover it by failing.

### What the manifest says

A `docs` manifest has the same members as the full one, and these differences. `profile` is `"docs"`. `entry` and `entries` name only `content/docs/applet.json`. `omits` is an array with one `{"feature", "message", "paths"}` object for each feature above, where each path is a file or, when it ends in a slash, a folder, and none of them is in the package. `files` lists only what is included, sorted as before, and `digest` is the SHA-256 of that list, worked out as it is for the full package. Two builds of the same source with the same engines give the same digest. A full manifest has no `profile` and no `omits`, and a host treats their absence as `full`. A host that pins a package pins the digest of the profile it took, and a `docs` digest never equals a `full` one. Every file in a `docs` package is the same file, byte for byte, as in the full package, apart from `manifest.json` and `content/omitted.json`.

### Release assets

Every release publishes the `docs` package beside the full one, built by the same workflow from the same tag: `yavc-content-docs-VERSION.zip`, `yavc-content-docs-VERSION.manifest.json` and `yavc-content-docs-VERSION.sha256`, with the same download prefix. A receiving host pins the release and the digest in the `docs` manifest, and does not need to rebuild the package or trust that its own build matches.

### When a feature's files are absent

Each feature above is reached through a control or an action that someone used. When a script that feature needs cannot be loaded, the shared loader (`yavc-util.js`) looks in its own text, where the package build for a reduced profile has written the list in place of `null` on the line `var omittedByBuild = null; // yavc-content: omissions`, and if the list has the file, the load fails with the feature's `message`, such as "Download as Word is not part of this build of Docs." The control shows that sentence where it shows any error: a toast for a command, a notice in the block for a diagram, and the error of the agent action. `content/omitted.json` is `{"version": 1, "omitted": [{"feature", "message", "paths"}, ...]}`, the same list as the manifest's `omits`. The loader does not read that file, since reading it is a request that a browser may log whatever the page does with the failure (WebKit does, for a refused or missing file), so it is there for people and for tests, and a full package, whose loader has `null`, makes no request at all when a script fails to load. A host that serves its own copy of `support/yavc-util.js` in place of the package's loses the list, and its users then see the plain failure and not the sentence about the omitted feature. Where the loader has no list or it does not list the missing file, a failure is reported as it is today, since a missing file in a full package is a fault and not a choice.

### What proves it

- Go tests build both profiles from stand-in engines and check that the full manifest has no profile members, that every file of `docs` equals the full package's file, that what `docs` lacks is exactly the other applets, the fixtures and the omitted features, and that `omits`, `content/omitted.json`, the list in `support/yavc-util.js` and the full package agree, and that `support/yavc-util.js` differs from the full package's only in that line.
- `scripts/test-docs-profile.cjs`, which the workflow runs against a built `docs` package, serves it under PFO's policy and headers (`default-src 'none'`, no `blob:`, `Cache-Control: no-store`) with the one-page host from the repository. Docs types, formats, changes view, opens its menus and dialogs, saves, prints and shows a picture the host supplies as a `data:` address, with no failed request except for what the manifest says is omitted, and with no violation of the policy. If Docs starts to need a file the profile omits, that run fails. It then uses each omitted feature and expects the sentence.
