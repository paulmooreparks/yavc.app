// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const window = {};
runInNewContext(readFileSync(new URL('../history.js', import.meta.url), 'utf8'), {window});
const state = (text, slide = 0) => ({text, slide});
test('Deck history orders typing and structural edits and retains selection', () => {
    const h = window.yavcDeckHistory.create(state('one'));
    h.record(state('one a'), 'text:0', 0); h.record(state('one ab'), 'text:0', 100);
    h.record(state('one ab\n---\ntwo', 1), 'add', 110);
    assert.equal(h.take('undo').text, 'one ab');
    assert.equal(h.take('undo').text, 'one');
    assert.equal(h.take('redo').text, 'one ab');
    assert.equal(h.take('redo').slide, 1);
});
test('Navigation boundaries and divergent edits do not merge or retain stale redo', () => {
    const h = window.yavcDeckHistory.create(state('a'));
    h.record(state('ab'), 'page:0', 0); h.boundary(); h.record(state('abc'), 'page:0', 1);
    assert.equal(h.take('undo').text, 'ab');
    h.record(state('abd'), 'command', 2); assert.equal(h.can('redo'), false);
});
test('History is bounded and no-op records do not add Undo entries', () => {
    const h = window.yavcDeckHistory.create(state('0'), {limit: 2});
    h.record(state('0'), 'command'); assert.equal(h.can('undo'), false);
    for (let i = 1; i <= 6; i++) h.record(state(String(i)), 'command', i);
    assert.equal(h.take('undo').text, '5'); assert.equal(h.take('undo').text, '4'); assert.equal(h.take('undo'), null);
});
