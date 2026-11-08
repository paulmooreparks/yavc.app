# Historical PR audit, 2026-11-09

PR #4, Make TestErrBusyAt32 deterministic, remains open. Its exact proposed patch is obsolete because the current relay test already waits for the event reader to acknowledge draining all MaxLive events. The current test passes 400 single-CPU repetitions. The obsolete patch should not be merged over that guard. Closing it can accompany the next approved merge.

PR #5, Serve the shortcode table at /api/shortcodes for the Editor, also remains open. Its old Editor-specific patch predates the extracted workspace. The sixth batch in PR #58 provides the public endpoint and metadata while making portable completion depend on the bundled engine. It also handles optional-only parameters and span closers. Once PR #58 is merged, PR #5 can close as superseded. Neither historical branch was merged or deleted by this audit.

The current backlog is `content-completion-plan.md`. Older sections in `handoff.md` are historical receipts; their statements about upcoming extraction, the Docs/Editor split and old candidates no longer describe the installed application. Source commits and each local installation receipt identify the actual candidate. Receiving-webview acceptance, encoding-aware writes, edited mixed line endings, broader Office import, line pagination, footnotes, review features and additional language servers remain open.
