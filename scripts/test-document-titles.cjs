// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), pw = require('playwright'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const port = process.env.YAVC_CHROME_TEST_PORT || '8453', evidence = path.join(os.tmpdir(), 'yavc-document-title-evidence');
fs.mkdirSync(evidence, { recursive: true });
const action = (p, app, name, input = {}) => p.evaluate(({app, name, input}) => pudlActions.run('yavc.' + app + '/' + name + '@1', input, {grant: 'all'}), {app, name, input});
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({headless: true});
        try {
            for (const app of ['editor', 'docs', 'slides', 'diagrams']) {
                const p = await browser.newPage({viewport: {width: 1400, height: 1000}}), errors = [];
                p.setDefaultTimeout(20000); p.on('pageerror', error => errors.push(error.message));
                try {
                    await p.goto(`http://localhost:${port}/?open=${app}&top=${app}`);
                    await p.locator(`[data-applet="${app}"][data-applet-state="running"]`).waitFor();
                    const win = p.locator(`.win[data-win="${app}"]`), title = win.locator('.win-title'), tabs = win.locator('.doc-tabs');
                    const label = app[0].toUpperCase() + app.slice(1), ext = app === 'editor' ? '.txt' : app === 'slides' ? '.slides.md' : app === 'diagrams' ? '.canvas' : '.docs.md';
                    const source = app === 'diagrams' ? '{"nodes":[],"edges":[]}' : '# Title test\n\nEditable body.\n';
                    const first = 'Title-one' + ext, second = 'Title-two' + ext, renamed = 'Title-renamed' + ext;
                    const create = name => action(p, app, app === 'slides' ? 'load' : 'new', app === 'diagrams' ? {kind: 'canvas', text: source} : {path: '~/' + name, text: source});
                    const opened = await create(first);
                    await action(p, app, 'save', {path: '~/' + first});
                    // Remove the clean startup document, if the application retained it.
                    if (opened.index > 1) await action(p, app, 'close', {index: 1});
                    await p.waitForFunction(({app, expected}) => document.querySelector(`.win[data-win="${app}"] .win-title`).textContent === expected, {app, expected: first + ' \u00b7 ' + label});
                    assert.equal(await tabs.isVisible(), false);
                    if (app === 'docs' || app === 'slides') {
                        const heading = win.locator('.ProseMirror h1').first(); await heading.click(); await p.keyboard.press('End'); await p.keyboard.type(' changed');
                    } else if (app === 'editor') {
                        await win.locator('.cm-content').click(); await p.keyboard.type('changed ');
                    } else await action(p, app, 'set-text', {text: '{"nodes":[{"id":"n","type":"text","x":0,"y":0,"width":100,"height":60,"text":"Changed"}],"edges":[]}'});
                    await p.waitForFunction(app => document.querySelector(`.win[data-win="${app}"] .win-title`).textContent.startsWith('\u25cf '), app);
                    assert.match(await title.getAttribute('aria-label'), /Unsaved changes/);
                    assert.match(await title.getAttribute('title'), /Title-one.*Unsaved changes/);
                    await p.screenshot({path: path.join(evidence, engine + '-' + app + '-single-dirty.png')});
                    if (app === 'docs' || app === 'slides') {
                        // Verify the pending rich marker first, then synchronize through the public view operation.
                        await action(p, app, 'view', {mode: 'text'});
                        await p.waitForFunction(async app => {
                            const result = await pudlActions.run('yavc.' + app + '/' + (app === 'docs' ? 'document' : 'deck') + '@1', {}, {grant: 'all'});
                            return result.modified;
                        }, app);
                    }
                    await create(second); await action(p, app, 'save', {path: '~/' + second});
                    assert.equal(await tabs.isVisible(), true);
                    assert.equal(await title.textContent(), second + ' \u00b7 ' + label);
                    assert.equal(await tabs.locator('[role="tab"]').first().locator('.doc-tab-dirty').count(), 1);
                    await tabs.locator('[role="tab"]').first().click();
                    await p.waitForFunction(({app, expected}) => document.querySelector(`.win[data-win="${app}"] .win-title`).textContent === expected, {app, expected: '\u25cf ' + first + ' \u00b7 ' + label});
                    assert.equal(await title.textContent(), '\u25cf ' + first + ' \u00b7 ' + label);
                    await action(p, app, 'save', {path: '~/' + renamed});
                    assert.equal(await title.textContent(), renamed + ' \u00b7 ' + label);
                    assert.doesNotMatch(await title.getAttribute('aria-label'), /Unsaved/);
                    await action(p, app, 'close', {index: 2});
                    assert.equal(await tabs.isVisible(), false);
                    assert.equal(await title.textContent(), renamed + ' \u00b7 ' + label);
                    assert.deepEqual(errors, []);
                    console.log(engine + ': ' + label + ' active filename, single-document dirty title, rich/source edits, inactive dirty tab, switch, Save As and close passed');
                } catch (error) {
                    console.error(engine, app, await p.locator('.win-title').allTextContents(), await p.locator('.doc-tabs').innerHTML());
                    await p.screenshot({path: path.join(evidence, engine + '-' + app + '-failure.png')});
                    throw error;
                } finally { await p.close(); }
            }
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
