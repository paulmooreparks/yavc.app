// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canvasSchema, shapes } from '../language-service/canvas-schema.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), J = require('../../diagram-kit/jcanvas.js');
const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../language-service');
function server() {
    let id = 0; const pending = new Map(), notifications = [];
    const self = { postMessage(message) {
        const m = JSON.parse(message);
        if (m.id != null) { const callback = pending.get(m.id); if (callback) { pending.delete(m.id); callback(m); } }
        else notifications.push(m);
    } };
    vm.runInNewContext(fs.readFileSync(path.join(folder, 'worker.js'), 'utf8'), { self, setTimeout, clearTimeout, URL, console });
    const notify = (method, params) => self.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', method, params }) });
    const request = (method, params) => new Promise((resolve, reject) => {
        const next = ++id, timer = setTimeout(() => { pending.delete(next); reject(new Error('No response to ' + method)); }, 2000);
        pending.set(next, m => { clearTimeout(timer); resolve(m); });
        self.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', id: next, method, params }) });
    });
    return { notify, request, notifications };
}
test('built language assets match their source manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json')));
    for (const [name, hash] of Object.entries({ ...manifest.inputs, ...manifest.outputs })) {
        assert.equal(createHash('sha256').update(fs.readFileSync(path.resolve(folder, name))).digest('hex'), hash, name + ' needs a rebuild');
    }
    assert.deepEqual(shapes, J.SHAPES);
    assert.equal(canvasSchema.definitions.node.properties.yavc.properties.textAlign.description.includes('shape default'), true);
});
test('the browser JSON server speaks LSP completion, hover and formatting', async () => {
    const s = server(), uri = 'yavc-lsp://test/one.canvas';
    const init = await s.request('initialize', {}); assert.equal(init.result.capabilities.positionEncoding, 'utf-16');
    const text = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":100,"height":80,"text":"x","yavc":{"shape":""}}],"edges":[]}';
    s.notify('textDocument/didOpen', { textDocument: { uri, version: 1, languageId: 'json', text } });
    const pos = text.indexOf('"shape":""') + 9;
    const complete = await s.request('textDocument/completion', { textDocument: { uri }, position: { line: 0, character: pos } });
    assert.ok(complete.result.items.some(i => i.label.includes('rectangle')));
    const hover = await s.request('textDocument/hover', { textDocument: { uri }, position: { line: 0, character: text.indexOf('"width"') + 2 } });
    assert.match(JSON.stringify(hover.result).replaceAll('&nbsp;', ' '), /width in pixels/i);
    const format = await s.request('textDocument/formatting', { textDocument: { uri }, options: { tabSize: 2, insertSpaces: true } });
    assert.ok(format.result.length > 0);
    s.notify('textDocument/didClose', { textDocument: { uri } });
    assert.equal((await s.request('textDocument/hover', { textDocument: { uri }, position: { line: 0, character: 1 } })).error.code, -32801);
});

test('CSS and HTML share bounded LSP sessions without treating their source as JSON', async () => {
    const s = server(); await s.request('initialize', {});
    for (const [kind, text, position, label] of [
        ['css', 'p { col }', 7, 'color'],
        ['html', '<but', 4, 'button']
    ]) {
        const uri = 'yavc-lsp://test/style.' + kind;
        s.notify('textDocument/didOpen', { textDocument: { uri, version: 1, languageId: kind, text } });
        const completion = await s.request('textDocument/completion', { textDocument: { uri }, position: { line: 0, character: position } });
        assert.ok(completion.result.items.some(item => item.label === label), kind + ' completion');
        const formatting = await s.request('textDocument/formatting', { textDocument: { uri }, options: { tabSize: 2, insertSpaces: true } });
        assert.ok(Array.isArray(formatting.result), kind + ' formatting');
        s.notify('textDocument/didClose', { textDocument: { uri } });
    }
    const uri = 'yavc-lsp://test/broken.css';
    s.notify('textDocument/didOpen', { textDocument: { uri, version: 1, languageId: 'css', text: 'p { color red; }' } });
    await new Promise(resolve => setTimeout(resolve, 220));
    const diagnostics = s.notifications.filter(n => n.params.uri === uri);
    assert.ok(diagnostics.at(-1).params.diagnostics.length);
    s.notify('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: 'p { color: red; }' }] });
    await new Promise(resolve => setTimeout(resolve, 220));
    assert.deepEqual(s.notifications.filter(n => n.params.uri === uri).at(-1).params.diagnostics, []);
    const hover = await s.request('textDocument/hover', { textDocument: { uri }, position: { line: 0, character: 6 } });
    assert.ok(hover.result.contents);
    s.notify('textDocument/didClose', { textDocument: { uri } });
    const unsupported = 'yavc-lsp://test/unknown.go';
    s.notify('textDocument/didOpen', { textDocument: { uri: unsupported, version: 1, languageId: 'go', text: '{}' } });
    assert.equal((await s.request('textDocument/hover', { textDocument: { uri: unsupported }, position: { line: 0, character: 0 } })).error.code, -32801);
});
test('validation is revisioned and external schemas never fetch', async () => {
    const s = server(), uri = 'yavc-lsp://test/two.canvas'; await s.request('initialize', {});
    s.notify('textDocument/didOpen', { textDocument: { uri, version: 1, text: '{"nodes":false}' } });
    s.notify('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: '{"nodes":[],"edges":[]}' }] });
    await new Promise(resolve => setTimeout(resolve, 220));
    const diagnostics = s.notifications.filter(n => n.method === 'textDocument/publishDiagnostics');
    assert.ok(diagnostics.length); assert.ok(diagnostics.every(d => d.params.version === 2)); assert.deepEqual(diagnostics.at(-1).params.diagnostics, []);
    const other = 'yavc-lsp://test/three.json';
    s.notify('textDocument/didOpen', { textDocument: { uri: other, version: 1, text: '{"$schema":"https://example.invalid/schema.json"}' } });
    const complete = await s.request('textDocument/completion', { textDocument: { uri: other }, position: { line: 0, character: 1 } });
    assert.ok(complete.result);
    s.notify('textDocument/didClose', { textDocument: { uri } }); s.notify('textDocument/didClose', { textDocument: { uri: other } });
});

test('cancelled requests and replaced document instances cannot return edits', async () => {
    const s = server(), uri = 'yavc-lsp://test/reopened.canvas'; await s.request('initialize', {});
    const open = text => s.notify('textDocument/didOpen', { textDocument: { uri, version: 1, text } });
    const params = { textDocument: { uri }, position: { line: 0, character: 1 } };
    open('{"nodes":[]}');
    const cancelled = s.request('textDocument/completion', params);
    s.notify('$/cancelRequest', { id: 2 });
    assert.equal((await cancelled).error.code, -32800);
    const stale = s.request('textDocument/hover', params);
    s.notify('textDocument/didClose', { textDocument: { uri } }); open('{"nodes":[],"edges":[]}');
    assert.equal((await stale).error.code, -32801);
    s.notify('textDocument/didClose', { textDocument: { uri } });
    open(' '.repeat(2097153));
    assert.equal((await s.request('textDocument/hover', params)).error.code, -32801);
    s.notify('textDocument/didClose', { textDocument: { uri } });
});

test('Canvas assistance includes diagram settings and independent color overrides', async () => {
    const s = server(), uri = 'yavc-lsp://test/settings.canvas'; await s.request('initialize', {});
    const text = '{"yavc":{}}';
    s.notify('textDocument/didOpen', { textDocument: { uri, version: 1, text } });
    const completion = await s.request('textDocument/completion', { textDocument: { uri }, position: { line: 0, character: 9 } });
    for (const key of ['background', 'grid', 'snap']) assert.ok(completion.result.items.some(i => i.label.includes(key)), key);
    const invalid = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":100,"height":60,"text":"x","yavc":{"fillColor":"bad"}}],"yavc":{"grid":"yes"}}';
    s.notify('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: invalid }] });
    await new Promise(resolve => setTimeout(resolve, 220));
    assert.ok(s.notifications.filter(n => n.method === 'textDocument/publishDiagnostics').at(-1).params.diagnostics.length >= 2);
    s.notify('textDocument/didClose', { textDocument: { uri } });
});
