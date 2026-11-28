// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Control+End and Control+Home reach the end and the start of a document in Docs' page view when a table is the last or the first block, as they do when it is not, in every browser. Firefox kept the caret in the table's last or first cell, so there was no way to type after or before the table. Real keys, against a built content package in an independent host:
//   node scripts/test-doc-ends.cjs <artifact> [chromium firefox webkit]
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
                const table = '| A | B |\n| --- | --- |\n| one | two |\n| three | four |\n';
                const start = async (source, mode, click) => {
                    await call('set-text', { text: source }); await call('view', { mode });
                    await page.waitForFunction(() => document.querySelector('#document .ProseMirror').getAttribute('aria-busy') !== 'true'); await page.waitForTimeout(800);
                    const target = page.locator('#document .ProseMirror ' + click.selector, { hasText: click.text }).first(); await target.waitFor(); await target.click(); await page.waitForTimeout(250);
                };
                const text = async () => { await page.waitForTimeout(700); return (await call('document')).text; };
                for (const mode of ['visual', 'document']) {
                    phase = mode + ': a table last';
                    await start('Before\n\n' + table, mode, { selector: 'td', text: 'four' });
                    await page.keyboard.press('Control+End'); await page.keyboard.type('X');
                    assert.equal(await text(), 'Before\n\n' + table + '\nX\n', engine + ' ' + mode + ': Control+End goes after a last table, and typing goes there');
                    phase = mode + ': a table first';
                    await start(table + '\nAfter\n', mode, { selector: 'td', text: 'one' });
                    await page.keyboard.press('Control+Home'); await page.keyboard.type('Y');
                    assert.equal(await text(), 'Y\n\n' + table + '\nAfter\n', engine + ' ' + mode + ': Control+Home goes before a first table, and typing goes there');
                    phase = mode + ': a paragraph last';
                    await start('Before\n\nLast words\n', mode, { selector: 'p', text: 'Before' });
                    await page.keyboard.press('Control+End'); await page.keyboard.type('Z');
                    assert.equal(await text(), 'Before\n\nLast wordsZ\n', engine + ' ' + mode + ': Control+End still goes to the end of the last paragraph');
                    phase = mode + ': a paragraph first';
                    await page.keyboard.press('Control+Home'); await page.keyboard.type('W');
                    assert.equal(await text(), 'WBefore\n\nLast wordsZ\n', engine + ' ' + mode + ': Control+Home still goes to the start of the first paragraph');
                }
                assert.deepEqual(errors, []);
                console.log(engine + ': Control+End and Control+Home reach the ends of the document, past a table');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
