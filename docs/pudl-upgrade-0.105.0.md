# PUDL 0.105.0 integration

The update uses the immutable `v0.105.0` tag at commit `e329c43c51c4a19df35181f5a9421219fd48c864`. The official `pudl-0.105.0.zip` and its published checksum were downloaded from the GitHub release. Both the published checksum and Paul's supplied checksum match SHA-256 `5c0e4f7ed32a3ca41e13e4c393ef74b7029b214d0aca4c7eaef57045fc98081d`.

The repository has one bundled distribution at `web/pudl`. All 193 files were copied together, including fonts, minified files and source maps. No vendor runtime file was patched. `pudl-0.105.0.json` records the distribution hashes from the verified archive. The required check script verifies the complete path set and every hash. The same test can verify served assets by setting `YAVC_PUDL_TEST_BASE` to the host's `/pudl/` address.

The integration follows the tagged [launcher contract](https://github.com/paulmooreparks/pudl/blob/v0.105.0/docs/LAUNCHER.md) and [taskbar contract](https://github.com/paulmooreparks/pudl/blob/v0.105.0/docs/TASKBAR-PINS.md).

## Launcher preferences and activation

The host stores version 2 launcher preferences as `presentation`, requested popup `width` and `height`, and a separate `paneSize` object. The desktop presentation survives compact opening and dismissal. The URL records desktop presentation in `start-mode` and current visibility in `start`; query and category remain addressable. Legacy `pinned` and `collapsed` values are accepted when no presentation is stored. Constrained viewport measurements do not replace requested dimensions.

Preferences load before the controller is enhanced so both dimension sets can be supplied through its documented options. Native Start opening or closing during that load is retained, along with any query. In compact mode, an early interaction changes only visibility and leaves the saved desktop presentation intact. A failed preference load leaves the launcher usable but prevents preference writes, preserving the saved values.

PUDL owns responsive presentation, the compact taskbar opener, invocation focus, Escape handling and activation feedback. The host no longer intercepts Escape or forces filter focus during restoration. It confirms a managed destination synchronously after the original window or dialog click handler accepts it. There is no delayed click replay or host popup-close timer. Browser Back can restore the preceding launcher URL state after an About dialog.

The footer provides the documented Size popover and Reset operation. PUDL selects the applicable dimensions for a popup or pane and provides automatic compact sizing. Size dismissal returns focus to Size; a subsequent Escape dismisses the launcher and restores the applicable opener.

## Taskbar preferences

The taskbar remains outside the launcher/workspace split. Destination/provider metadata is authored on server-rendered windows before PUDL initializes, including secondary instances. Application descriptors now declare `kind: 'applet'`.

The host preserves the complete valid `pins`, `order` and `references` arrays. It does not truncate canonical menu IDs or drop unavailable provider references. Known legacy application pins acquire their application-provider reference when needed. PUDL generates the Pinned section, menu pins, folding, stack chooser, Windows actions and Arrange toggle. The existing host readiness promise still covers window adoption and applet initialization.

## Verification and limits

The real-host fixture covers retained popup/pane sizes, compact reload and widening, Size/reset, browse and touch focus, two-Escape recovery, early interaction during delayed preference loading, failed-load preservation, dormant and menu references, restored Settings controls, singleton minimize/restore, background raising, stacks, unsaved-close cancellation, discarded arrangement drafts and actions-only Windows folding. Its unavailable menu ID exceeds the old 128-character host limit.

Dialog sweeps run at normal sizes and with enlarged public PUDL text tokens, in desktop/light and narrow/dark layouts. The enlarged cases exposed a picture-width row overflow and an unbroken About URL. The host fixes use a constrained grid for the former and URL wrapping for the latter. The numeric fixture checks fractional parsing, unrestricted typed precision, bounded values, invalid-field validation, form data, refresh and focus guards. Actual Page Setup and Typography workflows and Editor/Docs startup/disposal are checked separately.

The original failed fixture logs are retained in the installation evidence. One restoration assertion observed optimistic local settings before their server write completed; it now waits for the committed setting. Earlier launcher fixtures also assumed the old compact opener and focus policy. Installed-browser verification exposed two further fixture assumptions. The About/Back helper now waits for controller readiness and checks visibility in the same browser operation that opens the launcher. The compact focus test explicitly invokes the compact opener before expecting focus to return there; resizing an already-open desktop launcher does not establish that invocation. These corrections do not change the installed runtime. Native device camera behavior, every operating-system picker and unrelated historical browser failures are outside this upgrade's acceptance claim.

Independent fractional spin increments remain unsupported in PUDL 0.105.0. The number-field script is unchanged. `step="any"` remains in measurement controls, and spinning still changes the value by one unit. The separate upstream requirement is recorded in `pudl-number-step-report.md`.
