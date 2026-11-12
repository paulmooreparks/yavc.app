// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The Typography dialog draws its preview again after each change, and a draw never writes into a field the person is in: its text is
// selected for them to type over, and a value written under them drops the selection and puts what they type into the middle of it.
// Supply Playwright through NODE_PATH and run against disposable localhost data.
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8425';
const action = (page, name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }), { name, input });
const command = (page, id) => page.evaluate(id => { pudlCommands.run(id, null, document.querySelector('[data-applet]')); }, id);
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']) {
        const browser = await pw[engine].launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [];
        page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
        let phase = 'open';
        try {
            await page.goto(`http://docs.localhost:${port}/`, { waitUntil: 'domcontentloaded' }); await page.locator('.cm-editor').waitFor({ state: 'attached' });
            await action(page, 'new', { path: '~/typography-focus.docs.md', text: '# Typography\n\nA paragraph.\n' }); await page.locator('.doc-paginated .ProseMirror').waitFor();
            await command(page, 'typography');
            const spacing = page.getByRole('spinbutton', { name: 'Space After Paragraph', exact: true });
            await page.waitForFunction(() => document.querySelector('dialog[open] [data-type-preview]') && !document.querySelector('dialog[open] [aria-busy="true"]'));
            await page.waitForFunction(() => !document.querySelector('dialog[open] [data-type-field="size"]').disabled);

            phase = 'a draw while the field has the keyboard';
            /* The field has the keyboard and its text is selected, as after Tab into it or Playwright's fill. Then something else changes, and
               the preview is drawn again with a different default for this field. The draw must leave the field and its selection alone. */
            await spacing.focus(); await spacing.evaluate(node => node.select());
            const before = await spacing.inputValue();
            await page.evaluate(() => { const size = document.querySelector('dialog[open] [data-type-field="size"]'); size.value = '24'; size.dispatchEvent(new Event('change', { bubbles: true })); });
            await page.waitForFunction(() => document.querySelector('dialog[open] [data-type-summary]').textContent.trim() === '24 pt');
            await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
            assert.equal(await spacing.inputValue(), before, 'A draw did not write into the field that has the keyboard.');
            await page.keyboard.type('8');
            assert.equal(await spacing.inputValue(), '8', 'What was typed replaced the selected text.');

            phase = 'the default after leaving';
            /* A field the person leaves without changing it shows the default of the preview as it now is. */
            await page.keyboard.press('Tab');
            await page.getByRole('spinbutton', { name: 'Space After Paragraph', exact: true }).evaluate(node => node.blur());
            assert.equal(await page.evaluate(() => document.querySelector('dialog[open] [data-type-field="paragraph-spacing"]').value), '8');
            await page.getByRole('button', { name: 'Apply', exact: true }).click();
            await page.waitForFunction(() => /paragraph-spacing: 8pt/.test(CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()) || /paragraph-spacing: "?8/.test(CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()));
            assert.deepEqual(errors, []);
            console.log(engine + ' Typography: a draw leaves the field that has the keyboard alone, and what is typed replaces its selected text.');
        } catch (error) { error.message = engine + ' (' + phase + '): ' + error.message; throw error; } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exit(1); });
