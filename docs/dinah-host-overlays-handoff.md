# Dinah document asset and suggestion adapter

The applets now expose the optional services described in [the host overlay contract](document-host-overlays-contract.md). Dinah keeps its draft files, proposal store and review panel. The applets supply rendered image resolution and source-free suggestion decorations. This change does not install or alter Dinah's maintained application.

## Resolve draft images

Add `resources` under Dinah's existing `pudlHost.contentWorkspace` object. Its `resolve` method receives the same opaque resource used by `contentResources`, the authored reference, and `kind:'image'`. The existing query route works; a new base-URL route is unnecessary.

```js
resources: {
  async resolve({resource, href}, context) {
    const draft = dinahContentHost.draftOf(resource);
    if (!draft || !context.current()) return null;
    return {url: '/draft-file?' + new URLSearchParams({draft, name: href})};
  }
}
```

The native endpoint must retain its filename, draft ownership and allowed-root validation. The client only accepts same-origin HTTP/HTTPS results. The applets retain `shot.png` in source and the rich model. No package-directory fallback occurs for relative images. The host owns URL lifetime and cache policy. Other attachment-link navigation remains with Dinah; this service currently resolves pictures.

Docs can embed host-served raster pictures during Word/PDF export under the contract's existing image budgets and a bounded, no-redirect fetch. SVG export remains unsupported. Existing web/data image display and yavc VFS loading retain their separate rules.

## Publish proposal placements

Add `suggestions.subscribe(resource, callback, context)` and `suggestions.decide(request, context)` to that same workspace object. Subscribe returns its cleanup function synchronously. Publish the current native draft as `{revision, text, items}`; including `text` avoids ambiguity when the draft revision has advanced since the applet's last resource acknowledgement.

Convert Dinah's placed spans into each item's `start` and `end`. Copy the remaining proposal fields described by the contract, including `before`, `after`, `author`, `reason`, `group`, `stale` and `edited`. Keep unplaced proposals in Dinah's list instead of inventing offsets. Both boundaries count UTF-16 in the exact supplied text, including its original line endings. The applets handle CodeMirror's newline normalization internally.

The source view marks the exact span. The rich view highlights its blocks and shows the exact removal and replacement in a card. Local edits map these placements until the next native snapshot. Touching a range makes its local placement stale and disables Accept. Next/Previous Host Suggestion commands retain a rich view when its card is available.

## Handle decisions through the existing draft owner

The request identifies the resource, proposal and revision, supplies the visible source and mapped range, and includes `after` when the user edited the inline replacement. Use `context.host` to identify the owning content window. The adapter must flush or reconcile that window through its existing draft path, validate the captured request against the native revision, and refuse a stale decision. It must not borrow a newer revision merely to make an old request succeed. Publish fresh placements after reconciliation so the person can decide against the new revision.

Dinah then owns Accept or Reject and its native proposal record. The applet does not apply text returned by the decision callback. Deliver accepted source through the existing resource refresh/remount path and publish the updated proposal list. Per-item pending state prevents repeated requests. A callback captured in another window/resource, or before disposal, cannot acknowledge a replacement owner.

Inline Edit holds temporary replacement wording until the decision request; it does not write annotation syntax. The native panel remains the durable list, editor and group Accept All/Reject All interface. The persisted Markdown `review-*` actions continue to describe authored review annotations and must not be used as a substitute for these native proposals.

## Verification boundary

The dedicated portable-host proof serves synthetic files under an unrelated asset prefix and exercises all supported drawn image modes, raster export, decision ownership, host refresh, local position mapping, stale placement, disposal and duplicate/late decisions. It also checks keyboard operation, light/dark and narrow layouts, hostile document styles, and typing stability before a page break while a suggestion is present. The ordinary portable suites remain independent regression gates.

Dinah still needs to wire these services into its production adapter and run its own receiving-window acceptance with the real draft-file endpoint and proposal store. The producer's fixture does not establish that those native hooks are installed.
