// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('the export glyph check covers every shipped PDF font variant', () => {
    const fontkit = require('../vendor/fontkit-1.1.1/fontkit.js');
    const vfs = require('../vendor/pdfmake-0.2.23/vfs_fonts.js');
    const regular = Buffer.from(vfs['Roboto-Regular.ttf'], 'base64');
    assert.deepEqual(readFileSync(new URL('../vendor/pdfmake-0.2.23/Roboto-Regular.ttf', import.meta.url)), regular);
    const supported = fontkit.create(regular).characterSet;
    for (const name of ['Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf']) {
        assert.deepEqual(fontkit.create(Buffer.from(vfs[name], 'base64')).characterSet, supported, name + ' differs from the validated coverage');
    }
});
