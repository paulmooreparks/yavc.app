// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

test('A disposed document tab adapter cannot retitle a replacement window', () => {
    const calls = [], heading = {textContent: 'Docs', setAttribute() {}}, win = {contains: () => true, getAttribute: () => 'docs', querySelector: () => heading};
    let writes = 0;
    const list = {isConnected: true, closest: () => win, contains: () => false, addEventListener() {}, set innerHTML(value) { writes++; }};
    const window = {yavcUtil: {esc: value => String(value)}, pudlWindows: {retitle(key, title) { calls.push({key, title}); heading.textContent = title; }}};
    runInNewContext(readFileSync(new URL('../internal/web/static/doc-tabs.js', import.meta.url), 'utf8'), {window, document: {activeElement: null}});
    const tab = {name: 'First.md', modified: true};
    const adapter = window.yavcDocTabs.attach(list, {application: 'Docs', tabs: () => [tab], active: () => 0});
    adapter.render();
    assert.equal(calls[0].title, '\u25cf First.md \u00b7 Docs');
    adapter.render();
    assert.equal(writes, 1, 'Unchanged tabs retain their buttons while focus moves');
    list.isConnected = false;
    tab.name = 'Late callback.md';
    adapter.render();
    assert.equal(calls.length, 1, 'Detached mounts cannot affect the current window for the same key');
});
