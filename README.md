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
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o apps/editor/md/yavc-md.wasm ./cmd/yavc-md
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" apps/editor/md/
```

The Docker image builds it itself. Neither file is committed.

The engine includes parkscomputing.com's shortcodes (`internal/shortcodes`): `{{tip:Title}} … {{/tip}}` and the other notices, `{{expand}}`, `{{columns}}` with `{{column}}`, `{{figure:/path alt="…"}}`, `{{applet:name}}`, `{{video:youtube ID}}`, `{{code:~/bin/hello}}`, `{{toc}}`, `{{status:green Done}}`, `{{kbd:Ctrl+S}}`, `{{glyph:check}}`, `{{page:slug}}`, `{{anchor:name}}` and `{{draft-note}}`. The Editor's Insert menu offers each with an example.

## Licence

Apache License 2.0; see [LICENSE](LICENSE). Installed packages keep their own licences.
