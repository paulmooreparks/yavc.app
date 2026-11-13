# Points: a loyalty program adviser

Points is an application for a person who collects airline miles and wants to know where they stand and what to do next. The person picks a program, records their own standing in it, and lists flights they are considering. Points works out what they still need for the next tier and which of those flights get them there for the least money. Paul asked for it on 2026-11-13, and his own first use is reaching KrisFlyer Elite Silver with Singapore Airlines.

This document records the design. The decisions are numbered and dated so that later changes can refer to them. DESIGN.md decision 152 is the summary.

## Decisions

1. **Points is a package of this repository** (2026-11-13). It lives in `apps/points` in the PUDL applet package format, with the slug `points`, so it opens as a window on the desktop and as a page at `points.yavc.app`. It wants `fs`, `snapshot` and `config` from the host and no engine service.

2. **A program's rules are a data file** (2026-11-13). Each program has one file under `apps/points/programs/`, and `krisflyer.json` is the first. The file lists the program's tiers, what each tier requires, how long the qualifying period and the membership last, and the earning rate for each carrier and booking class. Every rule has the address of the page it was taken from and the date somebody last checked it, and the window shows both beside the rule. The applet's script contains no program's numbers, so adding a program is adding a file. The files are JSON because the browser reads them and the site has no XferLang reader for the browser; DESIGN.md decision 4 covers the engine's own files.

3. **Only what the airline publishes goes into a rules file** (2026-11-13). A figure enters a program file from the airline's own published page. A figure found only on a blog or a forum stays out until it is confirmed there, and the window says "not confirmed" where a rate is missing instead of showing a guess. The section on KrisFlyer below lists what is confirmed today.

4. **A person's standing is a file in their home folder** (2026-11-13, approved by Paul). The profile is `~/points/<program>.json`. It records the current tier, the qualifying miles earned so far, how many of those were earned on the ground, the date the qualifying period ends, and the redeemable balance. The membership number is not asked for. The file stays in the browser with every other guest file (DESIGN.md decision 11), so the server never receives it.

5. **The person types the profile, and an agent may fill it in** (2026-11-13, approved by Paul). The profile is a short form, and the form alone is enough to use the application. An agent the person has paired can write the same file through the applet's actions, for example after reading the person's account page in their own signed-in browser. The site never signs in to an airline, never asks for an airline password and never fetches an airline's pages. A box that accepts text copied from the account page and fills the form from it is wanted, and it is built once there is a sample of that text to build it against. It only fills the form for the person to check, so the application keeps working when the airline changes its page.

6. **The applet does arithmetic, and an agent gives advice** (2026-11-13, approved by Paul). The applet answers the questions that have one right answer: how many qualifying miles are still needed, by what date, how many a given flight earns, what each candidate flight costs per qualifying mile, and which set of candidate flights reaches the tier for the least money. A paired agent does the work that needs judgement or the open web, such as finding flights and fares, weighing a detour against its price, and suggesting how to earn redeemable miles. The agent uses the applet's actions for every figure, so its advice and the window agree. The site has no language model service, and adding one waits for accounts.

7. **The site fetches no fares** (2026-11-13). A candidate flight has a route, a carrier, a booking class and a price, and the person or an agent supplies all four. No free source of fares with a documented interface is known, and the application does not depend on one.

8. **Distance is an estimate unless the person gives the airline's figure** (2026-11-13). The applet estimates the miles of a route as the great-circle distance between the two airports, from a table of airports in the package, and labels the result as an estimate. An airline credits miles from a table of its own, which can differ. A candidate flight therefore accepts the miles figure from the airline's own calculator, typed by the person or supplied by an agent, and uses it in place of the estimate.

9. **Everything an agent or a pasted text supplies is untrusted** (2026-11-13). Each action validates its input against its schema, with limits on lengths, on counts (at most 200 candidate flights) and on number ranges. Text from a paste or an agent is written into the page as text and never as markup. The action that returns the profile declares `files.read`, and the ones that change the profile or the candidates declare `files.write`, so an agent has to ask before either.

10. **Every view has an address** (2026-11-13). The address states the program and the view, as in `points.yavc.app/?program=krisflyer&view=flights`. The views are Standing, Flights, and Rules. The profile form is a view, and it is not a dialog.

11. **The window says what it is not** (2026-11-13). Points is not connected to any airline, and its figures are a calculation from published rules and from what the person typed. The Rules view says so, with each rule's source and the date it was checked, and so does the footer of Standing.

## KrisFlyer, as checked on 2026-11-13

These figures were read from Singapore Airlines' page on Elite qualification and belong in the first rules file.

- Elite Silver requires 25,000 Elite miles earned within 12 consecutive months.
- Elite Gold requires 50,000 Elite miles earned within 12 consecutive months.
- Elite miles earned on the ground count for at most 20 percent of the requirement, which is 5,000 for Elite Silver and 10,000 for Elite Gold.
- A membership lasts 12 months, and the upgrade happens within a day of reaching the requirement.
- PPS Club requires 25,000 PPS Value within 12 months, and PPS Value is earned only in Suites, First and Business.

These are not yet confirmed from the airline's own pages, and the Builder confirms each before it enters the file.

- The earning rate for each booking class on Singapore Airlines flights is unconfirmed. A guide from April 2026 gives 200 percent for F and A, 150 for Z, C and J, 125 for U, S and T, 100 for L, P, Y, B and E, 75 for M, H and W, and 50 for Q, N, V and K. It gives no rate for D.
- Whether Scoot flights earn Elite miles, and at what rate, is unconfirmed, because the guides disagree.
- The earning rates on Star Alliance and other partner carriers are unconfirmed. The airline publishes a table for each partner.
- Which bookings earn nothing is unconfirmed. One guide lists award tickets, group bookings in class G and codeshare flights.
- The requirement for Solitaire PPS Club is unconfirmed, because the airline's page and the guides state it differently.
- The date from which the 12 consecutive months are counted for a member with no tier is unconfirmed. The profile records the end date the account page shows, so the arithmetic does not need this rule.

Sources: [KrisFlyer Elite qualification](https://www.singaporeair.com/en_UK/ca/ppsclub-krisflyer/krisflyer/krisflyer-elite-qualification/), [KrisFlyer Elite Silver](https://www.singaporeair.com/en_UK/ppsclub-krisflyer/krisflyer/krisflyer-elite-silver/), [The PPS Club](https://ws.singaporeair.com/en_UK/id/ppsclub-krisflyer/ppsclub/the-ppsclub).

## The views

**Standing** shows the current tier, the next tier, the qualifying miles earned and still needed, the date the period ends, and how much of the ground allowance is left. When the candidate flights can reach the tier, it shows the cheapest set that does and its total price. When they cannot, it says how many miles short the whole list is.

**Flights** is the list of candidate flights. Each row shows the route, carrier, booking class, price, the qualifying miles it earns and the price per qualifying mile, and the list is sorted by that price. A row whose booking class has no confirmed rate shows "not confirmed" and takes no part in the ranking.

**Rules** shows the program's tiers and earning table as the file states them, each with its source and the date it was checked.

**Profile** is the form for the person's standing.

## Actions

The provider is `yavc.points`. Pure actions run with no window open.

| Action | Kind | What it does |
|---|---|---|
| `programs@1` | pure | Lists the programs the package has. |
| `program@1` | pure | Returns one program's rules with their sources and dates. |
| `standing@1` | pure | Takes a profile and returns the next tier, the miles needed and the ground allowance left. |
| `earn@1` | pure | Takes a flight and returns the qualifying miles it earns, and whether the distance is an estimate. |
| `rank@1` | pure | Takes a profile and candidate flights and returns them ranked by price per qualifying mile, with the cheapest set that reaches the next tier. |
| `profile-read@1` | live, `files.read` | Returns the saved profile for a program. |
| `profile-write@1` | live, `files.write` | Saves a profile. |
| `flights-read@1` | live, `files.read` | Returns the saved candidate flights. |
| `flights-write@1` | live, `files.write` | Adds, changes or removes candidate flights. |
| `show@1` | live | Shows a view of a program in the window. |

The candidate flights are kept in `~/points/<program>-flights.json` beside the profile.

## Order of work

1. The KrisFlyer rules file, with every unconfirmed item above either confirmed from the airline's pages or left out.
2. The calculation module and the five pure actions, with unit tests that include the ground allowance, a class with no rate and the cheapest-set search.
3. The window with its four views, the profile form and the candidate list.
4. The live actions, and a review of the manifest against the command table.
5. The PUDL review, a site test listed in `scripts/site-tests.txt`, and the deploy.
6. The paste box, when a sample of the account page's text is available.

## Open questions

1. **Which program comes second.** The rules format is tested properly only when a second program with different rules, such as one that counts segments or spend, is written in it.
2. **Advice inside the window.** A language model service on the site would let the window give advice with no agent attached. It needs accounts first, so that its cost has an owner.
3. **Redeemable miles.** Earning rates from cards and partners differ by country and change often. The first version leaves them to the agent and keeps no table of them.
