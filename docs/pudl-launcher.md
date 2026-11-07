# Site launcher and taskbar pins

The site uses PUDL 0.103.0's launcher and taskbar destination APIs. The site title opens the launcher beneath the top bar; the folded menubar control opens the same launcher. Settings and About yavc.app are header links styled as buttons with gear and information glyphs. Settings opens a window on desktop and standalone pages. About retains its addressable dialog. The taskbar Start button and the Applets menu have been removed.

The launcher can remain open as a resizable pane. The host supplies the first pane of a workspace split and keeps the taskbar outside that split. PUDL owns popup placement, pane presentation, resizing and activation feedback. Launcher filters and presentation are represented by `start`, `start-q`, `start-category` and `start-mode` query parameters. Saved presentation is canonicalized into the initial address so Back restores the correct pane. The `site-launcher` preference stores pinning, collapse and geometry through the existing host configuration service.

Application catalog rows and windows use canonical applet IDs under the `applications` destination provider. The standard row action menu can pin an unopened application without launching it. PUDL supplies taskbar pinning, ordering and window menus. The `desktop-taskbar` preference stores version 1 with `pins`, `order` and provider `references`, including references to temporarily unavailable destinations. The host does not decorate or rewrite generated taskbar children. Article windows are excluded from this application provider.

A pinned activation registers its complete readiness promise through `pudl:taskbar-activate`. The promise awaits both the window open result and `pudlApplets.start(key)`, rejecting failed or removed mounts. PUDL supplies pending state and duplicate suppression; failures produce a host notice and remain retryable. Window and dialog destinations call `pudlLauncher.activated` synchronously because their native navigation is intercepted. The launcher closes after the control's feedback interval.

PUDL Start remembers the opener from the time a popup opens. When the menubar folds during that interaction, the old opener can become hidden. A launcher-scoped Escape handler uses the documented `pudlLauncher.close` API, which resolves the current visible anchor. Nested popovers retain their own Escape handling. The vendored release is unchanged.

## Release provenance

The vendor directory contains the complete `dist` folder from the public `v0.103.0` release archive at <https://github.com/paulmooreparks/pudl/releases/download/v0.103.0/pudl-0.103.0.zip>. The archive SHA-256 is `EAA6E6665004E5697E21245AC21FAF8EF7BDD7BA783EDB77FF836E668973D97C`. Every copied file was compared with the extracted distribution by hash. The integration follows the release's `docs/LAUNCHER.md` and `docs/TASKBAR-PINS.md` contracts.

## Verification

`scripts/test-launcher.cjs` covers header glyphs and destinations, standalone Settings, unopened pinning, dormant-pin reload, complete application activation, unpinning, saved pane presentation and Back. `scripts/test-start.cjs` covers catalog filtering, categories, URL restoration, application launch, keyboard focus and responsive bounds across themes and skins. Both fixtures run in Chromium, Firefox and WebKit against a disposable server. Their screenshots are retained under `%TEMP%/yavc-launcher-review` and `%TEMP%/yavc-start-review`.

The existing Chromium editing-command, Editor UI, content UI cleanup, shared toolbar and shared language-service fixtures also pass against PUDL 0.103.0. These tests use synthetic browser sessions and do not take desktop focus or read the system clipboard. The full repository gate and independent source review pass. No upstream PUDL test matrix or native desktop automation was performed.
