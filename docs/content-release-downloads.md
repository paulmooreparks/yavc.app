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

`cmd/yavc-content` takes an optional `-profile NAME`. Without it, or with `-profile full`, the output is the package described above and is byte for byte what it was before profiles existed, including `manifest.json`. A test holds the full package's digest, built from fixed stand-in engines, so that this stays true.

A profile is a fixed list in `cmd/yavc-content`. It names the applets it includes and the optional features it leaves out. The only profile besides `full` is `docs`.

### What `docs` contains

| Group | In `docs` |
| --- | --- |
| Applets | Docs only. Editor, Slides and Diagrams, their folders and the two independent-host fixtures (`lab`, `workspace-lab`) are left out. |
| Shared code Docs needs | `content-kit`, `text-workspace`, `md-editor`, `md-engine` with `yavc-md.wasm`, `support`, `pudl` (the whole verified PUDL release, unchanged), `shortcodes.json`, `LICENSE`, `go.mod` and `go.sum`. |
| Canvas drawing | The canvas files of `diagram-kit` that a document's `.canvas` reference needs, without D2 and its 22 MB engine. |

### What `docs` leaves out, as named features

| Feature | Files left out | What a person loses |
| --- | --- | --- |
| `export-word` and `export-pdf` | `export.js` and the vendored docx, pdfmake, fontkit and pdf-lib libraries | Export to Word and to PDF, and PDF notes |
| `import-office` | `import-word.js`, its worker, `office-input.js`, `import-images.js` and the vendored mammoth | Opening a Word document |
| `mermaid` | The vendored Mermaid | A Mermaid block shows its source |
| `d2` | `d2.js`, the D2 worker and `yavc-d2.wasm` | A D2 block shows its source |
| `language-service` | `language-service/worker.js` and its schemas, but not `bridge.js` | Diagnostics and completion for JSON, CSS and HTML text, where a tab has them |

A feature is left out whole or not at all. The list is in the manifest, so a host reads it and does not discover it by failing.

### What the manifest says

A `docs` manifest has the same members as the full one, and these differences. `profile` is `"docs"`. `entry` and `entries` name only `content/docs/applet.json`. `omits` is an array with one `{"feature": "...", "paths": ["prefix", ...]}` object for each feature above, where each path is a file or a folder prefix that is not in the package. `files` lists only what is included, sorted as before, and `digest` is the SHA-256 of that list, worked out as it is for the full package. Two builds of the same source with the same stand-in engines give the same digest. A full manifest has no `profile` and no `omits`, and a host treats their absence as `full`. A host that pins a package pins the digest of the profile it took, and a `docs` digest never equals a `full` one.

The ZIP and the download assets of a release stay the full package. A profile is built locally with `-profile docs`, and `-zip` writes the profile's ZIP in the same way.

### When a feature's files are absent

Each of the features above is reached through a control or an action the person or an agent used. When a file that feature needs cannot be loaded, the applet checks `content/omitted.json`, a file that only a reduced package has, and if it lists the feature, shows a PUDL notice beside the control that was used, in words such as "Export to Word is not part of this build of Docs." The same sentence is the error of the agent action. Without `content/omitted.json`, or when the feature is not in it, a failed load is reported as it is today, as an error that says the file could not be loaded, since a missing file in a full package is a fault and not a choice. `content/omitted.json` is `{"version": 1, "omitted": ["export-word", ...]}`, the features' names from the manifest. It is requested only after a load has failed, so a package that omits nothing is not asked for it. A block drawn in the document (Mermaid, D2) shows its source with the same notice inside the block's own frame, and does not fail silently.

### Tests

A Go test builds both profiles with stand-in engines and checks that the full digest is the one held, that `docs` contains none of the left-out paths, that `omits` and `omitted.json` agree with each other and with what is absent, and that every file a Docs load names at start is present. A package test serves the `docs` package, with the one-page host from the repository since the package leaves its own fixtures out, and checks that Docs starts and edits with no failed request, then asks for each left-out feature and sees the notice beside its control.
