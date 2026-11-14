// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A link reference definition ([1]: https://example.org/ref) is not drawn as a line of text in Docs' page view, as the preview does not draw it, while the link that uses it works and the definition stays in the file. Against a built content package in an independent host:
//   node scripts/test-ref-definitions.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
(async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8')), allowed = new Set(manifest.files.map(f => f.path));
    const server = http.createServer(async (req, res) => {
        try {
            const u = new URL(req.url, 'http://localhost'); if (!u.pathname.startsWith(prefix)) return res.writeHead(404).end();
            const name = decodeURIComponent(u.pathname.slice(prefix.length)); if (!allowed.has(name)) return res.writeHead(404).end();
            res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream'); res.end(await fs.readFile(path.join(artifact, name)));
        } catch (error) { res.writeHead(500).end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const engine of process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit']) {
            const browser = await pw[engine].launch({ headless: true }); let phase = 'startup';
            try {
                const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = []; page.setDefaultTimeout(25000);
                page.on('pageerror', error => errors.push(error.message));
                await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs&plain`); await page.locator('#document .ProseMirror').waitFor();
                const call = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }), { name, input });
                const source = 'Before [one][1] and [two][two].\n\n[1]: https://example.org/one\n[two]: https://example.org/two "Two"\n\nAfter\n';
                for (const mode of ['visual', 'document']) {
                    phase = mode;
                    await call('set-text', { text: source }); await call('view', { mode });
                    await page.waitForFunction(() => document.querySelector('#document .ProseMirror').getAttribute('aria-busy') !== 'true'); await page.waitForTimeout(800);
                    const shown = await page.evaluate(() => Array.from(document.querySelectorAll('#document .ProseMirror .pm-source')).filter(d => d.offsetParent !== null && d.textContent.includes('https://example.org')).map(d => d.textContent));
                    assert.deepEqual(shown, [], engine + ' ' + mode + ': a link reference definition is not drawn as a line');
                    assert.equal((await call('document')).text, source, engine + ' ' + mode + ': the definitions are kept in the file');
                    assert.ok(await page.locator('#document .ProseMirror', { hasText: 'After' }).count(), engine + ' ' + mode + ': the rest is drawn');
                }
                phase = 'a definition that is only text';
                await call('set-text', { text: 'Before\n\n\\[1]: https://example.org/not\n\nAfter\n' }); await call('view', { mode: 'visual' });
                await page.waitForFunction(() => document.querySelector('#document .ProseMirror').getAttribute('aria-busy') !== 'true'); await page.waitForTimeout(800);
                assert.ok(await page.locator('#document .ProseMirror', { hasText: 'https://example.org/not' }).count(), engine + ': an escaped bracket is text, and is drawn');
                assert.deepEqual(errors, []);
                console.log(engine + ': link reference definitions are not drawn as lines');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
