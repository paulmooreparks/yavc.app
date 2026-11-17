# PUDL 0.108.0 integration

Paul requested PUDL 0.108.0 through Dinah on 2026-11-17. The immutable tag resolves to `5e77a445fb774012be16f9fb75c6c989242cddf2`. The downloaded release archive was verified before extraction against the supplied SHA-256 `982519da8242175b0ba029d62d21faf01ad7327d25c4ebd26d63d9fb39004d72`.

The published distribution manifest has SHA-256 `10e42f32616106454284dd471ba13bc221468f23adc53652c54596b6f8298ce4`. Its version, commit, complete file set and all 196 file hashes match the archive's distribution. All 196 files replaced `web/pudl` together. The 21 changed files are the stylesheet and the windows, commands, menu, combo, date and toolbar scripts, including their minified copies and source maps. `pudl-0.108.0.json` records the provenance and hashes used by the distribution test.

PUDL's release notes require no project markup changes. The integration changes no applet-owned files, so the repository's applet-version rule requires no applet bumps. The receiving-host handoff identifies PUDL 0.108.0 in a new v0.2.103 candidate row, preserving the historical releases' recorded versions.

The distribution identity test passes. The complete site and package lists are run before handoff, with their results recorded in the pull request. Receiving hosts still need their own installed-product acceptance.
