# The presentation capability

Slides asks its host for two things when a deck is presented: a page for the presenter view, and, from version 2, a show that runs in a window of the host's own. Both are optional. A host with neither still presents a deck, full screen in the window Slides is in. The capability is `pudlHost.presentation`, and this document is its contract. DESIGN.md decision 121 records why version 2 exists.

## Version 1: the presenter page

`presentation.version` is 1 and the host offers one function.

`presenterURL({application, resource, channel})` returns the address of a page that mounts Slides for the same deck with `presenter=1` and `presenter-channel` set to the channel given. The address must be on the origin Slides is running on, because the presenter view and the editing window follow each other over a `BroadcastChannel`, which the browsers define per origin. Slides opens that address with `window.open`. A host may open a window of its own for that call.

## Version 2: a show in a window of the host's own

`presentation.version` is 2. The host may still offer `presenterURL`, with the meaning above, and it may offer `openShow`.

`openShow({application, resource, channel})` asks the host to run the show somewhere else, such as on another display. `application` is `slides`. `resource` is the deck's resource, or null for a deck that has not been saved. `channel` is a token for this deck's show, which the host may put in the show page's address. `openShow` resolves to a port, or to null when the host has nowhere else to show the deck. It must settle within one second: when it resolves to null, or does not settle in that time, Slides presents full screen in its own window, and the browser grants full screen only while the press that asked for it is recent. A port that arrives after that second is closed by Slides.

The show's page is Slides mounted with `show=1` in its state or address. That page draws the deck it is sent to fill its window, and it has no toolbar, filmstrip, notes or menus. It takes the other end of the port from `presentation.showPort()` and opens no channel of its own. On that page `presentation` needs `version: 2` and `showPort` only.

### The port

A port is an object with these members.

| Member | Meaning |
| --- | --- |
| `postMessage(message)` | Sends one message to the other end. |
| `onmessage` | A property the receiver sets to a function. The host calls it with each message from the other end, in the order sent. An event object with the message as its `data` is accepted too. |
| `close()` | Ends the connection. The host closes the show's window when the editing window's port is closed. |
| `onclose` | A property the receiver sets to a function. The host calls it when the other end is gone, for instance when the person closes the show's window. |

Every message is plain JSON, since a host may pass it between two processes. A host should keep messages posted before the show's page is ready and deliver them in order.

### The messages

Each message is an object with `v: 1` and a `type`. A receiver ignores a message with another `v` or a type it does not know.

From the editing window to the show:

| Type | Fields | Meaning |
| --- | --- | --- |
| `state` | `text`, `resource`, `slide`, `step` | The whole deck as its Markdown, at most 2,097,152 characters, the deck's resource or null, and the place to show. Sent when the show says it is ready and again after each change to the deck. The show keeps its place across a later `state`. |
| `unavailable` | none | The deck is larger than a `state` may be. The editing window then ends the show and says why. |
| `at` | `slide`, `step` | The editing window moved to a slide. |
| `advance` | `direction`: `next` or `previous` | The show is to go one step forward or back, as the presenter view's keys ask. |
| `end` | none | The show is over. Slides closes the port after sending it. |

From the show to the editing window:

| Type | Fields | Meaning |
| --- | --- | --- |
| `ready` | none | The page can draw. The editing window replies with `state`. |
| `at` | `slide`, `step` | The show moved by its own keys or a click. |
| `leave` | none | Escape was pressed in the show. The editing window ends the show. |

The editing window keeps the deck. It is the only one that reads or saves it, and the show never writes anything. The presenter view in the editing window's own origin stays on its `BroadcastChannel` and follows the same place, which the editing window passes on in both directions.

### What the show's page needs from the host

The show draws the slide the canvas draws, so it needs the services the canvas reads with, bound to the deck's resource from `openShow`: `contentWorkspace.resources.resolve` for pictures, `contentWorkspace.directory` and `pudlHost.fs.readText` for a diagram a slide refers to, and the shortcode catalogue with `shortcodeHost`. It needs none of the services that write: no `contentResources`, no snapshot service and no settings.

The host chooses the display, gives the show's window keyboard focus when it opens, and closes it on `end`, on `close()`, or when the editing window goes away.

### What Slides does

With a port, Present from the Start and Present from This Slide leave the editing window as it is. The presenter view opens as well when Always Show Presenter Window is on. Leave the Show, in the Show menu, ends a show elsewhere. While a show runs elsewhere, the status bar says so. When the port closes without an `end` or a `leave`, Slides says in its status line that the show's window closed, and it does not go full screen by itself. The show's page draws a fault, such as a deck it cannot draw, as a notice.

## Verification

`scripts/test-detached-show.cjs`, with the host in `scripts/fixtures/detached-show.js`, runs a built package in two pages of one browser, joined by a `BroadcastChannel` standing in for a host's relay. It checks the request, the first `state`, navigation from each side, an edit reaching the show, the show ending from each side, a window closed some other way, and the fall back with one display. It does not prove any particular host's relay or window placement.
