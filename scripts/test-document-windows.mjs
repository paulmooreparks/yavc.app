// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(full = false, acknowledge = true, app = 'docs') {
    const listeners = new Map(), owner = {inert: false, getAttribute: () => app, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)};
    const root = {isConnected: true, closest: () => owner};
    const target = {isConnected: true, closest: () => ({getAttribute: () => app+'-2'})};
    const window = {}, open = full ? Array.from({length: 9}, (_, i) => app + (i ? '-' + (i + 1) : '')) : [app];
    const raised=[],accepted=[];
    const pudlWindows = {state: () => ({open}),raise:key=>raised.push(key), open: async () => ({status: 'opened', window: {querySelector: () => target}})};
    const pudlApplets = {start: async () => { window.yavcDocumentWindows.bind(target, {application:app,resource:()=> 'memory:existing',accept:async payload=>{accepted.push(payload);return true;},flush: () => acknowledge}); }};
    runInNewContext(readFileSync(new URL('../internal/web/static/document-windows.js', import.meta.url), 'utf8'), {window, pudlWindows, pudlApplets, document: {querySelector: () => ({content: 'single'})}});
    return {api: window.yavcDocumentWindows, root, owner, target, listeners,raised,accepted};
}

test('Capacity failure retains every document in the source workspace', async () => {
    const f = fixture(true);
    const result = await f.api.split(f.root, 'docs', {front: 0, tabs: [{name: 'First'}, {name: 'Second'}]});
    assert.equal(result.moved.length, 0);
    assert.match(result.error, /nine/);
    assert.equal(f.owner.inert, false);
    assert.equal(f.listeners.size, 0);
});

for(const app of ['editor','docs','slides','diagrams'])test(app+' foregrounds the accepted document and reuses its existing window',async()=>{
    const f=fixture(false,true,app);
    await f.api.open(f.root,app,{operation:'open-file',input:{path:'memory:existing'}});
    assert.equal(f.accepted.length,1);assert.deepEqual(f.raised,[app+'-2']);
    f.raised.length=0;
    await f.api.open(f.root,app,{operation:'open-file',input:{path:'memory:existing'}});
    assert.equal(f.accepted.length,2);assert.deepEqual(f.raised,[app+'-2']);
});

test('Background recovery transfers do not request foreground activation',async()=>{
    const f=fixture();await f.api.split(f.root,'docs',{front:0,tabs:[{name:'First'},{name:'Second'}]});assert.deepEqual(f.raised,[]);
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
