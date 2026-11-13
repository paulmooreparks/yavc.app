// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A key typed straight after another that moved the caret acts where the caret is (DESIGN.md, decision 164). A person's Click, End, Shift+Enter
// reaches the page with the browser's own key handling between them, and ProseMirror takes the caret into its state only on a later selectionchange
// event, so the break once went where the caret had been, and a refusal ("A line break can be typed inside a paragraph only.") came instead.
// Run against a built content package in an independent host:
//   node scripts/test-docs-key-selection.cjs <artifact> [chromium firefox webkit]
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
                const p = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = []; p.setDefaultTimeout(20000);
                p.on('pageerror', e => errors.push(e.message));
                await p.goto('http://127.0.0.1:' + server.address().port + prefix + 'workspace-lab/index.html');
                await p.locator('#document .ProseMirror').waitFor();
                for (const view of ['document', 'visual']) {
                    phase = view + ' view';
                    await p.evaluate(name => pudlCommands.run(name, null, document.querySelector('#document')), 'view-' + view);
                    await p.waitForFunction(() => { const pm = document.querySelector('#document .ProseMirror'); return pm && pm.getAttribute('aria-busy') !== 'true' && pm.textContent.includes('Editable words.'); });
                    // Five times over in the document's last paragraph, each round going on where the one before ended.
                    const last = () => p.locator('#document .ProseMirror > p').last();
                    const breaks = () => last().locator('br:not(.ProseMirror-trailingBreak)').count();
                    // An edit elsewhere and its undo come first, as in the sequence that found the defect (Dinah-GK message 7198): the page is rebuilt
                    // by the undo, and the keys that follow must act where the next click puts the caret.
                    const heading = p.locator('#document .ProseMirror h1').first();
                    await heading.click(); await p.keyboard.press('End'); await p.keyboard.type(' EDITED' + view);
                    await p.waitForFunction(w => document.querySelector('#document .ProseMirror h1').textContent.includes(w), ' EDITED' + view);
                    await p.keyboard.press('Control+z');
                    await p.waitForFunction(w => !document.querySelector('#document .ProseMirror').textContent.includes(w), 'EDITED' + view);
                    // A paragraph of one line to begin with, so that the first End is the end of the paragraph.
                    await last().click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('Para ' + view);
                    const start = await breaks();
                    for (let round = 1; round <= 5; round++) {
                        const word = 'Round' + round + view;
                        await last().click(); await p.keyboard.press(round === 1 ? 'End' : 'Control+End'); await p.keyboard.press('Shift+Enter'); await p.keyboard.type(word);
                        assert.match(await last().innerHTML(), new RegExp('<br[^>]*>' + word + '$'), engine + ' ' + view + ' round ' + round + ': the break is in the paragraph, before what is typed after it: ' + await last().innerHTML());
                        assert.equal(await breaks(), start + round, engine + ' ' + view + ' round ' + round + ': one break more');
                    }
                }
                assert.deepEqual(errors, []);
                console.log(engine + ': Click, End, Shift+Enter, typing makes a break and goes after it, in Document and Visual');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
