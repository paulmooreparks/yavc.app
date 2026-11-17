# Machine-readable release records

Every tagged content release publishes `yavc-release-TAG.json` and `yavc-release-TAG.json.sha256` alongside the full and Docs-only packages. `TAG` includes the leading `v`. The record binds both packages to one source commit, PUDL provenance and the qualifications maintained in the repository. Schema 1 is additive: published fields are never renamed or removed, and consumers must ignore fields they do not recognise. A qualification describes a limitation; it does not turn a missing result or integrity failure into a pass.

The download base is `https://github.com/paulmooreparks/yavc.app/releases/download/TAG/`. The existing ZIPs, external manifests and package `.sha256` files keep their names and format. Release uploads remain immutable and refuse replacement.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | integer | The value is `1`. |
| `version` | string | The source release tag, including `v`. |
| `commit` | string | The full 40-character lowercase source commit checked out by the content workflow. |
| `writtenAt` | string | The time the record was written, in ISO 8601 UTC ending in `Z`. |
| `workflowRunUrl` | string | The content workflow's GitHub Actions run URL. |
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
| `contentDigest` | string | The aggregate digest defined in the README section below. |
| `fileCount` | integer | The number of manifest-listed payload files, excluding `manifest.json`. |

`pudl` contains `version`, `tag`, `commit`, `archiveSha256` and `provenanceFile`. The generator compares the complete `pudl/` file/hash map in both package manifests against every `docs/pudl-*.json` inventory. Exactly one inventory must match both packages. It reads those provenance fields from that file and records its path, for example `docs/pudl-0.108.0.json`. A newly vendored PUDL version therefore changes the record through its verified bytes and provenance file, without editing a version literal in the generator. The consumer also verifies the upstream archive hash and compares its complete distribution against both packages.

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

The checker verifies the record checksum and optional trusted pin, both ZIP hashes and lengths, both manifest hashes, both existing package checksum files, each aggregate content digest, the exact ZIP entry set, the internal/external manifest equality, every extracted file's length/hash, the upstream PUDL archive hash and its complete distribution's equality with both packages. It rejects duplicate JSON members, duplicate or escaping ZIP paths, Windows aliases and reserved paths, symlinks, encrypted entries, unexpected files and excessive file counts or sizes before extracting into fresh temporary directories. Archive entries are inspected before extraction, following [Python's ZIP security guidance](https://docs.python.org/3.12/library/zipfile.html#zipfile.ZipFile.extractall). The package limits match the producer: 10,000 payload files, 256 MiB per file, 512 MiB total and 8 MiB for JSON.

A successful check exits zero and prints JSON containing `verified: true`, the version, source commit, record SHA-256, both content digests/counts and all qualifications. A mismatch, failed download or malformed input exits nonzero. Verification establishes byte identity and provenance consistency; it does not establish that a qualification is acceptable to the receiving product or that the applets work in that product.

## Producer and verification

`content-release.yml` creates both packages, generates the record and sidecar, then runs the same consumer checker against the local release assets before publishing. PUDL's upstream archive is fetched into temporary storage for that verification and is not added to the YAVC release. The existing publish step uploads all eight YAVC assets together without replacing any asset. PR checks run the invented-fixture unit and tamper cases in `scripts/test_release_record.py`.

v0.2.104 predates this record. Its existing six assets are unchanged. Local acceptance reconstructs a record from those published assets to exercise the new checker; that fixture is never uploaded to the historical release. The acceptance results and tamper failure are recorded in the PR before handoff.
