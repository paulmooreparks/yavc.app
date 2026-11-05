// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright via NODE_PATH and use a disposable server.
const { strict: assert } = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Invalid local port');
const evidence = path.join(os.tmpdir(), 'yavc-start-review'); fs.mkdirSync(evidence, { recursive: true });
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await playwright[engine].launch({ headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            page.setDefaultTimeout(15000);
            await page.goto(`http://localhost:${port}/?open=dice&top=dice`);
            await page.locator('#site-start-button').click();
            const root = page.locator('#site-start');
            await root.waitFor({ state: 'visible' });
            assert.equal(await root.locator('[data-start-item]').count(), 17);
            await root.locator('[data-start-category-key="games"]').click();
            await page.waitForFunction(() => pudlStart.state(document.querySelector('#site-start')).count === 5);
            assert.equal(new URL(page.url()).searchParams.get('start-category'), 'games');
            await page.reload(); await root.waitFor({ state: 'visible' });
            assert.equal(await root.locator('[data-start-heading]').textContent(), 'Games');
            const query = root.locator('[data-start-query]');
            await query.fill('Docs');
            await page.waitForFunction(() => pudlStart.state(document.querySelector('#site-start')).count === 1);
            assert.equal(await root.locator('[data-start-item]:not([data-start-filtered]) .start-name').innerText(), 'Editor');
            await query.fill('no-such-application');
            await root.locator('[data-start-empty]').waitFor({ state: 'visible' });
            await root.locator('[data-start-empty] [data-start-clear]').click();
            await page.waitForFunction(() => pudlStart.state(document.querySelector('#site-start')).count === 17);
            await query.focus(); await page.keyboard.press('ArrowDown');
            assert.equal(await root.locator('[data-start-items] a').first().evaluate(e => e === document.activeElement), true);
            await page.keyboard.press('ArrowUp');
            assert.equal(await query.evaluate(e => e === document.activeElement), true);
            for (const state of [
                { width: 1280, height: 900, theme: 'light', skin: 'standard' },
                { width: 620, height: 850, theme: 'dark', skin: 'bevel' },
                { width: 360, height: 850, theme: 'dark', skin: 'glaze' }
            ]) {
                await page.setViewportSize({ width: state.width, height: state.height });
                await page.evaluate(s => { pudlSetTheme(s.theme); pudlSkins.select(s.skin); }, state);
                await page.evaluate(() => document.fonts.ready);
                const box = await root.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= state.width + 1);
                assert.ok(box.y >= 0 && box.y + box.height <= state.height + 1);
                assert.ok(await root.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
                await page.screenshot({ path: path.join(evidence, engine + '-' + state.width + '.png') });
            }
            await page.keyboard.press('Escape');
            await root.waitFor({ state: 'hidden' });
            assert.equal(await page.locator('#site-start-button').evaluate(e => e === document.activeElement), true);
            await page.setViewportSize({ width: 1280, height: 900 });
            await page.locator('#site-start-button').click();
            const editor = root.locator('a[data-site-start-app="editor"]');
            const target = new URL(await editor.getAttribute('href'));
            assert.ok(target.searchParams.get('open').split(',').includes('dice'));
            assert.ok(target.searchParams.get('open').split(',').includes('editor'));
            await editor.click(); await root.waitFor({ state: 'hidden' });
            await page.waitForFunction(() => new URL(location.href).searchParams.get('top') === 'editor');
            await page.goto(`http://diagrams.localhost:${port}/?file=~/Documents/example.canvas&start=1&start-category=create`);
            await root.waitFor({ state: 'visible' });
            assert.equal(new URL(await root.locator('[data-start-category-key="tools"]').getAttribute('href'), page.url()).searchParams.get('file'), '~/Documents/example.canvas');
            assert.equal(new URL(await root.locator('a[data-site-start-app="editor"]').getAttribute('href')).hostname, 'editor.localhost');
            await root.locator('[data-start-category-key="tools"]').click();
            await page.goBack();
            await page.waitForFunction(() => pudlStart.state(document.querySelector('#site-start')).category === 'create');
            console.log(engine + ': Start catalog, search, categories, URL restore, launch, focus and responsive bounds passed');
        } finally { await browser.close(); }
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
