# Document grouping in editing hosts

Editor, Docs, Slides and Diagrams accept an optional `pudlHost.documentWindows` version 1 capability. A host that omits it retains tabbed workspaces. The applet owns document contents, editing and saving; the host owns document-window allocation and destination reuse.

## Host operations

| Operation | Contract |
| --- | --- |
| `mode(root)` | Returns `single` or `tabbed` for this mount. |
| `bind(root, api)` | Registers the receiving mount and returns an unsubscribe function. The API supplies `application`, `resource()`, async `accept(request)` and synchronous `flush()`. |
| `open(root, application, request)` | Opens or raises a receiving window and returns the accepted operation's result. A request contains an operation and its input, or an opaque recovery snapshot. Failure rejects without releasing the source document. |
| `split(root, application, snapshot)` | Transfers every nonactive document into independently recoverable windows. It returns acknowledged source indexes in `moved` and an optional error. The source releases only those indexes. |

The receiving mount's `accept` handler suppresses further routing while it consumes a request. The host waits for applet readiness and then requires `flush()` to acknowledge recovery. Its window keys and resource identifiers remain host-owned. A native desktop host can implement these operations without PUDL window markup. It must provide equivalent protection against source edits or closure during migration, and it must acknowledge durable recovery before a source document is released.

The yavc host additionally exposes `initial(root)` to its snapshot adapter. A newly allocated window receives either its transferred snapshot or an explicit empty recovery seed. This prevents an old snapshot for a reused window key from leaking into a new document. The snapshot validator runs before the seed is adopted.

## yavc.app policy

The engine defaults to `-document-grouping single`. The deployment option `-document-grouping tabbed` retains multiple documents in each editing window. This policy is not an editing-mode control. Standalone applet pages use tabs, as they have no receiving document-window host.

New, Open, file navigation, uploaded source, agent creation and imported slide decks use the same routing boundary. An untouched blank document can be reused. Opening a saved resource already displayed by the same application raises its existing window. Unsaved text and named new resources open independently. Each window keeps its own source, selected view, Undo state and recovery snapshot.

PUDL currently supports nine numbered instances per application. The host refuses a tenth window with an actionable error. Existing recovery tabs that cannot migrate remain together and show a recovery warning. They are never discarded to satisfy the layout policy. Closing a window frees a slot; reloading retries the remaining migration.

During recovery migration, the source window is inert and its close operation is cancelled. A failed transfer retains its source tab. Successful transfers carry the document's recovery metadata and view, and the source removes its copy only after the receiving window acknowledges recovery. Ordinary per-document save and unsaved-close behavior remain unchanged.

## Verification

The document-grouping browser fixture covers pending rich edits followed immediately by New, individual Document/Visual/Preview restoration, tab activation after reload, held child-window startup, source-close cancellation during migration, migration/reload and single-window creation in all four apps. It also exercises a real configured keyboard New shortcut. The module tests cover capacity failure and refused recovery acknowledgement. Portable-host verification checks the capability-absent tabbed path separately.
