// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A click on a shape of a D2 diagram that is drawn again between the press and the release still selects the shape (DESIGN.md, decision
// 158). The D2 client draws again by replacing what the diagram's place holds, which takes the shape layer out of the page for a moment,
// and the layer used to hold the captured pointer, so the release never arrived. Supply Playwright through NODE_PATH. Use disposable
// localhost data.
const { strict: assert } = require('node:assert');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Use a disposable local port.');
async function run(engine) {
    const browser = await playwright[engine].launch(), page = await browser.newPage({ viewport: { width: 1300, height: 800 } }), errors = [];
    page.setDefaultTimeout(25000);
    page.on('pageerror', e => errors.push(e.message));
    const action = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
    let phase = 'startup';
    try {
        await page.goto(`http://diagrams.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
        await action('new', { kind: 'd2', text: 'a -> b' });
        // A shape can be pressed only once the drawing has been made and its layer is back, so each step waits for that.
        // The app can draw a new diagram a second time a moment after the first (the draw delay is 300 ms), and nothing can be pressed while it does, so the wait is for a drawing that stays.
        const settled = () => page.waitForFunction(() => document.querySelector('[data-role="state"]').textContent === 'Drawn' && document.querySelector('.dg-layer') && document.querySelector('.dg-layer').isConnected && document.querySelectorAll('.dg-hit-shape').length > 0);
        const drawn = async () => { await settled(); await page.waitForTimeout(700); await settled(); };
        await drawn();
        const shape = page.locator('.dg-hit-shape').first(); await shape.waitFor();
        phase = 'a press, a redraw, a release';
        const box = await shape.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        await page.mouse.move(x, y); await page.mouse.down();
        // The D2 client draws again by replacing what the place holds, so for the time a drawing takes the picture and the layer are
        // both out of the page, and the release comes then. They come back as the new picture is put in.
        await page.evaluate(() => {
            const layer = document.querySelector('.dg-layer'), place = layer.parentElement, img = place.querySelector(':scope > img.sc-diagram-image');
            window.__held = { place, img }; layer.remove(); img.remove();
        });
        await page.mouse.up();
        await page.evaluate(() => { window.__held.place.prepend(window.__held.img); });
        await page.waitForFunction(() => document.querySelector('.dg-layer') && document.querySelector('.dg-layer').isConnected);
        await page.locator('.dg-hit-shape.is-selected').waitFor();
        assert.equal(await page.locator('.dg-inspector-fields:not([disabled])').count(), 1, engine + ': the inspector shows the selected shape');
        phase = 'a move drag while the drawing is replaced';
        const text = async () => (await action('diagram')).text;
        const hold = () => page.evaluate(() => { const layer = document.querySelector('.dg-layer'), place = layer.parentElement, img = place.querySelector(':scope > img.sc-diagram-image'); window.__held = { place, img }; layer.remove(); img.remove(); });
        const back = async () => { await page.evaluate(() => { window.__held.place.prepend(window.__held.img); }); await page.waitForFunction(() => document.querySelector('.dg-layer') && document.querySelector('.dg-layer').isConnected); };
        const center = async key => { const b = await page.evaluate(k => { const hit = Array.from(document.querySelectorAll('.dg-hit-shape')).find(e => e.__key === k && e.getBoundingClientRect().width > 0 && e.isConnected && e.closest('.dg-layer').isConnected); const r = hit.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, key); return b; };
        const stuck = () => page.evaluate(() => document.querySelector('.dg-editable').classList.contains('dg-dragging'));
        await action('new', { kind: 'd2', text: 'a\nb' }); await page.locator('.dg-hit-shape').nth(1).waitFor(); await drawn();
        const source = await text();
        const drag = async cancel => {
            const from = await center('a'); await page.mouse.click(from.x, from.y);        // select a, so that a press on it can begin a move
            await page.locator('.dg-hit-shape.is-selected').waitFor();
            await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 12, from.y + 12, { steps: 2 });
            await hold(); await page.mouse.move(from.x + 30, from.y + 30, { steps: 2 }); await back();
            const to = await center('b'); await page.mouse.move(to.x, to.y, { steps: 3 });
            await hold();
            if (cancel) { await page.locator('.dg-stage').focus(); await page.keyboard.press('Escape'); await page.mouse.up(); } else { await page.mouse.up(); }
            await back();
            assert.equal(await stuck(), false, engine + ': no drag is left running');
        };
        await drag(true);
        assert.equal(await text(), source, engine + ': a cancelled drag changed the text');
        await drag(false);
        let moved = await text(); for (let k = 0; k < 40 && moved === source; k++) { await page.waitForTimeout(100); moved = await text(); }
        assert.notEqual(moved, source, engine + ': the drag moved the shape');
        assert.equal((moved.match(/a/g) || []).length, 1, engine + ': the shape is in the text once ' + JSON.stringify(moved));
        // One edit: a single undo restores the text.
        await page.evaluate(() => pudlCommands.run('undo', null, document.querySelector('[data-applet]')));
        assert.equal(await text(), source, engine + ': one undo took the drag back, so it was one edit');
        assert.deepEqual(errors, []);
        console.log(engine + ': a click on a shape that is drawn again between the press and the release selects it');
    } catch (err) { console.error(engine, phase, errors); throw err; } finally { await browser.close(); }
}
(async () => { for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) { await run(engine); } })().catch(err => { console.error(err); process.exitCode = 1; });
