# PUDL 0.108.1 integration

The team lead requested PUDL 0.108.1 on 2026-11-20 to take in Paul's row-action visibility and keyboard fix. The release tag identifies commit `3a77a4cba54bde35e34522af176be7645f01b962`. Before reading the archive's contents, the builder verified its SHA-256 as `26df8249c560360a9a56c3cc249169f6268b4aa03a69fdbd2c084184762b9114` and the published distribution manifest's SHA-256 as `5fa112285fff66f81b31f4b913be1c2f62aed2fc74f7fa3c956dd54cf8d0321f`.

The archive's complete distribution has the same 196 paths as the manifest. Every file matches its declared byte count, SHA-256 and SHA-384 integrity value. All 196 files replace `web/pudl` together; six differ from 0.108.0: the base stylesheet and menu script, their minified copies and their source maps. `pudl-0.108.1.json` records the verified provenance and file hashes for the distribution test and release-record builder.

Our only authored `data-row-actions` buttons are in the desktop launcher. Each button already has an application-specific accessible name. The site's only CSS override sets `flex: none`, and no applet depends on hiding these buttons until hover or removing them from the Tab order. No application markup or applet-owned files change, so no applet version needs a bump. The focused launcher test checks every action button at rest, then reaches one with Tab and opens its menu with Enter.

The distribution identity check, focused launcher checks and repository checks run locally. The full site and package matrices on the PR head remain the acceptance gate under CLAUDE.md. This vendored update does not require a full local matrix. Receiving hosts still need to verify their installed product.
