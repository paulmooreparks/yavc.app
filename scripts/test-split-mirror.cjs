// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// In Split view the caret of one pane is shown in the other (DESIGN.md, decision 168), here in Docs itself, with the caret and the range drawn on the page: a click and End on the page move the text's caret to the
// matching place, and a click and End in the text show a caret on the page, with neither pane taking the keyboard from the other, the document
// unchanged and nothing to undo. Needs a server on YAVC_CHROME_TEST_PORT.
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8461';
const source = '# Title\n\nAlpha beta gamma\n\nSecond **paragraph** here\n';
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true }); let phase = 'startup';
        try {
            const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [];
            page.setDefaultTimeout(25000);
            page.on('pageerror', e => errors.push(e.message));
            const call = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }), { name, input });
            await page.goto(`http://localhost:${port}/applet/docs`); await page.locator('.cm-content').waitFor({ state: 'attached' });
            await call('new', { path: '~/Split.md', text: source }); await call('view', { mode: 'split' });
            const rich = page.locator('.ProseMirror'); await rich.getByRole('heading', { name: 'Title' }).waitFor();
            const where = () => page.locator('[data-role="pos"]').textContent();
            const inText = () => page.evaluate(() => !!document.activeElement.closest('.cm-editor'));
            const inPage = () => page.evaluate(() => !!document.activeElement.closest('.ProseMirror'));
            const undoState = () => page.getByRole('button', { name: 'Undo', exact: true }).first().isDisabled();
            const undoAtStart = await undoState();
            phase = 'page to text';
            await rich.locator('p', { hasText: 'Alpha beta gamma' }).click(); await page.keyboard.press('End');
            await page.waitForFunction(() => /Line 3, column 17/.test(document.querySelector('[data-role="pos"]').textContent));
            assert.equal(await inPage(), true, engine + ': the page keeps the keyboard');
            await page.keyboard.press('Home');
            await page.waitForFunction(() => /Line 3, column 1\b/.test(document.querySelector('[data-role="pos"]').textContent));
            await rich.locator('p', { hasText: 'Second' }).click(); await page.keyboard.press('End');
            await page.waitForFunction(() => /Line 5, column 26/.test(document.querySelector('[data-role="pos"]').textContent));
            assert.equal(await inPage(), true);
            phase = 'text to page';
            const second = page.locator('.cm-line', { hasText: 'Second' }); await second.click(); await page.keyboard.press('Home'); await page.keyboard.press('End');
            await rich.locator('p', { hasText: 'Second' }).locator('.pm-mirror-caret').waitFor({ state: 'attached' });
            // The caret is at the end of that paragraph, after its last word.
            assert.equal(await rich.locator('p', { hasText: 'Second' }).evaluate(p => { const c = p.querySelector('.pm-mirror-caret'); return c.nextSibling === null || !c.nextSibling.textContent; }), true, engine + ': the caret on the page is at the end of the paragraph');
            assert.equal(await inText(), true, engine + ': the text keeps the keyboard');
            await page.locator('.cm-line', { hasText: 'Alpha' }).click(); await page.keyboard.press('Home');
            await rich.locator('p', { hasText: 'Alpha' }).locator('.pm-mirror-caret').waitFor({ state: 'attached' });
            assert.equal(await rich.locator('p', { hasText: 'Alpha' }).evaluate(p => p.firstChild.classList && p.firstChild.classList.contains('pm-mirror-caret')), true, engine + ': the caret on the page is at the start of the paragraph');
            assert.equal(await rich.locator('.pm-mirror-caret').count(), 1, engine + ': one caret on the page');
            // A selected range in the text is a highlighted range on the page.
            await page.keyboard.press('Shift+End');
            await rich.locator('.pm-mirror-range').first().waitFor({ state: 'attached' });
            assert.equal((await rich.locator('.pm-mirror-range').allTextContents()).join(''), 'Alpha beta gamma', engine + ': the range on the page');
            assert.equal(await inText(), true);
            phase = 'nothing changed';
            assert.equal((await call('document')).text, source, engine + ': mirroring changed the document');
            assert.equal(await undoState(), undoAtStart, engine + ': the undo history changed');
            assert.deepEqual(errors, []);
            console.log(engine + ': in Split the caret of each pane shows in the other, with no focus taken and no change made');
        } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
