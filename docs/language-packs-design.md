# Syntax highlighting and language servers for each file type

This is a proposal. Paul asked on 12 November 2026 how the Editor and Docs can gain syntax highlighting and language server support one file type at a time, since no release can include every language and no person needs them all. He approved writing the design. Nothing here is built. Dinah Team Lead and PUDL Team Lead have reviewed it, and it now waits for Paul.

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

A table in the package gives each language an identifier, a display name, its file extensions and file names (`Dockerfile`, `Makefile`), the names it goes by in a Markdown code fence, the script that holds its grammar, and which engines can colour it (decision 3). The Editor looks a file up by name. The status bar already shows Plain Text for an unknown file; it would show the language, and clicking it would let a person choose another for that file.

A host can add rows for file types of its own, by the same bounded and validated route it uses to add shortcodes today.

### 3. Docs uses the same grammars for code fences in its source views

In Text and Split, a fenced block that says `go` is coloured with the Go grammar, loaded when the first such block appears. CodeMirror's Markdown package documents this.

The rendered page and Preview do not colour code today. The engine writes a fenced block as `<code class="language-go">`, and PUDL adds the label and the Copy and Download buttons. PUDL has no highlighting engine of its own: its stylesheet colours the classes highlight.js writes, for a host that runs highlight.js, and yavc.app runs none. Colouring the rendered page is therefore separate work with its own engine to choose, and this proposal does not include it.

What the proposal does fix is the meaning of a name (PUDL Team Lead's review, 2026-11-12). The table in decision 2 is the one list of language identifiers, fence names and labels. A fence that says `js` means JavaScript in Text and on the page alike. The table says, for each language, whether the editor has a grammar and whether the rendered page has one, since the two engines will gain languages at different times. A language neither knows stays readable plain text, with its fence name and source unchanged. The table's labels and extensions feed PUDL's existing maps for code blocks, so PUDL keeps no second catalog.

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

### 6. A native server belongs to the host

Dinah Team Lead reviewed this decision against Dinah's code on 12 November 2026, and it is written as corrected.

A server such as gopls, rust-analyzer or a C# server is a program on the machine. Only Dinah and GK Companion can run one. On yavc.app the service is absent, and a pack of kind `process` is shown as needing the desktop application.

- **The host is the server's one client.** A language server has a single client, and one gopls for each window of a project would be too heavy. The host does the opening exchange once, keeps the set of open documents, and gives each applet window a channel for its own document only, with request numbers kept apart. The applet's service is therefore scoped to a document, and the session is the host's.
- **Starting.** The host starts the program from an executable and a list of arguments, with no shell. The pack's manifest gives the program's name and fixed arguments. The person may set a full path in Settings. Nothing from a document or an agent can add to either. The host uses a program the person has installed and downloads none.
- **Environment.** The host starts native code with a short list of allowed variables. The manifest lists the names of any others the server needs, such as `GOPATH`, `GOFLAGS` and `GOPROXY` for gopls.
- **Consent.** Dinah has no sandbox for native programs, so a native server runs with the person's full authority on the computer, and in several ecosystems it runs the project's own build code. The consent text has to say that plainly, as the install screen for a native extension does. Consent is remembered for the workspace, the server and the path the program resolved to, and the host asks again if that path changes. It can be withdrawn in Settings. An agent cannot give it: the request goes to the person in Notifications.
- **Stopping and restarting.** The host stops the server when no document uses it, and every process it starts ends when the host ends. That tie exists on Windows today and is not built for Linux or macOS, so native servers are Windows first. After a crash the host restarts the server a small bounded number of times and reopens the documents itself. A request in flight when the process died fails and is never sent again.
- **Addresses.** The applets give a document an opaque address and never a path. A native server needs real file addresses, because it reads the disk itself, and the host translates at its edge. It can do so only for a document in a folder of a workspace. The server's root is that folder, and a workspace with several folders has several roots.
- **Documents with no workspace folder.** A Confluence page, an unsaved document, and a file opened from outside every workspace get a worker server or none. The last has no workspace to remember consent for.
- **Requests from the server.** In the first round the host refuses an edit to any file other than the open document, and refuses requests to show a document or run a command.

### 7. A server pack is a signed package of a new kind

Dinah Team Lead's review found that neither of Dinah's package formats fits. A content package is unsigned and must not carry code. An extension package is signed, but its backend speaks MCP and its frontend runs in a sandboxed frame, and a language server is neither.

A server pack therefore reuses the extension package's envelope unchanged: the inventory of files signed with a pinned publisher key, installation that runs nothing, the check before each use, and the review a person sees at install. Its manifest has a language server section in place of actions. If packs are only ours (question 3 below), the pinned key is ours.

Two rules follow for the contract. A worker pack's script is served from the host's verified asset route, and it runs in the page with the applet's authority, which is more trust than an extension's sandboxed frame gets, so the install review says so. And the applet never gives the host an address to download from. When a person opens a file whose language has a pack that is not installed, the Editor says so once in its status bar, with a button that hands the host the pack's identifier. Where the pack file comes from is the host's to decide with Paul.

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

## Paul's decision (2026-11-14)

Paul answered the questions below, narrowing the proposal for now: colouring is for demonstration, so the core set is C, JavaScript, Go, Python and C#, in the Editor's Text view and in code fences in Docs' source views. Colouring ships with the applets and loads when a file or a fence of the language appears, and nothing is installed. Packs are only ones we build. Colouring the rendered page comes later. The language servers of decisions 4 to 8 are not started. DESIGN.md decision 188 records this and the shape of the first step, Go alone.

## Open questions for Paul

1. Do you agree that highlighting should simply come with the applets, loaded on demand, with install reserved for servers? The alternative is that grammars are packs too.
2. Which languages matter first for a server? I assume Go and C#, then TypeScript and Python.
3. Should a third party ever be able to publish a pack, or are packs only ones built by us? I propose only ours for now, because a pack is code.

4. Should the rendered page colour code too? It does not today, and it would need a highlighting engine chosen and added. That is separate work from this proposal.

## Reviews

Dinah Team Lead reviewed decisions 6 and 7 on 12 November 2026, and both are written as corrected. PUDL Team Lead reviewed decision 3 the same day, corrected the claim that PUDL colours code, and asked for one list of language names with each engine's coverage stated separately. Both agreed that highlighting should come with the applets and install be kept for servers.
