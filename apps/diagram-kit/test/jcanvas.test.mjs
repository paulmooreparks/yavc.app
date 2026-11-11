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

// The properties a screen design needs (docs/canvas-extension.md; DESIGN.md, decision 122).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const picture = (id, x, y, extra) => Object.assign({ id, type: 'file', x, y, width: 48, height: 48, file: 'icons/' + id + '.svg' }, extra);

test('text takes a colour, a size, a weight, a font and a padding, and a hard break is a new line', () => {
  const doc = jc.read(file({ nodes: [node('a', 0, 0, { text: 'Total\\\n12.50', yavc: { textColor: '#ffffff', fillColor: '#00a0e6', fontSize: 22, fontWeight: 500, fontFamily: 'Roboto, Arial', padding: 2, textAlign: 'right' } }), node('b', 0, 100, { text: 'One\n\nTwo', height: 120 })], yavc: { version: 1, font: 'Noto Sans' } })).doc;
  const out = jc.render(doc, { palette: PALETTE, font: 'Inter, sans-serif' });
  assert.match(out.svg, /<svg[^>]* font-family="&#39;Noto Sans&#39;, &#39;Inter&#39;, sans-serif"/);
  assert.match(out.svg, /<text x="122\.0"[^>]* font-size="22" font-weight="500" font-family="&#39;Roboto&#39;, &#39;Arial&#39;, &#39;Noto Sans&#39;, &#39;Inter&#39;, sans-serif" fill="#ffffff" text-anchor="end">/);
  const a = /<g data-text="a">(.*?)<\/g>/.exec(out.svg)[1], b = /<g data-text="b">(.*?)<\/g>/.exec(out.svg)[1];
  assert.deepEqual([...a.matchAll(/<tspan[^>]*>([^<]*)</g)].map(m => m[1]), ['Total', '12.50'], 'a hard break has no empty line between');
  assert.deepEqual([...b.matchAll(/<tspan[^>]*>([^<]*)</g)].map(m => m[1]), ['One', ' ', 'Two'], 'a paragraph keeps its gap');
  const box = out.boxes[0].text;
  assert.deepEqual([box.color, box.size, box.weight, box.family, box.pad], ['#ffffff', 22, 500, "'Roboto', 'Arial', 'Noto Sans', 'Inter', sans-serif", 2]);
  assert.deepEqual([out.boxes[1].text.size, out.boxes[1].text.weight, out.boxes[1].text.family, out.boxes[1].text.pad], [14, null, null, null]);
});

test('text properties of the wrong kind are refused, and a font cannot bring markup or a quote', () => {
  const bad = [{ textColor: 'red' }, { fontSize: 5 }, { fontSize: 201 }, { fontSize: '12' }, { fontWeight: 450 }, { fontWeight: 1000 }, { fontFamily: 'A"><script>' }, { fontFamily: "A'B" }, { fontFamily: 'url(x)' }, { fontFamily: '' }, { padding: -1 }, { padding: 65 }, { padding: 1.5 },
    { radius: -1 }, { radius: 1001 }, { outlineSides: 'top' }, { outlineSides: ['top', 'top'] }, { outlineSides: ['middle'] }, { tint: 'blue' }, { fit: 'tile' }, { style: 'missing' }, { style: 'a b' }];
  for (const yavc of bad) { assert.equal(jc.read(file({ nodes: [node('a', 0, 0, { yavc })] })).doc, null, JSON.stringify(yavc)); }
  assert.equal(jc.read(file({ nodes: [], yavc: { font: 'A;B' } })).doc, null);
});

test('a rectangle takes a radius and draws only the sides it is given', () => {
  const doc = jc.read(file({ nodes: [node('a', 0, 0, { yavc: { radius: 500 } }), node('b', 0, 100, { yavc: { radius: 0, outlineSides: [] } }), node('c', 0, 200, { yavc: { outlineSides: ['bottom'], strokeColor: '#ff0000' } }),
    node('d', 0, 300, { yavc: { shape: 'rounded', radius: 3 } }), node('e', 0, 400, { yavc: { shape: 'oval', radius: 3, outlineSides: [] } })] })).doc;
  const svg = jc.render(doc, { palette: PALETTE }).svg, of = id => new RegExp('<g data-node="' + id + '">(.*?)<g data-text').exec(svg)[1];
  assert.match(of('a'), /rx="30"/, 'a radius is no larger than half the shorter side');
  assert.match(of('b'), /^<rect[^>]* rx="0"[^>]* stroke="none"[^>]*\/>$/);
  assert.match(of('c'), /stroke="none"[^>]*\/><path d="M 124\.0 284\.0 L 24\.0 284\.0" fill="none" stroke="#ff0000"/);
  assert.match(of('d'), /rx="3"/);
  assert.match(of('e'), /^<ellipse[^>]* stroke="#333333"/, 'a shape that is not a rectangle keeps its outline');
});

test('a picture is drawn as image data, tinted through a filter, and framed only when asked', () => {
  const doc = jc.read(file({ nodes: [picture('home', 0, 0, { yavc: { tint: '#ffffff', fit: 'cover' } }), picture('back', 100, 0, { yavc: { tint: '#ffffff' } }), picture('logo', 200, 0, { color: '1', yavc: { fillColor: '#eeeeee', fit: 'stretch' } }),
    picture('gone', 300, 0), { id: 'doc', type: 'file', x: 400, y: 0, width: 100, height: 60, file: 'notes/plan.md' }] })).doc;
  const pictures = { 'icons/home.svg': PNG, 'icons/back.svg': PNG, 'icons/logo.svg': PNG, 'notes/plan.md': PNG };
  const out = jc.render(doc, { palette: PALETTE, pictures }), of = id => new RegExp('<g data-node="' + id + '">(.*?)</g>').exec(out.svg)[1];
  const filters = [...out.svg.matchAll(/<filter id="(yc\d+t\d+)"[^>]*><feFlood flood-color="#ffffff"\/><feComposite in2="SourceAlpha" operator="in"\/><\/filter>/g)];
  assert.equal(filters.length, 1, 'one filter for one colour');
  assert.equal(of('home'), '<image x="24" y="24" width="48" height="48" preserveAspectRatio="xMidYMid slice" href="' + PNG + '" filter="url(#' + filters[0][1] + ')"/>');
  assert.ok(of('back').includes('preserveAspectRatio="xMidYMid meet"') && of('back').includes('filter="url(#' + filters[0][1] + ')"'));
  assert.match(of('logo'), /^<rect[^>]* fill="#eeeeee" stroke="#cc0000"[^>]*\/><image[^>]* preserveAspectRatio="none"[^>]*\/>$/);
  assert.ok(!of('logo').includes('filter='));
  assert.match(of('gone'), /^<rect[^>]* stroke="#333333"[^>]*\/><text[^>]*><tspan[^>]*>gone</, 'a picture that was not read is the named box');
  assert.ok(!of('doc').includes('<image'), 'a file that is not a picture is never drawn as one');
  assert.deepEqual(out.boxes.map(b => !!b.picture), [true, true, true, false, false]);
  const again = jc.render(doc, { palette: PALETTE, pictures });
  assert.notEqual(/<filter id="([^"]+)"/.exec(again.svg)[1], filters[0][1], 'two drawings in one page do not share a filter');
});

test('only checked image data reaches the drawing', () => {
  const doc = jc.read(file({ nodes: [picture('a', 0, 0)] })).doc;
  for (const href of ['https://example.com/a.svg', 'javascript:alert(1)', 'data:text/html;base64,PGI+', 'data:image/svg+xml,<svg onload="x"/>', 'data:image/png;base64,AAAA" onload="x', { toString() { return PNG; } }, null]) {
    const svg = jc.render(doc, { palette: PALETTE, pictures: { 'icons/a.svg': href } }).svg;
    assert.ok(!svg.includes('<image') && !svg.includes('href='), String(href));
  }
  const proto = jc.render(doc, { palette: PALETTE, pictures: Object.create({ 'icons/a.svg': PNG }) }).svg;
  assert.ok(!proto.includes('<image'));
});

test('a node takes its style\'s properties, with its own over them, and the file survives a round trip', () => {
  const original = { nodes: [node('a', 0, 0, { yavc: { style: 'key' } }), node('b', 0, 100, { yavc: { style: 'key', fillColor: '#222222', textColor: '#ffff00' } }), node('c', 0, 200)], edges: [],
    yavc: { version: 1, styles: { key: { shape: 'rectangle', radius: 6, fillColor: '#00a0e6', outlineSides: [], textColor: '#ffffff', fontSize: 13, fontWeight: 500, textAlign: 'center', textVerticalAlign: 'middle' } } } };
  const text = jc.write(original), doc = jc.read(text).doc, out = jc.render(doc, { palette: PALETTE });
  assert.deepEqual(JSON.parse(text), original);
  assert.deepEqual(jc.extension(doc, doc.nodes[1]).fillColor, '#222222');
  assert.deepEqual([out.boxes[0].colors.fill, out.boxes[0].text.color, out.boxes[0].text.size, out.boxes[0].text.align, out.boxes[0].text.vertical], ['#00a0e6', '#ffffff', 13, 'center', 'middle']);
  assert.deepEqual([out.boxes[1].colors.fill, out.boxes[1].text.color, out.boxes[1].text.size], ['#222222', '#ffff00', 13]);
  assert.deepEqual([out.boxes[2].colors.fill, out.boxes[2].text.size, out.boxes[2].text.align], ['#ffffff', 14, 'left']);
  assert.match(out.svg, /<g data-node="a"><rect[^>]* rx="6" fill="#00a0e6" stroke="none"/);
  for (const styles of [[], { 'a b': {} }, { key: [] }, { key: { anchor: true } }, { key: { style: 'key' } }, { key: { fontSize: 1 } }, Object.fromEntries(Array.from({ length: 201 }, (_, i) => ['s' + i, {}]))]) {
    assert.equal(jc.read(file({ nodes: [], yavc: { styles } })).doc, null, JSON.stringify(styles).slice(0, 60));
  }
  assert.ok(jc.read(file({ nodes: [{ id: 'g', type: 'group', x: 0, y: 0, width: 10, height: 10, yavc: { style: 'key' } }], yavc: { styles: original.yavc.styles } })).doc, 'a style\'s text alignment is ignored on a node it does not apply to');
});

// What a screen written out as a canvas showed was missing or wrong (DESIGN.md decision 128).
function drawn(node, yavc, opts) {
  const read = jc.read(JSON.stringify({ yavc: Object.assign({ version: 1 }, yavc), nodes: [Object.assign({ id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 40, text: 'Total' }, node)], edges: [] }));
  assert.deepEqual(read.problems.filter(p => !p.warning), []);
  return jc.render(read.doc, Object.assign({ palette: PALETTE, pad: 0 }, opts));
}
test('a font family the format allows is written so that CSS reads it', () => {
  assert.equal(jc.families('GKR Roboto 5-29-0, Arial,sans-serif'), "'GKR Roboto 5-29-0', 'Arial', sans-serif");
  assert.equal(jc.families('"Inter", system-ui'), "'Inter', system-ui");
  const out = drawn({ yavc: { fontFamily: 'GKR Roboto 5-29-0' } }, { font: '7 Segment' });
  assert.match(out.svg, /<svg[^>]* font-family="&#39;7 Segment&#39;, &#39;Inter&#39;, system-ui, sans-serif"/);
  assert.match(out.svg, /<text[^>]* font-family="&#39;GKR Roboto 5-29-0&#39;, &#39;7 Segment&#39;, &#39;Inter&#39;, system-ui, sans-serif"/);
  assert.equal(out.boxes[0].text.family, "'GKR Roboto 5-29-0', '7 Segment', 'Inter', system-ui, sans-serif");
});
test('a label as wide as its letters is not cut, by a measured width or by an estimate', () => {
  const lines = svg => Array.from(svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)).map(m => m[1]);
  // The estimate takes Total at 14 pixels for 39 pixels wide. A box of 36 is within its error; a box of 20 is not.
  assert.deepEqual(lines(drawn({ width: 36, yavc: { padding: 0 } }, {}, { measure: false }).svg), ['Total']);
  assert.deepEqual(lines(drawn({ width: 20, height: 100, yavc: { padding: 0 } }, {}, { measure: false }).svg).join(''), 'Total');
  assert.ok(lines(drawn({ width: 20, height: 100, yavc: { padding: 0 } }, {}, { measure: false }).svg).length > 1);
  // A measured width decides exactly, and is asked with the node's face.
  const asked = [], measure = (text, size, weight, family) => { asked.push([size, weight, family]); return text.length * 6; };
  assert.deepEqual(lines(drawn({ width: 30, yavc: { padding: 0, fontSize: 12, fontWeight: 700, fontFamily: 'Roboto' } }, {}, { measure }).svg), ['Total']);
  assert.deepEqual(asked[0], [12, 700, "'Roboto', 'Inter', system-ui, sans-serif"]);
  assert.deepEqual(lines(drawn({ width: 60, height: 100, text: 'Total due now', yavc: { padding: 0 } }, {}, { measure }).svg), ['Total due', 'now']);
});
test('a line height is the distance between lines and places the first one', () => {
  const two = { height: 100, text: 'One\\\nTwo', yavc: { fontSize: 20, padding: 0, lineHeight: 1 } }, out = drawn(two);
  assert.match(out.svg, /<text x="0\.0" y="17\.0"/);
  assert.match(out.svg, /<tspan x="0\.0" dy="20\.0">Two<\/tspan>/);
  assert.equal(out.boxes[0].text.lineHeight, 1);
  assert.match(drawn(Object.assign({}, two, { yavc: { fontSize: 20, padding: 0 } })).svg, /<text x="0\.0" y="20\.0"[\s\S]*dy="26\.0"/);
  for (const bad of [0.5, 4, '1.2']) assert.match(jc.read(JSON.stringify({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: '', yavc: { lineHeight: bad } }], edges: [] })).problems[0].message, /lineHeight must be a number from 0\.8 to 3/);
});
test('an outline can be inside the edge, as a CSS border is', () => {
  const inside = drawn({ yavc: { outlinePosition: 'inside', lineWidth: 1, radius: 4 } }).svg;
  assert.match(inside, /<rect x="0\.5" y="0\.5" width="99" height="39" rx="3\.5"[^>]* stroke-width="1"\/>/);
  assert.match(drawn({ yavc: { lineWidth: 1, radius: 4 } }).svg, /<rect x="0" y="0" width="100" height="40" rx="4"/);
  const sides = drawn({ yavc: { outlinePosition: 'inside', lineWidth: 2, outlineSides: ['bottom'] } }).svg;
  assert.match(sides, /<rect x="0" y="0" width="100" height="40"[^>]* stroke="none"/);
  assert.match(sides, /<path d="M 99\.0 39\.0 L 1\.0 39\.0"[^>]* stroke-linecap="square"\/>/);
  assert.match(jc.read(JSON.stringify({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: '', yavc: { outlinePosition: 'outside' } }], edges: [] })).problems[0].message, /outlinePosition must be center or inside/);
});
test('a node can have an outline and no fill', () => {
  const out = drawn({ yavc: { noFill: true, strokeColor: '#ff0000', fillColor: '#00ff00' } }, { background: '#101010' });
  assert.match(out.svg, /<rect x="0" y="0" width="100" height="40"[^>]* fill="none" stroke="#ff0000"/);
  assert.equal(out.boxes[0].colors.fill, '#101010');
  assert.match(out.svg, /<text[^>]* fill="#[ef][0-9a-f]{5}"/i, 'The text is read against what is behind the node.');
  assert.match(jc.read(JSON.stringify({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: '', yavc: { noFill: 'yes' } }], edges: [] })).problems[0].message, /noFill must be a boolean/);
});
test('the first baseline comes from the font where the page gives its ascent and descent', () => {
  // A text font: ascent 0.95 and descent 0.25 of the size. At 15 pixels in an 18 pixel line a page paints the baseline 14 below the line's top.
  const font = (up, down) => Object.assign((text, size) => text.length * size * 0.5, { metrics: size => ({ ascent: size * up, descent: size * down }) });
  const text = drawn({ height: 18, yavc: { shape: 'text', padding: 0, fontSize: 15, lineHeight: 1.2 } }, {}, { measure: font(0.95, 0.25) }).svg;
  assert.match(text, /<text x="0\.0" y="14\.0"/);
  // A symbol font: ascent 0.94 and descent 0.06. At 22 pixels in a 22 pixel line the baseline is 21 below the top.
  assert.match(drawn({ height: 22, yavc: { shape: 'text', padding: 0, fontSize: 22, lineHeight: 1 } }, {}, { measure: font(0.94, 0.06) }).svg, /<text x="0\.0" y="21\.0"/);
  // A page that cannot give them, and no page at all, keep the estimate.
  const none = Object.assign((text, size) => text.length * size * 0.5, { metrics: () => null });
  assert.match(drawn({ height: 22, yavc: { shape: 'text', padding: 0, fontSize: 22, lineHeight: 1 } }, {}, { measure: none }).svg, /<text x="0\.0" y="18\.7"/);
  assert.match(drawn({ height: 22, yavc: { shape: 'text', padding: 0, fontSize: 22, lineHeight: 1 } }, {}, { measure: false }).svg, /<text x="0\.0" y="18\.7"/);
});
test('an estimate does not start a new line for a text it is not sure is too wide', () => {
  const lines = svg => Array.from(svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)).map(m => m[1]);
  // Take payment at 14 pixels is estimated at 94 pixels. A box of 80 is within a fifth of that; a box of 60 is not.
  assert.deepEqual(lines(drawn({ width: 80, height: 60, text: 'Take payment', yavc: { padding: 0 } }, {}, { measure: false }).svg), ['Take payment']);
  assert.deepEqual(lines(drawn({ width: 60, height: 60, text: 'Take payment', yavc: { padding: 0 } }, {}, { measure: false }).svg), ['Take', 'payment']);
});
test('padding can differ on each side', () => {
  const out = drawn({ width: 100, height: 60, yavc: { fontSize: 20, lineHeight: 1, paddingSides: [10, 4, 2, 30] } }, {}, { measure: false });
  assert.match(out.svg, /<text x="30\.0" y="27\.0"/);
  assert.deepEqual(out.boxes[0].text.pads, [10, 4, 2, 30]);
  assert.match(drawn({ width: 100, height: 60, yavc: { fontSize: 20, lineHeight: 1, paddingSides: [10, 4, 2, 30], textAlign: 'right', textVerticalAlign: 'bottom' } }, {}, { measure: false }).svg, /<text x="96\.0" y="55\.0"/);
  assert.match(drawn({ width: 100, height: 60, yavc: { fontSize: 20, lineHeight: 1, paddingSides: [10, 4, 2, 30], textAlign: 'center', textVerticalAlign: 'middle' } }, {}, { measure: false }).svg, /<text x="63\.0" y="41\.0"/);
  for (const bad of [[1, 2, 3], [1, 2, 3, 99], '4', [1, 2, 3, 1.5]]) assert.match(jc.read(JSON.stringify({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: '', yavc: { paddingSides: bad } }], edges: [] })).problems[0].message, /paddingSides must be four whole numbers/);
});
