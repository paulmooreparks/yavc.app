// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright through NODE_PATH. Run against disposable localhost data.
const { strict: assert } = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Use a local port number.');
const evidence = path.join(os.tmpdir(), 'yavc-diagram-pickers'); fs.mkdirSync(evidence, { recursive: true });
async function run(engine) {
    const browser = await playwright[engine].launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const action = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
    const doc = async () => JSON.parse((await action('diagram')).text);
    const settled = () => page.waitForFunction(() => !document.querySelector('.sc-diagram-stale'));
    const toolFirst = async () => {
        await page.getByRole('menuitem', { name: 'Shape', exact: true }).click();
        assert.equal((await page.locator('.menubar-panel:popover-open > .menu-action').first().innerText()).trim(), 'Drawing Tool');
        await page.keyboard.press('Escape');
    };
    try {
        await page.goto(`http://diagrams.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
        await action('diagram'); await toolFirst();
        await page.locator('.dg-hit-shape').first().click();
        assert.equal(await page.getByRole('group', { name: 'Line Style', exact: true }).locator('button > .glyph').count(), 3);
        await action('new', { kind: 'canvas', text: JSON.stringify({ nodes: [
            { id: 'a', type: 'text', x: 0, y: 0, width: 160, height: 80, text: 'A' },
            { id: 'b', type: 'text', x: 300, y: 0, width: 160, height: 80, text: 'B' }
        ], edges: [{ id: 'e1', fromNode: 'a', toNode: 'b' }, { id: 'e2', fromNode: 'b', toNode: 'a', yavc: { fromHead: 'diamond' } }] }) });
        await toolFirst();
        await action('canvas-view', { op: 'select', key: 'a', kind: 'node' });
        for (const label of ['Horizontal Alignment', 'Vertical Alignment', 'Line Style']) {
            const group = page.getByRole('group', { name: label, exact: true });
            const buttons = group.getByRole('button');
            assert.equal(await group.locator('button > .glyph').count(), await buttons.count());
            assert.ok(await buttons.evaluateAll(all => all.every(b => parseFloat(getComputedStyle(b).paddingLeft) >= 8 && b.scrollWidth <= b.clientWidth + 1)));
        }
        await page.locator('.dg-inspector').screenshot({ path: path.join(evidence, engine + '-alignment.png') });
        await action('canvas-view', { op: 'select', key: 'e1', kind: 'edge' });
        const route = page.getByRole('group', { name: 'Route', exact: true });
        assert.equal(await route.locator('button > .glyph').count(), 3);
        await route.getByRole('button', { name: 'Curve', exact: true }).click(); await settled();
        assert.equal((await doc()).edges[0].yavc.route, 'curve');
        const start = () => page.getByRole('button', { name: 'Start Head None', exact: true });
        await start().focus(); await page.keyboard.press('ArrowDown');
        const menu = page.getByRole('menu', { name: 'Start Head', exact: true });
        await menu.waitFor(); assert.equal(await menu.getByRole('menuitemradio').count(), 11);
        assert.equal(await menu.locator('.dg-option-content > .glyph').count(), 11);
        await menu.getByRole('menuitemradio', { name: 'Diamond', exact: true }).focus(); await page.keyboard.press('Enter'); await settled();
        assert.equal((await doc()).edges[0].yavc.fromHead, 'diamond');
        const changed = page.getByRole('button', { name: 'Start Head Diamond', exact: true });
        await page.waitForFunction(() => document.activeElement.matches('.dg-property-picker'));
        await changed.click(); assert.equal(await menu.getByRole('menuitemradio', { name: 'Diamond', exact: true }).getAttribute('aria-checked'), 'true');
        await page.keyboard.press('Escape'); await changed.waitFor();
        await page.locator('.dg-stage').focus(); await page.keyboard.press('Control+z'); await settled();
        assert.equal((await doc()).edges[0].yavc.fromHead, undefined);
        await action('canvas-view', { op: 'select', items: [{ id: 'e1', kind: 'edge' }, { id: 'e2', kind: 'edge' }] });
        await page.getByRole('button', { name: 'Start Head Mixed', exact: true }).click();
        assert.equal(await menu.locator('[aria-checked="true"]').count(), 0);
        await menu.getByRole('menuitemradio', { name: 'Circle', exact: true }).click(); await settled();
        assert.deepEqual((await doc()).edges.map(e => e.yavc.fromHead), ['circle', 'circle']);
        await page.getByRole('button', { name: 'End Head Arrow', exact: true }).click();
        await page.getByRole('menu', { name: 'End Head', exact: true }).waitFor();
        assert.ok(await page.getByRole('menuitemradio', { name: 'Arrow', exact: true }).locator('.glyph').isVisible());
        await page.screenshot({ path: path.join(evidence, engine + '-light.png') });
        await page.keyboard.press('Escape');
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await page.setViewportSize({ width: 720, height: 900 });
        await page.getByRole('button', { name: 'End Head Arrow', exact: true }).click();
        await page.getByRole('menu', { name: 'End Head', exact: true }).waitFor();
        await page.screenshot({ path: path.join(evidence, engine + '-dark-narrow.png') });
        await page.keyboard.press('Escape');
        await page.getByRole('menuitem', { name: 'File', exact: true }).click();
        assert.ok(await page.getByRole('menuitem', { name: 'Save As…', exact: true }).locator('.glyph').count());
        assert.deepEqual(errors, []);
        console.log(engine + ': Drawing Tool order, route/head glyphs, keyboard choice, checked/mixed state, batch edits and undo passed');
    } catch (err) {
        await page.screenshot({ path: path.join(evidence, engine + '-failure.png') }); throw err;
    } finally { await browser.close(); }
}
(async () => { for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']) await run(engine); })().catch(e => { console.error(e); process.exitCode = 1; });
