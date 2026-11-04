// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright via NODE_PATH and run against a disposable local server.
//   node scripts/test-diagram-chrome.cjs chromium firefox webkit
const { strict: assert } = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Use a local port number.');
const evidence = path.join(require('node:os').tmpdir(), 'yavc-diagram-chrome');
fs.mkdirSync(evidence, { recursive: true });

async function run(engine) {
    const browser = await playwright[engine].launch({ headless: true });
    let activePage;
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 950 } }), errors = [];
        activePage = page;
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(`http://diagrams.localhost:${port}/`);
        await page.locator('.cm-editor').waitFor();
        const action = (name, input = {}) => page.evaluate(({ name, input }) => window.pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
        const data = { nodes: [
            { id: 'a-b', type: 'text', x: 0, y: 0, width: 160, height: 80, text: 'shared', extra: { id: 'shared', long: Array.from({ length: 100 }, (_, i) => i) } },
            { id: 'shared', type: 'text', x: 300, y: 180, width: 160, height: 80, text: 'second' }
        ], edges: [{ id: 'shared', fromNode: 'a-b', toNode: 'shared', label: 'edge label' }] };
        const text = JSON.stringify(data, null, 2).replace('"nodes"', '"\\u006eodes"').replace('"a-b"', '"a\\u002db"');
        await action('new', { kind: 'canvas', text });
        assert.equal(await page.locator('.dg-palette').count(), 0);
        await page.locator('.dg-cv-hit[data-id="shared"]').click();
        const selected = await page.locator('.cm-editor').evaluate(e => {
            const view = window.CM.EditorView.findFromDOM(e), r = view.state.selection.main;
            return { text: view.state.sliceDoc(r.from, r.to), focus: view.hasFocus };
        });
        assert.equal(JSON.parse(selected.text).id, 'shared'); assert.equal(selected.focus, false);
        assert.ok(await page.locator('.cm-scroller').evaluate(e => e.scrollTop > 0));
        const caret = async pos => page.locator('.cm-editor').evaluate((e, pos) => {
            const view = window.CM.EditorView.findFromDOM(e); view.focus(); view.dispatch({ selection: { anchor: pos } });
            return view.state.selection.main.empty;
        }, pos);
        assert.equal(await caret(text.indexOf('"second"') + 3), true);
        assert.equal(await page.locator('.dg-inspector-title').innerText(), 'Node');
        assert.equal(await caret(text.indexOf('"edge label"') + 4), true);
        assert.equal(await page.locator('.dg-inspector-title').innerText(), 'Connector');
        await action('canvas-view', { op: 'pan', dx: 2000, dy: 2000 });
        await caret(text.indexOf('"long"') + 2);
        assert.equal(await page.locator('.dg-inspector-id').innerText(), 'a-b');
        const visible = await page.locator('.dg-cv-hit[data-id="a-b"]').boundingBox(), stage = await page.locator('.dg-stage').boundingBox();
        assert.ok(visible.x >= stage.x && visible.y >= stage.y && visible.x + visible.width <= stage.x + stage.width && visible.y + visible.height <= stage.y + stage.height);
        assert.equal(await page.locator('.cm-editor').evaluate(e => window.CM.EditorView.findFromDOM(e).hasFocus), true);
        assert.equal((await action('diagram')).text, text);
        await page.locator('.dg-cv-hit[data-id="a-b"]').click();
        assert.equal(await page.locator('.cm-editor').evaluate(e => JSON.parse(window.CM.EditorView.findFromDOM(e).state.sliceDoc(window.CM.EditorView.findFromDOM(e).state.selection.main.from, window.CM.EditorView.findFromDOM(e).state.selection.main.to)).id), 'a-b');
        await page.screenshot({ path: path.join(evidence, engine + '-source-link.png') });
        const rich = page.locator('g[data-text="a-b"] .dg-cv-text');
        await rich.waitFor();
        const editAlignment = async (property, value) => {
            await page.locator(`button[data-set="${property}"]`).filter({ hasNotText: 'Mixed' }).evaluateAll((buttons, value) => buttons.find(b => b.value === value).click(), value);
            await page.waitForFunction(({ property, value }) => {
                const cm = window.CM.EditorView.findFromDOM(document.querySelector('.cm-editor'));
                return (JSON.parse(cm.state.doc.toString()).nodes[0].yavc || {})[property] === (value || undefined);
            }, { property, value });
            await page.waitForFunction(() => !document.querySelector('.sc-diagram-stale'));
            await rich.waitFor();
        };
        await editAlignment('textAlign', 'right'); await editAlignment('textVerticalAlign', 'bottom');
        assert.deepEqual(await rich.evaluate(e => [e.style.textAlign, e.style.justifyContent]), ['right', 'flex-end']);
        await page.screenshot({ path: path.join(evidence, engine + '-text-alignment.png') });
        const exported = await action('render', { format: 'svg' });
        assert.ok(exported.width > 0 && exported.height > 0);
        await page.locator('.dg-stage').focus(); await page.keyboard.press('Control+z');
        await page.waitForFunction(() => {
            const e = document.querySelector('g[data-text="a-b"] .dg-cv-text'); return e && e.style.justifyContent === 'flex-start';
        });
        assert.equal(await rich.evaluate(e => e.style.textAlign), 'right');
        await editAlignment('textVerticalAlign', 'middle');
        await editAlignment('textAlign', 'center');
        assert.deepEqual(await rich.evaluate(e => [e.style.textAlign, e.style.justifyContent]), ['center', 'center']);
        await editAlignment('textAlign', ''); await editAlignment('textVerticalAlign', '');
        assert.deepEqual(await rich.evaluate(e => [e.style.textAlign, e.style.justifyContent]), ['left', 'flex-start']);
        await page.getByRole('button', { name: 'Show as ribbon', exact: true }).click();
        await page.getByRole('tab', { name: 'Shape', exact: true }).click();
        assert.equal(await page.locator('.menubar-ribbon .seg').count(), 0);
        const picker = page.locator('.menubar-ribbon').getByRole('button', { name: 'Drawing Tool', exact: true });
        await picker.click();
        assert.equal(await page.getByRole('menuitemradio').count(), 0);
        const oval = page.getByRole('menuitemcheckbox', { name: 'Oval', exact: true });
        await oval.locator('.glyph').waitFor();
        assert.equal(await oval.locator('.glyph').count(), 1, await oval.evaluate(e => e.outerHTML));
        await oval.click();
        await picker.click();
        assert.equal(await oval.getAttribute('aria-checked'), 'true');
        await oval.click();
        await picker.click();
        assert.equal(await oval.getAttribute('aria-checked'), 'false');
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 720, height: 900 });
        await page.screenshot({ path: path.join(evidence, engine + '-shape-picker.png') });
        await page.setViewportSize({ width: 1600, height: 1000 });
        const multi = { nodes: [
            { id: 'g', type: 'group', x: -20, y: -20, width: 500, height: 180, label: 'Group' },
            { id: 'a', type: 'text', x: 0, y: 0, width: 160, height: 80, text: 'First' },
            { id: 'b', type: 'text', x: 260, y: 0, width: 160, height: 80, text: 'Second' }
        ], edges: [{ id: 'a', fromNode: 'a', toNode: 'b' }] };
        await action('new', { kind: 'canvas', text: JSON.stringify(multi) });
        const hit = id => page.locator(`.dg-cv-hit[data-id="${id}"]`);
        const doc = async () => JSON.parse((await action('diagram')).text);
        const settled = () => page.waitForFunction(() => !document.querySelector('.sc-diagram-stale'));
        await hit('a').click(); await hit('b').click({ modifiers: ['Shift'] });
        assert.equal(await page.locator('.dg-inspector-title').innerText(), '2 Items');
        assert.equal(await page.locator('.dg-cv-ring').count(), 2);
        assert.equal(await page.locator('textarea[data-set="text"]').getAttribute('placeholder'), 'Mixed');
        await page.locator('textarea[data-set="text"]').fill('__mixed__'); await page.locator('textarea[data-set="text"]').dispatchEvent('change'); await settled();
        assert.deepEqual((await doc()).nodes.slice(1).map(n => n.text), ['__mixed__', '__mixed__']);
        await page.getByRole('group', { name: 'Line Style', exact: true }).getByRole('button', { name: 'Dashed', exact: true }).click(); await settled();
        assert.deepEqual((await doc()).nodes.slice(1).map(n => n.yavc.line), ['dashed', 'dashed']);
        await page.getByLabel('Color Picker', { exact: true }).evaluate(e => { e.value = '#123456'; e.dispatchEvent(new Event('change', { bubbles: true })); }); await settled();
        assert.deepEqual((await doc()).nodes.slice(1).map(n => n.color), ['#123456', '#123456']);
        await page.getByRole('group', { name: 'Color Presets', exact: true }).getByRole('button', { name: 'Red', exact: true }).click(); await settled();
        assert.deepEqual((await doc()).nodes.slice(1).map(n => n.color), ['1', '1']);
        await page.getByRole('group', { name: 'Color Presets', exact: true }).getByRole('button', { name: 'Default', exact: true }).click(); await settled();
        assert.deepEqual((await doc()).nodes.slice(1).map(n => n.color), [undefined, undefined]);
        const box = await hit('a').boundingBox(), scale = await hit('a').evaluate(e => e.getScreenCTM().a);
        await page.mouse.move(box.x + 30, box.y + 30); await page.keyboard.down('Alt'); await page.mouse.down();
        await page.mouse.move(box.x + 30 + 32 * scale, box.y + 30 + 24 * scale, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Alt'); await settled();
        assert.deepEqual((await doc()).nodes.slice(1).map(n => [n.x, n.y]), [[32,24], [292,24]]);
        await page.locator('.dg-stage').focus(); await page.keyboard.press('Control+z'); await settled();
        assert.deepEqual((await doc()).nodes.slice(1).map(n => [n.x, n.y]), [[0,0], [260,0]]);
        await page.keyboard.press('ArrowRight'); await settled();
        assert.deepEqual((await doc()).nodes.slice(1).map(n => n.x), [1,261]);
        await action('canvas-view', { op: 'select', items: [{ id: 'g', kind: 'node' }, { id: 'a', kind: 'node' }] });
        await page.locator('.dg-stage').focus(); await page.keyboard.press('ArrowRight'); await settled();
        assert.deepEqual((await doc()).nodes.map(n => n.x), [-19,2,262]);
        await action('canvas-view', { op: 'select', items: [{ id: 'a', kind: 'node' }, { id: 'a', kind: 'edge' }] });
        assert.equal(await page.locator('[data-set="shape"]').count(), 0);
        assert.equal(await page.locator('[data-set="x"]').count(), 0);
        assert.equal(await page.locator('[data-set="textAlign"]').count(), 0);
        await page.getByRole('group', { name: 'Line Style', exact: true }).getByRole('button', { name: 'Dotted', exact: true }).click(); await settled();
        assert.equal((await doc()).nodes[1].yavc.line, 'dotted'); assert.equal((await doc()).edges[0].yavc.line, 'dotted');
        const divider = page.getByRole('separator', { name: 'Resize the Inspector', exact: true });
        const before = await page.locator('.dg-inspector').boundingBox(); await divider.focus(); await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(width => document.querySelector('.dg-inspector').getBoundingClientRect().width > width, before.width);
        await page.screenshot({ path: path.join(evidence, engine + '-multiple-inspector.png') });
        await page.keyboard.press('Enter');
        const dividerBox = await divider.boundingBox(), originalWidth = (await page.locator('.dg-inspector').boundingBox()).width;
        await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 100); await page.mouse.down();
        await page.mouse.move(dividerBox.x - 30, dividerBox.y + 100, { steps: 5 }); await page.mouse.up();
        assert.ok((await page.locator('.dg-inspector').boundingBox()).width > originalWidth + 20);
        await page.locator('.dg-stage').focus(); await page.keyboard.press('Control+a');
        assert.equal(await page.locator('.dg-inspector-title').innerText(), '4 Items');
        await page.keyboard.press('Escape'); assert.equal(await page.locator('.dg-cv-ring').count(), 0);
        assert.equal(await page.getByRole('tab', { name: 'Diagram', exact: true }).count(), 0);
        await page.getByRole('tab', { name: 'Edit', exact: true }).click();
        await page.locator('.menubar-ribbon').getByRole('button', { name: 'Select Items…', exact: true }).focus(); await page.keyboard.press('Enter');
        await page.getByRole('checkbox', { name: 'Node a', exact: true }).focus(); await page.keyboard.press('Space');
        await page.getByRole('checkbox', { name: 'Node b', exact: true }).focus(); await page.keyboard.press('Space');
        await page.locator('dialog').getByRole('button', { name: 'Select', exact: true }).focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('.dg-inspector-title').innerText(), '2 Items');
        await divider.focus(); await page.keyboard.press('End');
        const overflows = await page.locator('.dg-choice .seg button').evaluateAll(buttons => buttons.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent));
        assert.deepEqual(overflows, []);
        await divider.focus(); await page.keyboard.press('Enter');
        await page.locator('.dg-stage').focus(); await page.keyboard.press('Escape');
        await action('canvas-view', { op: 'fit' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const points = await hit('a').evaluate(e => {
            const toScreen = (x, y) => { const p = new DOMPoint(x - 2 + Number(e.getAttribute('x')), y + Number(e.getAttribute('y'))).matrixTransform(e.getScreenCTM()); return { x: p.x, y: p.y }; };
            return [toScreen(-30, -30), toScreen(440, 100)];
        });
        const beforeMarquee = (await action('diagram')).text;
        const marqueeEvidence = await page.evaluate(points => points.map(p => {
            const el = document.elementFromPoint(p.x, p.y); return { point: p, target: el && el.tagName + '.' + el.getAttribute('class') };
        }), points);
        await page.mouse.move(points[0].x, points[0].y); await page.mouse.down(); await page.mouse.move(points[1].x, points[1].y, { steps: 5 }); await page.mouse.up();
        assert.equal(await page.locator('.dg-inspector-title').textContent({ timeout: 2000 }).catch(() => ''), '2 Items', JSON.stringify(marqueeEvidence));
        assert.equal((await action('diagram')).text, beforeMarquee);
        const cancelBox = await hit('a').boundingBox();
        await page.mouse.move(cancelBox.x + 20, cancelBox.y + 20); await page.mouse.down(); await page.mouse.move(cancelBox.x + 50, cancelBox.y + 35);
        await page.keyboard.press('Escape'); await page.mouse.up();
        assert.equal((await action('diagram')).text, beforeMarquee);
        await action('new', { kind: 'd2', text: 'a -> b' });
        await page.locator('.dg-hit-shape').first().click();
        await page.getByRole('group', { name: 'Line Style', exact: true }).getByRole('button', { name: 'Dotted', exact: true }).click();
        await page.waitForFunction(() => /stroke-dash:\s*2/.test(window.CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()));
        await page.waitForFunction(() => Array.from(document.querySelectorAll('.dg-inspector .seg button')).some(b => b.textContent === 'Dotted' && b.getAttribute('aria-pressed') === 'true'));
        await page.getByLabel('Line Color Picker', { exact: true }).waitFor();
        await action('new', { kind: 'mermaid', text: 'graph TD\n a --> b' });
        await page.waitForFunction(() => !Array.from(document.querySelectorAll('.menubar-ribbon button')).some(e => e.textContent.trim() === 'Drawing Tool'));
        assert.deepEqual(errors, []);
        await page.close();

        for (const app of ['diagrams', 'editor', 'slides']) {
            const p = await browser.newPage({ viewport: { width: 1300, height: 900 } }), errors = [];
            activePage = p;
            p.on('pageerror', e => errors.push(e.message));
            await p.goto(`http://${app}.localhost:${port}/`);
            await p.locator('[data-applet-state="running"]').first().waitFor();
            const main = p.locator(`[data-applet="${app}"]`).first();
            await main.evaluate(e => { e.dataset.chromeSentinel = 'same instance'; });
            const help = async name => {
                await p.getByRole('menuitem', { name: 'Help', exact: true }).click();
                await p.getByRole('menuitem', { name, exact: true }).click();
            };
            for (const [label, key] of [['About the Author','author'], ['For Agents','agents'], ['Privacy Policy','privacy'], ['Terms & Conditions','terms'], ['Help Contents','help']]) {
                await help(label);
                const win = p.locator(`.win[data-win="${key}"]`); await win.waitFor();
                await p.getByRole('menuitem', { name: 'Window', exact: true }).waitFor();
                assert.equal(new URL(p.url()).hostname, app + '.localhost');
                assert.equal(await main.getAttribute('data-chrome-sentinel'), 'same instance');
                assert.ok((await win.locator('article').innerText()).length > 0);
                assert.ok(new URL(p.url()).searchParams.get('open').includes(key));
                await win.locator('[data-win-action="close"]').click(); await win.waitFor({ state: 'detached' });
            }
            for (const [label, id] of [['About yavc.app','about-site'], ['About PUDL','about-pudl']]) {
                await help(label);
                await p.locator(`dialog#${id}:modal`).waitFor();
                assert.equal(new URL(p.url()).hostname, app + '.localhost');
                assert.equal(await main.getAttribute('data-chrome-sentinel'), 'same instance');
                await p.goBack(); await p.locator(`dialog#${id}:modal`).waitFor({ state: 'hidden' });
                await p.goForward(); await p.locator(`dialog#${id}:modal`).waitFor();
                await p.keyboard.press('Escape'); await p.locator(`dialog#${id}:modal`).waitFor({ state: 'hidden' });
                await p.waitForURL(url => url.pathname === '/');
            }
            await help('Privacy Policy');
            await p.locator('.win[data-win="privacy"]').waitFor();
            await p.waitForURL(url => (url.searchParams.get('open') || '').split(',').includes('privacy'));
            await p.reload();
            await p.locator('.win[data-win="privacy"]').waitFor();
            await p.locator(`[data-applet="${app}"][data-applet-state="running"]`).waitFor();
            await p.screenshot({ path: path.join(evidence, engine + '-' + app + '-help.png') });
            assert.deepEqual(errors, []);
            await p.close();
        }
        console.log(engine + ': source linking, multi-selection, inspector controls, menus and standalone Help/About passed');
    } catch (err) {
        if (activePage && !activePage.isClosed()) { await activePage.screenshot({ path: path.join(evidence, engine + '-failure-' + Date.now() + '.png') }).catch(() => {}); }
        throw err;
    } finally { await browser.close(); }
}
(async () => { for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']) await run(engine); })().catch(e => { console.error(e); process.exitCode = 1; });
