// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A host's long shortcodes are laid out across pages (DESIGN.md, decision 169): a container the host drew as a frame with a body (data-sc-frame,
// data-sc-body) is broken between its body's children, and a block the host drew as flowing content (flow: true) between its top-level children and
// between the rows of its tables, with each child once, no warning that something is indivisible, the source one shortcode, and a layout that settles.
// The html is the shape Dinah's host returns. Run against a built content package in an independent host:
//   node scripts/test-host-flow.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
            const browser = await pw[engine].launch({ headless: true }), p = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = []; p.setDefaultTimeout(60000);
            p.on('pageerror', e => errors.push(e.message)); let phase = 'startup';
            try {
                await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`); await p.locator('#document .ProseMirror').waitFor();
                await p.evaluate(() => pudlActions.run('yavc.docs/view@1', { mode: 'document' }, { grant: 'all' }));
                phase = 'drawn';
                await p.waitForFunction(() => ['gkinfo', 'gknote', 'gktoc', 'gkinclude', 'gkpiece'].every(n => document.querySelector('#document [data-host-shortcode="' + n + '"][data-host-drawn]')));
                // The layout settles: the number of gaps stays the same for three samples in a row.
                phase = 'settled';
                let last = -1, same = 0;
                for (let i = 0; i < 40 && same < 3; i++) { await p.waitForTimeout(700); const n = await p.evaluate(() => document.querySelectorAll('#document .doc-page-gap').length); same = n === last ? same + 1 : 0; last = n; }
                assert.equal(same, 3, engine + ': the layout did not settle (' + last + ' gaps)');
                const shape = await p.evaluate(() => {
                    const root = document.querySelector('#document .ProseMirror'), q = s => root.querySelector(s), gaps = el => el.querySelectorAll('.doc-page-gap').length;
                    const info = q('[data-host-shortcode="gkinfo"]'), note = q('[data-host-shortcode="gknote"]'), toc = q('[data-host-shortcode="gktoc"]'), include = q('[data-host-shortcode="gkinclude"]'), piece = q('[data-host-shortcode="gkpiece"]');
                    const count = (el, re) => Array.from(el.querySelectorAll('p')).filter(p => re.test(p.textContent)).length;
                    return {
                        frames: root.querySelectorAll('[data-sc-frame]').length, bodies: root.querySelectorAll('[data-sc-body]').length,
                        infoGaps: gaps(info), infoParagraphs: Array.from({ length: 24 }, (_, i) => count(info, new RegExp('^Paragraph ' + (i + 1) + '\\. '))),
                        noteGaps: gaps(note), noteTitle: count(note, /^Mind the gap/), noteParagraphs: Array.from({ length: 24 }, (_, i) => count(note, new RegExp('^Paragraph ' + (i + 1) + '\\. '))),
                        tocGaps: gaps(toc), tocLinks: toc.querySelectorAll('a').length,
                        includeGaps: gaps(include), includeParagraphs: Array.from({ length: 10 }, (_, i) => count(include, new RegExp('^Included paragraph ' + (i + 1) + '\\. '))),
                        includeRows: Array.from(include.querySelectorAll('tbody tr')).filter(r => !r.closest('.doc-page-gap')).length, includeHeads: Array.from(include.querySelectorAll('th')).filter(h => !h.closest('.doc-page-gap')).length,
                        includeFlow: include.getAttribute('data-host-flow'), tocFlow: toc.getAttribute('data-host-flow'), infoFlow: info.getAttribute('data-host-flow'),
                        pieceMarked: !!piece.querySelector('[data-sc-piece]'), pieceFrame: !!piece.querySelector('[data-sc-frame]'),
                        warned: /indivisible block/.test(document.body.innerText)
                    };
                });
                phase = 'the shape';
                assert.ok(shape.frames >= 3 && shape.bodies >= 3, engine + ': the host\'s frame and body marks are kept ' + JSON.stringify([shape.frames, shape.bodies]));
                assert.ok(shape.infoGaps >= 1, engine + ': the info container is broken between pages (' + shape.infoGaps + ')');
                assert.deepEqual(shape.infoParagraphs, Array(24).fill(1), engine + ': each paragraph of the info body is there once');
                assert.ok(shape.noteGaps >= 1, engine + ': the note container, with a title beside its body, is broken between pages');
                assert.deepEqual(shape.noteParagraphs, Array(24).fill(1), engine + ': each paragraph of the note body is there once'); assert.equal(shape.noteTitle, 1, engine + ': the title is there once');
                assert.equal(shape.infoFlow, null, engine + ': a container is not flowing content'); assert.equal(shape.tocFlow, 'true'); assert.equal(shape.includeFlow, 'true');
                assert.equal(shape.tocLinks, 3, engine + ': the contents block is drawn whole');
                assert.ok(shape.includeGaps >= 2, engine + ': the included page is broken between its children and inside its table (' + shape.includeGaps + ' gaps)');
                assert.deepEqual(shape.includeParagraphs, Array(10).fill(1), engine + ': each included paragraph is there once'); assert.equal(shape.includeRows, 40, engine + ': each row of the included table is there once'); assert.equal(shape.includeHeads, 2, engine + ': its header is there once, and repeated only in the gaps');
                assert.equal(shape.pieceFrame, true); assert.equal(shape.pieceMarked, false, engine + ': a mark of the page\'s own (data-sc-piece) in a host\'s drawing is taken away');
                assert.equal(shape.warned, false, engine + ': the page says something is indivisible');
                phase = 'the host is asked once for each';
                const calls = await p.evaluate(() => fixture.hostFlow.calls);
                assert.equal(new Set(calls).size, calls.length, engine + ': the host was asked twice for the same shortcode: ' + JSON.stringify(calls));
                phase = 'the source';
                const text = (await p.evaluate(() => pudlActions.run('yavc.docs/document@1', {}, { grant: 'all' }))).text;
                assert.equal(text, await p.evaluate(() => fixture.hostFlow.source), engine + ': drawing the shortcodes across pages changed the source');
                assert.deepEqual(errors, []);
                console.log(engine + ': a host\'s containers and flowing blocks are laid out across pages, each child once, with the source whole');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
