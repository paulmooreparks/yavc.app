# The yavc.app team and how it works

Paul formed the yavc.app team on 12 November 2026 and made the chat called yavc.app Development its lead. This page tells a team member what the project is, who decides what, and how a piece of work goes from a request to a release. An agent's memory of a conversation does not last, so anything the team needs to rely on is written here or in the documents this page points to.

## What yavc.app is

yavc.app is a Go server and a set of browser applications drawn with PUDL, Paul's design language. The applications that matter most are Editor for plain text, Docs for Markdown documents, Slides for decks and Diagrams for D2, Mermaid and JSON Canvas drawings. They run on the yavc.app website, and they are also released as a package that other programs embed. Dinah and GK Companion take that package today, and PJCP Front Office plans to.

That second use sets the tone of the work. Other projects depend on the package's contracts, so a change that looks local can break a program none of us runs.

## What to read first

1. `CLAUDE.md` at the top of the repository. Its rules apply to every commit.
2. `DESIGN.md`. Every decision is numbered there with its reason. Read the last twenty before changing anything.
3. `docs/review.md`, the record of what was tested and what went wrong before.
4. `docs/host-shortcodes-handoff.md`, the note written for each release, newest first.
5. The contract for whatever you are about to touch, under `docs`. `docs/standalone-host-brief.md` lists the host services and where each contract is.

## Who decides what

Paul owns the product. He decides scope, what is deployed to the yavc.app website, and anything public or hard to undo.

The lead decides design within that scope, reviews and merges every change, makes every release and speaks to Paul and to the other projects for the team. The lead takes these to Paul and does not decide them alone:

- a change of scope, or the removal of something a person uses
- a deployment to the yavc.app website
- a change to what the project promises about security or private data
- a disagreement with another project that the two leads cannot settle
- anything where the lead would be guessing what Paul wants

A team member decides how to build the task given, inside the contracts and decisions already written. A member who finds that a task needs a new decision, a changed contract or a wider scope stops and asks the lead before building it.

Nobody acts on a report that Paul approved something. An approval counts when it can be quoted from Paul's own message.

## How work flows

1. **A task comes from the lead**, in the team chat, addressed to one member. It says what a person should be able to do when the task is finished, what is out of scope, and how the result will be checked.
2. **The member works in a worktree and branch of its own.** Two agents in one checkout overwrite each other. Make one beside the main checkout, for example `git worktree add ../yavc.app-<your-name> -b <branch>`, and copy the four generated files Git ignores from the main checkout: `apps/md-engine/yavc-md.wasm`, `apps/md-engine/wasm_exec.js`, `apps/diagram-kit/yavc-d2.wasm` and `apps/diagram-kit/wasm_exec.js`. Never work in the lead's checkout, and never use `git stash` there. Branch from `main`, not from another open branch. The lead squashes each pull request as it merges, so a branch made from another one carries commits that no longer exist on `main` and conflicts. If your task depends on an open pull request, say so and the lead merges that one first.
3. **The member builds, tests and writes the record.** A change that alters behaviour adds or updates a test that fails without it. A decision goes into `DESIGN.md` with the next number, and what was tested goes into `docs/review.md`. A change to any applet's files needs a new version in its `applet.json`.
4. **The checks pass before a commit**: `bash scripts/check.sh --since HEAD`.
5. **The member opens a pull request** and tells the lead in the team chat. The message says what changed, what was tested and how, what was not tested, and anything the member is unsure about. A failing test is reported with its output and is never described as passing.
6. **The lead reviews and merges.** Members do not merge their own pull requests. The lead merges only when every check on the pull request has passed, the site tests included. A check that fails for a reason unrelated to the change is fixed first, not merged past. Every pull request adds a section at the end of `docs/review.md`, so one merged before yours usually makes yours conflict there. Rebase on `main`, keep every section with yours last, and tell the lead it is pushed.
7. **The lead releases**, verifies the published package against a local build, announces it to the projects that take it, and writes the handoff note.

## Rules that are easy to break

- **The repository is public.** Nothing belonging to GK Software, to a customer or to a client of Padma's goes into it or into its tests. Use neutral stand-ins.
- **Security comes first.** Anything a document, an agent or a host supplies is untrusted. Use the existing sanitising helpers and keep the size limits.
- **Never rely on undocumented behaviour** of a browser, a library or a host. Measuring what something does today does not make it a contract.
- **A change to what a person sees is reviewed against PUDL** before it is reported, with the `pudl-reviewer` agent.
- **Write a patch script with the Write tool and run it from a file.** A heredoc halves backslashes, and has broken Go and JavaScript here five times.
- **No em-dashes**, and plain complete sentences, in code comments, documents, commits and chat alike.
- **Do the right thing today.** Do not leave debt in a contract, a file format or another project's code. A choice that stays inside one file and can be replaced later is not debt.

## Tests

Playwright is taken from the PUDL checkout: `export NODE_PATH='C:/Users/paul/source/repos/pudl/node_modules'`.

The package tests run against a built package and need no server. Build one with `go run ./cmd/yavc-content -out "$TEMP/yavc-art-<your-name>"`, then run, for example, `node scripts/test-portable-workspace.cjs "$TEMP/yavc-art-<your-name>"`. Use an output folder of your own, since two members building into one folder corrupt each other's runs.

The site tests need a running server with empty data on a port of your own. `docs/review.md` says which tests cover which feature. Two site tests fail on main today, `test-diagram-chrome.cjs` and the last phase of `test-command-toolbar.cjs`. `test-portable-diagrams.cjs` sometimes crashes Firefox on navigation and passes when run again.

## Talking to each other

- Address a message to the one member it is for. Do not acknowledge a routine update.
- Ask the lead when you are blocked, when a task needs a decision, or when you find a defect outside your task. Report the defect and carry on with your task. Do not fix it unasked.
- Questions from other projects go to the lead. If one reaches you, pass it on.
- The lead sends Paul a digest and the decisions that are his. Members do not message Paul about the team's work.
