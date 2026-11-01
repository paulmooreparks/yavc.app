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
| `-data` | the folder the engine keeps sessions in | `data` |
| `-retain` | how long a session lives unseen | `2160h` (90 days) |

## Applications

An application is a [PUDL applet package](https://github.com/paulmooreparks/pudl-applet-packages): a folder with an `applet.json`. The ones under `applets/` are installed from their own repositories at a tagged release, each with its licence beside it; the ones under `apps/` are this site's own. Adding an application is adding a folder; the engine reads the manifests and writes the registry, the pages, the windows and the menus from them.

## Licence

Apache License 2.0; see [LICENSE](LICENSE). Installed packages keep their own licences.
