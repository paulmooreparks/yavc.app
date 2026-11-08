// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(full = false, acknowledge = true) {
    const listeners = new Map(), owner = {inert: false, getAttribute: () => 'docs', addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)};
    const root = {isConnected: true, closest: () => owner};
    const target = {isConnected: true, closest: () => ({getAttribute: () => 'docs-2'})};
    const window = {}, open = full ? Array.from({length: 9}, (_, i) => 'docs' + (i ? '-' + (i + 1) : '')) : ['docs'];
    const pudlWindows = {state: () => ({open}), open: async () => ({status: 'opened', window: {querySelector: () => target}})};
    const pudlApplets = {start: async () => { window.yavcDocumentWindows.bind(target, {flush: () => acknowledge}); }};
    runInNewContext(readFileSync(new URL('../internal/web/static/document-windows.js', import.meta.url), 'utf8'), {window, pudlWindows, pudlApplets, document: {querySelector: () => ({content: 'single'})}});
    return {api: window.yavcDocumentWindows, root, owner, listeners};
}

test('Capacity failure retains every document in the source workspace', async () => {
    const f = fixture(true);
    const result = await f.api.split(f.root, 'docs', {front: 0, tabs: [{name: 'First'}, {name: 'Second'}]});
    assert.equal(result.moved.length, 0);
    assert.match(result.error, /nine/);
    assert.equal(f.owner.inert, false);
    assert.equal(f.listeners.size, 0);
});

test('A transfer requires acknowledged recovery before the source may release it', async () => {
    const f = fixture(false, false);
    const pending = f.api.split(f.root, 'docs', {front: 0, tabs: [{name: 'First'}, {name: 'Second'}]});
    assert.equal(f.owner.inert, true);
    let prevented = false;
    f.listeners.get('pudl:window-closing')({preventDefault() { prevented = true; }});
    assert.equal(prevented, true);
    const result = await pending;
    assert.equal(result.moved.length, 0);
    assert.match(result.error, /recovery/);
    assert.equal(f.owner.inert, false);
});
