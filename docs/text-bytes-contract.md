# Bounded source bytes and strict text decoding

The file resolver needs verified source before it can offer Editor for an unfamiliar suffix. A filename or MIME value cannot establish that the bytes can be decoded without loss. This batch provides a read-only byte capability and a shared strict codec through the existing host authority. It does not activate dispatch or introduce another file store.

## Host-owned byte reads

The optional yavc `contentBytes` extension has `version: 1` and `read({resource, maxBytes}, context)`. It returns a promise of `{resource, revision, bytes, name, mediaType}`. `resource` and `revision` are opaque nonempty tokens limited to 4096 UTF-16 code units. The response identity must equal the request identity. `name` is an optional display name; `mediaType` is an optional untrusted hint. The bytes are a complete ArrayBuffer or Uint8Array, never a truncated prefix represented as a whole file.

`maxBytes` is a positive safe integer. The client and authority both reject an excessive length. The guest authority imposes its existing 8 MiB ceiling, checks stored size before fetching binary data, and pairs bytes with the revision of that immutable payload. Cancellation and the optional synchronous `context.current()` predicate are checked before work and after asynchronous reads. The client owns a copied result; changing it cannot mutate the file authority. This extension has no write operation and confers no write permission.

The guest adapter reads through the same serialized VFS queue and IndexedDB records as existing resource operations. Text records encode as UTF-8; they are decoded-string records and carry no promise about bytes discarded by older imports. Binary records retain their original bytes. Server mounts and settings decline this capability until their own bounded snapshot contracts exist. A missing capability remains unavailable and cannot fall back to fetching a resource token as a URL.

## Codec policy

The shared `apps/content-kit/text-codec.js` module performs no I/O. `decode(bytes, options)` recognizes UTF-8 by default, a UTF-8 signature, or a UTF-16LE/BE signature. BOM-less UTF-16 and legacy encodings are not guessed. It uses the documented [WHATWG TextDecoder fatal mode and BOM handling](https://encoding.spec.whatwg.org/#interface-textdecoder), retaining a leading U+FEFF in source. Byte and decoded-text bounds apply before the result is exposed.

Decoding refuses malformed sequences, isolated surrogates, NUL, DEL and C0 controls except tab, line breaks and form feed. These are conservative source-text restrictions, not a general Unicode or binary-file detector. The host must still honor a registered binary container or media operation. Decoding a binary format's ASCII prefix does not make that format editable source. Encoding accepts valid control code points so an authority can reproduce an existing decoded-string record's bytes; encoding alone never identifies a file as editable text.

`encode(text, encoding, options)` supports UTF-8, UTF-16LE and UTF-16BE. It refuses isolated surrogates rather than allowing replacement characters. UTF-16 output writes the documented code units in the selected byte order; it does not ask TextEncoder to support a legacy encoding. Decode verifies that re-encoding reproduces the complete input. Newline code units are preserved exactly, including CRLF, LF, CR and mixtures. Neither function normalizes text.

## Upload behavior and remaining gates

An upload eligible for the existing text path reads bounded bytes and attempts strict UTF-8 decoding. It stores text only when the result fits the text limit and re-encodes identically. A UTF-16 signature, invalid encoding, binary controls or an oversized decoded result retains the original binary file. Known media inputs continue to use binary storage. Computer dependency imports use the same path and retain their create-only and cancellation guarantees.

This prevents new replacement-decoder corruption. It cannot recover bytes already replaced by an earlier import. UTF-16 is readable by the codec but remains stored as bytes, because the current writable resource contract does not negotiate encoding provenance across Save As and recovery. Encoding-aware writes, raw-to-canonical mapping for edited mixed line endings, renderer preservation and actual Docs/Editor extraction remain separate gates. Existing native routes and applet identities are unchanged.
