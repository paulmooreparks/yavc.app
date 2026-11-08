// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright via NODE_PATH and run against a disposable server.
const { strict: assert } = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8430';
if (!/^\d+$/.test(port)) throw new Error('Invalid local port');
const evidence = path.join(os.tmpdir(), 'yavc-launcher-review'); fs.mkdirSync(evidence, { recursive: true });
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await playwright[engine].launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.setDefaultTimeout(15000);
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        try {
            await page.goto(`http://localhost:${port}/?open=dice&top=dice`);
            await page.waitForFunction(() => !!window.pudlHost && !!window.pudlLauncher?.state(document.getElementById('site-start')));
            await page.locator('[data-applet="dice"][data-applet-state="running"]').waitFor();
            assert.equal(await page.locator('#site-start-button, .site-menubar [data-menu-id="applets"]').count(), 0);
            const root = page.locator('#site-start');
            async function open() { await page.waitForFunction(()=>window.pudlLauncher?.state(document.getElementById('site-start'))); await page.evaluate(() => { const catalog=document.getElementById('site-start'); if(pudlLauncher.state(catalog).visible) pudlLauncher.open(catalog); else pudlMenubar.launcherButton({visible:true}).click(); }); await root.waitFor({ state: 'visible' }); }
            await open();
            for (const text of ['Settings', 'About yavc.app']) {
                const action = root.locator('header').getByRole('link', { name: text, exact: true });
                assert.equal(await action.locator('.glyph').count(), 1);
            }
            await root.locator('header').getByRole('link', { name: 'About yavc.app', exact: true }).click();
            await page.locator('#about-site').waitFor({ state: 'visible' });
            await root.waitFor({ state: 'hidden' });
            await page.keyboard.press('Escape');
            await page.locator('#about-site').waitFor({ state: 'hidden' });
            await page.waitForFunction(() => location.pathname === '/');
            await open();
            await root.locator('header').getByRole('link', { name: 'Settings', exact: true }).click();
            await page.locator('.win[data-win="settings"]').waitFor({ state: 'visible' });
            await root.waitFor({ state: 'hidden' });
            assert.ok(new URL(page.url()).searchParams.get('open').split(',').includes('dice'));
            await open();
            const row = root.locator('[data-win-pin-target="editor"]');
            await row.hover();
            await row.locator('[data-row-actions]').click();
            await page.getByRole('menuitem', { name: 'Pin to taskbar', exact: true }).click();
            const pin = page.locator('.win-bar [data-win-pin="editor"]');
            await pin.waitFor();
            assert.equal(await page.locator('.win[data-win="editor"]').count(), 0, 'Pinning must not launch the app');
            await page.waitForFunction(async () => (await pudlHost.config.load('desktop-taskbar', {})).pins?.includes('editor'));
            await root.locator('[data-launcher-close]').click();
            await page.reload(); await pin.waitFor();
            assert.equal(await page.locator('.win[data-win="editor"]').count(), 0);
            await pin.click();
            await page.locator('.win[data-win="editor"] .cm-editor').waitFor({ state: 'attached' });
            await page.waitForFunction(() => document.querySelector('.win-bar [data-win-pin="editor"]').getAttribute('aria-busy') !== 'true');
            await page.locator('.win[data-win="editor"] [data-win-action="close"]').click();
            await page.locator('.win[data-win="editor"]').waitFor({ state: 'detached' });
            await pin.waitFor();
            await pin.click({ button: 'right' });
            await page.getByRole('menuitem', { name: 'Unpin from taskbar', exact: true }).click();
            await pin.waitFor({ state: 'detached' });
            await page.waitForFunction(async () => !(await pudlHost.config.load('desktop-taskbar', {})).pins?.includes('editor'));
            await open(); await root.locator('[data-launcher-pin]').click();
            await page.waitForFunction(() => pudlLauncher.state(document.querySelector('#site-start')).presentation === 'pane');
            assert.equal(new URL(page.url()).searchParams.get('start-mode'), 'pane');
            await page.waitForFunction(async () => (await (await fetch('/config/site-launcher')).json()).presentation === 'pane');
            // A fresh address uses the saved presentation and must canonicalize it for Back.
            await page.goto(`http://localhost:${port}/?open=dice&top=dice`);
            await page.waitForFunction(() => new URL(location.href).searchParams.get('start-mode') === 'pane');
            await root.locator('[data-start-category-key="games"]').click(); await page.goBack();
            await page.waitForFunction(() => pudlLauncher.state(document.querySelector('#site-start')).presentation === 'pane' && pudlStart.state(document.querySelector('#site-start')).category === '');
            await page.screenshot({ path: path.join(evidence, engine + '-pane.png') });
            await root.locator('[data-launcher-pin]').click();
            if (await root.isHidden()) await open();
            await root.locator('[data-start-query]').focus();
            await page.setViewportSize({ width: 360, height: 850 });
            await page.screenshot({ path: path.join(evidence, engine + '-narrow.png') });
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => document.querySelector('.win-bar .win-bar-launcher') === document.activeElement);
            await page.setViewportSize({ width: 1280, height: 900 });
            await page.goto(`http://diagrams.localhost:${port}/?file=~/Documents/example.canvas&start=1`);
            await root.waitFor({ state: 'visible' });
            await root.locator('header').getByRole('link', { name: 'Settings', exact: true }).click();
            await page.locator('.win[data-win="settings"]').waitFor({ state: 'visible' });
            assert.equal(new URL(page.url()).hostname, 'diagrams.localhost');
            assert.equal(new URL(page.url()).searchParams.get('file'), '~/Documents/example.canvas');
            assert.deepEqual(errors, []);
            console.log(engine + ': Launcher header, Settings, About, dormant pins, activation, persistence, unpin, pane and Back passed');
        } catch (error) { await page.screenshot({ path: path.join(evidence, engine + '-failure.png') }); throw error; }
        finally { await browser.close(); }
    }
})().catch(e => { console.error(e); process.exitCode = 1; });

