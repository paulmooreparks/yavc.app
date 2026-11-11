# PUDL 0.107.1 integration

Paul asked on 2026-11-11 for one menu bar in the standalone Editor, since a window that is one application should not show the host's menus and the applet's menus as two groups. PUDL 0.107.1 adds that arrangement as an option on its menu bar, `data-menubar-composition="application"`, which the host's page sets. A receiving host can take a new PUDL only when the yavc.app package bundles the same one, so this update exists for that reason and changes no applet.

The update uses the immutable `v0.107.1` tag at commit `e2c05a919dba47ead103b0940e51f3d8200fb01a`. The official `pudl-0.107.1.zip` has SHA-256 `8b9cac72f0430e9601f56b20e91915dec5a614cd501eafeedf4166ef982be9e6`, and the published distribution manifest has SHA-256 `8469d48c529a7077b5a36477fb7d001cffeb218c5f0e8ead9edef5964a47f2b5`. Both were downloaded from the GitHub release and match what PUDL Team Lead announced. PUDL 0.107.0 was held before any host took it, so yavc.app goes from 0.106.2 to 0.107.1.

All 196 files of the distribution replaced `web/pudl` together, and each was checked against the manifest before it was copied. Four files differ from 0.106.2: `pudl-menubar.js`, its minified copy and source map, and the version comment in `pudl.css`. `pudl-0.107.1.json` records the hashes and replaces `pudl-0.106.2.json`.

## What the host and the applets needed

yavc.app's own site does not set the new option, so its menus are drawn as before. The applets needed no change for it. PUDL treats the first title an applet returns as the applet's own menu, which Editor and Docs already supply, and since v0.2.67 they supply it with no items while they start, so that PUDL draws no stand-in menu in the meantime.

## Verification and limits

The commit checks pass. The package tests pass in Chromium, Firefox and WebKit: the portable host, Diagrams, canvas pictures, the slide show in another window, HTML tables and host overlays. On the site, the launcher and taskbar test, editing commands, command state, document grouping and the Editor session test pass in all three engines. They ran on the candidate archive, whose bytes are the published ones, and the content digest of the package built from the published archive equals the tested one.

PUDL's own release record has one limitation that Paul accepted: a timeout in one of its popup tests on the first tag run, which did not happen again in 160 repetitions and is not explained. The single menu bar itself is shown in the standalone host by Dinah, since only that page sets the option.
