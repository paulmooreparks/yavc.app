# Native source preservation audit

This batch checks native source through the actual browser applications and Markdown WASM engine before the Docs/Editor split. It fixes two observed no-op save defects without claiming that the broader byte/encoding gate is complete.

## Findings and changes

Slides previously reconstructed the whole deck from trimmed slide text and canonical `---` separators. Opening and saving could remove trailing spaces and blank lines, change line endings, alter separator whitespace and add a final newline. The parser now retains original front matter, body spans, separators and BOM as serializer provenance. An unchanged deck writes its original source. An edited slide replaces that slide's span, using the source's newline convention; other slide spans and separator lines remain intact. Structural slide changes may add necessary line boundaries, and changed content uses the domain serializer's documented representation.

Editor's CodeMirror buffer normalizes line endings. Previously Save submitted that normalized buffer even when the resource had not changed. Editor now compares its canonical buffer with the original issued text and submits the original when they agree. Its saved/dirty baseline uses canonical text, while the resource acknowledgement retains the submitted original. This also preserves untouched BOMs and mixed line endings through repeated no-op saves and Save As. The legacy writer retains the same original-text behavior without changing its storage authority.

The Markdown parser/serializer already retains original source metadata and protects unsupported constructs as source nodes. Existing Go tests cover mixed and CRLF line endings, typed JSON round trips, unknown constructs, escaping and source-block fallbacks. The browser corpus additionally round-trips comments, unknown shortcode source and fenced-code information through the actual WASM engine, then changes a neighboring heading and checks those spans remain present.

## Evidence and limits

The bounded byte stage in `text-bytes-contract.md` adds a host-owned read-only byte snapshot and a strict shared Unicode codec. New eligible UTF-8 uploads retain signatures and newline bytes; malformed or unsupported text remains a binary file instead of receiving replacement characters. Real Files upload, reload and authority-bound tests run in all three engines. The stage also refuses isolated-surrogate writes, because UTF-8 cannot represent those code units without replacement. It does not yet make UTF-16 writable or provide edited mixed-EOL transaction mapping.

`scripts/test-content-preservation-routing.cjs` exercises Editor no-op saves and Slides no-op saves across empty content, BOM, CRLF, mixed endings, legacy CR endings, trailing whitespace, fences containing separators and missing final newlines. It also edits one slide and deck metadata while checking untouched source spans. The separate resource/Save As/recovery regression and Slides HTML/PPTX/PDF/exclusion checks cover shared consumers.

The resource contract still carries decoded strings. This is not a UTF-16/byte-preserving file API, and the bounded byte read/identify/decode/encode contract remains open. Edited mixed-EOL source in CodeMirror still needs a maintained raw-to-canonical transaction mapping, including Undo and recovery. A touched Slides span can use canonical source and does not promise preservation of every whitespace choice inside that edited span. Arbitrary extension support and the full unsupported-syntax corpus remain split gates. Those limits must be closed or enforced by declared format capabilities before activating the separate writable Docs package.
