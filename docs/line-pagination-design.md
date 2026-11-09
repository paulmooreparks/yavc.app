# Source-free line pagination

Document view keeps one logical ProseMirror document. Paragraphs can cross a physical page without creating paragraph nodes, changing Markdown or entering Undo. Lists expose their paragraph boundaries, including tight lists in prepared print content. Tables expose row boundaries. Unsupported source blocks and individual table rows remain atomic in this stage.

The layout reader measures text with DOM ranges and finds the first UTF-16 character on each rendered line by binary search. It never places a boundary inside a surrogate pair. It skips source-node internals and indivisible inline content. A paragraph has at most 20,000 measured lines; an excessive or unsupported block retains the existing oversized-content refusal. The document planner retains its 1,000-page ceiling.

The first and last pairs of paragraph lines form keep groups. This supplies the default two-line orphan and widow protection while preserving explicit breaks. Headings keep the first protected lines of the following paragraph. An impossible keep group falls back to the bounded unit behavior rather than looping.

Page gaps are ProseMirror widget decorations or read-only DOM spacers. Inline spacers use a block-level span, following the standard [anonymous block formatting rules](https://www.w3.org/TR/CSS2/visuren.html#anonymous-block-level). Existing gap heights are subtracted from measurements so repeated layout reaches the same result. List spacers use block display and do not increment the list counter. Table spacers use a row with a spanning cell.

Print measures the prepared export content independently after exclusions and assets have resolved. Each sheet clones the range between the same kind of line or block boundaries. The documented [DOM range cloning operation](https://dom.spec.whatwg.org/#dom-range-clonecontents) retains partially selected formatting ancestors. Continued ordered lists retain their starting item number, continued items suppress their repeated marker, and partial ancestors suppress repeated outer margins. Printing never edits the source model.

The browser fixtures compare exact source before and after pagination and Undo, check stable repeated measurements, and compare printed content without renderer-only inter-block whitespace. They also verify that every prepared print fragment fits its physical content area. Actual pagination can differ between engines when their text metrics differ. Both a given engine's editor and print paths use that engine's measured layout.

Splitting oversized table rows, repeating table headers, fragmenting arbitrary shortcode containers and page-footnote allocation remain further work. Those boundaries must stay visible until their own source, selection and print checks pass.
