// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright through NODE_PATH and use a disposable local server.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Invalid local port');
const evidence = path.join(os.tmpdir(), 'yavc-slides-filmstrip'); fs.mkdirSync(evidence, { recursive: true });
async function sample(page) {
    return page.evaluate(async () => {
        const film = document.querySelector('.deck-film'), frames = [];
        for (let i = 0; i < 20; i++) {
            await new Promise(requestAnimationFrame);
            const thumb = film.querySelector('.deck-thumb-stage');
            frames.push({ width: film.clientWidth, height: film.clientHeight, scroll: film.scrollHeight, top: film.scrollTop, thumbnail: thumb.getBoundingClientRect().height });
        }
        return frames;
    });
}
async function stable(page, label, receipt) {
    const frames = await sample(page); receipt.push({ label, frames });
    assert.equal(new Set(frames.slice(8).map(f => JSON.stringify(f))).size, 1, label + ': filmstrip keeps changing after layout');
}
(async () => {
    for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        // Playwright hides Chromium scrollbars by default. That masks this
        // regression, which requires a classic scrollbar consuming width.
        const browser = await playwright[name].launch({ headless: true, ...(name === 'chromium' ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {}) });
        const receipt = [];
        let page;
        try {
            page = await browser.newPage({ viewport: { width: 3840, height: 2160 } });
            await page.goto(`http://slides.localhost:${port}/`);
            await page.locator('.yavc-command-toolbar').waitFor();
            const action = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.slides/' + name + '@1', input, { grant: 'all' }), { name, input });
            await action('load', { text: Array.from({ length: 16 }, (_, i) => '# Slide ' + (i + 1) + '\n\nFilmstrip stability.').join('\n\n---\n\n') });
            await stable(page, '4K initial open', receipt);
            // This was the observed failure, followed by the surrounding band.
            for (const height of [1680, 1600, 1640, 1660, 1700, 1720, 1760, 1800, 2160, 900]) {
                await page.setViewportSize({ width: 3840, height });
                await stable(page, '3840x' + height, receipt);
            }
            if (name === 'chromium') {
                const gutter = await page.locator('.deck-film').evaluate(f => f.offsetWidth - f.clientWidth);
                assert.ok(gutter > 5, 'Regression requires visible classic scrollbars');
            }
            await action('go', { index: 16 });
            await stable(page, 'last slide selected', receipt);
            assert.ok(await page.locator('.deck-film').evaluate(f => f.scrollTop > 0));
            const last = page.locator('.deck-film [data-slide="15"]');
            await last.focus(); await page.keyboard.press('Home');
            await page.waitForFunction(() => document.querySelector('.deck-film [data-slide="0"]').getAttribute('aria-selected') === 'true');
            await stable(page, 'keyboard returns to first slide', receipt);
            for (const height of [1440, 1120, 1080, 1040]) {
                await page.setViewportSize({ width: 2560, height });
                await stable(page, '2560x' + height, receipt);
            }
            await page.screenshot({ path: path.join(evidence, name + '-filmstrip.png') });
            await page.setViewportSize({ width: 3840, height: 1680 });
            await action('save', { path: '~/filmstrip.slides.md' });
            await page.reload(); await page.locator('.deck-thumb').first().waitFor();
            await stable(page, 'reload at former oscillation height', receipt);
            await page.goto(`http://localhost:${port}/?open=slides&top=slides`);
            await page.locator('.win[data-win="slides"] .yavc-command-toolbar').waitFor();
            await action('load', { text: Array.from({ length: 16 }, (_, i) => '# Slide ' + (i + 1)).join('\n\n---\n\n') });
            await page.locator('.win[data-win="slides"] [data-win-action="maximize"]').click();
            for (const height of [1640, 1680, 1720, 1760, 1800, 2160]) {
                await page.setViewportSize({ width: 3840, height });
                await stable(page, 'desktop 3840x' + height, receipt);
            }
            await page.screenshot({ path: path.join(evidence, name + '-desktop-filmstrip.png') });
            console.log(name + ': standalone/desktop filmstrip settles across 4K/2560 height boundaries, navigation and reload');
        } catch (err) {
            if (page) await page.screenshot({ path: path.join(evidence, name + '-failure.png') }).catch(() => {});
            throw err;
        } finally {
            fs.writeFileSync(path.join(evidence, name + '-frames.json'), JSON.stringify(receipt, null, 2));
            await browser.close();
        }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
