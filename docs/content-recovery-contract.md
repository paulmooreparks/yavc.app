# Resource recovery contract

The resource client and the snapshot service remain separate host capabilities. Recovery stores an original revision alongside unsaved text; it does not create another file authority. The shared recovery helper has no persistence or filesystem access of its own.

## Restoring a draft

A version 2 Diagrams snapshot contains its tab state and, for each bound resource, a version 1 baseline with `resource` and `revision`. It retains draft text for dirty tabs and unbound drafts. A clean bound tab can read its current contents again. Baselines come from snapshots issued by the same resource client; the public `baseline()` helper refuses arbitrary copied objects.

The helper validates identities, versions, text size and tab count before snapshot registration. A saved baseline must name its tab's resource. The payload supports at most 512 tabs, 4 MiB of text per draft and 8 MiB across draft texts. These are input bounds, not a promise of browser storage capacity. Capture validates the same bounds before writing, so the service cannot acknowledge a payload it would refuse to restore.

On restore, a dirty draft can obtain an issued resource snapshot only when a fresh host read returns the original revision. Its later save still performs the host's conditional comparison. If the file changed, the draft retains its original baseline and text without obtaining a writable snapshot. A failed read also retains both, allowing another recovery attempt. An older dirty snapshot without a baseline keeps its text but cannot borrow the current file's revision. Clean tabs reread the current resource normally.

Diagrams displays a warning for those recovered conflicts, disables Save with a reason, and retains source download. Reopening or discarding the draft remains an explicit user action. A host can now supply the optional Save As operation in `content-creation-contract.md`; conflicted drafts can preserve a copy through it. Hosts without that operation direct the person to source download. Guest Diagrams now adopts that capability with the read-only command policy described in `diagram-resource-adoption.md`. The other document adapters remain a gate for the complete Docs/Editor split and cross-applet conditional persistence.

Revision tokens must not identify different text states of one resource. Resource identities remain scoped to the host authority and workspace, and the host rechecks write permission at execution. Recovery metadata does not confer access or replace conditional writes.

## Snapshot service version 2

The yavc-owned snapshot extension reports `version: 2`. Existing `join(root, take)` callers remain supported. A resource-aware caller uses `join(root, take, {validate})`; its synchronous validator runs before any provider is registered or another snapshot key is removed. Unsupported payloads therefore retain their previous stored copies and cannot be replaced by an empty startup snapshot.

Joining selects the newest applicable snapshot but retains alternate keys until a replacement write succeeds. Disposal or startup failure before that write leaves the original copy available. A failed replacement also retains it. Cleanup happens only after the destination acknowledges storage. Resource-aware startup returns the original kept value while it is still restoring, so a background snapshot cannot capture a half-restored workspace.

The returned handle adds synchronous `flush()`, which reports whether the latest value was stored. Serialization and quota failures return false and preserve the previous stored snapshot. A failed snapshot remains dirty for a later attempt. A left handle cannot flush. Diagrams' reload guard calls this acknowledgement before claiming unsaved work is retained; a failed flush keeps the normal browser unsaved-work warning available.

This is a yavc host extension, not a claim that PUDL publishes this recovery contract. Another host must implement the documented version before combining recovery with the experimental resource capability. Legacy snapshot implementations are refused before registration. Production Editor/Docs/Slides recovery adapters and migration remain separate work.

## Verification

The content-kit tests cover original baselines, matching and stale revisions, legacy drafts, unavailable resources, invalid payloads, registration ordering, failed writes and snapshot-key migration. The independent Diagrams artifact runs matching, stale and legacy recovery against a disposable host with synthetic files, real browser storage and actual source editing. It checks quota refusal and preservation of unsupported future snapshots without using the yavc server or guest VFS.
