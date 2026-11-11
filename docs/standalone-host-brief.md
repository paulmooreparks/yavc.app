# A standalone host for Editor: what yavc.app already provides

Paul decided on 2026-11-11, in the GKC Collaboration group, that Editor, Docs, Slides and Diagrams should also be installable programs, with Editor proved first. He also decided that a standalone program has one document in each window and one window for each document. The host is Dinah Team Lead's to design and build. This page tells that work what the yavc.app content package already gives it, so the host is a third implementation of written contracts and needs no copy of any editor. It defines nothing new. Where it and a contract disagree, the contract is right and this page needs correcting.

## The starting point

`scripts/fixtures/portable-workspace` is a complete host in one page: `index.html` loads PUDL and the support scripts, and `host.js` builds `pudlHost` with `pudlHostKit.host` and installs the applets from the package with `pudlHostKit.install`. It keeps its documents in memory. The release tests run Editor, Docs and Slides in it in Chromium, Firefox and WebKit, with a content security policy that allows nothing from outside the package. A standalone host can begin as that page with its in-memory services replaced by real ones.

The package is the release archive (`docs/content-release-downloads.md`). Editor, Docs and Slides share the editing kit and the engine inside it, so the four programs should sit on one pinned release, as Dinah and GK Companion do, and not on four copies that are updated apart.

## What Editor asks of its host

Every service is optional to the applet, which says what it cannot do when one is missing. The proof needs the first four.

| Service | What the host does | Contract |
| --- | --- | --- |
| `pudlHost.contentResources` | Reads a document, and saves it against the revision the save was based on. A save based on an older revision is refused as a conflict, and the applet then keeps the person's edits and says so. `saveAs` and `create` choose a new place, and `needsLocation` marks a document that has none yet. | `content-resource-contract.md`, `content-creation-contract.md` |
| `pudlHost.snapshot` version 2 | Keeps the unsaved draft of each window and gives it back after a crash or a restart. | `content-recovery-contract.md` |
| `pudlHost.documentWindows` | Returns `single` from `mode`, opens a new window for New and Open, and raises the window that already shows a document. This is the one document for each window rule, and the applets already follow it on yavc.app. | `document-window-contract.md` |
| `pudlHost.config` | Loads and stores the person's settings for the application. | `content-workspace-contract.md` |
| `pudlHost.fs.readText` and `onChange` | Reads a file a document refers to, such as a saved diagram, and reports changes to it. | `content-workspace-contract.md` |
| `pudlHost.contentWorkspace` | Gives a document's folder, resolves its pictures to addresses on the host's origin, and may offer shortcodes of the host's own. | `content-workspace-contract.md`, `document-host-overlays-contract.md`, `host-shortcodes-contract.md` |
| `pudlHost.contentBytes` | Reads a file's bytes so that the applet can detect its encoding and keep it on save. | `text-bytes-contract.md`, `encoded-resources-contract.md` |
| `pudlHost.fileResolution` | Decides which application opens a file, from the package's catalogue of file kinds. A desktop host maps this to file associations and Open With. | `file-resolution-contract.md`, `file-associations.md` |
| `pudlHost.commandToolbar` | Stores the person's toolbar arrangement. | `command-toolbar-design.md` |

Docs adds Office import and export, which run in the page and need nothing more. Slides adds `pudlHost.presentation` for the presenter view and a show in another window (`presentation-contract.md`). Diagrams uses the same resource, recovery, window and picture services as Editor.

## Agents

Each applet publishes its actions with their input schemas in its `actions.json`, and the page runs them through `pudlActions`. An action that returns file content declares `files.read`, so the host is asked before an agent reads through it (`agents-design.md`). A connection from another program, with its sign-in and its naming of the application and the document a call is for, is the host's to build. The applets need no change for it.

## What would be a finding

The proof should need no change to an applet. If it needs one, that is a gap in a contract, and it should be reported to yavc.app and fixed there in a release, as the slide show window was.

## The host's acceptance test

A host is ready to take the applets when the package's own tests pass against it, or against a build of it that stands in for its services. `scripts/test-portable-workspace.cjs` is the one for Editor, Docs and Slides, and `scripts/test-portable-diagrams.cjs` is the one for Diagrams. They say what each proves and what it leaves to the receiving host.

Dinah's standalone document host has a test of its own here, `scripts/test-standalone-editor.cjs`, since its page is not the fixture's. It is given the host's executable, starts the document service headless in a folder made for the run, and opens the pages in Chromium, Firefox and WebKit. It uses the service's control interface to open documents, to read which windows the service would have started, to say what the system's dialogs choose, and to close a window as its process does. It proves saving, a refused stale save, Save As, the routing of New and Open, drafts kept across reload and close, an agent's action behind the person's leave, attribute blocks kept through a rich edit, and a picture at a site path found once a web root is chosen. A real window, the system's own dialogs and file association are the host's to show.
