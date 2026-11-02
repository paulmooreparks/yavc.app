# yavc.app

yavc.app is a desktop of applications built with [PUDL](https://github.com/paulmooreparks/pudl), each of which also runs on its own at its own address, `{name}.yavc.app`, with the same state as on the desktop. The name stands for "Yet Another Vibe-Coded", said with a straight face. The design and its decisions are in [DESIGN.md](DESIGN.md).

## Running it

The engine is one Go binary. It serves the desktop at the site's domain, each installed applet package standalone at its subdomain, PUDL, and the readers' sessions.

```
go run ./cmd/yavc -domain localhost
```

opens the desktop at <http://localhost:8400/> and each applet at `http://{name}.localhost:8400/`. Browsers resolve names under `localhost` to the loopback address, but refuse a cookie for the whole of `localhost`, so a session is not shared between those addresses in a local run; sharing needs a real domain. In production the engine runs in Docker behind the cloudflared tunnel:

```
docker compose up -d --build
```

| Flag | Meaning | Default |
|---|---|---|
| `-addr` | the address to listen on | `127.0.0.1:8400` |
| `-domain` | the site's domain; applets answer at `{name}.domain` | `localhost` |
| `-secure` | the site is reached over HTTPS, so cookies are marked Secure | off |
| `-applets` | folders of installed applet packages, comma-separated | `applets,apps` |
| `-pudl` | the folder holding PUDL's `dist` files | `web/pudl` |
| `-pages` | the folder of the site's pages, Markdown files served at `/{slug}` and in windows | `pages` |
| `-bin` | the folder of the site's scripts, which the file system lists under `/site/bin` | `site/bin` |
| `-data` | the folder the engine keeps sessions in | `data` |
| `-retain` | how long a session lives unseen | `2160h` (90 days) |

## Applications

An application is a [PUDL applet package](https://github.com/paulmooreparks/pudl-applet-packages): a folder with an `applet.json`. The ones under `applets/` are installed from their own repositories at a tagged release, each with its licence beside it; the ones under `apps/` are this site's own. Adding an application is adding a folder; the engine reads the manifests and writes the registry, the pages, the windows and the menus from them.

## Pages and the file system

A page is a Markdown file in `pages/`, served at `/{slug}` with the site's bar and opened in a window on the desktop by its slug; its first heading is its title. The privacy policy, the terms, the author's page and the guides for Files and the Terminal are pages.

Files, the Editor and the Terminal share one file system (`internal/web/static/sitefs.js`, from parkscomputing.com): the site under `/site`, as `/api/site/tree` serves it, the built-in commands under `/bin`, and the reader's home, `~`, which is kept in the browser's local storage alone and never sent to the site (DESIGN.md, decision 11). A script in `site/bin/` is listed under `/site/bin` and runs in the Terminal by name.

## The Editor's Markdown engine

The Editor's Visual, Split and Preview views come from Dinah Desktop's page view. Their Markdown engine, the preview renderer and the page view's parser and serializer in `internal/preview` and `internal/pageview`, is compiled to WebAssembly from `cmd/yavc-md` and runs in the browser, so a document's text is never sent to the site. Build it with

```
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o apps/md-engine/yavc-md.wasm ./cmd/yavc-md
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" apps/md-engine/
```

The Docker image builds it itself. Neither file is committed.

The engine includes parkscomputing.com's shortcodes (`internal/shortcodes`): `{{tip:Title}} … {{/tip}}` and the other notices, `{{expand}}`, `{{columns}}` with `{{column}}`, `{{figure:/path alt="…"}}`, `{{applet:name}}`, `{{video:youtube ID}}`, `{{code:~/bin/hello}}`, `{{toc}}`, `{{status:green Done}}`, `{{kbd:Ctrl+S}}`, `{{glyph:check}}`, `{{page:slug}}`, `{{anchor:name}}` and `{{draft-note}}`. The Editor's Insert menu offers each with an example.

The `color` shortcode (`colour` is an alias) is the engine's first paired inline shortcode, `{{color:accent}}words{{/color}}`, matched within a paragraph and open to Markdown inside; a project adds another by giving a definition the kind `span`. The page view edits a colour span as a mark, so a coloured heading stays rich text.

## Slides

Slides (`apps/slides`, design in [docs/slides-design.md](docs/slides-design.md)) makes a slide deck from a Markdown file named `something.slides.md`: slides divided by `---`, a `{{slide:layout=title}}` line for a slide's settings, `{{notes}}` for the speaker's notes, and the front matter for the deck's title, theme, size and transition. The current slide is edited on its canvas, as the Editor's Visual view edits a page, or as its Markdown, and the deck presents full screen with a presenter window and exports as a page that presents itself, as a PowerPoint file (structural, editable) and as a PDF (each slide as drawn); a PowerPoint file imports as a deck. The libraries for those, PptxGenJS, pdf-lib and JSZip, are vendored under `apps/slides/vendor` with their MIT licences.

## The editing kit

`apps/md-editor` is the editing layer the Editor and Slides share, beside the Markdown engine in `apps/md-engine`: the page view (`page-view.js`, from Dinah Desktop), the vendored CodeMirror, ProseMirror and Mermaid, and `kit.js`, which gives an application the formats, the paragraph styles, Insert, the / menu's items, formatting on Markdown text and the dialogs, as `window.yavcMdEditor`. An application passes a small context saying where a format goes and takes the kit's command entries into its own command table.

## For agents

Every application's commands are an API (design in [docs/agents-design.md](docs/agents-design.md)). Each package under `apps/` has an `actions.json` (provider ids `yavc.files`, `yavc.editor`, `yavc.terminal`, `yavc.settings`, `yavc.slides`) in PUDL's applet actions form, with a JSON Schema for every action's input and output; `GET /api/actions` is the catalogue of all of them, with no sign-in, and `POST /mcp` is a Model Context Protocol server offering `applet_discover`, `applet_invoke`, `applet_status`, `applet_cancel` and `applet_artifact`. An invocation is relayed to a page the person has open, because their files and the applications are in the browser: the page keeps an event stream from the engine (`static/bridge.js`), runs the action through PUDL's broker and posts the record back. A person pairs an agent in Settings, under Agents, with a token the agent sends as a bearer token; the page asks the person before an action does more than the token allows. The page at `/agents` says the same for an agent to read.

## Licence

Apache License 2.0; see [LICENSE](LICENSE). Installed packages keep their own licences.
