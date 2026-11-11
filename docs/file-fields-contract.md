# File fields in dialogs

File fields retain editable paths and offer Browse beside the input. The host owns browsing and importing so an embedded applet does not acquire a second file authority. The shared dialog implementation wires these fields through an optional yavc host extension.

## Host capability

`pudlHost.fileFields` reports `version: 1` and exposes the asynchronous method `choose(request)`. This extension is owned by yavc and is not a published PUDL capability. Callers must invoke the method on its capability object. An absent or unsupported capability disables Browse with an explanation while direct path entry remains available.

The request accepts `kind` (`file` or `folder`), `title`, `start`, `accept`, `maxBytes`, `signal`, `current` and `host`. `accept` is an extension list or a comma-separated extension string. `maxBytes` is an optional positive safe integer limiting computer imports for that field. The host also enforces its 8 MiB import ceiling. Stylesheets, shared definitions and code listings specify their existing 256 KiB consumer limit. Selecting an existing VFS file does not bypass the consumer's normal read limits or validation.

`signal` cancels the owning operation. The optional synchronous `current()` callback reports whether the originating document and selection remain applicable. `host` identifies the owning applet root for nested dialog placement. A successful choice returns a canonical VFS path. Cancellation or an obsolete owner returns null. Errors appear beside the failed picker control.

## What is written into the field

The host returns a canonical path, and the applet decides how the document writes it. A document's files travel with it when they are given from its own folder: a host that saves a document somewhere else, or publishes it, gathers those and cannot gather a file given by a full path, which means nothing in another place. So where the dialog knows the document's folder (`base` in the options to `wirePaths`), a chosen file that shares a folder with the document at any depth is written from the document's folder, with `..` where the path has to go up. `/workspaces/W/Files/shared/codes.md` chosen for a document in `/workspaces/W/Files/notes` is written as `../shared/codes.md`. A file that shares only the root with the document, such as `~/Pictures/shot.png` for a document in `~/Documents`, keeps its full path, and so does every file chosen for a document that has no folder yet. `yavcDialog.referenceFrom(path, base)` is the rule. The picture dialog, the forms for a diagram and a code listing, the shared definitions file and the shared stylesheet all pass the document's folder.

## Selection and import

File browsing lists the VFS and offers From Your Computer. A computer selection opens a separate Import destination picker. Import creates a durable file through the host VFS and refuses an existing name. The person must choose another name instead of replacing another document's dependency. Cancelling the parent dialog does not delete a file whose import already committed.

The host checks cancellation and ownership before preparation, after asynchronous text or binary reads, and after binary preparation before linking the file into the tree. Cancellation before commit leaves no new file. Once the transactional commit has begun, it may finish, but a disposed or changed owner cannot adopt its returned path.

Folder browsing offers directories and a directly editable folder path. It does not offer computer uploads because a local computer directory cannot become a durable VFS folder reference through this capability.

## Shared controls

`yavcDialog.pathField(options)` renders the labeled input and Browse control. `wirePaths(api, options)` binds fields within a dialog and cancels nested work when the dialog closes. Shared text dialogs accept `browse`, `accept` and `maxBytes` as convenience options. Callers still validate the final path and capture their originating resource before awaiting the dialog.

The browser suites exercise computer import, duplicate refusal, cancellation during reads, stale owners and narrow layouts. Native operating-system picker internals and hardware permissions remain platform acceptance checks.
