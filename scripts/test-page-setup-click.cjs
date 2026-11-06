// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8423';
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true }), page = await browser.newPage(); page.setDefaultTimeout(15000);
        try {
            await page.goto(`http://editor.localhost:${port}/`, { waitUntil: 'domcontentloaded' });
            await page.locator('.cm-editor').waitFor();
            await page.evaluate(() => pudlActions.run('yavc.editor/new@1', { path: '~/click.docs.md', text: '# Dropdown regression' }, { grant: 'all' }));
            await page.waitForFunction(() => !!document.querySelector('.doc-paginated'));
            await page.evaluate(() => { pudlCommands.run('page-setup', null, document.querySelector('[data-applet]')); });
            const dialog = page.locator('.md-page-setup[open]'); await dialog.waitFor();
            for (const name of ['Paper Size', 'Units', 'Orientation', 'Preset']) {
                const control = page.getByLabel(name, { exact: true });
                await control.click();
                assert.equal(await dialog.count(), 1, name + ' click must keep Page Setup open');
                await control.press('Tab');
            }
            await page.getByRole('button', { name: 'Cancel', exact: true }).click();
            assert.equal(await dialog.count(), 0);
            // Body components may use data-choice without becoming dialog actions.
            await page.evaluate(() => { window.dialogResult = undefined; yavcDialog.open({ title: 'Body Choice', body: '<select aria-label="Body Choice" data-choice="body"><option>One</option></select>', buttons: [{ id: 'cancel', label: 'Cancel' }] }).then(r => { window.dialogResult = r.value; }); });
            await page.getByRole('combobox', { name: 'Body Choice', exact: true }).click();
            assert.equal(await page.locator('dialog[open]').count(), 1);
            await page.getByRole('combobox', { name: 'Body Choice', exact: true }).press('Tab');
            await page.getByRole('button', { name: 'Cancel', exact: true }).click();
            await page.waitForFunction(() => window.dialogResult === 'cancel');
            console.log(engine + ': actual dropdown clicks retain dialog; Cancel still closes it');
        } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
