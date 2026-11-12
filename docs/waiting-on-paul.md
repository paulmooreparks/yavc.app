# Waiting on Paul

This page lists the decisions the yavc.app team needs from Paul, so that they do not scroll away in a chat. The lead keeps it current: a question is added when it is asked and removed when Paul answers, and the answer goes into DESIGN.md.

## Language support for each file type

Paul asked on 2026-11-12 how the Editor and Docs can gain syntax highlighting and language servers one file type at a time. The proposal is `docs/language-packs-design.md`. Dinah Team Lead and PUDL Team Lead have reviewed it, and nothing is built.

1. **Should highlighting simply come with the applets?** The proposal is that every common language's colouring is part of the package and loads only when a file of that type opens, so nobody installs anything for colours. Installing is kept for language servers, which are large and can run code. The alternative is that colouring is installed language by language too.
2. **Which languages matter first for a language server?** The proposal assumes Go and C#, then TypeScript and Python.
3. **Should packs be only ones the team builds, for now?** The proposal says yes, because a pack is code that runs with the application's authority. Packs from others would need a way to trust them.
4. **Should the rendered page colour code too?** Today only the editing views colour code. The page you read and Preview show code in one colour. Colouring them needs a highlighting engine chosen and added, which is separate work.

## Keeping Edit Diagram

Paul asked on 2026-11-11 whether a diagram shown in a document could be edited in place, as OLE once allowed. The answer built that night, while Paul was asleep, is the Edit Diagram command: with the cursor on a diagram that comes from a file, Edit Diagram opens that file in Diagrams, and when it is saved the picture in the document draws again. It is in the Format menu, on the right-click menu over the diagram, and as a button in the diagram's form. It has shipped since v0.2.72, and Dinah and GK Companion use it, including for a diagram kept on a Confluence page.

Paul approved the direction, a diagram kept as its own file and edited in Diagrams, but never approved this command by name. The question is whether to keep it as it is.
