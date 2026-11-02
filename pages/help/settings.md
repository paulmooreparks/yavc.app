# Settings Help

[Settings](/settings) chooses how the site looks, says what the site keeps for you and forgets it on request, and pairs AI agents with the site. It opens from the site's own menu, at the left of the menu bar. On the desktop it opens in a window, and it is also a page at `yavc.app/settings` and runs on its own at `settings.yavc.app`.

## Appearance

The Appearance card has three choices, and each one applies at once.

- **Mode** is Light, Dark or Follow the System, which follows your computer's own setting.
- **Skin** sets the shape and depth of every control. The skins come from the PUDL release installed on the site.
- **Colours** sets a colour theme, which goes with any skin, in light and in dark.

The site's View menu offers the same three choices under Mode, Skin and Colours. The site keeps your choices under your session, so they follow you from the desktop to each application's own address.

## What this site keeps

The site keeps your appearance choices, each application's settings and each application's state, such as a game in progress, under an anonymous session. That is why the same game is on the desktop and at the game's own address. Nothing in the session identifies you, and a session that goes unused for {{retention}} is removed.

The files you make in the Editor, the Terminal, Files or a game's saves are kept in this browser alone, under the address you made them at, and the site never sees them. [Files Help](/help/files) says more about how they are kept.

Forget Everything This Site Keeps for You asks first, and then removes the session with everything in it, including any agent tokens. The page then starts afresh. Your files in this browser are left alone.

## Agents

An AI agent can work the applications here through the site's MCP endpoint, as you. It runs on a page you have open, with your files and your state, and the page asks you before it does anything its token does not already allow.

1. Choose Make a Token, and give the agent a name, which the page shows you when the agent asks for something.
2. Tick what the agent may do without asking: Read Your Files, Change Your Files, Open Windows and Ask You Questions. For anything else, the page asks you each time.
3. Choose Make the Token, and copy the token at once, since it is shown only this one time. Give it to the agent as a bearer token for the site's `/mcp` address.

The card lists each token with what it may do unasked, when it was made and when it was last used. Revoke stops an agent from reaching the site, and a new token can be made at any time. The page [For Agents](/agents) explains to an agent how to use the site.
