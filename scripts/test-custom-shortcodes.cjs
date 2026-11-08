// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Run against a disposable development server with Playwright via NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8416';
const evidence = path.join(os.tmpdir(), 'yavc-custom-shortcodes-evidence'); fs.mkdirSync(evidence, { recursive: true });
const source = '# 😀 Custom shortcodes\n\n{{define:card}}\n{{param:title default="A heading" help="Card heading"}}\n{{note:{{arg:title}}}}\n{{content}}\n{{/note}}\n{{/define}}\n\n{{define:badge}}\n{{param:text default="Badge" help="Literal label"}}\n**{{arg:text}}**\n{{/define}}\n\nBefore {{badge:text="My badge"}} after.\n\n{{card:title="My card"}}\nAn **editable** body.\n{{/card}}\n';
function action(page, app, name, input = {}) { return page.evaluate(({ app, name, input }) => pudlActions.run('yavc.' + app + '/' + name + '@1', input, { grant: 'all' }), { app, name, input }); }
function command(page, id) { return page.evaluate(id => { window.macroCommand = pudlCommands.run(id, null, document.querySelector('[data-applet]')); return true; }, id); }
async function text(page) { return (await action(page, 'editor', 'document')).text; }
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await playwright[engine].launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); page.setDefaultTimeout(15000);
        let phase = 'Editor rendering';
        try {
            await page.goto(`http://editor.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
            await action(page, 'editor', 'new', { path: '~/Documents/macros.md', text: source });
            await action(page, 'editor', 'view', { mode: 'split' });
            const box = page.locator('.pm-box[data-name="card"]'); await box.waitFor();
            await box.getByText('My card', { exact: true }).waitFor();
            assert.equal(await text(page), source);
            assert.equal((await action(page, 'editor', 'define')).entries.length, 2);
            assert.equal(await page.locator('.pm-source[data-kind="definition"]:visible').count(), 0);
            await page.locator('.pm-sc').filter({ hasText: 'My badge' }).waitFor();
            phase = 'Rich body and parameter edits';
            await box.locator('.pm-box-body p').click(); await page.keyboard.press('End'); await page.keyboard.type(' Added.');
            await page.waitForFunction(() => document.querySelector('.pm-box-body').textContent.includes('Added.'));
            await box.getByRole('button', { name: 'Parameters…', exact: true }).click();
            let dialog = page.getByRole('dialog', { name: 'Change card', exact: true }); await dialog.waitFor();
            await dialog.getByLabel('Title', { exact: true }).fill('Changed card'); await dialog.getByRole('button', { name: 'Change', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
            await box.getByText('Changed card', { exact: true }).waitFor();
            await page.waitForFunction(() => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('{{card:title="Changed card"}}'));
            let updated = await text(page); assert.ok(updated.includes('{{card:title="Changed card"}}'), updated); assert.ok(updated.includes('Added.')); assert.ok(updated.includes('{{define:card}}'));
            phase = 'Definition edits and Undo';
            await command(page, 'custom-shortcodes'); dialog = page.getByRole('dialog', { name: 'Custom Shortcodes', exact: true }); await dialog.waitFor();
            await dialog.getByLabel('Definition', { exact: true }).selectOption({ label: 'badge' });
            await dialog.getByLabel('Template Markdown', { exact: true }).fill('{{param:text default="Badge"}}\n*{{arg:text}}*\n');
            await page.screenshot({ path: path.join(evidence, engine + '-definitions-light.png') });
            await page.setViewportSize({ width: 620, height: 850 }); await page.evaluate(() => pudlSetTheme('dark'));
            assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
            assert.equal(await dialog.getByLabel('Definition', { exact: true }).evaluate(element => element.classList.contains('form-select') && element.parentElement.classList.contains('form-select-wrap')), true);
            await page.screenshot({ path: path.join(evidence, engine + '-definitions-dark.png'), animations: 'disabled' });
            await page.setViewportSize({ width: 1500, height: 1000 }); await page.evaluate(() => pudlSetTheme('light'));
            await dialog.getByRole('button', { name: 'Apply Definitions', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
            await page.locator('.pm-sc em').filter({ hasText: 'My badge' }).waitFor();
            await command(page, 'undo'); await page.locator('.pm-sc strong').filter({ hasText: 'My badge' }).waitFor();
            phase = 'New names and stale dialogs';
            await command(page, 'custom-shortcodes'); dialog = page.getByRole('dialog', { name: 'Custom Shortcodes', exact: true }); await dialog.waitFor();
            await dialog.getByLabel('Definition', { exact: true }).selectOption({ label: 'New Definition' });
            await dialog.getByLabel('Shortcode Name', { exact: true }).fill('bad}} trailing');
            await dialog.getByRole('button', { name: 'Apply Definitions', exact: true }).click();
            await dialog.getByText(/A shortcode name must start/).waitFor();
            assert.ok(!(await text(page)).includes('bad}} trailing'));
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            await command(page, 'custom-shortcodes'); dialog = page.getByRole('dialog', { name: 'Custom Shortcodes', exact: true }); await dialog.waitFor();
            await action(page, 'editor', 'new', { path: '~/other.md', text: 'Another document.' });
            await dialog.getByRole('button', { name: 'Apply Definitions', exact: true }).click();
            await dialog.getByText('The document changed. Close and reopen Custom Shortcodes.', { exact: true }).waitFor();
            assert.equal(await text(page), 'Another document.'); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            phase = 'Glyph gallery'; await command(page, 'insert-sc-glyph');
            dialog = page.getByRole('dialog', { name: 'Insert a Glyph', exact: true }); await dialog.waitFor();
            await dialog.locator('[data-glyph-choice]').first().waitFor();
            await page.screenshot({ path: path.join(evidence, engine + '-glyphs-wide.png') });
            await dialog.getByRole('button', { name: 'Insert', exact: true }).click();
            assert.equal(await dialog.getByRole('searchbox', { name: 'Search Glyphs' }).evaluate(e => e === document.activeElement), true);
            await dialog.getByRole('searchbox', { name: 'Search Glyphs' }).fill('che');
            const glyphs = dialog.locator('[data-glyph-choice]:visible'); await glyphs.first().waitFor();
            assert.ok(await glyphs.count() > 0); assert.equal(await glyphs.first().locator('.glyph').count(), 1);
            await glyphs.first().click();await dialog.getByRole('listbox',{name:'Glyphs',exact:true}).focus();await page.keyboard.press('ArrowDown');
            assert.equal(await dialog.locator('[data-glyph-choice][aria-selected="true"]').count(), 1);assert.equal(await dialog.getByRole('radio').count(),0);
            assert.equal(await dialog.locator('[data-role="error"]').isVisible(), false);
            await page.setViewportSize({ width: 380, height: 800 });
            assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
            await page.screenshot({ path: path.join(evidence, engine + '-glyphs.png') });
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.setViewportSize({ width: 1500, height: 1000 });
            phase = 'Shared definitions';
            await page.evaluate(() => pudlHost.fs.writeText('~/Shortcodes/shared.md', '{{define:shared}}\nShared **works**.\n{{/define}}\n'));
            await action(page, 'editor', 'new', { path: '~/Documents/shared-test.md', text: '---\nshortcodes: ../Shortcodes/shared.md\n---\n\n{{shared}}\n' });
            await action(page, 'editor', 'view', { mode: 'preview' }); await page.locator('[data-ed-page] strong').filter({ hasText: 'works' }).waitFor();
            await page.evaluate(() => pudlHost.fs.writeText('~/Shortcodes/shared.md', '{{define:shared}}\nShared **changed**.\n{{/define}}\n'));
            await page.locator('[data-ed-page] strong').filter({ hasText: 'changed' }).waitFor();
            phase = 'Completion and form disposal';
            await action(page, 'editor', 'new', { path: '~/completion.md', text: source + '\n{{ba' }); await action(page, 'editor', 'view', { mode: 'text' });
            await page.waitForFunction(() => window.yavcMacroTools && document.querySelector('.cm-editor'));
            await page.locator('.cm-editor').evaluate(element => { const view = CM.EditorView.findFromDOM(element); view.dispatch({ selection: { anchor: view.state.doc.length } }); view.focus(); CM.startCompletion(view); });
            await page.waitForFunction(() => CM.currentCompletions(CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state).some(item => item.label === 'badge'));
            await page.keyboard.press('Escape');
            await command(page, 'insert-custom-badge'); dialog = page.getByRole('dialog', { name: 'Insert badge', exact: true }); await dialog.waitFor();
            await page.evaluate(() => pudlApplets.destroy(document.querySelector('[data-applet="editor"]'))); await dialog.waitFor({ state: 'hidden' });
            assert.equal(await page.locator('dialog[open]').count(), 0);
            phase = 'Slides whole-deck definitions';
            await page.goto(`http://slides.localhost:${port}/`); await page.locator('.yavc-command-toolbar').waitFor();
            await action(page, 'slides', 'load', { text: source + '\n---\n\n# Second\n\n{{badge:text="Another slide"}}\n' });
            await page.locator('[data-role="slide"] .pm-box[data-name="card"]').waitFor();
            await page.locator('.deck-film [data-slide="1"] strong').filter({ hasText: 'Another slide' }).waitFor();
            await action(page, 'slides', 'go', { index: 2 });
            await page.locator('[data-role="slide"] .pm-sc').filter({ hasText: 'Another slide' }).waitFor();
            assert.equal((await action(page, 'slides', 'define')).entries.length, 2);
            await page.screenshot({ path: path.join(evidence, engine + '-slides.png') });
            phase = 'Slides HTML export';
            const downloading = page.waitForEvent('download'); await command(page, 'export-html'); const download = await downloading;
            const file = path.join(evidence, engine + '-macros.html'); await download.saveAs(file);
            const exported = await browser.newPage(); await exported.goto('file:///' + file.replace(/\\/g, '/'));
            await exported.locator('strong').filter({ hasText: 'Another slide' }).waitFor({ state: 'attached' });
            assert.ok(!(await exported.locator('body').innerText()).includes('{{define:')); await exported.close();
            console.log(engine + ': macro rendering, rich body/parameter edits, definition Undo, validation, shared files, glyph keyboard/narrow layout and whole-deck use passed');
        } catch (err) { await page.screenshot({ path: path.join(evidence, engine + '-failure.png') }).catch(() => {}); throw new Error(engine + ' ' + phase + ': ' + err.message, { cause: err }); }
        finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
