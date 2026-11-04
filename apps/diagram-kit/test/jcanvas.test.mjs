// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
//
// The JSON Canvas reader, writer, router and renderer, held to the
// extension's specification (docs/canvas-extension.md). Run by
// scripts/check.sh with node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jc = require('../jcanvas.js');

const PALETTE = { text: '#111111', muted: '#555555', line: '#333333', surface: '#ffffff', bg: '#fafafa', accent: '#0066cc', presets: ['#cc0000', '#cc6600', '#ccaa00', '#00aa00', '#00aaaa', '#8800cc'] };
const node = (id, x, y, extra) => Object.assign({ id, type: 'text', x, y, width: 100, height: 60, text: id }, extra);
const file = (o) => JSON.stringify(o);

test('an empty file is an empty canvas', () => {
  const r = jc.read('');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.doc, { nodes: [], edges: [] });
});

test('a valid file reads without problems, keeping unknown properties', () => {
  const r = jc.read(file({ nodes: [node('a', 0, 0, { extra: 1 })], edges: [], other: 'kept' }));
  assert.deepEqual(r.problems, []);
  assert.equal(r.doc.nodes[0].extra, 1);
  assert.equal(r.doc.other, 'kept');
});

test('the reader refuses what the specification and the extension forbid', () => {
  const cases = [
    [{ nodes: [node('a', 0, 0), node('a', 10, 10)] }, /Two nodes have the id "a"/],
    [{ nodes: [node('a', 0, 0)], edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }] }, /ends at "b", which is not a node/],
    [{ nodes: [node('a', 0, 0), node('b', 0, 0)], edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }, { id: 'e', fromNode: 'b', toNode: 'a' }] }, /Two edges have the id "e"/],
    [{ nodes: [node('a', 0, 0, { color: 'red' })] }, /color must be a hex colour/],
    [{ nodes: [node('a', 0, 0, { color: 'url(x)' })] }, /color must be a hex colour/],
    [{ nodes: [node('a', 0, 0, { yavc: { shape: 'star' } })] }, /shape "star" is not one of/],
    [{ nodes: [node('a', 0, 0, { yavc: { lineWidth: 9 } })] }, /lineWidth must be a whole number from 1 to 8/],
    [{ nodes: [node('a', 0, 0, { x: '0' })] }, /needs a number for x/],
    [{ nodes: [{ id: 'a', type: 'shape', x: 0, y: 0, width: 1, height: 1 }] }, /has the type "shape"/],
    [{ nodes: [{ id: 'f', type: 'file', x: 0, y: 0, width: 1, height: 1, file: 'a.md', subpath: 'x' }] }, /subpath must start with #/],
    [{ nodes: [node('a', 0, 0), node('b', 0, 0)], edges: [{ id: 'e', fromNode: 'a', toNode: 'b', yavc: { toHead: 'star' } }] }, /toHead must be one of/],
    [{ nodes: [node('a', 0, 0), node('b', 0, 0)], edges: [{ id: 'e', fromNode: 'a', toNode: 'b', fromSide: 'middle' }] }, /fromSide must be one of/],
    [{ nodes: 'no' }, /nodes must be an array/],
    [[], /A canvas is a JSON object/],
  ];
  for (const [doc, want] of cases) {
    const r = jc.read(file(doc));
    assert.equal(r.doc, null, JSON.stringify(doc));
    assert.match(r.problems[0].message, want);
  }
});

test('a JSON error and a duplicate are reported at their place', () => {
  const bad = jc.read('{"nodes": [}');
  assert.equal(bad.doc, null);
  assert.match(bad.problems[0].message, /not valid JSON/);
  const text = file({ nodes: [node('a', 0, 0), node('dup', 0, 0), node('dup', 1, 1)] });
  const dup = jc.read(text);
  assert.equal(dup.problems[0].at, text.indexOf('"dup"'));
});

test('the reader refuses a file over its limits', () => {
  assert.match(jc.read(' '.repeat(2 * 1024 * 1024 + 1)).problems[0].message, /over 2 MB/);
  const many = { nodes: Array.from({ length: 5001 }, (_, i) => node('n' + i, i, 0)) };
  assert.match(jc.read(file(many)).problems[0].message, /more than the 5000/);
});

test('a newer extension version is a warning, and the file still draws', () => {
  const r = jc.read(file({ nodes: [], yavc: { version: 2 } }));
  assert.ok(r.doc);
  assert.equal(r.problems[0].warning, true);
});

test('the writer keeps the specification order, indents by two, and puts the extension last', () => {
  const doc = {
    yavc: { version: 1 },
    edges: [{ label: 'uses', toNode: 'b', yavc: { route: 'curve' }, fromNode: 'a', id: 'e' }], // check-ignore(title-case-labels): a connector's label in a canvas file, the person's own words, not a label of the site's
    nodes: [{ text: 'A', height: 60, yavc: { shape: 'oval' }, y: 0, mine: true, width: 100, x: 0, type: 'text', id: 'a' }, node('b', 200, 0)],
  };
  const out = jc.write(doc);
  assert.ok(out.endsWith('}\n'));
  const parsed = JSON.parse(out);
  assert.deepEqual(Object.keys(parsed), ['nodes', 'edges', 'yavc']);
  assert.deepEqual(Object.keys(parsed.nodes[0]), ['id', 'type', 'x', 'y', 'width', 'height', 'text', 'mine', 'yavc']);
  assert.deepEqual(Object.keys(parsed.edges[0]), ['id', 'fromNode', 'toNode', 'label', 'yavc']);
  assert.match(out, /^\{\n {2}"nodes": \[\n {4}\{\n {6}"id": "a",/);
  // Writing what was written changes nothing.
  assert.equal(jc.write(jc.read(out).doc), out);
});

test('the writer keeps the ends in agreement with the heads', () => {
  const doc = { nodes: [node('a', 0, 0), node('b', 200, 0)], edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', yavc: { fromHead: 'cf-many', toHead: 'none' } },
    { id: 'e2', fromNode: 'a', toNode: 'b', fromEnd: 'arrow', yavc: { fromHead: 'none', toHead: 'diamond' } },
  ] };
  const e = JSON.parse(jc.write(doc)).edges;
  assert.equal(e[0].fromEnd, 'arrow');
  assert.equal(e[0].toEnd, 'none');
  assert.equal(e[1].fromEnd, 'none');
  assert.equal(e[1].toEnd, 'arrow');
  // The document given is not changed.
  assert.equal(doc.edges[0].fromEnd, undefined);
});

test('an elbow runs in horizontal and vertical lines between the nearest sides', () => {
  const nodes = [node('a', 0, 0), node('b', 300, 200)];
  const r = jc.route({ id: 'e', fromNode: 'a', toNode: 'b' }, nodes);
  assert.equal(r.curve, false);
  assert.deepEqual([r.from, r.to], ['right', 'left']);
  assert.deepEqual(r.points[0], [100, 30]);
  assert.deepEqual(r.points[r.points.length - 1], [300, 230]);
  for (let i = 1; i < r.points.length; i++) {
    const [a, b] = [r.points[i - 1], r.points[i]];
    assert.ok(a[0] === b[0] || a[1] === b[1], 'segment ' + i + ' is not horizontal or vertical');
  }
  // No point is repeated, and no three points lie on one straight run.
  assert.equal(r.points.length, 4);
});

test('the file\'s sides are used where it gives them', () => {
  const nodes = [node('a', 0, 0), node('b', 300, 0)];
  const r = jc.route({ id: 'e', fromNode: 'a', toNode: 'b', fromSide: 'bottom', toSide: 'bottom' }, nodes);
  assert.deepEqual([r.from, r.to], ['bottom', 'bottom']);
  assert.deepEqual(r.points[0], [50, 60]);
  assert.deepEqual(r.points[1], [50, 80]);
});

test('a straight route joins the side points, and a curve is one cubic along the normals', () => {
  const nodes = [node('a', 0, 0), node('b', 0, 300)];
  const s = jc.route({ id: 'e', fromNode: 'a', toNode: 'b', yavc: { route: 'straight' } }, nodes);
  assert.deepEqual(s.points, [[50, 60], [50, 300]]);
  const c = jc.route({ id: 'e', fromNode: 'a', toNode: 'b', yavc: { route: 'curve' } }, nodes);
  assert.equal(c.curve, true);
  assert.equal(c.points.length, 4);
  assert.deepEqual(c.points[1], [50, 140]);
  assert.deepEqual(c.points[2], [50, 220]);
});

test('the drawing escapes text and marks every node and edge', () => {
  const doc = jc.read(file({
    nodes: [
      node('a', 0, 0, { text: '<script>alert(1)</script> **bold**', yavc: { shape: 'cylinder', line: 'dashed' } }),
      node('b', 300, 0, { color: '1' }),
      { id: 'g', type: 'group', x: -20, y: -40, width: 460, height: 140, label: 'A "group"' }, // check-ignore(title-case-labels): a group's label in a canvas file, written to test escaping
      { id: 'l', type: 'link', x: 0, y: 200, width: 200, height: 40, url: 'javascript:alert(1)' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: '<b>', yavc: { toHead: 'cf-many' } }],
  })).doc;
  const r = jc.render(doc, { palette: PALETTE, title: 'The <canvas>' });
  assert.ok(r.svg.includes('<title>The &lt;canvas&gt;</title>'), 'the picture has an escaped text alternative');
  assert.ok(!r.svg.includes('<script>'));
  assert.ok(!r.svg.includes('<b>'));
  assert.ok(r.svg.includes('&lt;script&gt;'));
  assert.ok(r.svg.includes('A &quot;group&quot;'));
  assert.ok(!/href=/.test(r.svg), 'a link node is drawn as text, never as a link');
  for (const id of ['a', 'b', 'g', 'l']) { assert.ok(r.svg.includes('data-node="' + id + '"')); }
  assert.ok(r.svg.includes('data-edge="e"'));
  assert.ok(r.svg.includes('stroke="#cc0000"'), 'preset 1 is the palette\'s first');
  assert.ok(r.svg.includes('stroke-dasharray'));
  // Groups follow the same file drawing order as every other node.
  assert.ok(r.svg.indexOf('data-node="g"') > r.svg.indexOf('data-node="a"'));
  assert.equal(r.boxes.length, 4);
  assert.ok(r.width > 460 && r.height > 240);
});

test('every shape draws', () => {
  for (const shape of jc.SHAPES) {
    const doc = jc.read(file({ nodes: [node('a', 0, 0, { yavc: { shape } })] })).doc;
    const svg = jc.render(doc, { palette: PALETTE }).svg;
    assert.ok(svg.includes('data-node="a"'), shape);
    assert.ok(!svg.includes('NaN'), shape);
  }
});

test('every head draws', () => {
  for (const head of jc.HEADS) {
    const doc = jc.read(file({ nodes: [node('a', 0, 0), node('b', 300, 0)], edges: [{ id: 'e', fromNode: 'a', toNode: 'b', yavc: { fromHead: head, toHead: head } }] })).doc;
    const svg = jc.render(doc, { palette: PALETTE }).svg;
    assert.ok(!svg.includes('NaN'), head);
  }
});
