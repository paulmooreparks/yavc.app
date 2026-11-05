// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright through NODE_PATH and use a disposable local server.
const assert = require('node:assert/strict');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Invalid local port');
(async () => {
    for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const engine = name === 'edge' ? playwright.chromium : playwright[name];
        const browser = await engine.launch({ headless: true, ...(name === 'edge' ? { channel: 'msedge', args: ['--inprivate'] } : {}), ignoreDefaultArgs: ['--disable-popup-blocking'] });
        try {
            // A nonpersistent context keeps this test's private files isolated
            // while allowing the popup to share this same origin and context.
            const context = await browser.newContext();
            const page = await context.newPage();
            await page.goto(`http://slides.localhost:${port}/`);
            await page.locator('.yavc-command-toolbar').waitFor();
            const action = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.slides/' + name + '@1', input, { grant: 'all' }), { name, input });
            await action('load', { text: '# Presenter\n\nA saved deck.' });
            const state = () => page.evaluate(() => pudlCommands.list(document.querySelector('[data-applet="slides"]')).find(c => c.id === 'presenter'));
            assert.equal((await state()).disabled, true);
            assert.match((await state()).reason, /Save this deck in this browser/);
            await page.evaluate(() => pudlHost.config.set('command-toolbars', { slides: { version: 1, visible: true, inRibbon: true, items: ['presenter'] } }));
            const button = page.locator('.yavc-command-toolbar [data-command="presenter"]');
            await button.waitFor(); assert.equal(await button.isDisabled(), true);
            assert.match(await button.getAttribute('title'), /Save this deck in this browser/);
            await action('save', { path: '~/presenter.slides.md' });
            await page.waitForFunction(() => !document.querySelector('.yavc-command-toolbar [data-command="presenter"]').disabled);
            assert.equal(!!(await state()).disabled, false);
            const opened = page.waitForEvent('popup'); await button.click(); const popup = await opened;
            await popup.locator('.deck-presenter-mode').waitFor();
            assert.equal(new URL(popup.url()).searchParams.get('file'), '~/presenter.slides.md');
            await popup.locator('[data-role="pv-now"]').getByRole('heading', { name: 'Presenter', exact: true }).waitFor();
            await popup.close();
            console.log(name + ': unsaved reason, saved availability and user-click presenter popup passed in private context');
        } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
