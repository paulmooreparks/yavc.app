# Pictures of diagrams without an applet window

A program that publishes documents can make a picture of a canvas, a D2 diagram or a Mermaid diagram from the diagram's text, with no Editor, Docs or Diagrams window open. It does this with `yavcDiagramPicture.draw`, which lives in `content/diagram-kit/picture.js` in a content release (DESIGN.md, decision 127). This page says how a host page uses it, what comes back, and how the host ends a drawing it no longer wants. `examples/diagram-picture/` has a page and a driver that do all of it, and `scripts/test-diagram-picture-example.cjs` runs them against a built package in Chromium, Firefox and WebKit.

The function draws in a browser. A command-line consumer therefore starts a browser it controls, opens a page of its own, and asks that page for pictures.

## What the host page loads

The page loads two classic scripts from the package, in this order, as in `examples/diagram-picture/index.html`.

1. `support/yavc-util.js`, which `picture.js` uses to load the rest.
2. `content/diagram-kit/picture.js`, which defines `window.yavcDiagramPicture` with `draw` and `kindOf`.

Both come from the same release, and a pinned release is a directory whose files are listed in its `manifest.json`. A host that serves only the listed files serves everything the function asks for. `picture.js` loads nothing else until a kind of diagram asks for it, and it finds those files relative to its own address. A request of each kind was seen to load these files.

| Kind | Files loaded when it is first drawn |
| --- | --- |
| `canvas` | `content/diagram-kit/jcanvas.js`, and `content/diagram-kit/canvas-pictures.js` when the canvas has a picture node |
| `mermaid` | `content/md-editor/kit.js`, `content/md-editor/vendor/mermaid/mermaid.min.js`, `content/md-engine/safe-html.js` |
| `d2` | `content/diagram-kit/d2.js`, `content/diagram-kit/wasm_exec.js`, `content/diagram-kit/worker.js`, `content/diagram-kit/yavc-d2.wasm` |

A page that only draws canvases and Mermaid diagrams never fetches the D2 files, and the example checks that nothing of an engine is requested before a diagram of its kind is.

### Browsers and policy

The example and its test run in current Chromium, Firefox and WebKit, headless. The page needs a document with a body, a 2D canvas, an `Image` that decodes an SVG given as a `data:` address, and, for D2, `WebAssembly` and a `Worker`. The page in the example is served with this policy, and nothing in it is more than the function needs.

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'
```

D2's layout evaluates strings inside its worker, which is a document of its own, so a policy that is sent with `worker.js` must also allow `'unsafe-eval'`; the example sends its policy with the page only. A consumer that draws D2 elsewhere does not meet this.

## The request

```js
const out = await yavcDiagramPicture.draw({
  kind: 'canvas',          // 'canvas', 'd2' or 'mermaid'
  text: '...',             // the diagram file's text, at most 2 MiB
  format: 'png',           // 'svg' (the default) or 'png'
  scale: 1,                // a PNG only: 1 to 3 times the drawing's size, 2 by default
  pictures: async path => ({ url: '/pictures/' + path }), // a canvas only; see below
  signal: controller.signal // optional; see below
});
```

`kindOf(name)` gives the kind a file's name says, or null.

## The result

The promise resolves to one of these.

```js
{ format: 'svg', svg, width, height, problems }
{ format: 'png', blob, width, height, problems }
```

`width` and `height` are in CSS pixels. For a PNG they are the size of the picture itself, which is the drawing's size times `scale`, and the example reads the PNG's own header and expects the same numbers. The drawing is the one a document shows on paper, light and with the page's own fonts, whatever the page's theme. `problems` is an array of sentences about a picture that was still made, such as a picture that could not be found.

### How a consumer knows it has finished or failed

The promise is the only signal. It resolves when the picture is made and rejects when it is not, and nothing else is reported through events or callbacks. There is no time limit inside the function, so a host that wants one sets its own and ends the drawing as described under cancellation.

A diagram that cannot be drawn rejects with an `Error` whose message is its first mistake in words, as the example shows for each kind.

| Kind | A mistake gives, for example |
| --- | --- |
| `canvas` | `The canvas is not valid JSON: ...` |
| `d2` | `Line 1: connection missing destination` |
| `mermaid` | `Parse error on line 2: ...` |

A result with a nonempty `problems` is not a failure and not a complete success. The picture was drawn with a stand-in for what was missing, and a publisher that must not send a stand-in has to refuse the result itself: check `problems.length` before using `svg` or `blob`.

## Pictures come only from the host

The function reads no file and fetches nothing for a canvas on its own. A canvas names pictures with file nodes, and `pictures(path)` is the only way it gets one. `path` is as the canvas file has it, so the host resolves it against the folder the canvas is in and decides whether to give it. The function resolves to one of these.

- `{ url }`, an address on the page's own origin, which the function then fetches.
- `{ bytes }`, the picture's bytes.
- `null`, when the host will not give it or does not have it.

A picture kept inside the canvas file as a `data:` address is drawn from the file, and the host is not asked for it. Without a `pictures` function every file node is a missing picture.

D2 diagrams can name icons at other sites. The function does not fetch them, leaves them out, and says so in `problems`. A Mermaid diagram is drawn from its text alone.

### A missing picture is a problem and not a rejection

A canvas whose picture the host did not give is still drawn, with a box showing the picture's name in its place, and `problems` has one sentence for each, such as `The picture icons/cash.png is shown by its name, because it was not found.` The result is a real PNG or SVG with a placeholder in it. A host that does not want one checks `problems`, as above. There is no strict mode.

## Cancellation

`signal` is an `AbortSignal`. The function looks at it when the request begins, after the engine has drawn, and after a PNG has been made, and then rejects with a `DOMException` named `AbortError` and the message `The picture was cancelled.` It does not look inside a step that has begun. An abort given while Mermaid is being loaded or is drawing therefore takes effect when that step ends, not at the moment it was given, and a step that never ends is not ended by the signal.

What the function releases when it is aborted or fails is checked by the example, in each browser, for a Mermaid drawing aborted in the turn after it was started on a page that had not yet loaded Mermaid: the hidden element Mermaid draws into is removed in a `finally`, and the page has no timer, interval, worker or object URL that it did not have before, counted straight after the rejection and two seconds later. The check wraps `setTimeout`, `setInterval`, `Worker` and `URL.createObjectURL` before the page's own scripts run and counts those not yet run, cleared, terminated or revoked. The engine's scripts stay loaded in the page after the abort, which lets the next drawing be quick; nothing else about them is released. A page that draws again after an abort works.

To end a drawing that has to stop at once, or that does not finish in the time the host allows, the host closes the page or the browser context it opened for the work, which a browser automation library documents, and starts another for the next job. The signal is a way to say that a result is no longer wanted, and not a way to interrupt a step.

## Limits

A diagram's text is at most 2 MiB, a drawing's sides at most 32768 pixels and its SVG at most 16 MiB, and `scale` is from 1 to 3. A request outside these rejects with a sentence that says which.

## Running the example and its test

```
go run ./cmd/yavc-content -out /tmp/package
node examples/diagram-picture/driver.cjs /tmp/package chromium firefox webkit
node scripts/run-package-tests.mjs /tmp/package test-diagram-picture-example.cjs
```

The driver serves the package and `examples/diagram-picture/` itself, and uses only synthetic diagrams and one synthetic picture. Playwright must be resolvable.
