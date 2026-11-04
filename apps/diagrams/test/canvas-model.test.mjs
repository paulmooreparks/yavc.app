// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../canvas-model.js');
const J = require('../../diagram-kit/jcanvas.js');
const n = (id, x = 0, y = 0, width = 100, height = 60) => ({ id, type: 'text', x, y, width, height, text: id });
const base = () => ({ nodes: [n('a'), n('b', 300)], edges: [{ id: 'ab', fromNode: 'a', toNode: 'b' }], custom: { keep: true } });

test('moving and resizing preserve unknown data and never change the input', () => {
    const doc = base(), before = JSON.stringify(doc);
    const moved = M.edit(doc, { op: 'move', key: 'a', dx: -9, dy: 8 });
    assert.equal(moved.doc.nodes[0].x, -9);
    assert.equal(moved.doc.nodes[0].y, 8);
    assert.deepEqual(moved.doc.custom, { keep: true });
    assert.equal(JSON.stringify(doc), before);
    const resized = M.edit(moved.doc, { op: 'resize', key: 'a', width: 400, height: 20 });
    assert.equal(resized.doc.nodes[0].width, 400);
    assert.throws(() => M.edit(doc, { op: 'resize', key: 'a', width: 0 }));
    assert.throws(() => M.edit(doc, { op: 'move', key: 'a', dx: NaN, dy: 0 }));
});
test('resizing anchors the opposite edge and maintains proportions with Shift', () => {
    const b = n('a', -20, 10, 100, 50);
    const r = M.resize(b, 'nw', 30, 5, true);
    assert.equal(r.x + r.width, 80);
    assert.equal(r.y + r.height, 60);
    assert.equal(r.width / r.height, 2);
    assert.equal(M.resize(b, 'e', -400, 0).width, 1);
    assert.equal(M.resize(b, 's', 0, 20, true).width, 140);
});
test('snapping chooses nearby edges and centres before the grid and Alt bypasses both', () => {
    const b = n('a', 19, 22, 50, 50), nodes = [n('other', 72, 72, 100, 100)];
    const r = M.snap(b, nodes, ['a'], 5, false);
    assert.equal(r.box.x, 22);
    assert.equal(r.box.y, 22);
    assert.deepEqual(r.guides, [{ axis: 'x', at: 72 }, { axis: 'y', at: 72 }]);
    assert.deepEqual(M.snap(b, nodes, [], 5, true).box, b);
    assert.equal(M.snap(n('a', -11), [], [], 5).box.x, -8);
});
test('groups move all fully contained nodes once, including nested groups', () => {
    const doc = base();
    doc.nodes.unshift({ ...n('g', -10, -10, 200, 200), type: 'group' });
    doc.nodes.push({ ...n('inner', 0, 0, 100, 100), type: 'group' }, n('partial', 190, 100));
    const moved = M.edit(doc, { op: 'move', key: 'g', dx: 40, dy: -24 }).doc;
    assert.deepEqual(moved.nodes.map(x => [x.id, x.x, x.y]), [['g', 30, -34], ['a', 40, -24], ['b', 300, 0], ['inner', 40, -24], ['partial', 190, 100]]);
    const escaped = M.edit(doc, { op: 'move', key: 'a', dx: 1000, dy: 0 }).doc;
    assert.ok(!M.members(escaped, 'g').includes('a'));
    assert.equal(M.edit(doc, { op: 'delete', key: 'g' }).doc.nodes.length, 4);
});
test('new nodes and connectors avoid IDs in both namespaces and retain chosen sides', () => {
    const doc = base(); doc.edges[0].id = 'node';
    const created = M.edit(doc, { op: 'create', shape: 'rounded', x: -80, y: 16 });
    assert.equal(created.key, 'node-2');
    const connected = M.edit(created.doc, { op: 'connect', from: created.key, to: 'a', fromSide: 'bottom', toSide: 'top' });
    const e = connected.doc.edges.at(-1);
    assert.equal(e.fromSide, 'bottom'); assert.equal(e.toSide, 'top');
    assert.throws(() => M.edit(doc, { op: 'connect', from: 'absent', to: 'a' }));
    assert.throws(() => M.edit(doc, { op: 'connect', from: 'a', to: 'b', toSide: 'up' }));
});
test('inspector properties are validated and heads keep the standard arrow properties in step', () => {
    const doc = base();
    const set = M.edit(doc, { op: 'set', key: 'ab', kind: 'edge', property: 'toHead', value: 'cf-many' });
    assert.equal(set.doc.edges[0].toEnd, 'arrow');
    assert.equal(M.edit(set.doc, { op: 'set', key: 'ab', kind: 'edge', property: 'toHead', value: 'none' }).doc.edges[0].toEnd, 'none');
    for (const [property, value] of [['color', 'url(evil)'], ['shape', 'evil'], ['lineWidth', 9], ['__proto__', {}]]) {
        assert.throws(() => M.edit(doc, { op: 'set', key: 'a', property, value }));
    }
    assert.equal(M.edit(doc, { op: 'set', key: 'a', property: 'text', value: '<script>x</script>' }).doc.nodes[0].text, '<script>x</script>');
});
test('deletion removes incident edges and uses the requested namespace for colliding IDs', () => {
    const doc = base(); doc.edges[0].id = 'a';
    assert.equal(M.edit(doc, { op: 'delete', key: 'a', kind: 'edge' }).doc.nodes.length, 2);
    assert.equal(M.edit(doc, { op: 'delete', key: 'a', kind: 'node' }).doc.edges.length, 0);
    assert.throws(() => M.edit(doc, { op: 'move', key: 'a', kind: 'edge', dx: 1, dy: 0 }));
    assert.throws(() => M.edit(base(), { op: 'delete', key: 'ab', kind: 'node' }));
    assert.throws(() => M.edit(base(), { op: 'set', key: 'ab', kind: 'node', property: 'label', value: 'wrong namespace' }));
});
test('copy and paste remap group members and internal edges without changing source data', () => {
    const doc = base(); doc.nodes.unshift({ ...n('group', -10, -10, 500, 100), type: 'group' });
    const fragment = M.fragment(doc, 'group', 'node'), before = JSON.stringify(doc);
    const result = M.edit(doc, { op: 'paste', text: J.write(fragment) });
    const pasted = result.doc.nodes.slice(3), edge = result.doc.edges.at(-1);
    assert.equal(new Set(result.doc.nodes.map(n => n.id)).size, 6);
    assert.equal(pasted[0].x, 14);
    assert.equal(edge.fromNode, pasted[1].id); assert.equal(edge.toNode, pasted[2].id);
    assert.equal(JSON.stringify(doc), before);
    assert.throws(() => M.edit(doc, { op: 'paste', text: 'no' }));
    assert.throws(() => M.edit(doc, { op: 'paste', text: 'x'.repeat(2 * 1024 * 1024 + 1) }));
    const full = { nodes: Array.from({ length: J.LIMITS.items }, (_, i) => n('id-' + i)), edges: [] };
    assert.throws(() => M.edit(full, { op: 'paste', text: J.write({ nodes: [n('one')], edges: [] }) }), /5000/);
});
test('drawing order includes groups in the file order', () => {
    const doc = base(); doc.nodes.push({ ...n('g'), type: 'group' });
    const pal = { bg: '#fff', surface: '#fff', line: '#222', text: '#111', muted: '#555', accent: '#00f', presets: [] };
    const first = J.render(doc, { palette: pal }).svg;
    assert.ok(first.indexOf('data-node="g"') > first.indexOf('data-node="b"'));
    const changed = M.edit(doc, { op: 'order', key: 'g', direction: 'back' });
    assert.deepEqual(changed.doc.nodes.map(n => n.id), ['a', 'g', 'b']);
    assert.deepEqual(J.render(changed.doc, { palette: pal }).boxes.map(n => n.id), ['a', 'g', 'b']);
});

test('reattaching either endpoint preserves connector identity, styles and unknown data', () => {
    const doc = base(); doc.nodes.push(n('c', 20, 240));
    doc.edges[0].color = '4'; doc.edges[0].extra = { retain: true }; doc.edges[0].yavc = { route: 'curve', toHead: 'diamond' };
    const changed = M.edit(doc, { op: 'reconnect', key: 'ab', end: 'to', node: 'c', side: 'top' }).doc;
    assert.deepEqual(changed.edges[0], { ...doc.edges[0], toNode: 'c', toSide: 'top', toEnd: 'arrow' });
    const automatic = M.edit(changed, { op: 'reconnect', key: 'ab', end: 'from', node: 'b' }).doc;
    assert.equal(automatic.edges[0].fromNode, 'b'); assert.equal(automatic.edges[0].fromSide, undefined);
    assert.equal(doc.edges[0].toNode, 'b');
    assert.throws(() => M.edit(doc, { op: 'reconnect', key: 'ab', end: 'middle', node: 'a' }));
    assert.throws(() => M.edit(doc, { op: 'reconnect', key: 'ab', end: 'to', node: 'missing' }));
    assert.throws(() => M.edit(doc, { op: 'reconnect', key: 'ab', kind: 'node', end: 'to', node: 'a' }));
});
test('free endpoints remain standard nodes, are independently owned, and are pruned only when unused', () => {
    let d = M.edit(base(), { op: 'reconnect', key: 'ab', end: 'to', node: null, x: -30, y: 170 }).doc;
    const point = d.nodes.find(J.isAnchor);
    assert.deepEqual(point, { id: point.id, type: 'text', x: -30, y: 170, width: 0, height: 0, text: '', yavc: { shape: 'text', anchor: true } });
    assert.equal(d.edges[0].toNode, point.id); assert.equal(J.read(J.write(d)).problems.length, 0);
    d.edges.push({ id: 'shared', fromNode: 'a', toNode: point.id });
    d = M.edit(d, { op: 'reconnect', key: 'ab', end: 'to', node: 'b' }).doc;
    assert.ok(d.nodes.find(x => x.id === point.id));
    d = M.edit(d, { op: 'delete', key: 'shared', kind: 'edge' }).doc;
    assert.equal(d.nodes.some(J.isAnchor), false);
    const ordinary = { ...n('empty'), text: '', width: 0, height: 0, yavc: { shape: 'text' } };
    d.nodes.push(ordinary);
    assert.ok(M.edit(d, { op: 'delete', key: 'ab', kind: 'edge' }).doc.nodes.find(x => x.id === 'empty'));
    assert.throws(() => M.edit(d, { op: 'reconnect', key: 'ab', end: 'from', node: null, x: Infinity, y: 0 }));
});
test('free-to-free connectors and deletion remove their owned point nodes', () => {
    let d = M.edit(base(), { op: 'connect', from: 'a', to: null, x: 70, y: -50 });
    const key = d.key;
    d = M.edit(d.doc, { op: 'reconnect', key, end: 'from', node: null, x: 30, y: 100 });
    assert.equal(d.doc.nodes.filter(J.isAnchor).length, 2);
    assert.equal(M.edit(d.doc, { op: 'delete', key, kind: 'edge' }).doc.nodes.length, 2);
});
test('copying a node retains an attached free endpoint outside its box and remaps the connector', () => {
    const d = M.edit(base(), { op: 'connect', from: 'a', x: 700, y: 700 }).doc;
    const fragment = M.fragment(d, 'a', 'node');
    assert.equal(fragment.nodes.length, 2); assert.equal(fragment.edges.length, 1);
    const pasted = M.edit(d, { op: 'paste', text: J.write(fragment) }).doc;
    assert.equal(pasted.nodes.filter(J.isAnchor).length, 2);
    const edge = pasted.edges.at(-1);
    assert.ok(pasted.nodes.find(x => x.id === edge.fromNode));
    assert.ok(J.isAnchor(pasted.nodes.find(x => x.id === edge.toNode)));
});
test('interior drops are automatic and only a nearby side-centre pins the side', () => {
    const d = base();
    assert.deepEqual(M.attachment(d, { x: 350, y: 30 }, 12), { node: 'b', side: null });
    assert.deepEqual(M.attachment(d, { x: 302, y: 30 }, 12), { node: 'b', side: 'left' });
    assert.deepEqual(M.attachment(d, { x: 298, y: 30 }, 12), { node: 'b', side: 'left' });
    assert.deepEqual(M.attachment(d, { x: 350, y: 30 }, 120), { node: 'b', side: null });
    assert.deepEqual(M.attachment(d, { x: 302, y: 30 }, 1), { node: 'b', side: null });
    assert.deepEqual(M.attachment(d, { x: -20.1, y: 99.3 }, 12), { node: null, x: -20, y: 99 });
});
