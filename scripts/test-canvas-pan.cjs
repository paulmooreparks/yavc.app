// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Panning a canvas that is larger than its pane (DESIGN.md, decision 156): the view has scroll bars that follow the camera and move it,
// and Space with a drag, or a middle-button drag, pans from any point, over a shape too, without changing the document. The Pan tool is on
// the toolbar as a toggle. Supply Playwright through NODE_PATH. Use disposable localhost data.
const { strict: assert } = require('node:assert');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Use a disposable local port.');
async function run(engine) {
    const browser = await playwright[engine].launch(), page = await browser.newPage({ viewport: { width: 1300, height: 800 } }), errors = [];
    page.setDefaultTimeout(25000);
    page.on('pageerror', e => errors.push(e.message));
    const action = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.diagrams/' + name + '@1', input, { grant: 'all' }), { name, input });
    const text = async () => (await action('diagram')).text;
    const idle = () => page.waitForFunction(() => document.querySelector('.dg-cv-editor') && !document.querySelector('.sc-diagram-stale'));
    const place = page.locator('.dg-cv-editor');
    // How far the last column is from being wholly inside the pane, in pixels; zero or less when it is.
    const overhang = id => page.evaluate(id => {
        const p = document.querySelector('.dg-cv-editor').getBoundingClientRect(), h = document.querySelector('.dg-cv-hit[data-id="' + id + '"]').getBoundingClientRect();
        const bar = Math.max(0, document.querySelector('.dg-cv-editor').clientWidth - (document.querySelector('.dg-cv-scroll') ? document.querySelector('.dg-cv-scroll').clientWidth : 0));
        return h.right - (p.right - bar);
    }, id);
    const leftOf = id => page.evaluate(id => document.querySelector('.dg-cv-hit[data-id="' + id + '"]').getBoundingClientRect().left - document.querySelector('.dg-cv-editor').getBoundingClientRect().left, id);
    // Brings the first column to the left of the pane by panning, so that each way of panning begins in the same place.
    const toStart = async first => { await action('canvas-view', { op: 'pan', dx: Math.round(await leftOf(first) - 24), dy: 0 }); await idle(); };
    let phase = 'startup';
    try {
        await page.goto(`http://diagrams.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
        await action('new', { kind: 'canvas', style: 'blank' });
        const keys = [];
        for (let i = 0; i < 7; i++) { keys.push((await action('canvas-edit', { op: 'create', x: i * 420, y: (i % 2) * 140, text: 'Team ' + (i + 1) })).key); }
        await action('canvas-edit', { op: 'create', x: 0, y: 1500, text: 'Below' });
        const first = keys[0], last = keys[6];
        await action('canvas-view', { op: 'actual' }); await action('canvas-view', { op: 'zoom', factor: 2 }); await idle();
        const source = await text();
        assert.ok(await overhang(last) > 100, engine + ': the last column is beyond the pane at 200 %');

        phase = 'the scroll bars';
        assert.equal(await place.locator('.dg-cv-scroll').count(), 1, engine + ': the view has a scrolling box');
        const bars = () => page.evaluate(() => { const s = document.querySelector('.dg-cv-scroll'); return { left: s.scrollLeft, top: s.scrollTop, across: s.scrollWidth - s.clientWidth, down: s.scrollHeight - s.clientHeight }; });
        let b = await bars();
        assert.ok(b.across > 100 && b.down > 0, engine + ': the drawing is wider and taller than the pane, so both bars have room ' + JSON.stringify(b));
        // The camera drives the bars: a wheel pan moves them, and so do Fit and zoom.
        await toStart(first); const atStart = (await bars()).left;
        const pane = await place.boundingBox(); await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2); await page.mouse.wheel(300, 0); await page.waitForFunction(s => document.querySelector('.dg-cv-scroll').scrollLeft > s + 100, atStart);
        await toStart(first);
        // The bars drive the camera.
        await page.locator('.dg-cv-scroll').evaluate(e => { e.scrollLeft = e.scrollWidth; });
        await page.waitForFunction(id => { const p = document.querySelector('.dg-cv-editor').getBoundingClientRect(), h = document.querySelector('.dg-cv-hit[data-id="' + id + '"]').getBoundingClientRect(); return h.right <= p.right + 1; }, last);
        assert.ok(await overhang(last) <= 1, engine + ': scrolling to the end shows the last column');
        assert.equal(await text(), source, engine + ': scrolling changed the document');
        await action('canvas-view', { op: 'fit' }); await idle();
        b = await bars(); assert.ok(b.across <= 1 && b.down <= 1, engine + ': Fit leaves nothing to scroll ' + JSON.stringify(b));
        await action('canvas-view', { op: 'actual' }); await action('canvas-view', { op: 'zoom', factor: 2 }); await idle();

        phase = 'Tab follows the selection';
        await place.click({ position: { x: 20, y: 400 } }); await toStart(first);
        for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); }
        await page.waitForFunction(() => document.querySelector('.dg-cv-scroll').scrollLeft > 100);
        assert.ok(await page.evaluate(id => { const p = document.querySelector('.dg-cv-editor').getBoundingClientRect(), h = document.querySelector('.dg-cv-hit[data-id="' + id + '"]').getBoundingClientRect(); const c = (h.left + h.right) / 2; return c > p.left && c < p.right; }, last), engine + ': Tab to the last column brings its middle into the pane');
        assert.equal(await text(), source);

        phase = 'Space and drag, over a shape';
        const drag = async (button, hold) => {
            await toStart(first);
            for (let n = 0; n < 80 && (await overhang(last)) > 1; n++) {
                // Begin over the shape nearest the middle of the pane, or over empty canvas when none is in view.
                const at = await page.evaluate(() => {
                    const p = document.querySelector('.dg-cv-editor').getBoundingClientRect();
                    const seen = Array.from(document.querySelectorAll('.dg-cv-hit')).map(h => { const r = h.getBoundingClientRect(); return { l: Math.max(r.left, p.left + 10), r: Math.min(r.right, p.right - 10), t: Math.max(r.top, p.top + 10), b: Math.min(r.bottom, p.bottom - 10) }; }).filter(r => r.r - r.l > 20 && r.b - r.t > 20);
                    const middle = (p.left + p.right) / 2;
                    seen.sort((a, c) => Math.abs((a.l + a.r) / 2 - middle) - Math.abs((c.l + c.r) / 2 - middle));
                    return seen[0] ? { x: (seen[0].l + seen[0].r) / 2, y: (seen[0].t + seen[0].b) / 2 } : { x: middle, y: (p.top + p.bottom) / 2 };
                });
                await page.mouse.move(at.x, at.y);
                if (hold) { await page.keyboard.down('Space'); }
                await page.mouse.down({ button });
                const far = Math.max(40, Math.min(300, at.x - 15)); // The pointer stays inside the window, which Firefox needs to deliver the release.
                await page.mouse.move(at.x - far / 2, at.y - 10, { steps: 3 }); await page.mouse.move(at.x - far, at.y - 10, { steps: 3 });
                await page.mouse.up({ button });
                if (hold) { await page.keyboard.up('Space'); }
            }
            await idle();
        };
        await page.locator('.dg-stage').focus(); await page.keyboard.press('Escape'); assert.equal(await place.locator('.dg-cv-ring').count(), 0);
        await drag('left', true);
        assert.ok(await overhang(last) <= 1, engine + ': Space and drag reaches the last column ' + await overhang(last) + ' ' + JSON.stringify(await bars()));
        assert.equal(await text(), source, engine + ': Space and drag changed the document');
        assert.equal(await place.locator('.dg-cv-ring').count(), 0, engine + ': Space and drag selected nothing');

        phase = 'a middle-button drag, over a shape';
        await drag('middle', false);
        assert.ok(await overhang(last) <= 1, engine + ': a middle drag reaches the last column');
        assert.equal(await text(), source, engine + ': a middle drag changed the document');
        assert.equal(await place.locator('.dg-cv-ring').count(), 0, engine + ': a middle drag selected nothing');

        phase = 'focus on the scroll bars';
        assert.equal(await page.evaluate(() => { document.querySelector('.dg-cv-scroll').focus(); return document.activeElement.classList.contains('dg-stage'); }), true, engine + ': focus in the scrolling box goes to the stage, which hears Space');
        phase = 'Space in the label editor';
        await action('canvas-view', { op: 'select', key: first, kind: 'node' }); await page.locator('.dg-stage').focus(); await page.keyboard.press('Enter');
        const field = page.getByLabel('Text (Markdown)', { exact: true }); await field.waitFor();
        const camera = (await bars()).left; await field.fill(''); await page.keyboard.type('a b');
        assert.equal(await field.inputValue(), 'a b', engine + ': Space was typed into the label');
        assert.equal((await bars()).left, camera, engine + ': Space in the label did not pan');
        await page.keyboard.press('Escape');

        phase = 'the Pan tool on the toolbar';
        const pan = page.getByRole('button', { name: /^Pan/ }).first();
        await pan.waitFor();
        assert.equal(await pan.getAttribute('aria-pressed'), 'false', engine + ': the Pan button is not pressed at first');
        await pan.click(); assert.equal(await pan.getAttribute('aria-pressed'), 'true', engine + ': the Pan button is pressed after a click');
        await pan.click(); assert.equal(await pan.getAttribute('aria-pressed'), 'false', engine + ': a second click releases it');
        assert.deepEqual(errors, []);
        console.log(engine + ': a large canvas has scroll bars, pans with Space and a middle drag over a shape, and has Pan on the toolbar');
    } catch (err) { console.error(engine, phase, errors); throw err; } finally { await browser.close(); }
}
(async () => { for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) { await run(engine); } })().catch(err => { console.error(err); process.exitCode = 1; });
