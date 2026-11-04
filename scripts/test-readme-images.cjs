// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright through NODE_PATH. Remote images are mocked explicitly.
const { strict: assert } = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Use a disposable local port.');
const source = fs.readFileSync(path.join(__dirname, '../apps/md-editor/test/fixtures/readme-images.md'), 'utf8');
const evidence = path.join(os.tmpdir(), 'yavc-readme-images'); fs.mkdirSync(evidence, { recursive: true });
const picture = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#486888"/></svg>`;
async function run(engine) {
    const browser = await playwright[engine].launch(), page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const action = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.editor/' + name + '@1', input, { grant: 'all' }), { name, input });
    try {
        await page.route('https://plausible.io/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await page.route('**/api/admin/editor/shortcodes', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"shortcodes":[]}' }));
        await page.route('https://img.shields.io/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: picture(100, 20) }));
        await page.route('https://example.invalid/right.svg', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: picture(100, 20) }));
        await page.route('**/mock-lantern.svg', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: picture(256, 256) }));
        await page.goto(`http://editor.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
        await action('new', { path: '~/readme-images.md', text: source }); await action('view', { mode: 'preview' });
        const badges = page.locator('.doc-page a > img[src^="https://img.shields.io/"]');
        await badges.first().waitFor(); assert.equal(await badges.count(), 6);
        await page.waitForFunction(() => [...document.querySelectorAll('.doc-page a > img[src^="https://img.shields.io/"]')].every(i => i.complete && i.naturalHeight === 20));
        assert.ok(await badges.evaluateAll(all => all.every(i => i.getBoundingClientRect().width <= 101 && i.closest('a').getAttribute('href'))));
        const lantern = page.locator('.doc-page img[data-attachment="lantern.png"]');
        assert.equal(await lantern.getAttribute('align'), 'right');
        // The host's existing attachment resolver is outside this fixture.
        // Supply only the bytes after testing the generated attachment markup.
        await lantern.evaluate(i => { i.src = '/mock-lantern.svg'; i.classList.remove('ed-missing-image'); });
        await page.waitForFunction(() => document.querySelector('.doc-page img[data-attachment="lantern.png"]').naturalHeight === 256);
        assert.equal(await lantern.evaluate(i => getComputedStyle(i).float), 'right');
        const imageBox = await lantern.boundingBox(), next = await page.getByRole('heading', { name: 'The next section', exact: true }).boundingBox();
        assert.ok(next.y >= imageBox.y + imageBox.height - 1);
        const own = page.getByAltText('Own line', { exact: true });
        assert.equal(await own.evaluate(i => getComputedStyle(i.closest('.right')).textAlign), 'right');
        await page.screenshot({ path: path.join(evidence, engine + '-preview.png') });
        await action('view', { mode: 'visual' }); await action('view', { mode: 'text' });
        assert.equal((await action('document')).text, source);
        assert.deepEqual(errors, []);
        console.log(engine + ': linked badge images, local right-alignment, clearing and unchanged Markdown passed');
    } catch (err) { await page.screenshot({ path: path.join(evidence, engine + '-failure.png') }); throw err; }
    finally { await browser.close(); }
}
(async () => { for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']) await run(engine); })().catch(e => { console.error(e); process.exitCode = 1; });
