// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// An application that takes the keyboard after something asynchronous, such as its view being set once a file has opened, does so only
// when the keyboard is on nothing or already in that application. A person who has gone elsewhere, as into the launcher, keeps it.
// Supply Playwright through NODE_PATH and run against disposable localhost data.
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8425';
const action = (page, app, name, input = {}) => page.evaluate(({ app, name, input }) => pudlActions.run('yavc.' + app + '/' + name + '@1', input, { grant: 'all' }), { app, name, input });
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']) {
        const browser = await pw[engine].launch({ headless: true }), errors = [];
        let phase = 'start';
        try {
            for (const [app, modes] of [['docs', ['document', 'visual', 'split']], ['diagrams', ['split', 'text']]]) {
                const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(20000);
                phase = app;
                await page.goto(`http://${app}.localhost:${port}/`, { waitUntil: 'domcontentloaded' }); await page.locator('.cm-editor').waitFor({ state: 'attached' });
                await action(page, app, 'new', app === 'docs' ? { path: '~/late-focus.docs.md', text: '# Late focus\n\nA paragraph.\n' } : { kind: 'd2', text: 'a -> b\n' });
                /* The keyboard is somewhere that is not the application, as in a launcher over it. */
                await page.evaluate(() => { const probe = document.createElement('input'); probe.id = 'elsewhere'; probe.setAttribute('aria-label', 'Elsewhere'); document.body.append(probe); probe.focus(); });
                for (const mode of modes) {
                    await action(page, app, 'view', { mode });
                    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 300)))));
                    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'elsewhere', app + ' view ' + mode + ' took the keyboard from where it was.');
                }
                /* With the keyboard on nothing, the view still takes it, as before. */
                await page.evaluate(() => document.activeElement.blur());
                await action(page, app, 'view', { mode: modes[0] === 'text' ? 'split' : modes[modes.length - 1] === 'text' ? 'text' : modes[0] });
                await page.waitForFunction(() => document.activeElement && document.activeElement !== document.body);
                await page.close();
            }
            assert.deepEqual(errors, []);
            console.log(engine + ' Late focus: Docs and Diagrams leave the keyboard where the person has put it, and take it when it is on nothing.');
        } catch (error) { error.message = engine + ' (' + phase + '): ' + error.message; throw error; } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exit(1); });
