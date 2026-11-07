// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Run against a disposable server with Playwright supplied through NODE_PATH.
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8434';
if (!/^\d+$/.test(port)) throw new Error('Invalid port');
async function action(p, name, input) { await p.evaluate(({ name, input }) => pudlActions.run('yavc.editor/' + name + '@1', input, { grant: 'all' }), { name, input }); }
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true });
        try {
            const p = await browser.newPage(); p.setDefaultTimeout(15000);
            const errors = []; p.on('pageerror', e => errors.push(e.message));
            for (const host of ['localhost', 'editor.localhost', 'docs.localhost']) {
                await p.goto(`http://${host}:${port}/${host === 'localhost' ? '?open=editor&top=editor' : ''}`);
                await p.waitForFunction(() => { const b = document.querySelector('.yavc-command-toolbar [data-command="save"]'); return b && !b.disabled; });
                await action(p, 'new', { path: '~/identity.docs.md', text: '# Document' });
                async function label(expected) {
                    await p.waitForFunction(({ expected, desktop }) => {
                        const title = desktop ? document.querySelector('[data-win="editor"] .win-title')?.textContent : document.title.split(' · ')[0];
                        const menu = document.querySelector('[data-applet="editor"]') && [...document.querySelectorAll('.menubar-title')].some(n => n.textContent.trim() === expected);
                        return title === expected && menu;
                    }, { expected, desktop: host === 'localhost' });
                }
                await label('Docs');
                await action(p, 'view', { mode: 'text' }); await label('Docs');
                await action(p, 'new', { path: '~/identity.txt', text: 'Plain text' }); await label('Editor');
                await p.getByRole('tab', { name: /identity\.docs\.md/ }).click(); await label('Docs');
                await p.getByRole('tab', { name: /identity\.txt/ }).click(); await label('Editor');
            }
            assert.deepEqual(errors, []);
            console.log(engine + ': document/text identity, tab switching, Text view, desktop and standalone profiles passed');
        } finally { await browser.close(); }
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
