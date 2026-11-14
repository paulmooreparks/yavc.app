// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Typing three or more of - * or _ alone in a paragraph and pressing Enter makes a thematic break in Docs' page view, as it does in Markdown, and the caret goes on to a new paragraph
// below it. Two characters, or other text beside them, are left as typed. Real keys, against a built content package in an independent host:
//   node scripts/test-rule-input.cjs <artifact> [chromium firefox webkit]
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
                const text = async () => { await page.waitForTimeout(700); return (await call('document')).text; };
                const start = async source => { await call('set-text', { text: source }); await call('view', { mode: 'visual' }); await page.waitForFunction(() => document.querySelector('#document .ProseMirror').getAttribute('aria-busy') !== 'true'); await page.waitForTimeout(600); const first = page.locator('#document .ProseMirror p', { hasText: 'Before' }); await first.waitFor(); await first.click(); await page.waitForTimeout(200); await page.keyboard.press('End'); await page.keyboard.press('Enter'); };
                for (const [rule, typed] of [['---', '---'], ['***', '***'], ['_____', '_____']]) {
                    phase = 'type ' + typed;
                    await start('Before\n\nAfter\n');
                    await page.keyboard.type(typed); await page.keyboard.press('Enter');
                    await page.locator('#document .ProseMirror .pm-source[data-kind="rule"]').waitFor();
                    await page.keyboard.type('x');
                    assert.equal(await text(), 'Before\n\n' + rule + '\n\nx\n\nAfter\n', engine + ': ' + typed + ' and Enter make a rule, and typing goes on below it');
                    assert.equal(await page.locator('#document .ProseMirror hr').count(), 1, engine + ': the rule is drawn');
                    // One Undo takes the rule back to the three characters.
                    await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('ControlOrMeta+z');
                }
                phase = 'two characters are only text';
                await start('Before\n\nAfter\n');
                await page.keyboard.type('--'); await page.keyboard.press('Enter'); await page.keyboard.type('y');
                assert.match(await text(), /^Before\n\n\\?--\n\ny\n\nAfter\n$/, engine + ': two dashes make no rule');
                assert.equal(await page.locator('#document .ProseMirror hr').count(), 0);
                phase = 'other words beside them';
                await start('Before\n\nAfter\n');
                await page.keyboard.type('--- words'); await page.keyboard.press('Enter'); await page.keyboard.type('z');
                assert.equal(await page.locator('#document .ProseMirror hr').count(), 0, engine + ': three dashes with words after them make no rule');
                assert.deepEqual(errors, []);
                console.log(engine + ': three or more of - * or _ and Enter make a thematic break');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
