// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Docs alone under a Content-Security-Policy with style-src 'self' 'nonce-...' and no 'unsafe-inline', as a host does that sends a nonce with each response: the host gives Docs the nonce as
// pudlHost.editing.nonce (docs/editing-settings-contract.md, "A nonce"), and Docs puts it on every style element it makes and on CodeMirror's, and draws its glyphs without a style attribute.
// It is test-portable-strict-policy.cjs run with that policy, and fails on the first violation of any kind.
// Usage: node scripts/test-portable-nonce-policy.cjs <package folder> [browsers]
process.env.STRICT_NONCE = '1';
require('./test-portable-strict-policy.cjs');
