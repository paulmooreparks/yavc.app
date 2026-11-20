# PUDL 0.108.2 integration

The team lead requested PUDL 0.108.2 on 2026-11-20 for the 30px taskbar buttons. Annotated tag `d1f1bab38798d8ae5075859569fc5d3b886ab487` resolves to commit `ee4426740ab543d040893555c74880a062c19ef4`. The downloaded archive matches the supplied SHA-256 `b3edc3c9926d5d8d8c1701a6cd2231fde5667a1a4a82578ac697bffd66683b5d`, and its checksum sidecar uses LF. The published distribution manifest matches GitHub's asset digest `2c2e8164332a11c36b96f31b759361aa0983740528ab999d68564527fae96be1`.

All 196 distribution paths match the manifest. Every file matches its byte count, SHA-256 and SHA-384 integrity value before replacement. The whole distribution replaces `web/pudl` together. Four files differ from 0.108.1: `pudl.css`, `pudl-windows.css`, and the window stylesheet's minified copy and source map. `pudl-0.108.2.json` supplies provenance and file hashes to the distribution test and release-record builder.

No site or package test pins taskbar button height to 26px, and the project does not override PUDL's taskbar entry-height variable. The existing responsive taskbar check compares the measured desktop and narrow-window heights. No application-owned files change, and no applet version needs a bump.

The local gate is `bash scripts/check.sh --since HEAD`, including the complete distribution identity check. The full site and package lists run in CI under the vendored-update gate policy; no full local package run is needed. The PR records its CI state separately from this integration record.
