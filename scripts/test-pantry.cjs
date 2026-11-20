// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), pw = require('playwright'), path = require('node:path'), os = require('node:os');
const port = process.env.YAVC_CHROME_TEST_PORT || '8477';
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } }), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`http://localhost:${port}/applet/pantry`);
            const root = page.locator('[data-applet="pantry"][data-applet-state="running"]');
            await root.waitFor(); await root.locator('[data-action="start"]').click();
            await page.waitForFunction(() => Number(document.querySelector('[data-applet="pantry"]').dataset.splashScore) >= 10);
            await page.keyboard.press('p'); assert.equal(await root.getAttribute('data-splash-state'), 'paused');
            const mouse = await page.evaluate(() => ({ ...splash.pantry.game().mouse }));
            await page.waitForTimeout(100);
            assert.deepEqual(await page.evaluate(() => ({ ...splash.pantry.game().mouse })), mouse);
            await root.locator('[data-action="help"]').click();
            await root.locator('[data-role="help-dialog"]').waitFor({ state: 'visible' });
            const help = await root.locator('[data-role="help-dialog"]').textContent();
            for (const word of ['mouse', 'crumb', 'cats', 'bells']) assert.ok(help.includes(word));
            await root.locator('[data-action="close-help"]').click();
            await page.keyboard.press('p'); assert.equal(await root.getAttribute('data-splash-state'), 'playing');
            await page.keyboard.press('ArrowUp');
            await page.waitForFunction(() => splash.pantry.game().mouse.y < 14);
            await page.keyboard.press('p');
            await page.screenshot({ path: path.join(os.tmpdir(), 'yavc-pantry-motion-' + engine + '.png') });
            const canvas = root.locator('canvas');
            const painted = await canvas.evaluate(canvas => {
                const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                const first = Array.from(data.slice(0, 3)).join(','); let different = 0;
                for (let i = 0; i < data.length; i += 4) if (Array.from(data.slice(i, i + 3)).join(',') !== first) different++;
                return different;
            });
            assert.ok(painted > 1000, 'The pantry and characters are painted');
            await page.setViewportSize({ width: 390, height: 844 });
            assert.ok((await root.boundingBox()).width <= 390);
            await root.locator('[data-action="scores"]').click();
            await root.locator('[data-role="scores-dialog"]').waitFor({ state: 'visible' });
            await root.locator('[data-action="close-scores"]').click();
            assert.deepEqual(errors, []);
            console.log(engine + ': Pantry Raid starts, eats crumbs, buffers a turn, pauses, paints its own maze and opens its dialogs.');
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
