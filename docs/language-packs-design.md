# Syntax highlighting and language servers for each file type

This is a proposal. Paul asked on 12 November 2026 how the Editor and Docs can gain syntax highlighting and language server support one file type at a time, since no release can include every language and no person needs them all. He approved writing the design. Nothing here is built. The sections marked for the host are Dinah Team Lead's to confirm or correct before Paul decides.

## What exists today

The Editor highlights Markdown, JSON, CSS, HTML and shell scripts. Every other file is plain text. The Editor and Diagrams share one language server client, the official CodeMirror one, and it talks to servers for JSON, CSS and HTML that run in a browser worker (`docs/language-services-design.md`, DESIGN.md decisions 36 and 91). A server sees only the open document under an opaque address. It has no access to other files and no network.

That boundary is the base for everything below. The client, the worker transport, the revision checks and the size limits stay as they are.

## The proposal in short

Highlighting and language servers are different problems, and I propose to treat them differently.

1. **Highlighting for the common languages comes with the applets, and each grammar loads when a file needs it.** Nobody installs anything. A person who never opens a Go file never loads the Go grammar.
2. **A language server is an installable pack.** Servers are large, some need a program on the machine, and a native one runs code against the person's files. Those are the things that deserve an install step and a question.

This differs from the sketch I gave in the group on 12 November, where a pack held both a grammar and a server and was installed on first use. Measuring the grammars comes first, but I expect all of them together to be small enough that an install step for colours alone would be friction with no benefit.

## Decisions proposed

### 1. Grammars are the official CodeMirror ones, built here

CodeMirror publishes maintained language packages for about twenty languages, among them JavaScript and TypeScript, Python, Go, Rust, Java, C and C++, PHP, SQL, XML and YAML. Its legacy modes package covers over a hundred more, C# among them. Both are documented and supported by CodeMirror's author. I would use those and write no grammar of our own.

A CodeMirror language has to run against the same copy of CodeMirror as the editor it colours. The applets load CodeMirror as one self-contained script, so a grammar cannot be an independent download that brings its own copy. The build would therefore produce one small script for each language, compiled against the CodeMirror the applets already have, and each script registers its language when it loads. A grammar built for one CodeMirror bundle refuses to load into another, and the build records which bundle each was made for.

Grammars are code that runs in the page with the applet's authority. For that reason they are built and hashed in this repository like the rest of the applets, and a document or an agent cannot supply one.

### 2. One table says which language a file is

A table in the package gives each language an identifier, a display name, its file extensions and file names (`Dockerfile`, `Makefile`), the names it goes by in a Markdown code fence, and the script that holds its grammar. The Editor looks a file up by name. The status bar already shows Plain Text for an unknown file; it would show the language, and clicking it would let a person choose another for that file.

A host can add rows for file types of its own, by the same bounded and validated route it uses to add shortcodes today.

### 3. Docs uses the same grammars for code fences in its source views

In Text and Split, a fenced block that says `go` is coloured with the Go grammar, loaded when the first such block appears. CodeMirror's Markdown package documents this.

The rendered page and Preview are coloured by PUDL's code highlighter, which is a different engine with its own list of languages. This proposal leaves that alone. Aligning the two lists is a question for PUDL Team Lead and is listed under open questions.

### 4. A language server pack is a folder with a manifest

A pack contains a manifest and, for a server that runs in the browser, the server's script. The manifest gives:

- the pack's identifier, name, version and licence
- the languages it serves, by the identifiers of the table in decision 2
- which features it offers, from the set the client supports: completion, hover, diagnostics and formatting today
- the kind of server, `worker` or `process`
- for a worker, the script and its hash
- for a process, the program it expects to find and the arguments, with no binary inside the pack

Packs for servers are separate release assets, not part of the content package, so the package does not grow with them.

### 5. A worker server runs anywhere, with the limits servers have today

A server written in JavaScript or WebAssembly runs in a browser worker and speaks the same protocol over the same transport as the JSON server. It works on yavc.app, in Dinah and in GK Companion. It sees the open document only, as today. That is enough for completion, hover and syntax diagnostics within a file, and not enough for anything that needs the rest of a project.

Which servers can run this way has to be verified one by one before any is promised. TypeScript's own language service and the YAML language server are the likely first candidates.

### 6. A native server belongs to the host (for Dinah Team Lead to confirm)

A server such as gopls, rust-analyzer or a C# server is a program on the machine. Only Dinah and GK Companion can run one. The applet would ask an optional host service for a connection and get back a message channel that carries the language server protocol. Everything else is the host's:

- **Starting and stopping.** The host starts the program, restarts it a bounded number of times if it crashes, and stops it when no document uses it.
- **Where the program comes from.** The host uses a program the person has installed. It does not download one silently.
- **Consent.** A native server reads the whole project and, in several ecosystems, runs the project's own build code. Starting one is therefore the same kind of trust as running the project. The host asks the person once for each workspace and server, remembers the answer, and lets it be withdrawn in Settings. An agent cannot give this consent.
- **Addresses.** The applets give a document an opaque address and never a path. A native server needs real file addresses, because it reads the disk itself. The host translates between the two at its edge, so the applets' rule does not change.
- **Documents that are not files.** A Confluence page or an unsaved document has no place on disk, so it gets a worker server or none.

On yavc.app this service is absent, and a pack of kind `process` is shown as needing the desktop application.

### 7. Installing a pack is the host's, and yavc.app serves its own

In Dinah and GK Companion a server pack is one more kind of installable package, under the permission model those hosts already have. The applet asks the host which packs are installed and is told when that changes. When a person opens a file whose language has an available pack that is not installed, the Editor says so once in its status bar, with a button that asks the host to install it. It never installs on its own.

On yavc.app the site offers the worker packs it was built with, and "installed" means the person has turned one on.

### 8. More protocol features come after the first servers work

Go to definition, find references, rename and edits across several files are outside the client's current set. Rename and multi-file edits change documents that may not be open, which has to go through the host's save authority. Those wait for a second round, after a real project-aware server is running and the need is concrete.

## Order of work

1. The language table, grammars built from the official packages, loading on demand, and the language shown in the status bar. This needs nothing from a host and helps every file type at once.
2. Code fences in Docs' source views.
3. The pack manifest and one worker server as proof, with the install flow in one host.
4. The host service for native servers, with one server as proof. Go is a natural first, since Paul works in it.
5. The wider protocol features.

Steps 1 and 2 are yavc.app's alone. Steps 3 and 4 need a host contract written with Dinah Team Lead before any code.

## Open questions for Paul

1. Do you agree that highlighting should simply come with the applets, loaded on demand, with install reserved for servers? The alternative is that grammars are packs too.
2. Which languages matter first for a server? I assume Go and C#, then TypeScript and Python.
3. Should a third party ever be able to publish a pack, or are packs only ones built by us? I propose only ours for now, because a pack is code.

## Open questions for the other teams

- **Dinah Team Lead:** does decision 6 match how Dinah starts and supervises programs today, and does a server pack fit the existing extension package format, or does it need a new kind?
- **PUDL Team Lead:** should the rendered page's highlighter and the editor's grammars share one list of language names, so a fence coloured in Text is also coloured on the page?
