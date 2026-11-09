# Per-file guest VFS

The guest VFS remains the file authority for every applet on its origin. Applets read and save through the host services; they do not open IndexedDB or native files themselves. Guest storage remains browser-local and creates no server copy or cross-origin sharing. Server mounts and session-backed settings keep their existing backends.

## Database and contents

The `yavc-vfs` IndexedDB database has three object stores. `entries` holds one structured record per path, with type, immutable content identifier, byte size, modification time and opaque revision. `contents` holds one ArrayBuffer per content identifier for both text and binary files. `state` holds the directory generation, live byte count, seed bookkeeping and migration provenance. No authoritative record contains the whole filesystem as JSON or embeds text contents in directory metadata.

ArrayBuffer is the common persistent representation. The read service exposes a Blob facade when consumers need it. The owned Windows WebKit runtime rejected direct Blob serialization with `UnknownError: Error preparing Blob/File data to be stored in object store`; the implementation therefore uses documented structured-clone byte buffers consistently in every engine, without a runtime-dependent fallback branch. Both forms are documented IndexedDB values in the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).

Directory loading reads metadata only. Contents are fetched on demand. Ordinary document saves compare the target file revision and commit its replacement bytes, entry and usage in one readwrite transaction. Unrelated file revisions and content identifiers stay unchanged. Equal source bytes can keep the existing revision. Renames retain content identifiers. Deletion removes unreferenced contents within the same transaction. A copied file consumes its full logical size even when records temporarily reference the same immutable contents.

Legacy tree mutations use the existing per-page queue and compare the directory generation. Their in-memory structured snapshots contain metadata and only newly supplied text. A stale tree cannot replace acknowledged changes from another tab. Captured-tree saves retain the tree captured at invocation. Legacy `readHome` and `scriptSource` now return promises like `read`, because file text is no longer present on every tree node. Maintained consumers use asynchronous reads.

IndexedDB transactions never await a Blob read or another external promise. Payload preparation and equality checks happen before the write transaction; revision and cancellation checks happen again inside it. A file read obtains its entry and bytes in one readonly transaction, so its revision describes the returned immutable bytes. [IndexedDB's documented transaction lifetime](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) defines this boundary.

## Limits

| Policy | Default |
| --- | ---: |
| Stored file bytes | 100 MiB |
| Live file contents in the guest home | 1 GiB |
| Editable source, measured as UTF-8 bytes and bounded code units | 10 MiB |
| Directory entries, including folders | 100,000 |

The trusted host may supply `pudlHost.guestStorage` with `file`, `home`, `text` and `entries` integer limits before loading the VFS. The shared codec has a 100 MiB hard ceiling; policies must respect it. Other hosts, including native applications, retain their own resource providers and limits.

The byte counter sums each live file's complete stored bytes, including signatures. Metadata has its own entry-count bound. Browser quota is an additional physical limit and can fail before the application allowance. Retained migration data also consumes physical browser space. Settings remain a separate server-backed quota. A file larger than the editing budget can still be stored, renamed, copied, downloaded and deleted. Importers, dependency fields, rich renderers and exporters retain their separate safety budgets.

Source lines exceeding 65,536 UTF-16 code units disable soft wrapping for that document. The stored wrapping preference remains unchanged. Removing the last excessive line reenables wrapping, and Undo can restore the guard. This prevents huge single-line layout stalls observed in the owned WebKit proof; the same rule applies in every engine. It changes neither source nor rich document layout.

The public VFS `usage()` promise returns `{used, limit}` for live guest contents. `limits` exposes the active policy. Failed writes leave previous bytes, revisions and counters intact. No quota error silently removes the previous saved version.

## Migration and rollback

Initialization first checks the new authority. If absent, it imports the `home` record from the older `yavc-home` database, or the `pc-terminal-home` localStorage record when there is no transactional home. UTF-8 text becomes individual byte contents without changing BOMs, Unicode or line endings. Original binary bytes come from the corresponding old `blobs` store. Missing data, invalid paths, invalid Unicode, unsupported formats or exceeded quotas refuse migration. Entries, contents and the initialization header commit atomically, including when two tabs initialize concurrently.

The old `yavc-home` database, `yavc-home-blobs` database and localStorage record remain unchanged for recovery. Their retained data is outside the new live quota. The new authority records the old generation and legacy source. Notifications and startup checks detect writes made by an older build to its separate authority, retain both versions and show the existing divergence warning. Detection does not merge the versions. The File Records download includes metadata and retained older records; it is not a complete byte backup of the new filesystem.

A container rollback alone cannot move newer files back to the older authority. Export changed files with the new Files app, including binary files, before reverting to an older implementation. Keep the new database for recovery. The old release continues to see its retained old files. The new migration never deletes either old database automatically.

## Verification

`node scripts/test-home-store.cjs` exercises real IndexedDB in isolated Chromium, Firefox and WebKit contexts. It covers both migration sources, exact source bytes, metadata-only records, concurrent tree and per-file saves, create collisions, unchanged revisions, create-only imports, byte quotas, cancellation, injected disk-quota failure, binary cleanup, legacy divergence and reload. Synthetic policies make boundary tests independent of a machine's disk size.

`node scripts/test-vfs-consumers.cjs` checks actual Terminal, Editor, Slides and Diagrams saves and reloads against a disposable server supplied through `YAVC_CHROME_TEST_PORT`. Source-byte, encoding, history and recovery tests retain their independent checks. The ordinary repository gate runs before every commit. No fixture opens or changes a person's browser profile or files.
