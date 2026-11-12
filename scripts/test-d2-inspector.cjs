// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The Inspector of a D2 diagram: a change shows while the keyboard is in it, the field the person is in is kept, and the keyboard goes
// to the heading when its field goes. Supply Playwright through NODE_PATH and run against disposable localhost data.
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8459';
const action = (p, name, input = {}) => p.evaluate(({ name, input }) => pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
const command = (p, id) => p.evaluate(id => pudlCommands.run(id, null, document.querySelector('[data-applet="diagrams"]')), id);
/* A change to the text made by something other than the Inspector, with no move of the keyboard. */
const write = (p, text) => p.evaluate(async text => { const cm = (await yavcMdEditor.libs()).EditorView.findFromDOM(document.querySelector('.cm-content')); cm.dispatch({ changes: { from: cm.state.doc.length, insert: text } }); }, text);
const source = 'a: Alpha\nb: Beta\na -> b: link\n';
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const b = await pw[engine].launch({ headless: true }), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
        p.setDefaultTimeout(40000); p.on('pageerror', e => errors.push(e.message));
        let phase = 'startup';
        try {
            await p.goto(`http://diagrams.localhost:${port}/`); await p.locator('.cm-content').waitFor();
            await action(p, 'new', { text: source, kind: 'd2' }); await action(p, 'view', { mode: 'split' }); await command(p, 'toggle-outline');
            const item = key => p.locator(`[data-d2-outline="${key}"]`), field = key => p.locator(`.dg-inspector [data-set="${key}"]`);
            /* A click that does not move the keyboard, as a selection made by something other than the pointer does. */
            const choose = key => p.evaluate(key => document.querySelector(`[data-d2-outline="${key}"]`).click(), key);
            await item('a').waitFor(); await item('a').click(); await field('a').waitFor();

            phase = 'a change made elsewhere shows with the keyboard in the Inspector';
            await field('a').focus();
            await p.evaluate(() => { window.keptLabel = document.activeElement; });
            await write(p, 'a.shape: oval\n');
            await p.waitForFunction(() => document.querySelector('.dg-inspector [data-set="a.shape"]').value === 'oval');
            assert.equal(await p.evaluate(() => document.activeElement === window.keptLabel && window.keptLabel.isConnected), true, 'the field the keyboard was in is the same element');

            phase = 'the text being typed is kept while something else changes';
            await p.keyboard.press('End'); await p.keyboard.type('XY');
            await write(p, 'a.style.fill: "#ff0000"\n');
            await p.waitForFunction(() => document.querySelector('.dg-inspector [data-set="a.style.fill"]').value === '#ff0000');
            assert.equal(await field('a').inputValue(), 'AlphaXY');
            assert.equal(await p.evaluate(() => document.activeElement === window.keptLabel && window.keptLabel.selectionStart), 7, 'the caret is where it was');

            phase = 'the keyboard goes to the heading when its field goes';
            await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace');
            await field('a.shape').focus();
            /* The outline answers a choice only once it matches the text, so the drawing has to have caught up with what was written. */
            await p.waitForFunction(() => !document.querySelector('.sc-diagram-stale'));
            for (let tries = 0; tries < 40 && await p.locator('[data-inspector="item"] > .dg-inspector-title').innerText() !== 'Connection'; tries++) { await choose('(a -> b)[0]'); await p.waitForTimeout(250); }
            assert.equal(await p.locator('[data-inspector="item"] > .dg-inspector-title').innerText(), 'Connection');
            assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.textContent), 'Connection');
            assert.equal(await p.locator('[data-inspector="item"] > .dg-inspector-title').getAttribute('tabindex'), '-1');

            assert.deepEqual(errors, []);
            console.log(engine + ' D2 Inspector: a change shows with the keyboard inside, the typed text and caret are kept, and the keyboard goes to the heading.');
        } catch (error) { error.message = engine + ' (' + phase + '): ' + error.message; throw error; } finally { await b.close(); }
    }
})().catch(error => { console.error(error); process.exit(1); });
