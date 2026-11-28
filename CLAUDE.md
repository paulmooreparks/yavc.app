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

The workflow `site tests` runs the tests listed in `scripts/site-tests.txt` in Chromium, Firefox and WebKit on every pull request and every push to main, each test against a fresh server (`node scripts/run-site-tests.mjs`, after building `yavc` and the two wasm engines). The same workflow runs the package tests in the three browsers. When you repair a test that is not listed, add it to that file in the same pull request.

### The verification gate

Paul set these rules on 28 November 2026. They replace the one-rerun rule and the local three-browser gate.

The hosted run on the pull request's head is the gate. Push the branch and let the hosted runner run the full matrix. Do not run a full browser matrix on a working desktop. Locally, run only the tests the change touches, in one browser, to see them pass before you push.

WebKit is checked on the hosted Linux runner. WebKit on Windows is not a gate, because nobody who uses yavc.app runs it. A failure seen only in WebKit on Windows does not block a merge or a release.

### When a test fails

State a cause before any rerun. Read the failing line and the log, and write down why it failed. A rerun without a stated cause is not allowed, on the hosted runner or locally, and a passing rerun explains nothing. Keep the first log. The site runner writes each local run to a new folder, and the hosted runner uploads the logs of a failed job.

A failure that nobody can reproduce gets one stress run of about an hour on the hosted runner:

```
gh workflow run stress.yml --ref <branch> -f tests="test-launcher.cjs" -f engine=webkit -f minutes=60
```

The run repeats the test and keeps the logs of every round that failed. If it reproduces the failure, diagnose it from those logs. If it does not, close the item in `docs/backlog.md` with a link to the stress run. An item is never left open as unexplained.

A red run on main stops every merge until main is green. The other way to lift the stop is to set the failing test aside in `scripts/site-tests-set-aside.txt` with the browser, the date, an owner and the cause as far as it is known. The owner removes the line in the pull request that repairs the test, and every run prints the tests that are set aside.

A missing test record, a ledger mismatch, a digest or integrity mismatch, and a failed build or packaging step block the gate. None of them can be set aside.
