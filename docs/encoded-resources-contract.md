# Encoding-aware resources, version 2

The content resource authority may now advertise `version: 2`. The shared client continues to accept version 1 hosts for ordinary UTF-8 resources. Version 2 is explicit negotiation, so an older client refuses the authority instead of silently dropping encoding metadata.

Every version 2 read and successful write acknowledgement includes `encoding` and `bom`. The supported encodings are `utf-8`, `utf-16le` and `utf-16be`. The signature flag is boolean. UTF-16 currently requires its signature because imports do not guess a byte order. Text excludes one leading encoding signature; a further U+FEFF is ordinary source content. The authority strictly decodes and re-encodes the original bytes before exposing the text.

Writes, create-only destinations and Save As carry the captured text, encoding and signature flag. The acknowledgement must preserve that format. Conditional writes compare the original resource revision at the storage authority. An existing-file save retains its issued snapshot's encoding; format conversion uses an explicit copy operation. Version 1 hosts receive their original request shapes and cannot accept an encoding-aware UTF-16 copy.

Guest UTF-16 files remain binary records in the existing VFS. Their bytes inherently retain byte order and signature, and old clients continue to treat them as binary. The new writer commits the replacement blob and its revision-bearing file record in the same IndexedDB transaction. It does not add encoding fields to a text record that older VFS serializers could discard. UTF-8 files retain the existing text-record representation, including any signature in the stored bytes.

The source workspace keeps encoding and signature metadata with each recovered tab. Source history handles line endings independently. New recovery baselines include the encoding format, and changed formats cannot acquire a writable recovered baseline. A legacy dirty snapshot that stored a signature as source remains recoverable as an unbound copy when it cannot be safely rebased onto the new decoded-body convention. Clean legacy snapshots open the current file and discard incompatible history.

The existing limits still apply. Guest editing permits at most 256 KiB of decoded text and 8 MiB of source bytes. Malformed input, unsupported encodings, binary controls, isolated surrogates and cancelled or stale writes fail before committing. A missing host capability cannot fall back to a direct URL, local filesystem access or a lossy decoder.
