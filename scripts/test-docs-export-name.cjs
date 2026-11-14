// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A document a host gives with an opaque resource ID is named by the name the host gave it (DESIGN.md, decision 166): the file a Word or PDF
// download hands over, and the status line. The host's setting documentName: false leaves the name out of the status line.
// Run against a built content package in an independent host:
//   node scripts/test-docs-export-name.cjs <artifact> [chromium firefox webkit]
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
                const base = 'http://127.0.0.1:' + server.address().port + prefix + 'workspace-lab/index.html';
                for (const [query, shown] of [['?plain', 'Document.docs.md'], ['?plain&editing=no-name', '']]) {
                    phase = 'the status line ' + query;
                    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = []; p.setDefaultTimeout(30000);
                    p.on('pageerror', e => errors.push(e.message));
                    await p.goto(base + query);
                    await p.locator('#document .ProseMirror').waitFor();
                    await p.waitForFunction(() => document.querySelector('#document .ProseMirror').textContent.includes('Plain words.'));
                    // The host's resource is memory:document.docs.md and its name Document.docs.md.
                    assert.equal(await p.locator('#document [data-role="where"]').textContent(), shown, engine + ': the status line ' + (query || ''));
                    if (query === '?plain') {
                        for (const [command, extension] of [['export-docx', '.docx'], ['export-pdf', '.pdf']]) {
                            phase = command;
                            const download = p.waitForEvent('download');
                            await p.evaluate(c => { pudlCommands.run(c, null, document.querySelector('#document')); }, command);
                            const file = await download;
                            assert.equal(file.suggestedFilename(), 'Document' + extension, engine + ': ' + command + ' named its file ' + file.suggestedFilename());
                        }
                    }
                    assert.deepEqual(errors, []);
                    await p.close();
                }
                console.log(engine + ': a download is named by the document\'s name, the status line shows it, and documentName: false hides it');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
