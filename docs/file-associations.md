# File associations

The current design is [Content applications and file opening](content-applications-design.md), prepared on 2026-11-07 after Paul chose separate Docs and Editor applets with shared implementation code. Its sections 4 through 8 define routing, configuration, dispatch, byte preservation and resource ownership.

The earlier launch-profile proposal and automatic title switching were withdrawn. Docs defaults to ordinary Markdown in Visual and `.docs.md` in Document, with Text and Split source access. Editor handles general text/code and offers read-only preview where supported. Slides and Diagrams retain their own domains and backing-source views. The same applet identity persists across view changes.

The pure resolver, versioned content catalog and plan-only host extension are implemented in `file-resolution-contract.md`. Current manifest request handlers, Files suffix checks and the Docs subdomain alias still perform actual routing. File Associations settings and dispatch activation remain upcoming. Shipped associations and user overrides select among declared capabilities; they do not restrict the universe of text files that Editor can open or grant a handler unsupported editing features.
