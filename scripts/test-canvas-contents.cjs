// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The canvas-contents action (DESIGN.md, decision 163) returns what an open canvas contains as data: its nodes with kind, text, position, size and
// group, its edges with their ends and label, and its groups with what each holds. The test checks the answer against the schema the action
// declares, checks its facts, and checks that reading a canvas that is not in front changes nothing. Needs a server on YAVC_CHROME_TEST_PORT.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
const declared = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'diagrams', 'actions.json'), 'utf8')).actions.find(a => a.ref === 'yavc.diagrams/canvas-contents@1');

// A checker for the parts of JSON Schema the action's schemas use.
function check(value, schema, where, errors) {
    const types = [].concat(schema.type || []);
    const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
    if (types.length && !types.some(t => t === kind || t === 'number' && kind === 'integer')) { errors.push(where + ' is ' + kind + ', not ' + types.join(' or ')); return errors; }
    if (schema.enum && !schema.enum.includes(value)) { errors.push(where + ' is ' + JSON.stringify(value) + ', not one of ' + JSON.stringify(schema.enum)); }
    if (kind === 'object') {
        for (const key of schema.required || []) { if (!(key in value)) { errors.push(where + ' lacks ' + key); } }
        for (const key of Object.keys(value)) {
            if (schema.properties && schema.properties[key]) { check(value[key], schema.properties[key], where + '.' + key, errors); }
            else if (schema.additionalProperties === false) { errors.push(where + ' has ' + key + ', which the schema does not allow'); }
        }
    }
    if (kind === 'array' && schema.items) { value.forEach((item, i) => check(item, schema.items, where + '[' + i + ']', errors)); }
    return errors;
}

const canvas = JSON.stringify({ yavc: { version: 1 }, nodes: [
    { id: 'outer', type: 'group', x: 0, y: 0, width: 600, height: 400, label: 'Outer' },
    { id: 'inner', type: 'group', x: 20, y: 150, width: 300, height: 200, label: 'Inner' },
    { id: 'a', type: 'text', x: 20, y: 30, width: 120, height: 60, text: 'Alpha' },
    { id: 'c', type: 'text', x: 40, y: 190, width: 120, height: 60, text: 'Gamma' },
    { id: 'b', type: 'text', x: 700, y: 30, width: 120, height: 60, text: 'Beta' },
    { id: 'f', type: 'file', x: 700, y: 150, width: 120, height: 60, file: 'notes/plan.md' },
    { id: 'l', type: 'link', x: 700, y: 250, width: 120, height: 60, url: 'https://example.org/' },
    { id: 'free', type: 'text', x: 450, y: 330, width: 0, height: 0, text: '', yavc: { anchor: true, shape: 'text' } }
], edges: [
    { id: 'e1', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', label: 'goes' },
    { id: 'e2', fromNode: 'c', toNode: 'free' }
] });

(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1300, height: 900 } }), errors = [];
        page.setDefaultTimeout(25000);
        page.on('pageerror', e => errors.push(e.message));
        let phase = 'startup';
        try {
            const action = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
            await page.goto(`http://diagrams.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
            assert.deepEqual(declared.capabilities, ['files.read']); assert.equal(declared.changes, 'none');
            phase = 'a canvas';
            await action('new', { kind: 'canvas', text: canvas });
            const got = await action('canvas-contents');
            assert.deepEqual(check(got, declared.outputSchema, 'output', []), [], engine + ': the answer does not match its schema');
            const node = id => got.nodes.find(n => n.id === id), group = id => got.groups.find(g => g.id === id), edge = id => got.edges.find(e => e.id === id);
            assert.deepEqual(got.nodes.map(n => n.id).sort(), ['a', 'b', 'c', 'f', 'l'], engine + ': nodes are the ones that are not groups or free points');
            assert.deepEqual([node('a').kind, node('a').text, node('a').x, node('a').y, node('a').width, node('a').height], ['text', 'Alpha', 20, 30, 120, 60]);
            assert.equal(node('a').group, 'outer'); assert.equal(node('c').group, 'inner', 'a node is in the smallest group that holds it'); assert.equal(node('b').group, null);
            assert.deepEqual([node('f').kind, node('f').file, node('f').text, node('f').url], ['file', 'notes/plan.md', null, null]);
            assert.deepEqual([node('l').kind, node('l').url, node('l').text, node('l').file], ['link', 'https://example.org/', null, null]);
            assert.deepEqual(got.groups.map(g => g.id).sort(), ['inner', 'outer']);
            assert.deepEqual(group('outer').members.sort(), ['a', 'c', 'inner'], engine + ': what the outer group holds');
            assert.deepEqual(group('inner').members, ['c']); assert.equal(group('inner').group, 'outer'); assert.equal(group('outer').group, null); assert.equal(group('outer').label, 'Outer');
            assert.deepEqual([edge('e1').fromNode, edge('e1').fromSide, edge('e1').toNode, edge('e1').toSide, edge('e1').label], ['a', 'right', 'b', 'left', 'goes']);
            assert.deepEqual([edge('e2').fromNode, edge('e2').fromSide, edge('e2').label, edge('e2').toNode, edge('e2').toPoint], ['c', null, null, null, { x: 450, y: 330 }], engine + ': an end on a free point is that point');
            assert.equal(edge('e1').fromPoint, null);
            phase = 'a canvas that is not in front';
            await action('new', { kind: 'd2', text: 'a -> b\n' });
            const before = await action('diagrams');
            assert.equal(before.active, 2);
            const behind = await action('canvas-contents', { index: 1 });
            assert.deepEqual(behind.nodes, got.nodes); assert.equal(behind.index, 1);
            assert.equal((await action('diagrams')).active, 2, engine + ': reading a canvas that is not in front changed the diagram in front');
            phase = 'a diagram that is not a canvas';
            await assert.rejects(action('canvas-contents'), /not a canvas/);
            assert.deepEqual(errors, []);
            console.log(engine + ': the contents of a canvas, as data that matches the action\'s schema');
        } catch (err) { console.error(engine, phase, errors); throw err; } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
