// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { normalize } = require('../../../internal/web/static/command-toolbar.js');
test('toolbar preferences reject malformed fields without mutating defaults or dropping future command IDs', () => {
    const defaults = ['save', '-', 'undo'];
    assert.deepEqual(normalize({ version: 2, items: ['unknown'], visible: false }, defaults), { version: 1, items: defaults, visible: true, inRibbon: true });
    const input = { version: 1, visible: false, inRibbon: 'false', items: ['-', 'save', 'save', '-', '-', null, {}, 'future-tool', 'common-toolbar-customize', '-'] };
    assert.deepEqual(normalize(input, defaults), { version: 1, items: ['save', '-', 'future-tool'], visible: false, inRibbon: true });
    assert.deepEqual(defaults, ['save', '-', 'undo']); assert.equal(input.items.length, 10);
    assert.equal(normalize({ version: 1, items: Array.from({ length: 100 }, (_, i) => 'tool-' + i) }, defaults).items.length, 60);
    assert.deepEqual(normalize({ version: 1, items: [] }, defaults).items, []);
});
