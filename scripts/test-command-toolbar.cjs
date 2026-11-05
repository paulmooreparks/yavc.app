// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright via NODE_PATH; run against a disposable local server.
const { strict: assert } = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Use a disposable local port.');
const evidence = path.join(os.tmpdir(), 'yavc-command-toolbar'); fs.mkdirSync(evidence, { recursive: true });
async function docsAlias(context, engine) {
    const docs = await context.newPage(), editor = await context.newPage(); docs.setDefaultTimeout(15000); editor.setDefaultTimeout(15000);
    try {
        await docs.goto(`http://docs.localhost:${port}/`);
        await docs.locator('.cm-editor').waitFor({ state: 'attached' });
        await docs.waitForFunction(() => { const b = document.querySelector('.yavc-command-toolbar [data-command="common-toolbar-customize"]'); return b && !b.disabled; });
        await docs.locator('.yavc-command-toolbar [data-command="common-toolbar-customize"]').click();
        const dialog = docs.getByRole('dialog', { name: 'Customize Docs Toolbar', exact: true });
        await dialog.getByLabel('Search Available Commands', { exact: true }).fill('Files');
        await dialog.getByLabel('Available Commands', { exact: true }).selectOption('toggle-files');
        await dialog.getByRole('button', { name: 'Add to Toolbar', exact: true }).click(); await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        // The local server intentionally uses host-only cookies. Give the
        // second synthetic origin the same session to exercise the shared
        // preference contract used by a deployed parent-domain cookie.
        const cookies = await context.cookies(`http://docs.localhost:${port}/`);
        await context.addCookies(cookies.filter(c => c.name === 'yavc').map(c => ({ ...c, domain: 'editor.localhost' })));
        await editor.goto(`http://editor.localhost:${port}/`);
        await editor.locator('.yavc-command-toolbar [data-command="toggle-files"]').waitFor();
        await docs.screenshot({ path: path.join(evidence, engine + '-docs-toolbar.png') });
        await docs.evaluate(() => typeof window.yavcMdEngine === 'function' ? yavcMdEngine().then(() => true) : true);
        console.log(engine + ': Docs toolbar label and same-session Editor preferences across origins passed');
    } finally { await docs.close(); await editor.close(); }
}
async function dialogReview(context, engine) {
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    try {
        await page.goto(`http://diagrams.localhost:${port}/`);
        await page.locator('.cm-editor').waitFor();
        await page.evaluate(() => pudlActions.run('yavc.diagrams/new@1', { kind: 'canvas', style: 'basic' }, { grant: 'all' }));
        await page.locator('.yavc-command-toolbar [data-command="common-toolbar-customize"]').click();
        const dialog = page.getByRole('dialog', { name: 'Customize Diagrams Toolbar', exact: true });
        for (const state of [
            { width: 1700, height: 1050, theme: 'light', skin: 'standard' },
            { width: 1100, height: 900, theme: 'dark', skin: 'standard' },
            { width: 620, height: 900, theme: 'light', skin: 'bevel' },
            { width: 360, height: 850, theme: 'dark', skin: 'glaze' }
        ]) {
            await page.setViewportSize({ width: state.width, height: state.height });
            assert.equal(await page.evaluate(state => { pudlSetTheme(state.theme); return pudlSkins.select(state.skin); }, state), true);
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(() => {
                const a = document.querySelector('[data-available]').getBoundingClientRect(), t = document.querySelector('[data-selected]').getBoundingClientRect(), arrows = document.querySelector('.yavc-toolbar-transfer').getBoundingClientRect();
                return Math.abs(a.top - t.top) <= 1 && Math.abs(a.height - t.height) <= 1 && arrows.left >= a.right && arrows.right <= t.left && Math.abs((arrows.top + arrows.bottom) / 2 - (a.top + a.bottom) / 2) <= 1;
            });
            assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
            assert.equal(await dialog.locator('[data-available-caption]').innerText(), await dialog.locator('[data-available]').evaluate(e => e.options[e.selectedIndex].text));
            assert.equal(await dialog.locator('[data-selected-caption]').innerText(), await dialog.locator('[data-selected]').evaluate(e => e.options[e.selectedIndex].text));
            const order = dialog.getByRole('group', { name: 'Toolbar Order', exact: true });
            assert.ok((await order.boundingBox()).y >= (await dialog.locator('[data-selected]').boundingBox()).y + (await dialog.locator('[data-selected]').boundingBox()).height);
            await dialog.screenshot({ path: path.join(evidence, engine + '-dialog-' + state.width + '-' + state.theme + '-' + state.skin + '.png') });
        }
        const selected = dialog.getByLabel('Toolbar Commands', { exact: true }), before = await selected.locator('option').count();
        await dialog.getByLabel('Available Commands', { exact: true }).focus(); await page.keyboard.press('ArrowDown');
        assert.equal(await dialog.locator('[data-available-caption]').innerText(), await dialog.locator('[data-available]').evaluate(e => e.options[e.selectedIndex].text));
        await dialog.getByLabel('Search Available Commands', { exact: true }).fill('Split');
        await dialog.getByLabel('Available Commands', { exact: true }).selectOption('view-split');
        await dialog.getByRole('button', { name: 'Add to Toolbar', exact: true }).focus(); await page.keyboard.press('Space');
        assert.equal(await selected.locator('option').count(), before + 1);
        assert.equal(await dialog.locator('[data-selected-caption]').innerText(), 'Split');
        await dialog.getByRole('button', { name: 'Remove from Toolbar', exact: true }).focus(); await page.keyboard.press('Space');
        assert.equal(await selected.locator('option').count(), before);
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        console.log(engine + ': top-aligned lists, centered transfer arrows and keyboard transfers passed in light/dark, Standard/Bevel/Glaze at 360 to 1700 pixels');
    } finally { await page.close(); }
}
async function run(engine) {
    const browser = await playwright[engine].launch(), context = await browser.newContext({ viewport: { width: 1700, height: 1050 } });
    let page, phase = 'startup';
    try {
        if (process.argv.includes('--dialog-visual')) { await dialogReview(context, engine); return; }
        if (process.argv.includes('--docs-only')) { await docsAlias(context, engine); return; }
        for (const app of ['diagrams', 'editor', 'slides']) {
            page = await context.newPage(); const errors = [];
            page.setDefaultTimeout(12000);
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/api/admin/editor/shortcodes', route => route.fulfill({ contentType: 'application/json', body: '{"shortcodes":[]}' }));
            phase = app + ' startup'; await page.goto(`http://${app}.localhost:${port}/`);
            const bar = page.locator('.yavc-command-toolbar'); await bar.waitFor();
            const customize = () => bar.locator('[data-command="common-toolbar-customize"]');
            await page.waitForFunction(() => { const b = document.querySelector('.yavc-command-toolbar [data-command="common-toolbar-customize"]'); return b && !b.disabled && b.textContent.includes('Customize'); });
            const action = (name, input = {}) => page.evaluate(({ app, name, input }) => pudlActions.run('yavc.' + app + '/' + name + '@1', input, { grant: 'all' }), { app, name, input });
            const command = id => page.evaluate(id => pudlCommands.run(id, null, document.querySelector('[data-applet]')), id);
            const ids = () => bar.locator('[data-command]').evaluateAll(all => all.filter(e => !e.closest('.menu-panel')).map(e => e.dataset.command));
            const settledIds = expected => page.waitForFunction(expected => JSON.stringify(Array.from(document.querySelectorAll('.yavc-command-toolbar [data-command]')).filter(e => !e.closest('.menu-panel')).map(e => e.dataset.command)) === JSON.stringify(expected), expected);
            if (app === 'diagrams') await action('new', { kind: 'canvas', style: 'basic' });
            else if (app === 'editor') await action('new', { path: '~/toolbar.md', text: '# Toolbar\n\nSample text' });
            else await action('load', { text: '# Toolbar\n\nSample slide' });
            await action('save', { path: '~/toolbar' + (app === 'diagrams' ? '.canvas' : app === 'slides' ? '.slides.md' : '.md') });
            const original = await ids(); if (app !== 'slides') assert.ok(original.includes('undo')); assert.ok(original.includes('save'));
            await customize().focus(); await page.keyboard.press('Home');
            assert.equal(await page.evaluate(() => document.activeElement.dataset.command), 'save');
            await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.activeElement.dataset.command), 'common-toolbar-customize');
            phase = app + ' cancel'; await customize().click();
            const dialog = page.getByRole('dialog', { name: /^Customize .* Toolbar$/ });
            const availableList = dialog.getByLabel('Available Commands', { exact: true }), toolbarList = dialog.getByLabel('Toolbar Commands', { exact: true });
            const availableBox = await availableList.boundingBox(), toolbarBox = await toolbarList.boundingBox();
            assert.ok(Math.abs(availableBox.y - toolbarBox.y) <= 1); assert.ok(Math.abs(availableBox.height - toolbarBox.height) <= 1);
            const transfer = dialog.getByRole('group', { name: 'Transfer Commands', exact: true });
            const addArrow = transfer.getByRole('button', { name: 'Add to Toolbar', exact: true }), removeArrow = transfer.getByRole('button', { name: 'Remove from Toolbar', exact: true });
            assert.equal(await addArrow.innerText(), '>'); assert.equal(await removeArrow.innerText(), '<');
            const arrows = await transfer.boundingBox(); assert.ok(arrows.x > availableBox.x + availableBox.width && arrows.x + arrows.width < toolbarBox.x);
            assert.equal(await dialog.getByRole('button', { name: 'Add', exact: true }).count(), 0); assert.equal(await dialog.getByRole('button', { name: 'Remove', exact: true }).count(), 0);
            if (app === 'diagrams') {
                const labels = await dialog.getByLabel('Toolbar Commands', { exact: true }).locator('option').allTextContents();
                assert.ok(labels.includes('Add Shape (D2)')); assert.ok(labels.includes('Add Shape (Canvas)'));
            }
            const addSplit = async () => { await dialog.getByLabel('Search Available Commands', { exact: true }).fill('Split'); await dialog.getByLabel('Available Commands', { exact: true }).selectOption('view-split'); await addArrow.click(); };
            await addSplit(); await dialog.screenshot({ path: path.join(evidence, engine + '-' + app + '-customize.png') });
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            assert.deepEqual(await ids(), original);
            phase = app + ' apply'; await customize().click(); await addSplit();
            await dialog.getByRole('button', { name: 'Add Separator', exact: true }).click(); await removeArrow.click();
            if (app === 'diagrams') {
                await dialog.getByLabel('Search Available Commands', { exact: true }).fill('Oval'); await dialog.getByLabel('Available Commands', { exact: true }).selectOption('tool-oval'); await addArrow.click();
            }
            await dialog.getByRole('button', { name: 'Move Down', exact: true }).click();
            await dialog.getByLabel('Keep Visible with the Ribbon', { exact: true }).uncheck();
            await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
            assert.ok((await ids()).includes('view-split')); assert.equal(await bar.getAttribute('data-toolbar-ribbon'), 'hide');
            if (app === 'diagrams') {
                const oval = bar.locator('[data-command="tool-oval"]'); await oval.click(); assert.equal(await oval.getAttribute('aria-pressed'), 'true');
                await bar.locator('[data-command="drawing-tool"]').click();
                await page.getByRole('menuitemcheckbox', { name: 'Oval', exact: true }).click();
                assert.equal(await oval.getAttribute('aria-pressed'), 'false');
            }
            await bar.locator('[data-command="view-split"]').click();
            await page.waitForFunction(() => document.querySelector('.yavc-command-toolbar [data-command="view-split"]').getAttribute('aria-pressed') === 'true');
            phase = app + ' ribbon'; await page.getByRole('button', { name: 'Show as ribbon', exact: true }).click();
            assert.equal(await bar.isVisible(), false);
            await page.evaluate(() => { window.toolbarDialog = pudlCommands.run('common-toolbar-customize', null, document.querySelector('[data-applet]')); }); await dialog.waitFor();
            await dialog.getByLabel('Keep Visible with the Ribbon', { exact: true }).check();
            await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
            await page.evaluate(() => toolbarDialog);
            assert.equal(await bar.isVisible(), true);
            await page.screenshot({ path: path.join(evidence, engine + '-' + app + '-toolbar-ribbon.png') });
            const customized = await ids();
            await page.waitForFunction(() => typeof window.yavcMdEngine === 'function'); await page.evaluate(() => yavcMdEngine().then(() => true));
            await page.reload(); await bar.waitFor();
            await page.waitForFunction(() => { const b = document.querySelector('.yavc-command-toolbar [data-command="common-toolbar-customize"]'); return b && !b.disabled && b.textContent.includes('Customize'); });
            await settledIds(customized);
            assert.deepEqual(await ids(), customized);
            phase = app + ' save failure'; await customize().click();
            await page.evaluate(() => { window.realConfigSet = pudlHost.config.set; pudlHost.config.set = async () => 'Synthetic settings failure'; });
            await dialog.getByRole('button', { name: 'Restore Defaults', exact: true }).click();
            await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
            await dialog.getByRole('alert').filter({ hasText: 'Synthetic settings failure' }).waitFor();
            assert.equal(await dialog.isVisible(), true);
            await page.evaluate(() => { pudlHost.config.set = realConfigSet; });
            await dialog.getByRole('button', { name: 'Apply', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
            assert.deepEqual(await ids(), original);
            phase = app + ' reload';
            await page.evaluate(() => typeof window.yavcMdEngine === 'function' ? yavcMdEngine().then(() => true) : true);
            await page.reload(); await bar.waitFor();
            await page.waitForFunction(() => { const b = document.querySelector('.yavc-command-toolbar [data-command="common-toolbar-customize"]'); return b && !b.disabled && b.textContent.includes('Customize'); });
            await settledIds(original);
            assert.deepEqual(await ids(), original);
            assert.equal(await bar.isVisible(), true);
            await command('common-toolbar-show'); assert.equal(await bar.isVisible(), false);
            await command('common-toolbar-show'); assert.equal(await bar.isVisible(), true);
            await page.setViewportSize({ width: 620, height: 900 });
            await page.waitForFunction(() => {
                const bar = document.querySelector('.yavc-command-toolbar'), box = bar.getBoundingClientRect();
                return Array.from(bar.querySelectorAll('button')).filter(b => !b.closest('.menu-panel') && b.getClientRects().length).every(b => { const r = b.getBoundingClientRect(); return r.left >= box.left - 2 && r.right <= box.right + 2; });
            });
            await page.screenshot({ path: path.join(evidence, engine + '-' + app + '-narrow.png') });
            assert.deepEqual(errors, []); await page.close();
            console.log(engine + ': ' + app + ' shared toolbar, customization, failure, ribbon and reload passed');
        }
        phase = 'desktop scopes and preference notifications'; page = await context.newPage(); page.setDefaultTimeout(15000);
        const desktopErrors = []; page.on('pageerror', e => desktopErrors.push(e.message));
        await page.goto(`http://localhost:${port}/?open=diagrams,diagrams-2&top=diagrams`);
        const first = page.locator('.win[data-win="diagrams"] .dg'), second = page.locator('.win[data-win="diagrams-2"] .dg');
        await first.locator('.cm-editor').waitFor({ state: 'attached' }); await second.locator('.cm-editor').waitFor({ state: 'attached' });
        const scoped = (key, id) => page.evaluate(({ key, id }) => pudlCommands.run(id, null, document.querySelector('.win[data-win="' + key + '"] .dg')), { key, id });
        await scoped('diagrams', 'new-canvas-blank'); await scoped('diagrams-2', 'new-canvas-blank');
        await page.evaluate(() => { pudlWindows.snap('diagrams', 'left'); pudlWindows.snap('diagrams-2', 'right'); });
        const writePrefs = items => page.evaluate(items => pudlHost.config.set('command-toolbars', { diagrams: { version: 1, visible: true, inRibbon: true, items } }), items);
        await writePrefs(['cv-new', '-', 'undo', 'redo']);
        await page.waitForFunction(() => document.querySelectorAll('.win .yavc-command-toolbar [data-command="cv-new"]').length === 2);
        const count = root => root.locator('.cm-editor').evaluate(e => JSON.parse(CM.EditorView.findFromDOM(e).state.doc.toString()).nodes.length);
        await first.locator('.yavc-command-toolbar [data-command="cv-new"]').click(); assert.equal(await count(first), 1); assert.equal(await count(second), 0);
        await second.locator('.yavc-command-toolbar [data-command="cv-new"]').click(); assert.equal(await count(first), 1); assert.equal(await count(second), 1);
        phase = 'overflow focus on a shared preference update';
        // Set an explicit overflow width. Desktop space no longer loses
        // 300 pixels to an application sidebar.
        await page.setViewportSize({ width: 1100, height: 1050 });
        await writePrefs(['save', 'undo', 'redo', '-', 'tool-rectangle', 'tool-rounded', 'tool-oval', '-', 'tool-diamond', 'tool-person', 'tool-cloud', '-', 'tool-hexagon', 'tool-package', 'tool-text', '-', 'cv-new', 'cv-connect', 'cv-delete', '-', 'fit', 'cv-zoom-in', 'cv-zoom-out']);
        const fold = first.locator('.yavc-command-toolbar .toolbar-fold > .menu-btn:visible, .yavc-command-toolbar .toolbar-more > .menu-btn:visible').first();
        await fold.waitFor(); await fold.focus();
        await writePrefs(['cv-new', 'undo']);
        await page.waitForFunction(() => { const root = document.querySelector('.win[data-win="diagrams"] .dg'), active = document.activeElement; return root.contains(active) && active.getClientRects().length && (active === root || root.querySelector('.yavc-command-toolbar').contains(active)); });
        await page.screenshot({ path: path.join(evidence, engine + '-desktop-scopes.png') });
        phase = 'instance disposal';
        await page.evaluate(() => pudlWindows.close('diagrams'));
        await page.getByRole('button', { name: "Don't Save", exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('.win[data-win="diagrams"] .yavc-command-toolbar'));
        await writePrefs(['cv-new', '-', 'cv-zoom-in']);
        await second.locator('.yavc-command-toolbar [data-command="cv-zoom-in"]').waitFor();
        await second.locator('.yavc-command-toolbar [data-command="cv-new"]').click(); assert.equal(await count(second), 2);
        phase = 'untrusted preferences';
        await page.evaluate(() => pudlHost.config.set('command-toolbars', { diagrams: { version: 1, visible: 'false', inRibbon: 'false', items: ['<img src=x onerror="window.toolbarAttack=true">', 'cv-new', 'cv-new', '-', '__proto__'] } }));
        await page.waitForFunction(() => document.querySelectorAll('.win[data-win="diagrams-2"] .yavc-command-toolbar [data-command="cv-new"]').length === 1);
        assert.equal(await second.locator('.yavc-command-toolbar img').count(), 0); assert.equal(await page.evaluate(() => window.toolbarAttack), undefined);
        assert.deepEqual(desktopErrors, []); await page.close();
        console.log(engine + ': desktop command isolation, preference notifications, overflow focus, disposal and hostile preferences passed');
        for (const app of ['diagrams', 'editor', 'slides']) {
            phase = app + ' legacy host'; page = await context.newPage(); page.setDefaultTimeout(12000);
            await page.addInitScript(() => { let host; Object.defineProperty(window, 'pudlHost', { configurable: true, get: () => host, set: value => { delete value.commandToolbar; host = value; } }); });
            await page.goto(`http://${app}.localhost:${port}/`); await page.locator('.applet-toolbars .toolbar').waitFor({ state: 'attached' });
            await page.evaluate(() => pudlMenubar.ribbon(false)); await page.locator('.applet-toolbars .toolbar').waitFor();
            assert.equal(await page.locator('.yavc-command-toolbar').count(), 0);
            assert.equal(await page.evaluate(() => pudlCommands.list(document.querySelector('[data-applet]')).some(c => c.id === 'common-toolbar-customize')), false);
            await page.close();
        }
        console.log(engine + ': all three applets retain their legacy host toolbars');
        if (engine === 'chromium') {
            phase = 'Docs shared preference'; await docsAlias(context, engine);
            phase = 'host without configuration'; page = await context.newPage(); page.setDefaultTimeout(12000);
            await page.addInitScript(() => { let host; Object.defineProperty(window, 'pudlHost', { configurable: true, get: () => host, set: value => { delete value.config; host = value; } }); });
            await page.goto(`http://diagrams.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
            const custom = page.locator('.yavc-command-toolbar [data-command="common-toolbar-customize"]');
            await custom.waitFor(); assert.equal(await custom.isDisabled(), true); assert.match(await custom.getAttribute('title'), /does not save toolbar settings/);
            assert.equal(await page.locator('.yavc-command-toolbar [data-command="save"]').isEnabled(), true); await page.close();
            console.log(engine + ': default toolbar works without configuration and customization explains its disabled state');
        }
    } catch (err) { if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidence, engine + '-failure.png') }).catch(() => {}); err.message = phase + ': ' + err.message; throw err; }
    finally { await browser.close(); }
}
(async () => { const engines = process.argv.slice(2).filter(arg => !arg.startsWith('--')); for (const engine of engines.length ? engines : ['chromium']) await run(engine); })().catch(e => { console.error(e); process.exit(1); });
