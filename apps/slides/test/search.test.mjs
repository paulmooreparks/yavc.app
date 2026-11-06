// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../search.js', import.meta.url), 'utf8'), context);
const substitute = context.window.yavcSlideSearch.substitute;
test('replacement tokens retain full input context, captures and literal fallback semantics', () => {
    for (const [input, pattern] of [
        ['before Alpha one after', /Alpha (one)/gu],
        ['before Alpha one after', /(?<=before )Alpha (?<item>one)/gu],
        ['x b y', /(a)?b/gu],
        ['x abc y', /(a)(b)(c)/gu]
    ]) {
        const match = pattern.exec(input);
        assert.ok(match);
        for (const value of ['plain', '$$', '$&', "$`|$'", '$1|$2|$3', '$01|$10|$12|$99|$0', '$<item>|$<missing>|$<>', '$$$& $1 $<item>']) {
            pattern.lastIndex = 0;
            const expected = input.replace(pattern, value);
            const actual = input.slice(0, match.index) + substitute(value, match, input) + input.slice(match.index + match[0].length);
            assert.equal(actual, expected, value + ' with ' + pattern);
        }
    }
});
