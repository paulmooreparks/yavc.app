# Resource creation and Save As

The experimental resource capability keeps its version 1 read/write operations and adds optional `create` and `saveAs` operations. Hosts without either operation remain usable for existing resources. Applets inspect capability availability before offering the corresponding commands. These operations remain a yavc-owned extension pending shared-host coordination.

## Explicit creation

`create({resource, text})` creates a resource at a destination understood by that host. It must atomically require that the destination does not exist. It never replaces an existing file, including when a competing writer creates it after the request starts. The host rechecks destination scope and creation permission at execution. A successful acknowledgement contains the same resource identity, a revision and writable status; it can also supply a display `name`. The acknowledgement represents the exact submitted text.

This operation supports explicitly granted agent destinations and hosts that already know a new resource address. An applet cannot derive a native resource identity from an arbitrary path convention. A host that allocates identities through its picker can omit explicit creation and supply Save As instead.

## Host-owned Save As

`saveAs({name, sourceResource, text}, context)` owns destination selection and commit as one operation. The name and source resource are suggestions, not write authority. The optional context supplies the applet's dialog host element; native hosts may use their own UI. Context is not persisted and cannot confer a file grant. Cancellation resolves to null and does not change the applet's binding. Success returns `{resource, revision, name, writable}`, acknowledging the host-selected destination and the exact captured text.

The host obtains explicit confirmation before replacing an existing destination. It captures that destination's revision and compares it at the storage authority when committing. A changed destination requires a fresh choice and confirmation. A new destination requires atomic absence. The source resource's revision is never substituted for the destination revision.

The yavc adapter uses the existing PUDL file picker and guest VFS. Conditional picker choices contain `expectedRevision`, or null for an absent destination. A changed existing revision requires another Replace confirmation. The commit remains inside the picker, so an error stays beside the failed control and the person can choose again. Server mounts, virtual settings and non-text replacement targets are refused until their backend supports the same contract. Computer downloads remain a separate export command.

The prepared adapter is available under the yavc-owned `pudlHost.contentResourceAdapter` extension. Diagrams now selects it for guest storage when snapshot service version 2 is available, as described in `diagram-resource-adoption.md`. Editor and Slides retain their legacy document writers. PUDL's documented `services` field remains a table of named service URLs. The other applet adapters still gate the complete Docs/Editor split and cross-applet conditional persistence.

## Applet acknowledgement

The resource client captures text and suggested metadata before awaiting the host. It accepts a new binding only from an acknowledged host response. Diagrams advances its resource snapshot, name and saved baseline after that acknowledgement, and leaves later edits dirty. A failed or cancelled copy retains the old binding and recovery metadata. Display names survive recovery independently of writable snapshots, including when the file is unavailable or its revision changed.

The applet passes its lifetime AbortSignal in the optional context. Disposal before adapter loading or during selection prevents a later picker and closes any pending one. The VFS checks that signal inside the transaction before mutating the destination. A transaction that has already accepted its mutation can finish and remains host-owned; disposal cannot bind its acknowledgement to a replacement tab. An abort is not a promise to undo an accepted write.

Save can open Save As for an unbound draft when that capability exists. A conflicted recovered draft can use Save As to preserve a copy while retaining protection on its original file. Agent Save to a different explicit destination uses create-only semantics and refuses an existing destination. Display names are separate from opaque resource identities; ordinary saves preserve a name when the host omits unchanged metadata.
