# Launch profiles and file associations

This proposal records the response to Paul's questions on 2026-11-07. File-association implementation has not started. Docs already uses the Editor package, as DESIGN.md's Addresses section and decision 17 of `docs/docs-design.md` describe.

## Editor and Docs

Editor and Docs should remain two named launch profiles of one applet implementation. Docs starts with document creation and Document view. Editor starts with general text/code editing and its applicable view defaults. Both profiles use the same file tabs, editing engine, save lifecycle, formatting and export code. A user can choose Text while working in Docs or Document while working in Editor.

A launch profile needs a stable ID, display name, default new-file type and supported default view. It should be usable from the launcher, a standalone address, a desktop window and Open With. The current Docs subdomain alias supplies only part of that contract. Separate applet implementations would duplicate state and editing behavior without adding a useful boundary. If packages must expose separately named launcher entries, both entries should still invoke the same implementation through declared profiles.

The existing per-origin guest storage boundary remains significant. Launching Docs inside the desktop can share that desktop's files, while navigating to `docs.yavc.app` enters a different browser origin. Naming profiles does not make those stores interchangeable. An association must use the current host's file capability rather than navigating a guest's file path to another origin.

## Current routing

Applet manifests declare operation handlers such as Editor's `open`, Slides' `present` and Diagrams' `diagram`. Files separately tests `.slides.md` and the diagram suffixes before falling back to `open`. Editor independently chooses supported views and document defaults. MIME type is currently used in other file-serving and artifact paths; it does not provide a unified applet-and-view association policy.

## Proposed resolver

One host service should resolve a file to an installed applet, launch profile, operation and initial view. Files, recent files, links and desktop hosts should use that service instead of copying suffix rules. Applet metadata should declare supported content types and profiles; host defaults should select among them, and user configuration should override the default choice within those supported capabilities. Manifest metadata remains JSON under DESIGN.md decision 8. Host policy should use the engine's configuration format and be exposed through the existing configuration capability; this proposal does not add fields to the shared PUDL package contract without coordinating that schema.

The resolver should use this order:

1. An explicit Open With or URL choice wins if that applet and mode support the file.
2. A user association overrides the shipped default. Filename matching is case-insensitive and uses the longest matching suffix.
3. Shipped compound-suffix associations precede generic suffix and MIME matches.
4. A known MIME type can supply a choice when filename rules do not identify a supported handler. Generic `text/plain` and `application/octet-stream` do not override a specific filename convention.
5. An unrecognized file offers supported Open With choices or download. Text fallback requires text identification; unsupported binary data is not opened as text automatically.

A remembered view for an existing document takes precedence over an association's initial-view hint. An explicit current opening choice takes precedence over that remembered view. An invalid or unsupported choice is explained beside Open With and offers an available alternative. Associations never authorize execution, unsanitized HTML, automatic full-screen presentation or access beyond the current file grant. MIME metadata is a hint and remains untrusted.

The shipped defaults would include these associations:

| Filename | Applet/profile | Initial mode |
| --- | --- | --- |
| `*.docs.md` | Editor / Docs | Document |
| `*.slides.md` | Slides | Visual editing |
| `*.canvas` | Diagrams | Visual editing |
| `*.d2`, `*.mmd`, `*.mermaid` | Diagrams | Split |
| `*.md` | Editor / Editor | User's Markdown preference |
| `*.html`, `*.css`, `*.js`, `*.json`, ordinary text | Editor / Editor | Text |

HTML should open as source by default because editing source and viewing its rendered result are different operations, and the current Editor does not have a rich HTML editing mode. A separate Preview action can keep the established sandbox and sanitization boundary. `.docs.md`, `.slides.md` and `.canvas` retain their existing storage formats; a profile does not create another file format.

Settings should expose File Associations with a default app/profile and starting mode, plus Reset to Default. Open With should offer one-time opening and an explicit Always Use choice. The resolver should return both its choice and the rule that selected it so the UI can explain an unexpected opening. Persistence should contain stable applet/profile IDs and validated modes, with unavailable choices retained but visibly unavailable. Resolver tests should cover compound suffix precedence, case, MIME disagreement, missing applets, user overrides, supported modes and guest-origin isolation.
