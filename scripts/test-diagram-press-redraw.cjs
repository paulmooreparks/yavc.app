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
        assert.deepEqual(errors, []);
        console.log(engine + ': a click on a shape that is drawn again between the press and the release selects it');
    } catch (err) { console.error(engine, phase, errors); throw err; } finally { await browser.close(); }
}
(async () => { for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) { await run(engine); } })().catch(err => { console.error(err); process.exitCode = 1; });
