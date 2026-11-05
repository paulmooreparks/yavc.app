// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Use Playwright through NODE_PATH and a disposable local server.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8414';
const evidence = path.join(os.tmpdir(), 'yavc-editor-styles-evidence'); fs.mkdirSync(evidence, { recursive: true });
function action(page, app, name, input = {}) { return page.evaluate(({ app, name, input }) => pudlActions.run('yavc.' + app + '/' + name + '@1', input, { grant: 'all' }), { app, name, input }); }
function command(page, id) { return page.evaluate(id => { window.styleCommand = pudlCommands.run(id, null, document.querySelector('[data-applet]')); return true; }, id); }
async function color(locator, expected) {
    await locator.waitFor(); let value;
    for (let i = 0; i < 150; i++) { value = await locator.evaluate(e => getComputedStyle(e).color); if (value === expected) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(value, expected);
}
async function cssText(dialog, text) { await dialog.locator('.cm-editor').evaluate((e, text) => { const view = CM.EditorView.findFromDOM(e); view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); }, text); }
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await playwright[engine].launch({ headless: true }); let page;
        try {
            const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } }); page = await context.newPage(); page.setDefaultTimeout(15000);
            await page.goto(`http://editor.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
            const original = '# 😀 Styles\n\n{{style}}\n.custom { color: rgb(10, 30, 50); }\n{{/style}}\n\n{{class:custom}}\nStyled words.\n{{/class}}\n';
            await action(page, 'editor', 'new', { path: '~/Documents/style.md', text: original });
            await action(page, 'editor', 'view', { mode: 'preview' });
            await color(page.locator('[data-ed-page] .custom').first(), 'rgb(10, 30, 50)');
            await command(page, 'stylesheet'); let dialog = page.getByRole('dialog', { name: 'Document Stylesheet', exact: true });
            await dialog.waitFor();
            assert.equal(await dialog.getByLabel('Style Block', { exact: true }).evaluate(element => element.classList.contains('form-select') && element.parentElement.classList.contains('form-select-wrap')), true);
            await cssText(dialog, 'p { col'); await dialog.locator('.cm-editor').evaluate(e => { const v = CM.EditorView.findFromDOM(e); v.dispatch({ selection: { anchor: v.state.doc.length } }); v.focus(); CM.startCompletion(v); });
            await page.waitForFunction(() => { const v = CM.EditorView.findFromDOM(document.querySelector('.md-style-dialog .cm-editor')); return CM.currentCompletions(v.state).some(c => c.label === 'color'); });
            await page.keyboard.press('Escape'); await cssText(dialog, '.custom { color: rgb(10, 30, 50); }');
            for (const size of [{ width: 1500, height: 1000, theme: 'light', skin: 'standard' }, { width: 620, height: 900, theme: 'dark', skin: 'bevel' }, { width: 360, height: 800, theme: 'dark', skin: 'glaze' }]) {
                await page.setViewportSize({ width: size.width, height: size.height }); await page.evaluate(s => { pudlSetTheme(s.theme); pudlSkins.select(s.skin); }, size);
                assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
                await page.screenshot({ path: path.join(evidence, engine + '-stylesheet-' + size.width + '.png') });
            }
            await page.setViewportSize({ width: 1500, height: 1000 });
            await cssText(dialog, '.custom { color: rgb(60, 40, 20); }');
            await dialog.locator('.cm-editor').evaluate(e => CM.EditorView.findFromDOM(e).focus()); await page.keyboard.press('Control+s'); await dialog.waitFor({ state: 'hidden' });
            await color(page.locator('[data-ed-page] .custom').first(), 'rgb(60, 40, 20)');
            await page.evaluate(() => pudlCommands.run('undo', null, document.querySelector('[data-applet]')));
            await color(page.locator('[data-ed-page] .custom').first(), 'rgb(10, 30, 50)');
            await command(page, 'class'); dialog = page.getByRole('dialog', { name: 'Style the Words', exact: true });
            await dialog.getByRole('button', { name: 'custom', exact: true }).waitFor(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            await page.evaluate(() => pudlHost.fs.writeText('~/Styles/shared.css', '.shared { color: rgb(12, 34, 56); }'));
            await action(page, 'editor', 'set-text', { text: '---\nstylesheet: ../Styles/shared.css\n---\n\n{{class:shared}}\nShared words.\n{{/class}}\n' });
            await color(page.locator('[data-ed-page] .shared').first(), 'rgb(12, 34, 56)');
            await command(page, 'shared-stylesheet'); dialog = page.getByRole('dialog', { name: 'Shared Stylesheet', exact: true });
            await dialog.waitFor(); await cssText(dialog, '.shared { color: rgb(65, 43, 21); }');
            await dialog.getByRole('button', { name: 'Save Stylesheet', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
            await color(page.locator('[data-ed-page] .shared').first(), 'rgb(65, 43, 21)');
            assert.equal(await page.evaluate(() => pudlHost.fs.readText('~/Styles/shared.css')), '.shared { color: rgb(65, 43, 21); }');
            await command(page, 'shared-stylesheet'); dialog = page.getByRole('dialog', { name: 'Shared Stylesheet', exact: true }); await dialog.waitFor();
            await cssText(dialog, '.shared { color: red; }');
            await page.evaluate(() => pudlHost.fs.writeText('~/Styles/shared.css', '.shared { color: rgb(11, 22, 33); }'));
            await dialog.getByRole('button', { name: 'Save Stylesheet', exact: true }).click();
            await dialog.getByText('The stylesheet or document changed. Close and reopen it before saving.', { exact: true }).waitFor();
            assert.equal(await page.evaluate(() => pudlHost.fs.readText('~/Styles/shared.css')), '.shared { color: rgb(11, 22, 33); }');
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            await page.evaluate(() => {
                const original = pudlHost.fs.writeText;
                pudlHost.fs.writeText = (...args) => new Promise(resolve => { window.finishStyleWrite = async () => { const result = await original(...args); pudlHost.fs.writeText = original; resolve(result); }; });
            });
            await command(page, 'shared-stylesheet'); dialog = page.getByRole('dialog', { name: 'Shared Stylesheet', exact: true }); await dialog.waitFor();
            await cssText(dialog, '.shared { color: rgb(22, 44, 66); }'); await dialog.getByRole('button', { name: 'Save Stylesheet', exact: true }).click();
            await page.waitForFunction(() => typeof window.finishStyleWrite === 'function');
            assert.equal(await dialog.locator('.cm-editor').evaluate(e => CM.EditorView.findFromDOM(e).state.readOnly), true);
            assert.equal(await dialog.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true);
            await dialog.locator('.cm-editor').evaluate(e => CM.EditorView.findFromDOM(e).focus()); await page.keyboard.type('new typing');
            assert.equal(await dialog.locator('.cm-editor').evaluate(e => CM.EditorView.findFromDOM(e).state.doc.toString()), '.shared { color: rgb(22, 44, 66); }');
            await page.evaluate(() => finishStyleWrite()); await dialog.waitFor({ state: 'hidden' });
            await page.evaluate(() => { window.styleWriteOriginal = pudlHost.fs.writeText; pudlHost.fs.writeText = async () => 'Simulated stylesheet write failure'; });
            await command(page, 'shared-stylesheet'); dialog = page.getByRole('dialog', { name: 'Shared Stylesheet', exact: true }); await dialog.waitFor();
            await dialog.getByRole('button', { name: 'Save Stylesheet', exact: true }).click();
            await dialog.getByText('Simulated stylesheet write failure', { exact: true }).waitFor();
            assert.equal(await dialog.locator('.cm-editor').evaluate(e => CM.EditorView.findFromDOM(e).state.readOnly), false);
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.evaluate(() => { pudlHost.fs.writeText = styleWriteOriginal; });
            await command(page, 'stylesheet'); dialog = page.getByRole('dialog', { name: 'Document Stylesheet', exact: true }); await dialog.waitFor();
            await action(page, 'editor', 'new', { path: '~/another.md', text: 'Another document.' });
            await cssText(dialog, 'p { color:red }'); await dialog.getByRole('button', { name: 'Apply Styles', exact: true }).click();
            await dialog.getByText(/The document changed.*Close and reopen/).waitFor();
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            console.log(engine + ': Editor styles, Unicode source edits/undo, named classes, shared CSS and stale-dialog guard passed');

            await page.goto(`http://slides.localhost:${port}/`); await page.locator('.yavc-command-toolbar').waitFor();
            const deck = '# First\n\n{{style}}\n.custom { color: rgb(100, 20, 30); }\n{{/style}}\n\n{{style:slide}}\n.custom { color: rgb(30, 20, 100); }\n{{/style}}\n\n{{class:custom}}\nFirst words.\n{{/class}}\n\n---\n\n# Second\n\n{{class:custom}}\nSecond words.\n{{/class}}\n';
            await action(page, 'slides', 'load', { text: deck });
            await color(page.locator('[data-role="slide"] .custom').first(), 'rgb(30, 20, 100)');
            await color(page.locator('.deck-film [data-slide="1"] .custom').first(), 'rgb(100, 20, 30)');
            await action(page, 'slides', 'go', { index: 2 }); await color(page.locator('[data-role="slide"] .custom').first(), 'rgb(100, 20, 30)');
            await command(page, 'deck-style-block'); dialog = page.getByRole('dialog', { name: 'Slide Stylesheet', exact: true }); await dialog.waitFor();
            await dialog.getByLabel('Style Block', { exact: true }).selectOption({ label: 'New Style Block (This Slide)' });
            await cssText(dialog, '.custom { color: rgb(70, 80, 90); }');
            await dialog.getByRole('button', { name: 'Apply Styles', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
            await color(page.locator('[data-role="slide"] .custom').first(), 'rgb(70, 80, 90)');
            await page.screenshot({ path: path.join(evidence, engine + '-slides.png') });
            await page.evaluate(() => pudlCommands.run('present', null, document.querySelector('[data-applet]')));
            await color(page.locator('.deck-show .custom').first(), 'rgb(30, 20, 100)');
            await page.evaluate(() => pudlCommands.run('leave', null, document.querySelector('[data-applet]')));
            const downloading = page.waitForEvent('download'); await command(page, 'export-html'); const download = await downloading;
            const file = path.join(evidence, engine + '-deck.html'); await download.saveAs(file);
            const exported = await context.newPage(); await exported.setContent(fs.readFileSync(file, 'utf8'));
            await color(exported.locator('.deck-slide .custom').first(), 'rgb(30, 20, 100)'); await exported.close();
            console.log(engine + ': Slides whole-deck/local styles, thumbnails, navigation, stylesheet UI, presenting and HTML export passed');
            await page.goto(`http://localhost:${port}/?open=slides&top=slides`); await page.locator('.win[data-win="slides"] .yavc-command-toolbar').waitFor();
            await action(page, 'slides', 'deck');
            await page.evaluate(async () => {
                const K = yavcMdEditor; await K.styles(); const real = K.libs, CM = await real();
                K.libs = () => new Promise(resolve => { window.releaseStyleLibrary = () => { K.libs = real; resolve(CM); }; });
                window.pendingStyleOpen = pudlCommands.run('deck-style-block', null, document.querySelector('[data-applet="slides"]'));
            });
            await page.waitForFunction(() => typeof window.releaseStyleLibrary === 'function');
            await page.evaluate(() => pudlWindows.close('slides')); await page.locator('.win[data-win="slides"]').waitFor({ state: 'detached' });
            await page.evaluate(async () => { releaseStyleLibrary(); await pendingStyleOpen; });
            assert.equal(await page.locator('.md-style-dialog').count(), 0); assert.equal(await page.locator('[data-md-style-owner]').count(), 0);
            await page.goto(`http://localhost:${port}/?open=slides&top=slides`); await page.locator('.win[data-win="slides"] .yavc-command-toolbar').waitFor(); await action(page, 'slides', 'deck');
            await command(page, 'deck-style-block'); dialog = page.getByRole('dialog', { name: 'Slide Stylesheet', exact: true }); await dialog.waitFor();
            await page.evaluate(() => pudlWindows.close('slides')); await dialog.waitFor({ state: 'hidden' });
            assert.equal(await page.locator('[data-md-style-owner]').count(), 0);
            console.log(engine + ': stylesheet loading/open-dialog disposal, frozen slow-save drafts and recoverable write failures passed');
        } catch (err) { if (page) { await page.screenshot({ path: path.join(evidence, engine + '-failure.png') }).catch(() => {}); console.error(await page.locator('.notice-body, .ed-message, .deck-message').allTextContents().catch(() => [])); } throw err; }
        finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
