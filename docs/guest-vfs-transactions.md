# Transactional guest VFS

The guest VFS remains the file authority for every applet on its origin. Conditional resource writes use that authority through a host adapter. Applets do not open IndexedDB, localStorage or native files themselves.

## Storage authority

The former `pc-terminal-home` localStorage record has no compare-and-write primitive. Browser locks cannot protect it against older code that does not acquire those locks. The new authority is the `home` record in the `state` store of the `yavc-home` IndexedDB database. Its versioned envelope contains the existing serialized filesystem, a monotonically increasing generation and the original migration source. Pictures reside in the same database's `blobs` store. The IndexedDB readwrite transaction provides the comparison and commit boundary.

Legacy mutations refresh their cached tree, serialize within a per-page queue, and commit only against the generation they refreshed. A competing commit rejects the operation and reloads the current tree. Acknowledged writes cannot silently replace unrelated concurrent changes. The caller receives its existing error shape and can retry. Blob preparation occurs inside the queue; background refresh is deferred until the operation finishes. Notifications improve freshness but grant no write authority.

Every persisted entry has an opaque revision. An unrelated file save preserves it. Resource writes compare the captured file revision and merge into the latest root within one transaction. Deleted or recreated files do not inherit an old revision. Identical text can retain its revision. Revision metadata does not count toward the existing 2 MiB user quota. Failed transactions leave the authoritative root unchanged.

`pcSiteFs.contentResources` implements the experimental version 1 read/write contract for existing text files under canonical guest `~/` paths. Server mounts and virtual settings are refused because their backends do not yet implement this contract. It does not create resources or implement Save As. The ordinary legacy filesystem still supports those operations.

This capability is not yet supplied as `pudlHost.contentResources` to installed applets. Their recovered drafts do not yet carry original resource revisions. The legacy document save path therefore retains its previous document-level concurrency limitations, even though bulk filesystem operations now have a transactional commit boundary. Enabling the resource capability requires baseline-aware recovery and per-document save integration.

## Migration and rollback

The first guest load imports the old file record and copies its referenced binary data into the new database. The root and copied binaries commit together. Invalid JSON, invalid paths, incomplete pictures or failed database writes prevent migration; the source remains available. Concurrent initializers accept the first committed root. If an older tab changes its source during or after migration, the new authority retains its imported snapshot while the changed legacy record remains separately available.

The migration never modifies the old localStorage record or the old `yavc-home-blobs` database. Older tabs cannot overwrite the new root or delete its pictures. The new filesystem detects a changed legacy record on startup and storage notifications, displays a PUDL warning, and offers a download of both file records. That JSON download contains file metadata and text; it is not a binary backup. The browser retains the binary stores.

Deleting or replacing a binary entry first commits the new root. Cleanup checks current and retained migration references in a transaction before deleting bytes. A failed metadata save cannot delete a referenced picture. Original migration pictures remain available for recovery even if their current entries are removed.

An older release continues to read its retained old stores. It will not see edits made in the new authority. Before reverting, close other editing tabs and export changed files, including pictures, through the current Files app. Keep the new database intact for recovery. A container rollback alone does not transfer newer browser-local edits to an older storage implementation. Installation must call out this boundary; this implementation does not silently mirror or merge divergent trees.

Guest storage remains origin-specific. This change creates neither cross-subdomain sharing nor a server copy. Administrator mounts and session-backed settings retain their existing backends.

## Verification

`node scripts/test-home-store.cjs` runs the real VFS and IndexedDB implementation in fresh Chromium, Firefox and WebKit contexts. It checks migration with pictures, stale file revisions, competing root commits, acknowledged concurrent writes, per-page mutation queues, Terminal's queued touch operation, stable unrelated revisions, path and settings rejection, binary cleanup, legacy divergence, reload, malformed sources and near-limit migration. The fixture serves synthetic site metadata and never opens the installed user's files.

`node scripts/test-vfs-consumers.cjs` runs actual Terminal touch commands and Editor, Slides and Diagrams save/reload operations against a disposable site server. It checks the visible PUDL warning and file-record download in all three engines. The server port is supplied through `YAVC_CHROME_TEST_PORT`. The normal repository gate also runs before commit. Existing shared toolbar and content UI fixtures cover desktop and standalone consumers.
