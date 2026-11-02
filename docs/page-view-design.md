# The page view: editing shortcodes as rich text

The page view is the Visual view of the Editor and the canvas of Slides: ProseMirror over a document the Markdown engine builds (`internal/pageview`) and writes back, block by block, so that a block the person did not touch is written back byte for byte. This note records how shortcodes are edited there. Paul set the requirement on 2026-11-03: a shortcode's content has to be editable in place, as rich text, because editing it only as raw Markdown would stop people using the thing.

## Decisions

1. **A container shortcode is a rich block with blocks inside it** (2026-11-03). A tip, note, info or warning notice, an expand section, a note to self, a class box, speaker notes and a column set are nodes of the editor's document whose body is edited as any run of blocks is: typing, formatting, lists, tables, pictures and further shortcodes inside them all work as they do on the page. The engine reads a container's body as a small document of its own (the preview marks every block with its source lines, so the body's blocks are found the same way the page's are), and writes it back between the container's own opening and closing lines, which are kept as they were. The box is drawn with the same HTML the preview draws for it, so what is edited looks like what is published. A `{{style}}` block stays a source block, since its body is CSS.

2. **A column set is a row of columns** (2026-11-03). `{{columns}}` becomes a block holding one column per part of its body, divided by the `{{column}}` lines; each column is edited as a run of blocks, and the dividing lines are written back as they were, or as `{{column}}` for a column added in the editor.

3. **A block shortcode is a form** (2026-11-03). A shortcode that stands alone and has no body (a picture, a video, an applet, a code listing, the contents, a page link) is drawn as the preview draws it and edited through a dialog of its settings, as the picture dialog already does; a click on it opens the dialog. Until a shortcode has its form, a click edits its Markdown in place, as before.

4. **A span shortcode is a mark** (2026-11-03, already built). Coloured words and styled words are marks on the text, applied from Format and written back as `{{color:…}}…{{/color}}` and `{{class:…}}…{{/class}}`.

5. **The box's settings and ways out** (2026-11-03). A box shows a small bar while the pointer or the keyboard is in it, with Settings for its title or arguments, Remove the Box, which lifts its content onto the page, and Edit as Markdown, which turns it back into a source block for anything the rich form cannot say. Enter on an empty last line of a box leaves the box, as Enter on an empty last item leaves a list.

## Round trip

A container keeps its source text and its opening and closing lines. Writing it back joins the opening line, each inner block written as the page writes blocks (an unchanged block as its own text, a changed one afresh), the blank text that trailed the body, and the closing line. A container whose body the person did not change therefore comes back byte for byte, and the engine's tests hold it to that.
