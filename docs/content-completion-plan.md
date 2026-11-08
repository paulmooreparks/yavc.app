# Continuous content application work

Paul authorized continuous implementation and automatic local installation of verified batches on 2026-11-09. This plan replaces historical handoff entries as the working backlog. Root-checkout edits remain separate. Completed candidates are committed and installed without routine approval stops; production deployment remains outside this authorization.

| Order | Work | Acceptance |
| --- | --- | --- |
| 1 | Slides deck-wide Undo/Redo and slide-setting dirty state; presenter and fullscreen review | Structural, source, rich and metadata edits have ordered Undo; saved baselines and recovery remain correct; presentation works across supported engines. |
| 2 | Diagrams Outline/navigation and keyboard selection; Canvas embedding and D2 conversion; Obsidian compatibility | Real document fixtures cover selection/source linking, edits, conversion loss reports and external-format round trips. |
| 3 | Docs themes/templates, pagination and page-footnote improvements, review features | Authored source survives editing; page/export behavior agrees for each supported feature. |
| 4 | Encoding-aware writes, edited mixed-line-ending preservation and Office import | Original bytes remain available, edits preserve declared encoding/newline rules, and imports report unsupported content. |
| 5 | Shared language-assistance expansion | Providers share document identity, cancellation, bounded transport and failure recovery. |
| 6 | Receiving desktop adapter and offline package acceptance | The actual desktop host owns resources and recovery; one pinned package passes in its embedded browser without network dependencies. |
| 7 | Reconcile historical handoffs and old PRs | The remaining backlog reflects implemented code and verified limits. |

The upstream numeric-control extension remains external work. PUDL 0.105.0 cannot separate unrestricted typed precision from the wheel increment. The host retains `step="any"` until a documented upstream capability exists.

Slides history and presentation are committed at `8bd96a3`, installed locally and passing installed-image checks in Chromium, Firefox and WebKit. The Diagrams batch at `e771ea5` is also installed and covers D2 Outline, portable Canvas fences, copy conversion and format-level compatibility. The following batch adds saved diagram references with host-owned reads, live saved updates and Save As rebasing. Actual Obsidian saving remains a receiving-application check. The current Office writers explicitly refuse diagram blocks. No downstream desktop integration has been claimed from a portable browser fixture.

Each batch uses the required repository gate, focused cross-browser regressions and source review. Browser automation stays isolated from Paul's desktop. Independent-host and installed-image checks cover changes to shared packages. Earlier failed test evidence remains separate from successful runs.
