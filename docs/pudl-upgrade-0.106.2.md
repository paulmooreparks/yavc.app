# PUDL 0.106.2 integration

Paul asked on 2026-11-11 for stacked taskbar buttons in GK Companion. Dinah's release test compares every `pudl/` file in the yavc.app content package with Dinah's own PUDL copy, so Dinah and GK Companion cannot take a new PUDL until a yavc.app release bundles the same one. This update exists for that reason and changes no applet.

The update uses the immutable `v0.106.2` tag at commit `a6e0d432cdd57f5798c4e58384b94f4f26d8722f`. The official `pudl-0.106.2.zip` has SHA-256 `7e315f5775f2486808b94cb0de9142a8dec168f602560d68269137aace8afc10`, and the published distribution manifest has SHA-256 `60b3fff55740c41cf4e0e895582874fa1386ba0ee78fb918e2e62ffe9afa1b93`. Both were downloaded from the GitHub release and match what PUDL Team Lead announced. PUDL 0.106.0 was put on hold before any host took it, and 0.106.1 was never published, so yavc.app goes from 0.105.0 to 0.106.2.

All 196 files of the distribution replaced `web/pudl` together, and each was checked against the manifest before it was copied. No vendor file was patched. `pudl-0.106.2.json` records the hashes and replaces `pudl-0.105.0.json`; the check script still verifies the complete path set and every hash.

## What changes for a person

A taskbar button that stands for two windows of one application shows one rear edge, and a button for three or more shows two. The Standard skin has firmer boundaries on raised controls. Alloy Bold is a new skin with Alloy's controls and Standard's active title colours. Two menu bar defects are fixed: an Alt mnemonic pressed just after a window took focus was matched against the previous window's menus, and a layout change under a resting mouse pointer could replace the menu that the keyboard had opened.

## What the host needed

The host needed no code change. The site reads its skins from `pudl-skins.json` and links each stylesheet from that catalogue, so Alloy Bold is offered in the Skin menu and in Settings without an edit. yavc.app had no workaround for the title separator that this release corrects. No preference or stored data changes.

## Verification and limits

The commit checks pass. The package tests pass in Chromium, Firefox and WebKit: Editor, Docs and Slides in the portable host, Diagrams, canvas pictures and the slide show in another window. On the site, `test-pudl-upgrade.cjs` (launcher, pins, stacks and folding), `test-editing-commands.cjs` and `test-workspace-command-state.cjs` pass in all three engines.

`test-pudl-upgrade.cjs` read the launcher's state before the launcher existed after a reload, which failed now and then in WebKit on 0.105.0 as well. Its three waits now tolerate a launcher that is not there yet. The same test fails about one run in eight in Chromium, where the launcher's filter text is empty after the launcher is closed and reopened. That happens at the same rate on 0.105.0 and has not been traced.

Five site tests fail in the same way on 0.105.0 and on 0.106.2, so this upgrade did not cause their failures: `test-launcher.cjs`, `test-document-titles.cjs`, `test-start.cjs`, `test-key-bindings.cjs` and `test-command-toolbar.cjs`. They expect older behaviour of the site, they are not part of the commit checks, and they are still to be brought up to date.
