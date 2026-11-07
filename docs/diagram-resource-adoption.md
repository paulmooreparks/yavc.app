# Diagrams resource adoption

Diagrams uses the prepared resource adapter on guest yavc origins when snapshot service version 2 and the guest authority are available. Explicit resource hosts remain authoritative in other embeddings. Administrator mounts keep the existing file adapter until their backend provides conditional writes. A resource snapshot cannot be restored through that legacy adapter as an ordinary writable path.

Guest files use their VFS revisions, including existing absolute-path aliases. Public site files and virtual settings can be read as immutable resources with content-derived revision tokens. They remain read-only through this adapter. Guest creation and Save As keep the destination checks from decision 64. No browser or native filesystem access moves into the applet.

## Read-only behavior

A loaded read-only resource cannot change through source input, completion, formatting, history, drawing gestures, shape commands, Inspector fields or mutating agent actions. Source transactions are filtered and CodeMirror reports its read-only state. Drawing views retain selection, navigation, zoom, pan and export while omitting resize and connector grips. Save As can create an editable copy; its acknowledgement refreshes the source and drawing controls.

An unbound scratch document remains editable. A recovered conflict without a matching writable baseline also remains available as a draft, with Save disabled and Save As offered. That recovery state does not acquire permission to overwrite its original resource.

Asynchronous edit and format results are applied only to the same live tab and unchanged source. Copy acknowledgement remains scoped to the originating tab. Host permission and revision checks still run when persistence executes.

## Incremental adoption

This batch enables the resource path for Diagrams only. Editor and Slides still have legacy document writers, so this is not a claim of cross-applet stale-save protection. Existing Terminal and Files operations also retain their explicit filesystem semantics. The Docs/Editor split remains gated on the other document adapters, file routing and source-preservation work. Older open applet versions retain their previous behavior and should be reloaded after installation.

The per-applet adoption makes conditional saves and safe recovery available now without changing other applications' backends. The host remains the single VFS authority. Complete extraction/reintegration and actual receiving-webview acceptance remain separate gates.
