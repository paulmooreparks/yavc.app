# Editor and Slides resource adoption

Editor and Slides select the same prepared guest resource adapter as Diagrams. An explicitly supplied resource host takes precedence. Selection requires snapshot service version 2 and synchronous recovery-write acknowledgement. Administrator mounts retain the legacy filesystem adapter, which refuses version 2 resource snapshots before registration. The shared `content-kit/resource-session.js` module handles capability selection and validation of the two legacy recovery shapes.

## Saving and recovery

Each open resource keeps its host-issued revision. Saves synchronize the owning rich surface, capture the submitted source, and serialize persistence per tab. A queued save uses the preceding acknowledged revision. Another window's changed revision rejects the write and leaves the draft available. Explicit saves to another destination require atomic absence. Save As remains a host-owned selection and commit operation, including replacement revision checks and cancellation.

Only the originating live tab accepts a save acknowledgement. Newer text remains dirty, and a late completion cannot bind a reopened file. Write permission in the acknowledgement refreshes source and rendered controls. The applet lifetime signal cancels an outstanding Save As picker; cancellation does not undo a host transaction already accepted by storage.

A pending rich draft drains before a revoked permission locks the surface. If that local synchronization fails, the successful host acknowledgement still advances the resource baseline. The rich draft stays available for copying, a revoked surface freezes, and leaving prompts while pending rich content cannot be represented in the source snapshot. The applet does not claim that saving an earlier submission also saved those newer edits.

Recovery retains the original baseline rather than taking a newly read revision for an old draft. Matching drafts can save. Stale, unavailable and unversioned drafts retain their source and offer Save As while refusing an ordinary overwrite. Clean Editor snapshots restore history only when their stored source fingerprint still matches the file. A changed clean file opens with fresh history.

Resource-mode Editor uses host snapshots for new recovery writes. Its old local session and work records are retained as migration inputs, and the adapter validates their draft and waiting-record limits before using them. Reload protection requires `snapshot.flush()` to acknowledge storage. Closing an Editor or Slides window still prompts for unsaved work because closing the window can discard its snapshot.

## Immutable resources

Editor retains its existing read-only views and adds a source transaction filter. Slides displays immutable resources without enabling the rich editing surface. Source typing, completion, history, replace, slide/deck changes, formatting and mutating agent actions cannot modify them. Selection, keyboard focus, find, copying, view changes, presentation and export remain available. Save As can create an editable copy without changing the original file.

Permissions apply to resource source. Dependency editing remains a separate host-granted operation. This batch does not add an attachment resolver or change the authority over stylesheet, image, shortcode or diagram dependencies.

## Remaining work

All three guest content applications now submit document writes through the same revision authority when they share an origin. Browser guest homes still belong to their existing origins; this does not merge storage between applet subdomains. Terminal and Files retain their explicit filesystem operations. Older open applet versions must be reloaded before their writes gain the new behavior.

This batch does not create the separate Docs package, implement configurable file associations, finish the source-preservation audit or extract Editor and Slides into release artifacts. Those steps remain part of the agreed extraction and reintegration effort. An unrelated browser host proof for Diagrams also remains distinct from acceptance in a receiving application's actual webview.
