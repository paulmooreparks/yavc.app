# Working on yavc.app

DESIGN.md holds the decisions and the reasons for them. Read it before changing anything structural, and add a numbered decision there when you make one. The docs folder holds the longer designs (agents, the page view, Slides) and the review record in docs/review.md.

## Before every commit

Run the checks, with the last commit as the ref so the version rule runs too:

```
bash scripts/check.sh --since HEAD
```

CI runs the same script on every push. Do not commit while it fails. If a rule in `scripts/check.mjs` is wrong for one line, add `check-ignore(rule-id): reason` on that line with a reason a reviewer can judge. If the rule is wrong in general, change the rule and say why in its comment.

When you fix a problem that could come back, add a rule or a test that would have caught it, and record the fix in docs/review.md or DESIGN.md.

## Rules the checks enforce

- Any change to an applet's files needs a new version in its `applet.json`.
- Browser code uses the shared modules instead of its own copies. `internal/web/static/yavc-util.js` provides escaping, script loading, downloads, shortcut labels and error notices. `internal/web/static/dialogs.js` provides every dialog. Never use `alert()`, `confirm()` or `prompt()`.
- An applet action that returns file content declares `files.read`, so that an agent has to ask before reading through it.
- Glyphs must exist in PUDL or be defined on `:root` in a project stylesheet. Project glyphs are named `--glyph-yavc-*`.
- No em-dashes in any text.

## Rules the checks cannot enforce

- Security comes first. Anything an agent or a Markdown document supplies is untrusted, including HTML, CSS, YAML front matter, file paths and PPTX files. Sanitise it with the existing helpers and keep the size limits.
- Follow the Architectural Principles and PUDL. Buttons act and links navigate, every state has a URL, and errors appear as PUDL notices beside the control that failed.
- Write patch scripts with the Write tool and run them from a file. Bash heredocs halve backslashes and have broken Go and JavaScript literals here more than once.
- Deploy with `docker compose up -d --build` and check the change on https://yavc.app before reporting it as done.

## The site tests

The workflow `site tests` runs the tests listed in `scripts/site-tests.txt` in Chromium on every push to main, each against a fresh server (`node scripts/run-site-tests.mjs`, after building `yavc` and the two wasm engines). When you repair a test that is not listed, add it to that file in the same pull request. A change to an applet should also run that applet's own site and package tests before it is reported.
