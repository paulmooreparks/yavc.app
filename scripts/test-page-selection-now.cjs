// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A command given to the page view acts on the selection the browser has at that moment (DESIGN.md, decision 160), and not on the one
// ProseMirror has taken from the browser's last selectionchange event, which is a task of its own and can be frames behind. The test
// selects a word on the page and gives Add Comment in the same turn of the script, so that no event has been delivered between them,
// which fails without the change every time. Needs a server on YAVC_CHROME_TEST_PORT.
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8461';
const source = '# Review sample\n\nSecond paragraph with other words.\n';
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true });
        let phase = 'startup';
        try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }), errors = [];
            page.setDefaultTimeout(25000);
            page.on('pageerror', error => errors.push(error.message));
            const call = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }), { name, input });
            await page.goto(`http://localhost:${port}/applet/docs`); await page.locator('.cm-content').waitFor({ state: 'attached' });
            await call('new', { path: '~/Selection.md', text: source }); await call('view', { mode: 'visual' });
            await page.locator('.ProseMirror h1').waitFor();
            for (const [where, word, from, to] of [['the heading', 'Review', 0, 6], ['the second paragraph', 'Second', 0, 6]]) {
                phase = 'select ' + word + ' and comment in one turn';
                // The page is first given the caret somewhere else, so that its own selection is not where the new one is.
                await page.waitForFunction(() => { const pm = document.querySelector('.ProseMirror'); return pm && pm.getAttribute('contenteditable') === 'true' && pm.getAttribute('aria-busy') !== 'true' && pm.textContent.includes('Second paragraph'); });
                await page.locator('.ProseMirror p').click();
                await page.evaluate(({ selector, from, to }) => {
                    const element = document.querySelector(selector), range = document.createRange(), selection = getSelection();
                    element.closest('.ProseMirror').focus();
                    range.setStart(element.firstChild, from); range.setEnd(element.firstChild, to);
                    selection.removeAllRanges(); selection.addRange(range);
                    // No event has been delivered since the selection was made.
                    window.commentTask = pudlCommands.run('review-comment', null, document.querySelector('[data-applet]'));
                }, { selector: where === 'the heading' ? '.ProseMirror h1' : '.ProseMirror p', from, to });
                await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('First comment.');
                await page.getByRole('button', { name: 'Add Comment', exact: true }).click();
                await page.waitForFunction(() => document.querySelectorAll('.ProseMirror .pm-critic').length > 0);
                const text = (await call('document')).text;
                assert.ok(text.includes('{==' + word + '==}{>>First comment.<<}'), engine + ': the comment is on ' + word + ' and not on the earlier selection: ' + JSON.stringify(text));
                await page.evaluate(() => pudlCommands.run('undo', null, document.querySelector('[data-applet]')));
                assert.equal((await call('document')).text, source, engine + ': undo takes the comment back');
            }
            assert.deepEqual(errors, []);
            console.log(engine + ': a command given in the turn of a selection acts on that selection');
        } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
