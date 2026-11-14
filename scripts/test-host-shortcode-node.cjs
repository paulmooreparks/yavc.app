// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A host's block shortcode is one node of the page (docs/host-shortcodes-contract.md): the keys that delete it take the whole of it, never a part of its
// source, one Undo puts all of it back, and it is not lost by laying the pages out again. Real keys in the Document view, against a host that draws
// {{gktoc}} (scripts/fixtures/host-flow.js). Run against a built content package in an independent host:
//   node scripts/test-host-shortcode-node.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const ORIGINAL = '# Node\n\nBefore.\n\n{{gktoc}}\n\nAfter.\n';
(async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8')), allowed = new Set(manifest.files.map(f => f.path)), addon = await fs.readFile(path.join(__dirname, 'fixtures/host-flow.js'), 'utf8');
    const server = http.createServer(async (req, res) => {
        try {
            const u = new URL(req.url, 'http://localhost'); if (!u.pathname.startsWith(prefix)) return res.writeHead(404).end();
            const name = decodeURIComponent(u.pathname.slice(prefix.length)); if (!allowed.has(name)) return res.writeHead(404).end();
            let body = await fs.readFile(path.join(artifact, name)); if (name === 'workspace-lab/host.js') body = Buffer.from(body + '\n' + addon);
            res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream'); res.end(body);
        } catch (error) { res.writeHead(500).end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const engine of process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit']) {
            const browser = await pw[engine].launch({ headless: true }), p = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = []; p.setDefaultTimeout(30000);
            p.on('pageerror', e => errors.push(e.message)); let phase = 'startup';
            const text = async () => (await p.evaluate(() => pudlActions.run('yavc.docs/document@1', {}, { grant: 'all' }))).text;
            const settled = async () => { await p.waitForFunction(() => document.querySelector('#document [data-host-shortcode="gktoc"][data-host-drawn]')); await p.waitForTimeout(1500); };
            try {
                await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`); await p.locator('#document .ProseMirror').waitFor();
                await p.evaluate(() => pudlActions.run('yavc.docs/view@1', { mode: 'document' }, { grant: 'all' }));
                await p.evaluate(t => pudlActions.run('yavc.docs/set-text@1', { text: t }, { grant: 'all' }), ORIGINAL);
                await settled(); assert.equal(await text(), ORIGINAL);
                const after = p.locator('#document .ProseMirror p', { hasText: /^After\./ });
                for (const key of ['Backspace', 'Delete']) {
                    phase = key + ' takes the whole shortcode';
                    await p.evaluate(t => pudlActions.run('yavc.docs/set-text@1', { text: t }, { grant: 'all' }), ORIGINAL); await settled();
                    if (key === 'Backspace') { await after.click(); await p.keyboard.press('Home'); }
                    else { await p.locator('#document .ProseMirror p', { hasText: /^Before\./ }).click(); await p.keyboard.press('End'); }
                    await p.keyboard.press(key); await p.waitForTimeout(400);
                    let now = await text();
                    // A first key may select the shortcode, as it does any node, and a second takes it; either way none of its source is left in part.
                    if (now === ORIGINAL) { await p.keyboard.press(key); await p.waitForTimeout(400); now = await text(); }
                    assert.ok(!/gktoc|\{\{|\}\}/.test(now), engine + ' ' + key + ': the shortcode is gone and no part of its source is left behind: ' + JSON.stringify(now));
                    assert.ok(/Before\./.test(now) && /After\./.test(now), engine + ' ' + key + ': the paragraphs around it are kept: ' + JSON.stringify(now));
                    phase = key + ' undone by one Undo';
                    await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await p.waitForTimeout(600);
                    assert.equal(await text(), ORIGINAL, engine + ' ' + key + ': one Undo puts all of the shortcode back');
                    await settled(); assert.equal(await p.locator('#document .ProseMirror [data-host-shortcode="gktoc"]').count(), 1, engine + ': and it is drawn once');
                }
                phase = 'shift-arrow takes the shortcode whole';
                await p.evaluate(t => pudlActions.run('yavc.docs/set-text@1', { text: t }, { grant: 'all' }), ORIGINAL); await settled();
                await p.locator('#document .ProseMirror p', { hasText: /^Before\./ }).click(); await p.keyboard.press('End');
                await p.keyboard.press('Shift+ArrowDown'); await p.keyboard.press('Shift+ArrowDown'); await p.keyboard.press('Shift+ArrowDown');
                const selected = await p.evaluate(() => String(getSelection()));
                await p.keyboard.type('X'); await p.waitForTimeout(500);
                const typed = await text();
                assert.ok(!/gktoc|\{\{|\}\}/.test(typed), engine + ': typing over a selection that took the shortcode leaves none of it behind (selected ' + JSON.stringify(selected) + '): ' + JSON.stringify(typed));
                await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await p.waitForTimeout(600);
                assert.equal(await text(), ORIGINAL, engine + ': one Undo puts it all back');
                assert.deepEqual(errors, []);
                console.log(engine + ': a host block shortcode is one node: Backspace, Delete and typing over it take all of it, and one Undo returns all of it');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
