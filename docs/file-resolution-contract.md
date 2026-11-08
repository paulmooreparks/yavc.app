# File resolution foundation

The pure resolver and version 2 content catalog implement the opening policy from `content-applications-design.md`. The host now uses these plans for Files dispatch. The `pudlHost.fileResolution.resolve(request)` extension returns a plan or an explanation; it never opens an applet, reads a resource, starts a presentation or runs a command. This is a yavc-owned host extension, not a new PUDL manifest field.

## Catalog and preferences

`internal/web/static/content-handlers.json` records native text/container types, their filename matches, handler operations, supported intents/views and shipped associations. Source-capable Editor operations are declared separately from Docs, Slides and Diagrams native operations. The catalog currently covers the content handlers needed for the split. It is not yet a complete catalog of every site's viewer, importer or domain request. Docs is registered independently of Editor. Existing Slides presentation naming does not start a show as a side effect of planning.

The host reads `file-associations` through the established configuration service, exposed as `~/.config/file-associations.json`. Version 1 preferences contain a bounded `rules` array. Each rule has a stable `id`, one `match` containing `suffix`, exact `name` or `mime`, and a registered `type`, `applet`, `operation` and `view`. Preferences cannot add executable URLs, scripts, arbitrary operations or undeclared views. Unknown versions, duplicate case-insensitive matches and invalid capabilities are rejected. The host retains the last valid preferences in the current page and returns a `preferenceError` beside the result. With no valid page-local predecessor, it uses the shipped defaults. It does not rewrite the invalid saved configuration.

Native identification is independent of handler preferences. A broad `.md` override can choose Editor for a deck, but cannot reinterpret `.slides.md` as ordinary document prose. Compound suffixes use the longest match, exact filenames precede suffixes within a preference tier, and user filename preferences precede shipped routing choices. Filename matches precede MIME-only matches, including user MIME preferences. MIME is an untrusted hint; it never proves that source is decodable.

## Requests and results

The request contains a display `name`, optional `mime`, `intent`, explicit `applet`/`view`, optional `verifiedText`, and the host's current `readable`/`writable` flags. The pure API additionally accepts the installed applet IDs and validated preferences. It contains no resource address or content, so it cannot transport a file between origins or confer a file grant.

Resolution returns `resolved`, `choice`, `unsupported` or `access-denied`. Only `resolved` has a selected `plan`. A plan identifies the applet, operation, request kind, view, supported views, native type, winning rule, required text/byte read and read-only state. An explicit unsupported applet/view returns an explanation and available alternatives, without silently choosing one. A missing preferred package leaves its types unresolved with available alternatives. Package availability comes from the installed applet catalog.

Unknown verified text can select Editor without a predicted suffix or language provider. Unverified unknown data has no text fallback. Known binary container types cannot become source content because a generic MIME value says text. A text plan created from a known filename still requires a validated text read before execution. Resource access, parser success and write authority remain the host's responsibility.

## Execution and remaining integration

Version 2 adds validated `dispatch.command` identifiers to trusted catalog handlers. Version 1 catalogs remain valid for planning. `pudlHost.fileResolution.open({resource,applet?,view?}, context)` revalidates the file through the host VFS, resolves defaults or an explicit choice, waits for the documented PUDL window and applet readiness contracts, then invokes the declared command against the returned mount. Standalone hosts use their distinct request verbs on the same origin. Default opening never starts a presentation or a command.

Files uses this execution service. Its explicit Edit command chooses Editor. Docs and Editor use it for guarded saved-resource handoff. File Associations settings UI and a general Open With chooser remain follow-up work; the validated JSON preference file already controls these choices. Unsupported binary or unverified unknown resources retain the existing safe preview/download policy. No browser subdomain handoff or second resource store is introduced.
