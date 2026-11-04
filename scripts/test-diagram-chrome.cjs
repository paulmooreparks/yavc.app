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
        console.log(engine + ': source linking and standalone Help/About windows passed for Diagrams, Editor and Slides');
    } catch (err) {
        if (activePage && !activePage.isClosed()) { await activePage.screenshot({ path: path.join(evidence, engine + '-failure-' + Date.now() + '.png') }).catch(() => {}); }
        throw err;
    } finally { await browser.close(); }
}
(async () => { for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']) await run(engine); })().catch(e => { console.error(e); process.exitCode = 1; });
