# PUDL 0.110.1 integration

The team lead took PUDL 0.110.1 on 2026-11-27. It corrects two launcher defects Paul saw in installed GK Companion on 0.110.0, in the launcher's first opening and placement and in the ribbon row's Launcher button. PUDL reports that the button now stays fully visible and closes the launcher on a second click. Tag `v0.110.1` is the annotated tag object `8bc9fd3dc86523c4cef5dc3d7a5153bb2b38176b`, which resolves to commit `cd8d526fe847d64ae232a2b591c97fe666929d50`. The downloaded archive matches the published SHA-256 `8841779a5c208f677c0238cd472c85bd0a97b21421454e1d94d4014963250791`, and its checksum sidecar uses LF. The distribution manifest matches GitHub's asset digest `51153c68800486f94bc63d7b56449fdd21a4e1d3b8b084e34a64b87f48a9d8ee`.

All 196 distribution paths match the manifest, and every file matched its byte count, SHA-256 and SHA-384 integrity value before replacement. The whole distribution replaces `web/pudl` together. Seven files differ from 0.110.0: `pudl-launcher.js` and `pudl-menubar.js`, each with its minified copy and source map, and the version line of `pudl.css`. No file was added or removed. `pudl-0.110.1.json` supplies provenance and file hashes to the distribution test and release-record builder.

yavc.app needs no application change, for the reasons given in `pudl-upgrade-0.110.0.md`. PUDL's Firefox defects (pudl issues 43 and 44) remain open, so the advice in that note stands: deploying this release to https://yavc.app is Paul's call.

The local gate is `bash scripts/check.sh --since HEAD`, `node scripts/test-pudl-distribution.mjs`, and `test-launcher.cjs` in all three engines. The full site and package lists run in CI.
