# For agents

Every application on this site is built so that an AI agent can do what a person can do in it, and can find out what that is without reading the source. This page says how. An agent that reads it has what it needs; a person who wants an agent working for them should read the pairing section and then open Settings.

## What there is

Each application publishes its actions in a manifest, in the form PUDL's applet actions contract describes: a provider id such as `yavc.slides`, and for every action a reference such as `yavc.slides/go@1`, a title and description, JSON Schemas for its input and its output, the capabilities it needs and whether running it twice matters. The whole catalogue, every manifest with its addresses resolved, is one request with no sign-in:

```
GET https://yavc.app/api/actions
```

The same catalogue, and the means to run things, is offered through the Model Context Protocol at:

```
POST https://yavc.app/mcp
```

The server speaks the Streamable HTTP transport and offers five tools: `applet_discover`, `applet_invoke`, `applet_status`, `applet_cancel` and `applet_artifact`. These are the names the PUDL specification recommends for any host of the actions contract, so an agent that has driven one PUDL site can drive this one. Discovery needs no token; the whole catalogue is large, so an agent should ask for one provider at a time once it knows which.

## Where things run

A person's files live in their browser, and so does every application; the site keeps nothing of theirs on its server but the small state that follows them between the desktop and an application's own address. An invocation is therefore relayed: the agent asks the site, the site sends the request to a page the person has open, the page's action broker runs it, and the result comes back the same way. The person watches it happen on the page they are looking at. If no page is open, `applet_invoke` says so, and the agent should ask the person to open the site.

An action marked `live` is answered by the running application. If it is not open on the page, the site opens it; `yavc.slides/present@1` and its kind open an application on a file deliberately. An action with no `live` mark runs on its own, with no window.

## Pairing

An agent acts as the person who paired it. In Settings, under Agents, the person makes a token, names the agent and chooses what it may do without asking: read their files, change their files, open windows, ask them questions. The token is shown once. The agent sends it as a bearer token:

```
Authorization: Bearer yavc_…
```

Everything an agent does with that token runs as that person, on their pages, with their files, and is listed in Settings beside the token, where the person can revoke it.

## What the person decides

An action needing more than the token grants is not refused and not run quietly. The page asks the person, in a dialog, which agent asks, what it wants to do and what that would let it do, and the person allows it once, allows it while the page is open, or refuses. An agent should expect this, and should expect a refusal to come back as a failed invocation that says so.

Some things are never an action, because they cannot be undone: forgetting everything the site keeps for a person is the person's alone, in Settings.

## A worked example

An agent with a token wants to make a deck and show it.

1. `applet_discover` with `provider: "yavc.slides"` gives the Slides actions.
2. `applet_invoke` of `yavc.slides/make@1` with the slides as Markdown gives the deck's text. This is a pure action, so it runs on any page.
3. `applet_invoke` of `yavc.slides/load@1` with that text puts it in Slides, opening Slides if it was not open, and the person sees it.
4. `applet_invoke` of `yavc.slides/save@1` with a path such as `~/talks/intro.slides.md` asks the person, unless the token may change files, and then writes it.
5. `applet_invoke` of `yavc.slides/show@1` presents it.

Each invocation comes back with its record: `done` with the output, `failed` with why, `waiting` while the person is asked, or still running, which `applet_status` reads again.
