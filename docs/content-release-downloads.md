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
