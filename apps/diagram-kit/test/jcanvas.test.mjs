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

test('explicit fill, outline and background render safely with readable text and survive round-trip', () => {
  const original = { nodes: [node('a', 0, 0, { color: '5', yavc: { fillColor: '#000000', strokeColor: '#ff0000' } })], edges: [], yavc: { version: 1, background: '#aabbcc', grid: true, snap: false } };
  const doc = jc.read(jc.write(original)).doc, out = jc.render(doc, { palette: PALETTE });
  assert.match(out.svg, /fill="#000000" stroke="#ff0000"/);
  assert.match(out.svg, /data-canvas-background=""[^>]*fill="#aabbcc"/);
  assert.equal(out.boxes[0].text.color, '#ffffff'); assert.equal(out.background, '#aabbcc');
  assert.doesNotMatch(out.svg, /radial-gradient|dg-cv-grid/);
  assert.deepEqual(doc.yavc, original.yavc);
  delete doc.nodes[0].yavc.fillColor;
  assert.equal(jc.render(doc, { palette: PALETTE }).boxes[0].text.color, PALETTE.text);
  for (const [key, value] of [['background', 'red'], ['grid', 'true'], ['snap', 1]]) {
    assert.equal(jc.read(file({ ...original, yavc: { [key]: value } })).doc, null);
  }
  assert.deepEqual(PALETTE.bg, '#fafafa');
  for (const item of [node('plain', 0, 0, { yavc: { shape: 'text', fillColor: '#000' } }),
    { id: 'link', type: 'link', url: 'https://example.invalid', x: 0, y: 0, width: 100, height: 60, yavc: { fillColor: '#000' } }]) {
    const result = jc.render({ nodes: [item], edges: [] }, { palette: PALETTE });
    assert.match(result.svg, /fill="#000"/); assert.match(result.svg, /<text[^>]*fill="#ffffff"/);
  }
});

test('text alignment resolves both axes independently and survives round-trip', () => {
  for (const shape of ['rectangle', 'diamond']) {
    const doc = { nodes: [node('a', 0, 0, { text: 'One\nTwo', yavc: { shape } })], edges: [] };
    const original = jc.render(doc, { palette: PALETTE }).boxes[0].text;
    assert.equal(original.align, shape === 'rectangle' ? 'left' : 'center');
    assert.equal(original.vertical, shape === 'rectangle' ? 'top' : 'middle');
    for (const align of ['left', 'center', 'right']) {
      const positions = [];
      for (const vertical of ['top', 'middle', 'bottom']) {
        doc.nodes[0].yavc = { shape, textAlign: align, textVerticalAlign: vertical };
        const round = jc.read(jc.write(doc)); assert.deepEqual(round.problems, []);
        assert.deepEqual(round.doc.nodes[0].yavc, doc.nodes[0].yavc);
        const out = jc.render(round.doc, { palette: PALETTE }), box = out.boxes[0].text;
        assert.equal(box.align, align); assert.equal(box.vertical, vertical);
        const text = out.svg.match(/<g data-text="a"><text x="([\d.-]+)" y="([\d.-]+)"[^>]*text-anchor="([^"]+)"/);
        assert.ok(text); assert.equal(text[3], { left: 'start', center: 'middle', right: 'end' }[align]);
        assert.equal(Number(text[1]), Number((align === 'left' ? box.x + 8 : align === 'right' ? box.x + box.w - 8 : box.x + box.w / 2).toFixed(1)));
        positions.push(Number(text[2]));
      }
      assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
    }
  }
  for (const yavc of [{ textAlign: 'justify' }, { textVerticalAlign: 'center' }, { textAlign: 1 }]) {
    assert.ok(jc.read(file({ nodes: [node('a', 0, 0, { yavc })], edges: [] })).problems.length);
  }
});

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
  assert.deepEqual(Object.keys(parsed.edges[0]), ['id', 'fromNode', 'fromSide', 'toNode', 'toSide', 'label', 'yavc']);
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

test('automatic anchors use the nearest side centres, change on movement, and respect pinned sides', () => {
  const a = node('a', 0, 0), b = node('b', 300, 0), e = { id: 'ab', fromNode: 'a', toNode: 'b' };
  assert.deepEqual([jc.route(e, [a, b]).from, jc.route(e, [a, b]).to], ['right', 'left']);
  const above = { ...b, x: 0, y: -200 };
  assert.deepEqual([jc.route(e, [a, above]).from, jc.route(e, [a, above]).to], ['top', 'bottom']);
  const pinned = jc.route({ ...e, toSide: 'left' }, [a, above]);
  assert.equal(pinned.to, 'left');
  const resized = jc.route(e, [a, { ...b, x: -100, y: -200, width: 1000, height: 60 }]);
  const spots = n => [[n.x+n.width/2,n.y], [n.x+n.width,n.y+n.height/2], [n.x+n.width/2,n.y+n.height], [n.x,n.y+n.height/2]];
  const expected = Math.min(...spots(a).flatMap(p => spots({ ...b, x: -100, y: -200, width: 1000, height: 60 }).map(q => Math.hypot(p[0]-q[0],p[1]-q[1]))));
  assert.equal(Math.hypot(resized.points[0][0]-resized.points.at(-1)[0], resized.points[0][1]-resized.points.at(-1)[1]), expected);
});
test('point anchors validate, draw only their connectors, and retain endpoint geometry for controls', () => {
  const p = { id: 'point', type: 'text', x: -80, y: 190, width: 0, height: 0, text: '', yavc: { shape: 'text', anchor: true } };
  const d = { nodes: [node('a', 0, 0), p], edges: [{ id: 'ap', fromNode: 'a', toNode: 'point' }] };
  assert.ok(jc.read(file(d)).doc);
  for (const bad of [{ ...p, text: 'hidden' }, { ...p, width: 1 }, { ...p, yavc: { anchor: 'true' } }]) {
    assert.equal(jc.read(file({ ...d, nodes: [node('a',0,0), bad] })).doc, null);
  }
  const out = jc.render(d, { palette: PALETTE });
  assert.equal(out.boxes.length, 1); assert.ok(!out.svg.includes('data-node="point"'));
  assert.deepEqual(out.edges[0].toPoint, [-80-out.origin[0],190-out.origin[1]]);
  const plain = JSON.parse(file(d)); delete plain.nodes[1].yavc.anchor;
  assert.ok(jc.read(file(plain)).doc);
});
