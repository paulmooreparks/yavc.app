# Agents: every application's commands as an API

yavc.app is built so that an AI agent can do anything a person can do in an application, and can find out what that is without reading the source. This document records the design. The decisions are numbered and dated so that later changes can refer to them.

## Decisions

1. **Every application publishes an actions manifest** (2026-11-03). Each package under `apps/` has an `actions.json` in the PUDL applet actions form, which `pudl-actions.js` brokers in the page and the PUDL specification's chapter 9 states for any host. The manifest lists the provider's id, `yavc.<slug>` for the site's own applications, and every action with a reference such as `yavc.slides/go@1`, a title and description, JSON Schemas for its input and output, the capabilities it needs and its replay rule. Installed packages under `applets/` keep the manifests they came with and their own provider ids; a package without one still publishes its `handles` verbs, which the broker turns into actions. The rule for what goes in a manifest is that every command in the application's command table that does not merely open a dialog has an action, every piece of state a person can see has an action that reads it, and anything a person can change has an action that changes it. A command that asks the person a question, such as Save As, has an action that takes the answer as input instead.

2. **Two kinds of action, and the open applet answers the second** (2026-11-03). An action over data alone, such as parsing a deck or rendering Markdown, is `pure` and lives in the manifest's `module`, so it runs with no window open and anywhere the broker runs. An action over the application's live state, such as going to a slide or saving, is `live`, and the running applet attaches its handlers with `pudlApplets.attach(id, handlers)` as it starts. A live action with no open applet is answered by opening one: the broker waits for an attach, and the host's `yavc.<slug>/open@1`-style handles actions bring the window. On a standalone page the applet is always open.

3. **A catalogue the engine serves, with no browser** (2026-11-03). `GET /api/actions` on the site returns every manifest the package scanner found, as JSON, with each `module` address made absolute and each provider's page address beside it. An agent reads it with one request and no session. The same list, written for a reader, is the page at `/agents`, in the Help menu as "For agents". The catalogue is the only discovery the site offers; there is no registry an agent must sign into to see what exists.

4. **An MCP server on the engine, relaying to the person's browser** (2026-11-03). The engine serves the Model Context Protocol at `POST /mcp` over the Streamable HTTP transport, with the five tools the PUDL specification recommends as the binding of the actions contract: `applet_discover`, `applet_invoke`, `applet_status`, `applet_cancel` and `applet_artifact`. Discovery answers from the catalogue. The other four cannot run on the server, because decision 11 of DESIGN.md keeps a reader's files in the browser and every applet runs there, so the engine relays them to a page the person has open: each page keeps an event stream from the engine open, bound to the session cookie, the engine sends the invocation down it, the page runs it through `pudlApplets.invoke` and posts each change of the record back, and the MCP tool answers from those reports. When no page of the session is connected, `applet_invoke` says so and tells the agent to ask the person to open the site. This is the shape PUDL Desktop's MCP server has, a client of the site in the same process, turned round for a site whose state is in the browser.

5. **An agent acts as the person who paired it** (2026-11-03). An MCP client does not hold the browser's cookie, so the person makes a pairing token in Settings, under "Agents", and gives it to the agent, which sends it as a bearer token. The engine keeps the token's hash in the session, so the agent is the session: its invocations go to that person's pages, run with that person's files and state, and are listed in Settings, where the person can revoke the token. A token is shown once, when made. Discovery needs no token. Without accounts there is nothing else to be, so this is the whole of agent identity until accounts arrive, when a token belongs to an account instead.

6. **The person decides what an agent may do** (2026-11-03). An invocation relayed from an agent runs with the grant the token was made with, which by default is the capabilities that have no effect beyond the page, `artifact.create` and `notification.post`. An action needing more, such as `files.write` or `window.open`, reaches the host's `pudlApplets.confirm`, which asks the person in a PUDL dialog on the page that runs it, saying which agent asks, which action, and which capabilities, with "Allow", "Allow for this session" and "Refuse". A token may also be made with a wider grant, for an agent the person trusts, and the dialog is then skipped for what the grant covers.

7. **Which page runs it** (2026-11-03). A session may have several pages open, the desktop and standalone ones. The engine sends an invocation to the page that most recently told it that it was in front; every page reports that when it gains focus or becomes visible. An invocation whose action is live, when its applet is not open on that page, is answered as decision 2 says. The person therefore sees the agent's work on the page they are looking at.

8. **Invocation records live in the engine only while they run** (2026-11-03). The engine keeps the records of relayed invocations in memory, with the views the page posted, for one hour after they finish, so an agent whose call timed out can still read the result with `applet_status`. Nothing about invocations is written to the session file. A page that closes mid-invocation leaves the record running until the broker's own limit passes; the next report after that is refused and the record is marked failed with that reason.

## What this is not

The engine runs no action itself, and no agent gets a sandboxed JavaScript engine on the server as parkscomputing.com's agents do. That follows from DESIGN.md decision 11 and costs nothing for a pure action, which the page runs just as well. If a server-side home arrives with accounts, pure actions may then run in the engine as well, and nothing in the manifests changes.

The engine does not translate an application's menus into tools. An agent gets the actions, with schemas, which say what the application does; the menus say how a person reaches the same things. Keeping the two in one command table, as PUDL's applet contract already does for toolbars and menus, is the application's job, and the review of a package checks that the manifest covers the command table.

## The wire

### Catalogue

`GET /api/actions` returns:

```json
{
  "site": "https://yavc.app/",
  "providers": [
    { "id": "yavc.slides", "applet": "slides", "title": "Slides", "page": "https://slides.yavc.app/",
      "manifest": "https://yavc.app/applets/slides/actions.json?v=0.2.0",
      "actions": [ { "ref": "yavc.slides/go@1", "title": "…", "description": "…", "inputSchema": {}, "outputSchema": {}, "capabilities": [], "replay": "once", "live": true } ] }
  ]
}
```

The entries are the manifests' own, unchanged, with `module` resolved to an absolute address. `handles` verbs the package declares without an action are listed as the broker publishes them.

### Pairing

`POST /agent/tokens` with the session cookie makes a token: the body is `{ "name": "Claude", "grant": ["files.read"] }` and the answer `{ "id": "…", "token": "…", "name": "…", "grant": [], "created": "…" }`, the token in clear this once. `GET /agent/tokens` lists them without the token, `DELETE /agent/tokens/{id}` revokes one. These are the Settings panel's requests. The token is 32 random bytes, base64url; the session file keeps `sha256` of it.

### The page's stream

`GET /agent/stream`, with the session cookie, is a `text/event-stream` the page keeps open. Each `invoke` event is `{ "id", "action", "input", "owner": { "kind": "agent", "name" }, "grant", "runMs" }`; a `cancel` event is `{ "id" }`. The page posts `POST /agent/report` with each record view as `pudl:applet-invocation` gives it, and with an artifact's bytes when the record is done and has any. `POST /agent/front` says the page is in front.

### MCP

`POST /mcp` speaks JSON-RPC 2.0 as the Streamable HTTP transport asks, protocol versions `2025-06-18` and `2025-03-26`, with `Mcp-Session-Id`. The bearer token, when given, pairs the MCP session to the person's session. `tools/list` gives:

- `applet_discover` `{ provider?, action? }`: the catalogue, one provider's part or one action.
- `applet_invoke` `{ action, input, requestId?, waitSeconds? }`: relays the invocation and waits up to `waitSeconds` (default 60, at most 600) for it to finish, answering with the record whatever its status.
- `applet_status` `{ id }`: the record as last reported.
- `applet_cancel` `{ id }`: asks the page to cancel it.
- `applet_artifact` `{ id, key }`: an artifact's bytes, as an image when it is one and as base64 text otherwise.

A record is `{ id, action, owner, status, input, output?, error?, request?, artifacts, created, updated }`, the broker's own view. The server's `instructions` tell an agent to discover first, to pair before invoking, and that the person may be asked to allow an action.

## Order of work

1. Manifests for Slides and Settings, and live handlers in both. The Editor, Files and Terminal came with manifests from parkscomputing.com; they are kept, and the Editor's and the Terminal's grow in a later round to cover their command tables (decision 1).
2. The catalogue at `/api/actions` and the `/agents` page.
3. Pairing tokens in the session store and the Settings panel's Agents card.
4. The page stream, `bridge.js`, and the confirm dialog in the host.
5. The MCP server.
6. A review of each manifest against its command table, as the reviewer brief asks.
