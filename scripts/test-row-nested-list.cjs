// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A table row taller than a page in a host's flowing block is cut inside the row (decision 173), also when a cell holds a list (decision 183): each list item is there once and in order, the row has a gap in it, and
// no item runs off the page. Document view on a small page, against a built content package in an independent host:
//   node scripts/test-row-nested-list.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const SOURCE = '# Requirements\n\n{{gklist}}\n\nAfter the table.\n';
(async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8')), allowed = new Set(manifest.files.map(f => f.path)), addon = await fs.readFile(path.join(__dirname, 'fixtures/host-flow.js'), 'utf8');
    const server = http.createServer(async (req, res) => {
        try {
            const u = new URL(req.url, 'http://localhost'); if (!u.pathname.startsWith(prefix)) return res.writeHead(404).end();
            const name = decodeURIComponent(u.pathname.slice(prefix.length)); if (!allowed.has(name)) return res.writeHead(404).end();
            let body = await fs.readFile(path.join(artifact, name)); if (name === 'workspace-lab/host.js') body = Buffer.from(body + String.fromCharCode(10) + addon);
            res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream'); res.end(body);
        } catch (error) { res.writeHead(500).end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const engine of process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit']) {
            const browser = await pw[engine].launch({ headless: true }), p = await browser.newPage({ viewport: { width: 1400, height: 1000 } }), errors = []; p.setDefaultTimeout(30000);
            p.on('pageerror', e => errors.push(e.message));
            try {
                await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs&plain`); await p.locator('#document .ProseMirror').waitFor();
                await p.evaluate(t => pudlActions.run('yavc.docs/set-text@1', { text: t }, { grant: 'all' }), SOURCE);
                await p.evaluate(() => pudlActions.run('yavc.docs/view@1', { mode: 'document' }, { grant: 'all' }));
                await p.waitForFunction(() => document.querySelectorAll('#document [data-host-shortcode="gklist"] li').length >= 60);
                let last = -1, same = 0; for (let i = 0; i < 30 && same < 3; i++) { await p.waitForTimeout(700); const n = await p.evaluate(() => document.querySelectorAll('#document .doc-page-gap').length); same = n > 0 && n === last ? same + 1 : 0; last = n; }
                const shape = await p.evaluate(() => {
                    const root = document.querySelector('#document .ProseMirror'), page = root.closest('.doc-paginated'), sheet = parseFloat(page.style.getPropertyValue('--sheet-height')), top = page.getBoundingClientRect().top, zoom = Number(page.style.zoom) || 1;
                    const found = Array.from(root.querySelectorAll('li')).filter(l => !l.closest('.doc-page-gap')).map(l => l.textContent.trim()).filter(t => /^Item\d+ /.test(t)).map(t => Number(/^Item(\d+) /.exec(t)[1]));
                    const row = Array.from(root.querySelectorAll('tr')).find(r => /R-2/.test(r.textContent) && !r.closest('.doc-page-gap'));
                    // An item that is wholly past the bottom of its sheet is one that ran off the page.
                    const over = Array.from(root.querySelectorAll('li')).filter(l => !l.closest('.doc-page-gap') && /^Item\d+ /.test(l.textContent)).filter(l => { const r = l.getBoundingClientRect(); const at = (r.top - top) / zoom, end = (r.bottom - top) / zoom, sheets = Math.floor(at / (sheet + 24)); return end > sheets * (sheet + 24) + sheet + 1; }).length;
                    return { found, gaps: row ? row.querySelectorAll('.doc-page-gap').length : -1, over };
                });
                assert.deepEqual(shape.found, Array.from({ length: 60 }, (_, i) => i + 1), engine + ': each list item is there once and in order');
                assert.ok(shape.gaps >= 1, engine + ': the row is cut inside (' + shape.gaps + ' gaps in it)');
                assert.equal(shape.over, 0, engine + ': no item runs off its page (' + shape.over + ')');
                // The same row in print: each item once, in order.
                await p.evaluate(() => { window.printed = 0; const append = document.body.append.bind(document.body); document.body.append = (...nodes) => { append(...nodes); for (const n of nodes) { if (n.tagName === 'IFRAME') { n.contentWindow.print = () => { window.printed++; }; } } }; return pudlCommands.run('print-document', null, document.querySelector('#document')); });
                await p.waitForFunction(() => window.printed === 1);
                const printedItems = await p.locator('.ed-print-frame').evaluate(f => (f.contentDocument.body.textContent.match(/Item\d+ /g) || []).map(t => Number(/\d+/.exec(t)[0])));
                assert.deepEqual(printedItems, Array.from({ length: 60 }, (_, i) => i + 1), engine + ': print has each item once, in order');
                assert.deepEqual(errors, []);
                console.log(engine + ': a row with a list in a cell is cut inside the row, each item once and in order');
            } catch (err) { console.error(engine, errors.length ? 'page errors: ' + errors.join(' / ') : ''); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
