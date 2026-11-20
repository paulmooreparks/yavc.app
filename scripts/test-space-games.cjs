// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), pw = require('playwright'), os = require('node:os'), path = require('node:path');
const port = process.env.YAVC_CHROME_TEST_PORT || '8477';
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true });
        try {
            for (const [slug, title, legacy] of [['driftwake', 'Driftwake', 'asteroids'], ['lantern-line', 'Lantern Line', 'invaders']]) {
                const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }), errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.goto(`http://localhost:${port}/applet/${slug}`);
                const root = page.locator(`[data-applet="${slug}"][data-applet-state="running"]`); await root.waitFor();
                assert.match(await page.title(), new RegExp(title));
                assert.equal(await root.locator('canvas').getAttribute('aria-label'), title + ': the game');
                const manifest = await page.evaluate(async slug => (await fetch(`/applets/${slug}/actions.json`)).json(), slug);
                assert.equal(manifest.id, 'splash.' + slug); assert.equal(manifest.title, title);
                const saveError = await page.evaluate(legacy => pudlHost.fs.writeText('~/.splash/scores.json', JSON.stringify({ [legacy]: [{ score: 12345, level: 3, date: '2026-11-20' }] })), legacy);
                assert.equal(saveError, null);
                await root.locator('[data-action="scores"]').click();
                await root.locator('[data-role="scores-dialog"] td').filter({ hasText: '12345' }).waitFor();
                await root.locator('[data-action="close-scores"]').click();
                await root.locator('[data-action="start"]').click(); assert.equal(await root.getAttribute('data-splash-state'), 'playing');
                await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); await page.keyboard.press('p');
                assert.equal(await root.getAttribute('data-splash-state'), 'paused');
                await page.screenshot({ path: path.join(os.tmpdir(), 'yavc-' + slug + '-' + engine + '.png') });
                await root.locator('[data-action="help"]').click(); await root.locator('[data-role="help-dialog"]').waitFor({ state: 'visible' });
                assert.equal(await root.locator('[data-role="help-dialog"] h3').textContent(), title);
                await root.locator('[data-action="close-help"]').click();
                const redirect = await page.request.get(`http://localhost:${port}/${legacy}`, { maxRedirects: 0 });
                assert.equal(redirect.status(), 308); assert.equal(redirect.headers().location, '/' + slug);
                await page.goto(`http://localhost:${port}/help/${slug}`); assert.ok((await page.textContent('body')).includes(title));
                assert.deepEqual(errors, []); await page.close();
            }
            console.log(engine + ': renamed games mount, start, accept controls, pause and expose their new actions, dialogs, help and legacy path redirects.');
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
