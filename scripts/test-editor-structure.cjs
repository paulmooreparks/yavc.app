// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8418';
const evidence = path.join(os.tmpdir(), 'yavc-editor-structure-evidence'); fs.mkdirSync(evidence, { recursive: true });
const source = '---\ntitle: Structure test\n---\n\n# First 😀\n\nIntro.\n\n> A **rich quote**.\nlazy continuation\n>\n> - One\n> - Two\n\n| Left | Center | Right |\n| :----- | :----: | ----: |\n| A | B | C |\n\n## Child\n\nKeep this with First.\n\n```md\n# Example\n```\n\n{{define:card}}\n## Template\n{{content}}\n{{/define}}\n\n# Second\n\nSecond body.\n\n# Third\n\nThird body.\n';
function action(page, app, name, input = {}) { return page.evaluate(({ app, name, input }) => pudlActions.run('yavc.' + app + '/' + name + '@1', input, { grant: 'all' }), { app, name, input }); }
function command(page, id) { return page.evaluate(id => { window.structureCommand = pudlCommands.run(id, null, document.querySelector('[data-applet]')); return true; }, id); }
function getText(page) { return action(page, 'docs', 'document').then(result => result.text); }
async function sourceContains(page, fragment) { await page.waitForFunction(fragment => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes(fragment), fragment); }
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await playwright[engine].launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); page.setDefaultTimeout(15000);
        let phase = 'Editor start';
        try {
            await page.goto(`http://docs.localhost:${port}/`); await page.locator('.cm-editor').waitFor({state:'attached'});
            await action(page, 'docs', 'new', { path: '~/Documents/structure.md', text: source }); await action(page, 'docs', 'view', { mode: 'split' });
            await page.locator('.ProseMirror blockquote').waitFor(); await page.locator('.ProseMirror table').waitFor();
            assert.equal(await getText(page), source);
            phase = 'Outline action revision';
            const outline = await action(page, 'docs', 'outline');
            assert.deepEqual(outline.entries.map(entry => entry.title), ['First 😀', 'Child', 'Second', 'Third']);
            assert.match(outline.revision, /^[a-f0-9]{64}$/);
            await action(page, 'docs', 'move-section', { from: outline.entries[2].from, after: outline.entries[3].from, revision: outline.revision });
            await sourceContains(page, '# Third\n\nThird body.\n# Second');
            await assert.rejects(action(page, 'docs', 'move-section', { from: outline.entries[2].from, direction: 'up', revision: outline.revision }), /changed/);
            await command(page, 'undo');
            await page.waitForFunction(source => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString() === source, source);
            phase = 'Outline navigation'; await command(page, 'toggle-outline');
            const tree = page.getByRole('tree', { name: 'Document Outline', exact: true }); await tree.waitFor();
            assert.equal(await tree.locator('a[data-outline-index]').count(), 4);
            await tree.getByRole('treeitem', { name: 'Second', exact: true }).click();
            await page.waitForFunction(() => document.activeElement.closest('.ProseMirror'));
            assert.equal(await page.locator('.cm-editor').evaluate(element => { const view = CM.EditorView.findFromDOM(element); return view.state.doc.lineAt(view.state.selection.main.from).text; }), '# Second');
            await tree.getByRole('treeitem', { name: 'Second', exact: true }).getAttribute('aria-current').then(value => assert.equal(value, 'location'));
            assert.equal(new URL(page.url()).searchParams.get('line'), String(source.slice(0, source.indexOf('# Second')).split('\n').length));
            await page.screenshot({ path: path.join(evidence, engine + '-outline.png') });
            phase = 'Outline refresh preserves keyboard focus';
            await tree.getByRole('treeitem', { name: 'Second', exact: true }).focus();
            await page.locator('.cm-editor').evaluate(element => { const view = CM.EditorView.findFromDOM(element); view.dispatch({ changes: { from: view.state.doc.length, insert: '\nExternal edit.\n' }, userEvent: 'input.external' }); });
            await page.locator('[data-outline-tree][aria-busy="false"]').waitFor();
            assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Second');
            await page.locator('.cm-editor').evaluate((element, source) => { const view = CM.EditorView.findFromDOM(element); view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source }, userEvent: 'input.external' }); view.focus(); }, source);
            await page.locator('[data-outline-tree][aria-busy="false"]').waitFor();
            assert.ok(await page.evaluate(() => !!document.activeElement.closest('.cm-editor')));
            await tree.getByRole('treeitem', { name: 'Second', exact: true }).click();
            await page.waitForFunction(() => !!document.activeElement.closest('.ProseMirror'));
            phase = 'Section movement and Undo'; await command(page, 'section-up');
            await sourceContains(page, '# Second\n\nSecond body.\n\n# First');
            let moved = await getText(page); assert.ok(moved.includes('## Child\n\nKeep this with First.'));
            await command(page, 'undo'); await sourceContains(page, '# First');
            await page.waitForFunction(source => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString() === source, source);
            await page.locator('[data-outline-tree][aria-busy="false"]').waitFor();
            await tree.getByRole('treeitem', { name: 'Second', exact: true }).focus(); await page.keyboard.press('Alt+Shift+ArrowUp');
            await sourceContains(page, '# Second\n\nSecond body.\n\n# First'); await command(page, 'undo');
            await page.waitForFunction(source => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString() === source, source);
            phase = 'Outline drag movement';
            await page.waitForFunction(() => document.querySelector('[data-outline-index="0"]').textContent === 'First 😀');
            await tree.locator('a[data-outline-index="0"]').dragTo(tree.locator('a[data-outline-index="3"]'), { targetPosition: { x: 20, y: 18 } });
            await sourceContains(page, '# Third\n\nThird body.\n# First');
            assert.ok((await getText(page)).includes('## Child\n\nKeep this with First.'));
            await command(page, 'undo');
            await page.waitForFunction(source => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString() === source, source);
            phase = 'Aligned table editing';
            await page.locator('.ProseMirror[aria-busy="false"]').waitFor();
            await page.locator('.ProseMirror tbody tr').nth(1).locator('td').first().click();
            await page.waitForFunction(() => yavcMdEditor._page.marks().table); await action(page, 'docs', 'table', { op: 'align-center' });
            await page.waitForFunction(() => [...document.querySelectorAll('.ProseMirror tr')].every(row => row.children[0].style.textAlign === 'center'));
            await sourceContains(page, '| :---: | :---: | ---: |');
            await command(page, 'undo'); await page.waitForFunction(() => [...document.querySelectorAll('.ProseMirror tr')].every(row => row.children[0].style.textAlign === 'left'));
            phase = 'Structural edits retain table alignment';
            await page.locator('.ProseMirror tbody tr').nth(1).locator('td').first().click();
            await page.waitForFunction(() => yavcMdEditor._page.marks().table);
            await action(page, 'docs', 'table', { op: 'row-below' });
            assert.equal(await page.locator('.ProseMirror tr').count(), 3);
            assert.ok(await page.locator('.ProseMirror tr').evaluateAll(rows => rows.every(row => row.children[0].style.textAlign === 'left' && row.children[1].style.textAlign === 'center' && row.children[2].style.textAlign === 'right')));
            await command(page, 'undo'); await page.waitForFunction(() => document.querySelectorAll('.ProseMirror tr').length === 2);
            await page.locator('.ProseMirror tbody tr').nth(1).locator('td').first().click();
            await page.waitForFunction(() => yavcMdEditor._page.marks().table);
            await action(page, 'docs', 'table', { op: 'column-after' });
            assert.ok(await page.locator('.ProseMirror tr').evaluateAll(rows => rows.every(row => row.children.length === 4 && row.children[0].style.textAlign === 'left' && row.children[1].style.textAlign === '' && row.children[2].style.textAlign === 'center' && row.children[3].style.textAlign === 'right')));
            await command(page, 'undo'); await page.waitForFunction(() => document.querySelector('.ProseMirror tr').children.length === 3);
            phase = 'Unquote a nested list';
            await page.locator('.ProseMirror[aria-busy="false"] blockquote li p').first().click();
            await page.waitForFunction(() => yavcMdEditor._page.marks().quote && yavcMdEditor._page.marks().list === 'bullet_list'); await command(page, 'quote');
            await page.waitForFunction(() => !document.querySelector('.ProseMirror blockquote'));
            assert.equal(await page.locator('.ProseMirror ul li').count(), 2); await sourceContains(page, '- One\n- Two');
            await command(page, 'undo'); await page.locator('.ProseMirror blockquote li').first().waitFor();
            phase = 'Text quote toggling';
            await action(page, 'docs', 'new', { path: '~/text-quote.md', text: 'First line\nSecond line\nAfter.' }); await action(page, 'docs', 'view', { mode: 'text' });
            await page.locator('.cm-editor').evaluate(element => { const view = CM.EditorView.findFromDOM(element); view.dispatch({ selection: { anchor: 0, head: view.state.doc.line(3).from } }); view.focus(); });
            await action(page, 'docs', 'format', { op: 'quote' }); assert.equal(await getText(page), '> First line\n> Second line\nAfter.');
            await command(page, 'quote'); assert.equal(await getText(page), 'First line\nSecond line\nAfter.');
            phase = 'Narrow navigation';
            await action(page, 'docs', 'new', { path: '~/narrow.md', text: source }); await action(page, 'docs', 'view', { mode: 'visual' });
            await page.setViewportSize({ width: 380, height: 850 }); await page.evaluate(() => pudlSetTheme('dark')); await command(page, 'toggle-outline');
            if (!(await tree.isVisible())) { await command(page, 'toggle-outline'); }
            await tree.waitFor(); assert.ok(await page.locator('.ed-outline-pane').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
            await page.screenshot({ path: path.join(evidence, engine + '-narrow.png'), animations: 'disabled' });
            await tree.getByRole('treeitem', { name: 'Third', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('[data-applet]').classList.contains('ed-compact-outline'));
            await page.setViewportSize({ width: 1500, height: 1000 });
            phase = 'Retain rich draft after source conflict';
            await action(page, 'docs', 'new', { path: '~/conflict.md', text: '# First\n\nOriginal body.\n\n# Second\n\nOther body.\n' });
            await action(page, 'docs', 'view', { mode: 'split' });
            await command(page, 'toggle-outline'); if (!(await tree.isVisible())) { await command(page, 'toggle-outline'); }
            await tree.getByRole('treeitem', { name: 'First', exact: true }).waitFor();
            await page.locator('.ProseMirror[aria-busy="false"] p').first().click();
            await page.waitForFunction(() => yavcMdEditor._page.outlineIndex() === 0);
            const conflict = await page.evaluate(async () => {
                const api = yavcMdEditor._page, engine = await yavcMdEngine(), markdown = engine.markdown;
                const cm = CM.EditorView.findFromDOM(document.querySelector('.cm-editor')), original = cm.state.doc.toString();
                let release; engine.markdown = doc => new Promise(resolve => { release = () => resolve(markdown(doc)); });
                try {
                    api.run('quote'); const saving = api.sync().then(() => false, () => true);
                    while (!release) { await new Promise(resolve => setTimeout(resolve, 0)); }
                    cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: original + '\nNew source edit.\n' } });
                    release(); const refused = await saving;
                    engine.markdown = markdown;
                    document.querySelector('[data-outline-index="0"]').click();
                    const revision = engine.outlineState(cm.state.doc.toString()).revision;
                    const moveRefused = await pudlActions.run('yavc.docs/move-section@1', { from: 0, direction: 'down', revision }, { grant: 'all' }).then(() => false, () => true);
                    const reloadRefused = await api.reload().then(() => false, () => true);
                    const closeRefused = await api.enable(false).then(() => false, () => true);
                    const retained = api.active() && api.pending() && !!document.querySelector('.ProseMirror blockquote');
                    const sourceKept = cm.state.doc.toString() === original + '\nNew source edit.\n';
                    cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: original } });
                    await api.sync();
                    return { refused, moveRefused, reloadRefused, closeRefused, retained, sourceKept, recovered: cm.state.doc.toString() !== original && /^>/m.test(cm.state.doc.toString()) };
                } finally { engine.markdown = markdown; }
            });
            assert.deepEqual(conflict, { refused: true, moveRefused: true, reloadRefused: true, closeRefused: true, retained: true, sourceKept: true, recovered: true });
            phase = 'Slides shared editing';
            await page.goto(`http://slides.localhost:${port}/`); await page.locator('.yavc-command-toolbar').waitFor();
            await action(page, 'slides', 'load', { text: '## Shared editing\n\n> Quoted text\nlazy continuation\n\n| A | B |\n| :--- | ---: |\n| Left | Right |\n' });
            await page.locator('[data-role="slide"] .ProseMirror blockquote').waitFor();
            await page.locator('[data-role="slide"] td').first().click(); await page.waitForFunction(() => yavcMdEditor._page.marks().table); await action(page, 'slides', 'table', { op: 'align-right' });
            await page.waitForFunction(() => [...document.querySelectorAll('[data-role="slide"] tr')].every(row => row.children[0].style.textAlign === 'right'));
            await page.screenshot({ path: path.join(evidence, engine + '-slides.png') });
            console.log(engine + ': Outline navigation, section history, rich quotes, GFM column alignment, narrow navigation and shared Slides editing passed');
        } catch (err) { await page.screenshot({ path: path.join(evidence, engine + '-failure.png') }).catch(() => {}); throw new Error(engine + ' ' + phase + ': ' + err.message, { cause: err }); }
        finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
