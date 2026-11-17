# Machine-readable release records

Every tagged content release publishes `yavc-release-TAG.json` and `yavc-release-TAG.json.sha256` alongside the full and Docs-only packages. `TAG` includes the leading `v`. The record binds both packages to one source commit, PUDL provenance and the qualifications maintained in the repository. Consumers must reject schema values they do not support; this checker accepts only integer `1`. Within schema 1, consumers must ignore unknown fields. Additive changes never rename or remove an existing field, or change its type or meaning. A qualification describes a limitation; it does not turn a missing result or integrity failure into a pass.

The download base is `https://github.com/paulmooreparks/yavc.app/releases/download/TAG/`. The existing ZIPs, external manifests and package `.sha256` files keep their names and format. Release uploads remain immutable and refuse replacement.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | integer | The value is `1`. |
| `version` | string | The source release tag, including `v`. |
| `commit` | string | The full 40-character lowercase source commit checked out by the content workflow. |
| `writtenAt` | string | The time the record was written, in ISO 8601 UTC ending in `Z`. |
| `workflowRunUrl` | string | The content workflow's GitHub Actions run URL. |
| `previousVersion` | string or null | The previous `v*` tag on first-parent history, or null for the first release. |
| `changes` | array | The first-parent commits after that tag through the release commit, oldest first. |
| `hostOnly` | array | The sorted union of demonstration-host paths declared by both builds. |
| `packages.full`, `packages.docs` | object | Each object describes one package using the fields below. |
| `pudl` | object | The verified bundled PUDL provenance described below. |
| `qualificationSource` | string | The value is `docs/release-qualifications.json`. |
| `qualifications` | array | The current file's entries, or `[]` when there are none. |
| `readme` | object | Its `contentDigest` string states the digest recipe and its `image` string explains why the image is omitted. |

Each package object has these fields. SHA-256 values are lowercase hexadecimal strings without an algorithm prefix, and sizes count bytes.

| Field | Type | Meaning |
| --- | --- | --- |
| `fileName` | string | The package ZIP asset's basename. |
| `sha256` | string | The SHA-256 of the downloaded ZIP bytes. |
| `size` | integer | The ZIP asset's byte length. |
| `manifestFileName` | string | The external manifest asset's basename. |
| `manifestSha256` | string | The SHA-256 of the external manifest's original bytes. |
| `contentDigest` | string | The package manifest's own `digest` field, recomputed using the README recipe below. The checker fails if the record and manifest differ. |
| `fileCount` | integer | The number of manifest-listed payload files, excluding `manifest.json`. |

`pudl` contains `version`, `tag`, `commit`, `archiveSha256` and `provenanceFile`. The generator compares the complete `pudl/` file/hash map in both package manifests against every `docs/pudl-*.json` inventory. Exactly one inventory must match both packages. It reads those provenance fields from that reviewed file and records its path, for example `docs/pudl-0.108.0.json`. In particular, `pudl.commit` is copied from this provenance file. The checker validates its form and verifies the archive and distribution bytes, but does not resolve PUDL's tag to that commit. A newly vendored PUDL version therefore changes the record through its verified bytes and provenance file, without editing a version literal in the generator.

Each change has `pr` (an integer, or null when the subject has no trailing `(#N)`), `title` (the subject with that suffix removed) and `commit` (the full lowercase 40-character commit). The generator reads Git in the workflow's complete clone (`fetch-depth: 0`). It walks the release commit's first-parent ancestors, excluding the release commit itself, and chooses the nearest ancestor carrying a `v*` tag. If one commit has multiple such tags, Git's descending version-name order breaks the tie. It then reads that tag's exclusive range through the release commit using `git log --first-parent --reverse`. It includes direct commits as well as PR merge or squash commits, and excludes commits reached only through a merge's other parents. The first release includes its entire first-parent history. The selection uses documented [Git first-parent traversal](https://git-scm.com/docs/git-rev-list) and [tag version sorting](https://git-scm.com/docs/git-tag), and a failed Git operation blocks generation.

The package builder declares `hostOnly` in each package manifest at the same copy decisions that include demonstration files. It names `go.mod`, `go.sum` and every file actually copied from the full profile's two demonstration-host trees. New files in those trees are enumerated automatically. The Docs-only profile declares just its module files. The generator copies the union of these explicit declarations; it never classifies paths by naming patterns. Consumers omit only listed paths present in their selected profile and retain all other payload files, including shared licences. The checker requires the record's list to equal the union of the manifests' declarations and every named path to be manifest-listed. Historical manifests such as v0.2.104 predate this field; a locally reconstructed acceptance record can supply the build's declaration, but the checker can validate only membership for those historical manifests. The normal generator refuses packages without a build declaration.

Every qualification has nonempty `id`, `status`, `scope`, `reason` and `owner` strings. Entries can add `test`, `engine`, `platform`, `evidence`, `originalRun` and `confirmationRun` as needed. The file currently records the Linux WebKit column exemption and the unexplained Firefox DOCX download timeout from PR 262. The latter grants no exemption to later runs. Owners update this file when a limitation is introduced or removed; an empty file array is the default when no qualifications apply. The generator copies its entries without interpreting them as release permission.

The `image` object is currently absent. `image.yml` publishes independently and the content workflow cannot reliably read that same tag's manifest digest without waiting for it. The record's README states that omission. An optional image object may be added later with its tag reference and manifest digest, without changing existing fields. Consumers must still perform image and installed-host acceptance separately.

## README: the content digest

The digest is the existing `cmd/yavc-content` manifest digest, which Tester recomputes during package acceptance. Take `files` in strictly increasing path order. Reduce every entry to the properties `path`, `bytes`, `sha256` in that order. Serialize the array as compact JSON with no spaces or trailing newline, encode it as UTF-8, then take SHA-256. Preserve integer byte lengths. Use Go `encoding/json` string escaping, including `\u003c`, `\u003e`, `\u0026`, `\u2028` and `\u2029` for `<`, `>`, `&`, U+2028 and U+2029. Other valid Unicode characters remain UTF-8. This is the documented [Go JSON encoding](https://pkg.go.dev/encoding/json#Marshal) used by the producer.

The record contains this explanation in `readme.contentDigest`. Current package paths make Tester's Node compact-JSON calculation agree with Go. The Python checker also implements and tests Go's escaping, so correctness does not depend on those characters being absent from future paths. The manifest's other properties, including `profile`, are outside the content digest. The external manifest's separate SHA-256 protects all of its bytes, and the checker requires the internal manifest to be identical.

The record sidecar is one ordinary checksum line: `HEX`, two spaces, the record basename, and a newline. Its digest covers the record's entire original UTF-8 file, including the final newline. The sidecar detects download corruption but is not a signature. A receiving project should pin the record SHA-256 through its trusted dependency process and pass that pin to the checker.

## Consumer checker

`scripts/release_record.py` needs Python 3.10 or later and no third-party modules. A consumer can run it with a tag:

```text
python scripts/release_record.py check v0.2.105 --sha256 TRUSTED_RECORD_SHA256
```

A downloaded record works too. Keep its `.json.sha256` beside it. Without `--assets-dir`, the checker downloads that record's six YAVC assets and PUDL's upstream archive from their fixed GitHub repositories.

```text
python scripts/release_record.py check downloads/yavc-release-v0.2.105.json
```

For local assets, add `--assets-dir downloads`. That directory must contain both ZIPs, both external manifests and both package checksum files. If `pudl-VERSION.zip` is also there, verification is fully offline; otherwise the checker downloads the upstream PUDL archive into temporary storage. It never executes anything from an archive. Add `--output-dir new-directory` to retain the verified extracted packages as `new-directory/full` and `new-directory/docs`. The destination must not exist. Without that option, temporary downloads and extractions are removed after verification.

The checker verifies the record checksum and optional trusted pin, both ZIP hashes and lengths, both manifest hashes, both existing package checksum files, each aggregate content digest, the exact ZIP entry set, the internal/external manifest equality, every extracted file's length/hash, the build's host-only declarations, the upstream PUDL archive hash and its complete distribution's equality with both packages. It rejects duplicate JSON members, duplicate or escaping ZIP paths, Windows aliases and reserved paths, symlinks, encrypted entries, unexpected files and excessive file counts or sizes before extracting into fresh temporary directories. Archive entries are inspected before extraction, following [Python's ZIP security guidance](https://docs.python.org/3.12/library/zipfile.html#zipfile.ZipFile.extractall). The package limits match the producer: 10,000 payload files, 256 MiB per file, 512 MiB total and 8 MiB for JSON.

A successful check exits zero and prints JSON containing `verified: true`, the version, source commit, record SHA-256, both content digests/counts and all qualifications. A mismatch, failed download or malformed input exits nonzero. Verification establishes byte identity and provenance consistency; it does not establish that a qualification is acceptable to the receiving product or that the applets work in that product.

## Checker summary contract

The summary has its own integer `summarySchema`, initially `1`. Consumers must reject unsupported summary schemas and ignore unknown fields within summary schema 1. Existing fields are never removed or renamed, and their types and meanings do not change. The following table lists every field currently emitted, including nested objects. Array contents use the record's existing qualifications contract.

| Field | Type | Meaning |
| --- | --- | --- |
| `summarySchema` | integer | The value is `1`. |
| `verified` | boolean | The downloaded bytes and recorded package/distribution digests agree. |
| `trustedPinVerified` | boolean | This is true only when a supplied `--sha256` pin matched; it is false without a supplied pin. |
| `version` | string | The verified record's release tag. |
| `commit` | string | The verified record's source commit. |
| `recordSha256` | string | The digest of the record's original bytes. |
| `packages` | object | The package summaries keyed by profile. |
| `packages.full` | object | The full package summary. |
| `packages.full.contentDigest` | string | The full manifest's verified `digest`. |
| `packages.full.fileCount` | integer | The full package's verified payload count. |
| `packages.docs` | object | The Docs-only package summary. |
| `packages.docs.contentDigest` | string | The Docs manifest's verified `digest`. |
| `packages.docs.fileCount` | integer | The Docs package's verified payload count. |
| `pudl` | object | The record's complete PUDL provenance object. |
| `pudl.version` | string | The recorded PUDL version. |
| `pudl.tag` | string | The recorded PUDL tag. |
| `pudl.commit` | string | The commit copied from reviewed repository provenance; its tag resolution is not checked. |
| `pudl.archiveSha256` | string | The verified upstream archive's SHA-256. |
| `pudl.provenanceFile` | string | The repository provenance file used by the generator. |
| `qualifications` | array | The complete qualifications copied from the record. |

The test reads this table and checks the summary's keys and types against it, in both pinned and unpinned modes. Both modes verify the same bytes. `verified` alone does not establish a trusted pin. A mismatched supplied pin fails instead of emitting a successful summary. Attestation-based pinning is deferred to a follow-up PR.

## Pinning the checker revision

A consumer fetches `scripts/release_record.py` at the release's own source commit, using `commit` from a record obtained through its trusted dependency process or the pinned release tag. The source URL is `https://raw.githubusercontent.com/paulmooreparks/yavc.app/COMMIT/scripts/release_record.py`. Keep that checker commit next to the record SHA-256 in the receiving project's adoption record. Do not select the checker from a moving branch. The checker is executable code, so an untrusted record cannot by itself authorise selecting and running a new checker revision.

## Producer and verification

`content-release.yml` creates both packages, generates the record and sidecar, then runs the same consumer checker against the local release assets before publishing. PUDL's upstream archive is fetched into temporary storage for that verification and is not added to the YAVC release. The existing publish step uploads all eight YAVC assets together without replacing any asset. PR checks run the invented-fixture unit and tamper cases in `scripts/test_release_record.py`.

v0.2.104 predates this record. Its existing six assets are unchanged. Local acceptance reconstructs a record from those published assets to exercise the new checker; that fixture is never uploaded to the historical release. The acceptance results and tamper failure are recorded in the PR before handoff.
