// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Run against a disposable local server. Supply Playwright through NODE_PATH
// if it is installed outside this checkout. This script never opens live data.
//   node scripts/test-canvas.cjs chromium firefox webkit
const { strict: assert } = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const url = process.env.CANVAS_TEST_URL || 'http://diagrams.localhost:8412/';
if (!/^http:\/\/([a-z-]+\.)?localhost:\d+\/$/.test(url)) throw new Error('Use a disposable localhost server.');
const evidence = process.env.CANVAS_TEST_OUTPUT || path.join(require('node:os').tmpdir(), 'yavc-c2-evidence');
fs.mkdirSync(evidence, { recursive: true });
const node = (id, x, y, width = 160, height = 80) => ({ id, type: 'text', x, y, width, height, text: `**${id}**` });
const fixture = () => ({ nodes: [node('a', -160, -40), node('b', 180, 80)], edges: [{ id: 'ab', fromNode: 'a', toNode: 'b' }], extra: { keep: 'unknown data' } });

async function run(engine) {
    const browser = await playwright[engine].launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [], consoleErrors = [], networkErrors = [], pending = new Set();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('request', r => pending.add(r.url()));
    page.on('requestfinished', r => pending.delete(r.url()));
    page.on('requestfailed', r => { pending.delete(r.url()); networkErrors.push(r.url() + ': ' + r.failure().errorText); });
    const action = (name, input = {}) => page.evaluate(({ name, input }) => window.pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
    const command = id => page.evaluate(id => window.pudlCommands.run(id, null, document.querySelector('.dg')), id);
    const text = async () => (await action('diagram')).text;
    const doc = async () => JSON.parse(await text());
    const hit = id => page.locator(`.dg-cv-hit[data-id="${id}"]`);
    const stage = page.locator('.dg-stage');
    const idle = () => page.waitForFunction(() => document.querySelector('.dg-cv-editor') && !document.querySelector('.dg-place.sc-diagram-stale'));
    const set = async d => { await action('set-text', { text: typeof d === 'string' ? d : JSON.stringify(d) }); await idle(); await command('fit'); await command('cv-actual'); };
    const undo = async () => { await stage.focus(); await page.keyboard.press('Control+z'); await idle(); };
    const drag = async (target, dx, dy, modifiers = []) => {
        const b = await target.boundingBox(); assert.ok(b);
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        for (const m of modifiers) await page.keyboard.down(m);
        await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 6 });
        await page.mouse.up();
        for (const m of modifiers) await page.keyboard.up(m);
        await idle();
    };
    try {
        await page.goto(url);
        await page.waitForFunction(() => !!window.pudlActions && !!document.querySelector('.dg .cm-editor'));
        await action('new', { kind: 'canvas', text: JSON.stringify(fixture()) });
        await page.locator('.dg-cv-hit').first().waitFor(); await idle(); await command('fit'); await command('cv-actual');

        // The actual picture and hits must use the same viewport, including
        // after the inspector changes the available width.
        await hit('a').click();
        await page.waitForFunction(() => document.querySelectorAll('.dg-cv-grip').length === 12);
        const alignment = await page.evaluate(() => {
            const root = document.querySelector('.dg-cv-editor'), pic = root.querySelector(':scope > svg'), hit = root.querySelector('.dg-cv-layer');
            const a = pic.getBoundingClientRect(), b = hit.getBoundingClientRect();
            return { pic: [a.x, a.y, a.width, a.height], hit: [b.x, b.y, b.width, b.height], pv: pic.getAttribute('viewBox'), hv: hit.getAttribute('viewBox'), background: getComputedStyle(pic).backgroundColor, fill: getComputedStyle(pic.querySelector('rect')).fill };
        });
        assert.deepEqual(alignment.pic, alignment.hit); assert.equal(alignment.pv, alignment.hv);
        assert.equal(alignment.background, alignment.fill);
        const initial = await text();
        await page.keyboard.press('ArrowRight'); await idle();
        assert.equal((await doc()).nodes[0].x, -159);
        await page.keyboard.press('Shift+ArrowDown'); await idle();
        assert.equal((await doc()).nodes[0].y, -32);
        await undo(); assert.equal((await doc()).nodes[0].y, -40);
        assert.equal((await doc()).nodes[0].x, -159);
        await undo(); assert.equal(await text(), initial);

        await hit('a').click();
        let b = await hit('a').boundingBox(), scale = b.width / 160;
        await drag(hit('a'), 34 * scale, 18 * scale);
        assert.deepEqual((await doc()).nodes[0], { ...fixture().nodes[0], x: -128, y: -24 });
        await undo(); assert.equal(await text(), initial);
        await hit('a').click(); b = await hit('a').boundingBox(); scale = b.width / 160;
        await drag(hit('a'), 13 * scale, 7 * scale, ['Alt']);
        // Browser input can quantize subpixel screen coordinates before
        // the camera converts them to whole file pixels.
        assert.ok(Math.abs((await doc()).nodes[0].x + 147) <= 1); assert.ok(Math.abs((await doc()).nodes[0].y + 33) <= 1);
        await undo();

        // Cancellation and a concurrent source edit cannot submit the old drag.
        await hit('a').click(); b = await hit('a').boundingBox();
        await page.mouse.move(b.x + 30, b.y + 30); await page.mouse.down(); await page.mouse.move(b.x + 100, b.y + 60);
        await page.keyboard.press('Escape'); await page.mouse.up();
        assert.equal(await text(), initial);
        await hit('a').click(); b = await hit('a').boundingBox();
        await page.mouse.move(b.x + 30, b.y + 30); await page.mouse.down(); await page.mouse.move(b.x + 60, b.y + 50);
        const updated = fixture(); updated.nodes[0].text = 'Changed during a drag';
        await action('set-text', { text: JSON.stringify(updated) }); await page.mouse.up(); await idle();
        assert.equal((await doc()).nodes[0].text, 'Changed during a drag'); assert.equal((await doc()).nodes[0].x, -160);

        await set(fixture()); await hit('a').click(); b = await hit('a').boundingBox(); scale = b.width / 160;
        await drag(page.locator('[data-grip="se"][data-kind="resize"]'), 40 * scale, 20 * scale, ['Alt', 'Shift']);
        let d = await doc(); assert.equal(d.nodes[0].width, 200); assert.equal(d.nodes[0].height, 100); assert.equal(d.nodes[0].x, -160);
        await undo();
        await hit('a').click(); b = await hit('a').boundingBox(); scale = b.width / 160;
        await drag(page.locator('[data-grip="nw"][data-kind="resize"]'), 16 * scale, 8 * scale, ['Alt']);
        d = await doc(); assert.equal(d.nodes[0].x, -144); assert.equal(d.nodes[0].y, -32); assert.equal(d.nodes[0].width, 144); assert.equal(d.nodes[0].height, 72);
        await undo();

        await hit('a').click(); await command('cv-zoom-out');
        await drag(hit('a'), 40, 40, ['Alt']);
        d = await doc(); assert.equal(d.nodes[0].x, -110); assert.equal(d.nodes[0].y, 10);
        await undo(); await command('cv-actual');

        // A connector is dragged from an explicit source side to a target side.
        await hit('a').click();
        const grip = await page.locator('[data-grip="right"][data-kind="connect"]').boundingBox(), to = await hit('b').boundingBox();
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
        await page.mouse.move(to.x + 2, to.y + to.height / 2, { steps: 8 }); await page.mouse.up(); await idle();
        d = await doc(); assert.equal(d.edges.length, 2); assert.equal(d.edges[1].fromSide, 'right'); assert.equal(d.edges[1].toSide, 'left');
        await page.locator('[data-set="route"]').selectOption('curve'); await idle();
        assert.equal((await doc()).edges[1].yavc.route, 'curve');
        await page.locator('[data-set="toHead"]').selectOption('cf-many'); await idle();
        assert.equal((await doc()).edges[1].toEnd, 'arrow');
        await page.locator('[data-set="toHead"]').selectOption('none'); await idle();
        assert.equal((await doc()).edges[1].toEnd, 'none');

        await set(fixture()); await command('tool-rounded');
        const ground = await page.locator('.dg-cv-editor').boundingBox();
        await page.mouse.click(ground.x + 60, ground.y + 60); await idle();
        d = await doc(); assert.equal(d.nodes.length, 3); assert.equal(d.nodes[2].yavc.shape, 'rounded');
        await command('cv-duplicate'); await idle();
        d = await doc(); assert.equal(d.nodes.length, 4); assert.equal(new Set(d.nodes.map(n => n.id)).size, 4);
        await command('cv-back'); await idle();
        assert.equal((await doc()).nodes[2].id, d.nodes[3].id);
        await command('cv-delete'); await idle(); assert.equal((await doc()).nodes.length, 3);

        await set(fixture()); await hit('a').click();
        const textField = page.locator('textarea[data-set="text"]');
        await textField.fill(''); await textField.blur(); await idle();
        assert.equal((await doc()).nodes[0].text, '');
        const colour = page.locator('input[data-set="color"]'), beforeBadColour = await text();
        await colour.fill('javascript:evil'); await colour.blur();
        await page.waitForFunction(() => !!document.querySelector('[data-set="color"][aria-invalid="true"]'));
        assert.equal(await text(), beforeBadColour);
        await colour.fill('4'); await colour.blur(); await idle();
        assert.equal((await doc()).nodes[0].color, '4');

        // Native clipboard integration is exercised in Chromium. The shared
        // model corpus covers the same paste validation in every Node run.
        if (engine === 'chromium') {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
            await command('cv-copy');
            const clip = await page.evaluate(() => navigator.clipboard.readText());
            assert.equal(JSON.parse(clip).nodes[0].id, 'a');
            await command('cv-paste'); await idle();
            assert.equal((await doc()).nodes.length, 3);
        }

        // Completion of an earlier clipboard read cannot edit a new tab.
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => new Promise(resolve => { window.finishClipboard = resolve; }) } });
            window.pendingPaste = window.pudlCommands.run('cv-paste', null, document.querySelector('.dg'));
        });
        await page.waitForFunction(() => !!window.finishClipboard);
        await action('new', { kind: 'canvas', text: JSON.stringify(fixture()) }); await idle();
        const newTabText = await text();
        await page.evaluate(text => { window.finishClipboard(text); delete navigator.clipboard; return window.pendingPaste; }, JSON.stringify(fixture()));
        assert.equal(await text(), newTabText);

        // Group membership follows geometry, including after a node leaves.
        const grouped = fixture(); grouped.nodes.unshift({ id: 'g', type: 'group', x: -200, y: -100, width: 600, height: 400, label: 'Group' });
        await set(grouped); await command('fit');
        await page.locator('[data-id="g"]').click({ position: { x: 10, y: 10 } });
        await stage.focus(); await page.keyboard.press('Shift+ArrowRight'); await idle();
        d = await doc(); assert.equal(d.nodes[0].x, -192); assert.equal(d.nodes[1].x, -152); assert.equal(d.nodes[2].x, 188);
        await action('canvas-edit', { op: 'move', key: 'a', dx: -1000, dy: 0 }); await idle();
        await action('canvas-edit', { op: 'move', key: 'g', dx: 16, dy: 0 }); await idle();
        assert.equal((await doc()).nodes[1].x, -1152);
        assert.equal((await doc()).extra.keep, 'unknown data');

        // A malformed source leaves the last good image disabled.
        await action('set-text', { text: '{invalid' });
        assert.equal(await page.locator('.sc-diagram-stale').count(), 1);
        const beforeInvalid = await text();
        await stage.focus(); await page.keyboard.press('ArrowRight'); assert.equal(await text(), beforeInvalid);
        await set(fixture());

        // Camera changes never enter saved text or exported content bounds.
        const beforeCamera = await text(), exported = await action('render', { format: 'svg' });
        await command('cv-zoom-in'); await command('cv-pan-right');
        await action('canvas-view', { op: 'select', key: 'b', kind: 'node' });
        await action('canvas-view', { op: 'pan', dx: 20, dy: -10 });
        await action('canvas-view', { op: 'zoom', factor: 0.8 });
        await action('canvas-view', { op: 'fit' });
        assert.equal(await text(), beforeCamera);
        const exportedAfter = await action('render', { format: 'svg' });
        assert.equal(exportedAfter.width, exported.width); assert.equal(exportedAfter.height, exported.height);
        await page.emulateMedia({ colorScheme: 'dark' }); await idle();
        await hit('a').click();
        await page.screenshot({ path: path.join(evidence, engine + '-dark.png') });
        await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active' }); await idle();
        await page.screenshot({ path: path.join(evidence, engine + '-forced-colors.png') });
        await page.emulateMedia({ forcedColors: 'none' });
        await page.setViewportSize({ width: 720, height: 700 }); await command('fit');
        await page.screenshot({ path: path.join(evidence, engine + '-narrow.png') });

        // Other renderers still load with the palette's new shape hidden.
        await action('new', { kind: 'd2', text: 'a -> b' });
        await page.locator('.dg-hit-shape').first().waitFor();
        assert.equal(await page.locator('[data-command="tool-rounded"]').isVisible(), false);
        await action('new', { kind: 'mermaid', text: 'graph TD\n a --> b' });
        assert.equal(await page.locator('.dg-palette').isVisible(), false);
        assert.deepEqual(errors, []);
        console.log(engine + ' ' + browser.version() + ': canvas pointer, keyboard, undo, inspector, groups, source, exports and renderer smoke passed');
    } catch (err) {
        const prefix = path.join(evidence, engine + '-failure-' + Date.now());
        await page.screenshot({ path: prefix + '.png' }).catch(() => {});
        const state = await page.evaluate(() => ({ kit: !!window.yavcMdEditor, cm: !!window.CM, modes: !!window.yavcDiagramModes, canvas: !!window.yavcCanvas })).catch(() => null);
        fs.writeFileSync(prefix + '.json', JSON.stringify({ error: err.message, pageErrors: errors, consoleErrors, networkErrors, pending: [...pending], state }, null, 2));
        throw err;
    } finally { await browser.close(); }
}
async function hostSmoke(engine) {
    const browser = await playwright[engine].launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const action = (name, input = {}) => page.evaluate(({ name, input }) => window.pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
    const doc = async () => JSON.parse((await action('diagram')).text);
    const idle = () => page.waitForFunction(() => document.querySelector('.dg-cv-editor') && !document.querySelector('.dg-place.sc-diagram-stale'));
    try {
        await page.goto(url.replace('diagrams.localhost', 'localhost') + 'diagrams');
        await page.waitForFunction(() => !!document.querySelector('.dg .cm-editor'));
        await action('new', { kind: 'canvas', text: JSON.stringify(fixture()) }); await idle();
        const stage = page.locator('.dg-stage');
        await stage.focus(); await page.keyboard.press('Escape'); await page.keyboard.press('Tab');
        assert.equal(await stage.evaluate(e => e === document.activeElement), true);
        assert.match(await page.locator('.dg-message').innerText(), /node "a"/);
        await page.keyboard.press('Shift+Tab'); assert.equal(await stage.evaluate(e => e === document.activeElement), false);
        await stage.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('r');
        await page.locator('dialog[open]').waitFor();
        await page.locator('dialog[open] input').fill('192 96');
        await page.getByRole('button', { name: 'Resize', exact: true }).click(); await idle();
        assert.equal((await doc()).nodes[0].width, 192); assert.equal((await doc()).nodes[0].height, 96);
        await stage.focus(); await page.keyboard.press('c');
        await page.locator('dialog[open]').waitFor();
        await page.locator('dialog[open] input').fill('b');
        await page.getByRole('button', { name: 'Connect', exact: true }).click(); await idle();
        assert.equal((await doc()).edges.length, 2);
        await stage.focus(); await page.keyboard.press('h');
        const modes = await page.evaluate(() => {
            const root = document.querySelector('.dg');
            return ['tool-select', 'cv-pan'].map(id => window.pudlCommands.find(id, root).checked());
        });
        assert.deepEqual(modes, [false, true]);
        const beforeCamera = await action('diagram');
        const pane = await stage.boundingBox();
        await page.mouse.move(pane.x + 50, pane.y + 50); await page.mouse.down(); await page.mouse.move(pane.x + 100, pane.y + 80); await page.mouse.up();
        assert.equal((await action('diagram')).text, beforeCamera.text);
        await stage.focus(); await page.keyboard.press('Escape');

        // PUDL's fixed contract emits no unchanged skin-attribute writes
        // after repeated selection, refresh or unrelated DOM changes.
        const notifications = await page.evaluate(async () => {
            let count = 0;
            const root = document.documentElement, skin = window.pudlSkins.current();
            const mo = new MutationObserver(records => { count += records.length; });
            mo.observe(root, { attributes: true, attributeFilter: ['data-skin', 'data-skin-pref'] });
            window.pudlSkins.select(skin); window.pudlSkins.refresh();
            const span = document.createElement('span'); document.body.append(span); span.remove();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            mo.disconnect(); return count;
        });
        assert.equal(notifications, 0);
        await page.evaluate(() => window.pudlSkins.select(window.pudlSkins.available().find(x => x !== 'standard') || 'standard'));
        await idle();
        await page.screenshot({ path: path.join(evidence, engine + '-desktop.png') });
        assert.deepEqual(errors, []);
        console.log(engine + ': desktop host, keyboard dialogs, focus escape, tool choices and skin notifications passed');
    } catch (err) {
        await page.screenshot({ path: path.join(evidence, engine + '-desktop-failure.png') }).catch(() => {});
        throw err;
    } finally { await browser.close(); }
}
async function endpoints(engine) {
    const browser = await playwright[engine].launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const action = (name, input = {}) => page.evaluate(({ name, input }) => window.pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
    const text = async () => (await action('diagram')).text, doc = async () => JSON.parse(await text());
    const idle = () => page.waitForFunction(() => document.querySelector('.dg-cv-editor') && !document.querySelector('.dg-place.sc-diagram-stale'));
    const stage = page.locator('.dg-stage'), hit = id => page.locator(`.dg-cv-hit[data-id="${id}"]`);
    const selectEdge = () => action('canvas-view', { op: 'select', key: 'ab', kind: 'edge' });
    const filePoint = async (x, y) => {
        const n = (await doc()).nodes.find(x => x.id === 'a');
        return hit('a').evaluate((e, p) => {
            const q = new DOMPoint(p.x - p.n.x + Number(e.getAttribute('x')), p.y - p.n.y + Number(e.getAttribute('y'))).matrixTransform(e.getScreenCTM());
            return { x: q.x, y: q.y };
        }, { n, x, y });
    };
    const dragEnd = async (end, to) => {
        const b = await page.locator(`[data-kind="reconnect"][data-grip="${end}"]`).boundingBox(); assert.ok(b);
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up(); await idle();
    };
    try {
        await page.goto(url); await page.locator('.dg .cm-editor').waitFor();
        const data = fixture(); data.nodes.push(node('c', 180, 300)); data.edges[0].color = '4'; data.edges[0].extra = 'keep';
        await action('new', { kind: 'canvas', text: JSON.stringify(data) }); await idle();
        await page.evaluate(() => { const r = document.querySelector('.dg'); window.pudlCommands.run('fit', null, r); window.pudlCommands.run('cv-actual', null, r); });
        const middle = await page.locator('.dg-cv-edge-hit[data-id="ab"]').evaluate(e => {
            const p = e.getPointAtLength(e.getTotalLength() / 2).matrixTransform(e.getScreenCTM()); return { x: p.x, y: p.y };
        });
        await page.mouse.click(middle.x, middle.y);
        assert.equal(await page.locator('[data-kind="reconnect"]').count(), 2);
        const c = await hit('c').boundingBox();
        await dragEnd('to', { x: c.x + c.width / 2 + 3, y: c.y + c.height / 2 });
        let d = await doc(); assert.equal(d.edges[0].toNode, 'c'); assert.equal(d.edges[0].toSide, undefined);
        assert.equal(d.edges[0].extra, 'keep'); assert.equal(d.edges[0].color, '4');
        const b = await hit('b').boundingBox();
        await dragEnd('to', { x: b.x + b.width / 2, y: b.y + 2 });
        d = await doc(); assert.equal(d.edges[0].toNode, 'b'); assert.equal(d.edges[0].toSide, 'top');
        const pinned = await text();
        await dragEnd('to', await filePoint(80, 200));
        d = await doc(); let anchor = d.nodes.find(n => n.yavc?.anchor);
        assert.ok(anchor); assert.equal(anchor.x, 80); assert.equal(anchor.y, 200);
        assert.equal(d.edges[0].toNode, anchor.id); assert.equal(d.edges[0].toSide, undefined);
        assert.equal(await page.locator(`.dg-cv-hit[data-id="${anchor.id}"]`).count(), 0);
        const free = await text();
        await stage.focus(); await page.keyboard.press('Control+z'); await idle(); assert.equal(await text(), pinned);
        await page.keyboard.press('Control+y'); await idle(); assert.equal(await text(), free);
        await selectEdge(); await dragEnd('to', { x: c.x + c.width / 2, y: c.y + c.height / 2 });
        d = await doc(); assert.equal(d.nodes.filter(n => n.yavc?.anchor).length, 0);

        // A moving node previews the same automatic route that will be saved.
        const beforeMove = await text();
        await hit('c').click(); const cr = await hit('c').boundingBox();
        await page.mouse.move(cr.x + cr.width / 2, cr.y + cr.height / 2); await page.keyboard.down('Alt'); await page.mouse.down();
        await page.mouse.move(cr.x + cr.width / 2 - 380, cr.y + cr.height / 2 - 500, { steps: 8 });
        assert.equal(await text(), beforeMove);
        const preview = await page.locator('[data-preview-edge="ab"]').getAttribute('d');
        const expected = await page.evaluate(data => {
            const origin = document.querySelector('.dg-cv-hit[data-id="a"]'), a = data.nodes.find(n => n.id === 'a');
            const ox = a.x - Number(origin.getAttribute('x')), oy = a.y - Number(origin.getAttribute('y'));
            data.nodes.find(n => n.id === 'c').x -= 380; data.nodes.find(n => n.id === 'c').y -= 500;
            const r = window.yavcCanvas.route(data.edges[0], data.nodes);
            r.points = r.points.map(p => [p[0] - ox, p[1] - oy]);
            return { d: window.yavcCanvas.path(r), side: r.to };
        }, d);
        assert.equal(preview, expected.d); assert.equal(expected.side, 'bottom');
        await page.mouse.up(); await page.keyboard.up('Alt'); await idle();
        assert.equal((await doc()).nodes.find(n => n.id === 'c').y, -200);
        await stage.focus(); await page.keyboard.press('Control+z'); await idle();

        // Escape and text edits cancel an endpoint drag without allocating a point.
        await selectEdge(); const beforeCancel = await text();
        let g = await page.locator('[data-kind="reconnect"][data-grip="from"]').boundingBox();
        await page.mouse.move(g.x + 8, g.y + 8); await page.mouse.down(); await page.mouse.move(g.x + 65, g.y + 65);
        await page.keyboard.press('Escape'); await page.mouse.up(); assert.equal(await text(), beforeCancel);
        await selectEdge(); g = await page.locator('[data-kind="reconnect"][data-grip="from"]').boundingBox();
        await page.mouse.move(g.x + 8, g.y + 8); await page.mouse.down(); await page.mouse.move(g.x + 40, g.y + 60);
        const updated = await doc(); updated.nodes[0].text = 'Newer source';
        await action('set-text', { text: JSON.stringify(updated) }); await page.mouse.up(); await idle();
        assert.equal((await doc()).nodes[0].text, 'Newer source'); assert.equal((await doc()).nodes.some(n => n.yavc?.anchor), false);

        // Keyboard reconnect supports both a free point and an automatic node.
        await selectEdge(); await stage.focus(); await page.keyboard.press('e');
        await page.locator('dialog[open]').waitFor();
        await page.locator('dialog [data-set="target"]').selectOption('');
        await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('');
        await page.getByRole('spinbutton', { name: 'Y', exact: true }).fill('220');
        await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-invalid') === 'true');
        assert.equal(await page.getByRole('spinbutton', { name: 'X', exact: true }).evaluate(e => e === document.activeElement), true);
        await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('-80');
        await page.getByRole('button', { name: 'Reconnect', exact: true }).click(); await idle();
        assert.equal((await doc()).nodes.find(n => n.yavc?.anchor).x, -80);
        assert.equal((await doc()).nodes.find(n => n.yavc?.anchor).y, 220);
        await selectEdge(); await stage.focus(); await page.keyboard.press('Shift+e');
        await page.locator('dialog[open]').waitFor();
        await page.locator('dialog [data-set="target"]').selectOption('b'); await page.locator('dialog [data-set="side"]').selectOption('');
        await page.getByRole('button', { name: 'Reconnect', exact: true }).click(); await idle();
        assert.equal((await doc()).edges[0].fromNode, 'b'); assert.equal((await doc()).edges[0].fromSide, undefined);
        await action('canvas-edit', { op: 'reconnect', key: 'ab', end: 'from', node: null, x: -80, y: 100 }); await idle();
        assert.equal((await doc()).nodes.filter(n => n.yavc?.anchor).length, 2);
        await page.screenshot({ path: path.join(evidence, engine + '-endpoints.png') });
        const exported = await action('render', { format: 'png', scale: 1 }); assert.ok(exported.width > 0 && exported.height > 0);
        await action('canvas-edit', { op: 'delete', key: 'ab', kind: 'edge' }); await idle();
        assert.equal((await doc()).nodes.filter(n => n.yavc?.anchor).length, 0);
        assert.deepEqual(errors, []);
        console.log(engine + ': endpoint reattachment, free points, live automatic routes, undo, cancellation, keyboard and PNG export passed');
    } catch (err) {
        await page.screenshot({ path: path.join(evidence, engine + '-endpoint-failure-' + Date.now() + '.png') }).catch(() => {});
        throw err;
    } finally { await browser.close(); }
}
async function startup(engine) {
    const browser = await playwright[engine].launch({ headless: true });
    try {
        for (const applet of ['diagrams', 'editor', 'slides']) {
            const context = await browser.newContext(), page = await context.newPage(), errors = [];
            page.on('pageerror', e => errors.push(e.message));
            page.on('console', m => { if (m.type() === 'warning' && m.text().includes('pudl-applets:')) errors.push(m.text()); });
            let release, requested;
            const held = new Promise(resolve => { release = resolve; }), seen = new Promise(resolve => { requested = resolve; });
            await page.route('**/static/doc-tabs.js*', async route => { requested(); await held; await route.continue(); });
            try {
                await page.goto(url.replace('diagrams.localhost', applet + '.localhost'), { waitUntil: 'commit' });
                await seen;
                await page.locator('[data-applet="' + applet + '"]').waitFor({ state: 'attached' });
                assert.equal(await page.evaluate(() => !!window.pudlApplets), false, 'The loader ran before document tabs were available.');
                release();
                if (applet === 'slides') { await page.getByRole('button', { name: 'Text', exact: true }).click(); }
                await page.locator('.cm-editor').first().waitFor({ state: 'attached' });
                assert.deepEqual(errors, []);
                console.log(engine + ': delayed document tabs preserve ' + applet + ' startup');
            } catch (err) {
                await page.screenshot({ path: path.join(evidence, engine + '-' + applet + '-startup-failure-' + Date.now() + '.png') }).catch(() => {});
                throw err;
            } finally { release(); await context.close(); }
        }
    } finally { await browser.close(); }
}
(async () => {
    const args = process.argv.slice(2), host = args.includes('--host'), boot = args.includes('--startup'), ends = args.includes('--endpoints'), engines = args.filter(x => !x.startsWith('--'));
    for (const engine of engines.length ? engines : ['chromium']) await (ends ? endpoints(engine) : boot ? startup(engine) : host ? hostSmoke(engine) : run(engine));
})().catch(err => { console.error(err); process.exitCode = 1; });
