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
                for (let i = 0; i < 40 && same < 3; i++) { await p.waitForTimeout(700); const n = await p.evaluate(() => document.querySelectorAll('#document .doc-page-gap').length + document.querySelectorAll('#document [data-host-shortcode="gkinclude"] .doc-page-gap').length * 10000); same = n >= 10000 && n === last ? same + 1 : 0; last = n; }
                assert.equal(same, 3, engine + ': the layout did not settle (' + last + ' gaps)');
                const shape = await p.evaluate(() => {
                    const root = document.querySelector('#document .ProseMirror'), q = s => root.querySelector(s), gaps = el => el.querySelectorAll('.doc-page-gap').length;
                    const info = q('[data-host-shortcode="gkinfo"]'), note = q('[data-host-shortcode="gknote"]'), toc = q('[data-host-shortcode="gktoc"]'), include = q('[data-host-shortcode="gkinclude"]'), piece = q('[data-host-shortcode="gkpiece"]');
                    const count = (el, re) => Array.from(el.querySelectorAll('p')).filter(p => re.test(p.textContent)).length;
                    return {
                        frames: root.querySelectorAll('[data-sc-frame]').length, bodies: root.querySelectorAll('[data-sc-body]').length,
                        infoGaps: gaps(info), infoParagraphs: Array.from({ length: 24 }, (_, i) => count(info, new RegExp('^Paragraph ' + (i + 1) + '\\. '))),
                        noteGaps: gaps(note), noteTitle: Array.from(note.querySelectorAll('p')).filter(t => /^Mind the gap/.test(t.textContent) && !t.closest('.doc-gap-cap')).length, noteParagraphs: Array.from({ length: 24 }, (_, i) => count(note, new RegExp('^Paragraph ' + (i + 1) + '\\. '))),
                        tocGaps: gaps(toc), tocLinks: toc.querySelectorAll('a').length,
                        includeGaps: gaps(include), includeParagraphs: Array.from({ length: 10 }, (_, i) => count(include, new RegExp('^Included paragraph ' + (i + 1) + '\\. '))),
                        includeRows: Array.from(include.querySelectorAll('tbody tr')).filter(r => !r.closest('.doc-page-gap')).length, includeHeads: Array.from(include.querySelectorAll('th')).filter(h => !h.closest('.doc-page-gap')).length,
                        includeFlow: include.getAttribute('data-host-flow'), tocFlow: toc.getAttribute('data-host-flow'), infoFlow: info.getAttribute('data-host-flow'),
                        pieceMark: piece.querySelector('[data-sc-frame]').getAttribute('data-sc-piece'), pieceFrame: !!piece.querySelector('[data-sc-frame]'),
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
                const tall = await p.evaluate(() => { const rows = Array.from(document.querySelectorAll('#document [data-host-shortcode="gkinclude"] tbody tr')).filter(r => !r.closest('.doc-page-gap') && /^TALL/.test(r.textContent)); return { tokens: rows.flatMap(r => (r.textContent.match(/T\d+/g) || []).map(t => Number(t.slice(1)))), gaps: rows.reduce((n, r) => n + r.querySelectorAll('.doc-page-gap').length, 0) }; });
                assert.deepEqual(tall.tokens, Array.from({ length: 700 }, (_, i) => i + 1), engine + ': a row taller than a page has each of its words once, in order');
                assert.ok(tall.gaps >= 1, engine + ': a row taller than a page is cut inside the row (' + tall.gaps + ' gaps in it)');
                assert.ok(shape.includeGaps >= 2, engine + ': the included page is broken between its children and inside its table (' + shape.includeGaps + ' gaps)');
                assert.deepEqual(shape.includeParagraphs, Array(10).fill(1), engine + ': each included paragraph is there once'); assert.equal(shape.includeRows, 41, engine + ': each row of the included table is there once'); assert.equal(shape.includeHeads, 2, engine + ': its header is there once, and repeated only in the gaps');
                assert.equal(shape.pieceFrame, true); assert.equal(shape.pieceMark, 'only', engine + ': the page\'s own mark replaces data-sc-piece=middle in a host drawing');
                assert.equal(shape.warned, false, engine + ': the page says something is indivisible');
                // A frame that a gap runs through is drawn in pieces: the frame is the first, a cap above each gap closes the piece before it and a cap below it
                // opens the next, the last piece's cap is marked last, a frame no gap runs through is marked only, and a title the host marked to repeat comes
                // again below each gap, as a copy no one can reach and the page's own text once.
                phase = 'the pieces of a frame';
                const pieces = await p.evaluate(() => {
                    const root = document.querySelector('#document .ProseMirror');
                    const describe = frame => ({ piece: frame.getAttribute('data-sc-piece'), gaps: Array.from(frame.querySelectorAll('.doc-page-gap')).filter(g => !g.closest('.doc-gap-cap')).length,
                        caps: Array.from(frame.querySelectorAll('.doc-gap-cap')).map(c => c.getAttribute('data-sc-piece') + ':' + (c.classList.contains('doc-gap-cap-end') ? 'end' : 'start')), covers: frame.querySelectorAll('.doc-gap-cover').length });
                    const note = root.querySelector('[data-host-shortcode="gknote"] [data-sc-frame]');
                    return { host: describe(root.querySelector('[data-host-shortcode="gkinfo"] [data-sc-frame]')), note: describe(note), notice: describe(root.querySelector('.sc-notice')), only: describe(root.querySelector('[data-host-shortcode="gkpiece"] [data-sc-frame]')),
                        titles: Array.from(note.querySelectorAll('strong')).filter(t => /Mind the gap/.test(t.textContent)).map(t => !!t.closest('.doc-gap-cap')), hidden: Array.from(note.querySelectorAll('.doc-gap-cap [aria-hidden], .doc-gap-cap[aria-hidden]')).length };
                });
                const expected = gaps => { const list = []; for (let i = 0; i < gaps; i++) { list.push((i === 0 ? 'first' : 'middle') + ':end', (i === gaps - 1 ? 'last' : 'middle') + ':start'); } return list; };
                for (const kind of ['host', 'note', 'notice']) {
                    assert.ok(pieces[kind].gaps >= 1, engine + ': the ' + kind + ' frame is broken by a gap');
                    assert.equal(pieces[kind].piece, 'only', engine + ': the ' + kind + ' frame is one element from its first piece to its last, so it draws the box whole and the caps draw the edges a gap opens');
                    assert.deepEqual(pieces[kind].caps, expected(pieces[kind].gaps), engine + ': the caps of the ' + kind + ' frame');
                    assert.equal(pieces[kind].covers, pieces[kind].gaps, engine + ': a cover for each gap of the ' + kind + ' frame');
                }
                assert.equal(pieces.only.piece, 'only', engine + ': a frame no gap runs through is a single piece'); assert.deepEqual(pieces.only.caps, []);
                assert.equal(pieces.titles.filter(inCap => !inCap).length, 1, engine + ': the title of the note is on the page once'); assert.equal(pieces.titles.filter(inCap => inCap).length, pieces.note.gaps, engine + ': and again below each gap');
                // What each part draws: the frame keeps its real top and bottom, a cap above a gap is open at its foot and one below it at its head, each
                // keeps the side borders and the background of the frame, the cover paints the gutter where the sheets' gutter is and nowhere else, and a
                // repeated title lies wholly in its cap and clear of the text that follows it.
                phase = 'what each part draws';
                const drawn = await p.evaluate(() => {
                    const root = document.querySelector('#document .ProseMirror'), paginated = root.closest('.doc-paginated'), zoom = Number(paginated.style.zoom) || 1;
                    const sheet = parseFloat(paginated.style.getPropertyValue('--sheet-height')), gutter = parseFloat(paginated.style.getPropertyValue('--sheet-gap')), period = sheet + gutter, origin = paginated.getBoundingClientRect().top;
                    const px = v => parseFloat(v) || 0, result = {};
                    const firstText = gap => { for (let n = gap.nextSibling; n; n = n.nextSibling) { if (n.nodeType === 3 && n.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(n); const rect = r.getClientRects()[0]; if (rect) { return rect.top; } } if (n.nodeType === 1 && !n.classList.contains('doc-page-gap')) { return n.getBoundingClientRect().top; } } return null; };
                    for (const [kind, sel] of [['host', '[data-host-shortcode="gkinfo"] [data-sc-frame]'], ['note', '[data-host-shortcode="gknote"] [data-sc-frame]'], ['notice', '.sc-notice']]) {
                        const frame = root.querySelector(sel), fs = getComputedStyle(frame), out = result[kind] = { frameEdges: [px(fs.borderTopWidth), px(fs.borderBottomWidth), px(fs.borderLeftWidth)], frameBottomRadius: px(fs.borderBottomLeftRadius), frameTopRadius: px(fs.borderTopLeftRadius), caps: [], covers: [], overlaps: [] };
                        for (const gap of Array.from(frame.querySelectorAll('.doc-page-gap')).filter(g => !g.closest('.doc-gap-cap'))) {
                            for (const cap of gap.querySelectorAll('.doc-gap-cap')) {
                                const cs = getComputedStyle(cap), end = cap.classList.contains('doc-gap-cap-end'), rect = cap.getBoundingClientRect();
                                out.caps.push({ end, top: px(cs.borderTopWidth), bottom: px(cs.borderBottomWidth), left: px(cs.borderLeftWidth), right: px(cs.borderRightWidth), bg: cs.backgroundColor === fs.backgroundColor, width: Math.abs(rect.width - frame.getBoundingClientRect().width) < 1.5, clipped: cap.scrollHeight > cap.clientHeight + 1, withinGap: rect.top >= gap.getBoundingClientRect().top - 1 && rect.bottom <= gap.getBoundingClientRect().bottom + 1 });
                                if (!end && cap.textContent.trim()) { const next = firstText(gap); out.overlaps.push({ inside: Array.from(cap.children).every(c => c.getBoundingClientRect().bottom <= rect.bottom + 0.5 && c.getBoundingClientRect().top >= rect.top - 0.5), clear: next === null || next >= rect.bottom - 0.5 }); }
                            }
                            const cover = gap.querySelector('.doc-gap-cover'), stops = Array.from(cover.style.background.matchAll(/(-?[\d.]+)px/g)).map(m => parseFloat(m[1])), at = (gap.getBoundingClientRect().top - origin) / zoom;
                            const grey = period * Math.floor((at + 0.5) / period) + sheet - at;
                            out.covers.push({ greyAt: Math.max(...stops), expected: Math.max(0, grey + gutter), gutter });
                        }
                    }
                    return result;
                });
                for (const kind of ['host', 'note', 'notice']) {
                    const d = drawn[kind];
                    assert.ok(d.frameEdges[0] > 0 && d.frameEdges[1] > 0 && d.frameEdges[2] > 0, engine + ': the ' + kind + ' frame keeps its top, bottom and side borders ' + JSON.stringify(d.frameEdges));
                    assert.ok(d.frameBottomRadius === d.frameTopRadius, engine + ': the ' + kind + ' frame\'s bottom corners are rounded as its top corners are');
                    for (const cap of d.caps) {
                        assert.ok(cap.left > 0 && cap.right > 0, engine + ': a ' + kind + ' cap keeps the side borders ' + JSON.stringify(cap));
                        assert.equal(cap.end ? cap.bottom : cap.top, 0, engine + ': a ' + kind + ' cap is open where the gap is ' + JSON.stringify(cap));
                        assert.ok(cap.bg && cap.width && !cap.clipped && cap.withinGap, engine + ': a ' + kind + ' cap has the background and width of the frame, clips nothing and stays inside its gap ' + JSON.stringify(cap));
                    }
                    for (const cover of d.covers) { assert.ok(Math.abs(cover.greyAt - cover.expected) < 1.5, engine + ': the cover paints the gutter where the sheets have it, ending at ' + cover.greyAt + ' and not ' + cover.expected); }
                    for (const o of d.overlaps) { assert.ok(o.inside && o.clear, engine + ': a repeated title lies in its cap and clear of the text after it ' + JSON.stringify(o)); }
                }
                assert.ok(drawn.note.overlaps.length >= 1, engine + ': the note\'s repeated titles were checked');
                // Print uses the drawings the page holds (docs/host-shortcodes-contract.md, "Print"): each host shortcode once, its text whole, a table's
                // rows whole and in order, over several sheets, with no request to the host for a drawing it already holds.
                phase = 'print uses the drawings the page holds';
                const asked = await p.evaluate(() => fixture.hostFlow.calls.length);
                await p.evaluate(() => { window.printed = 0; const append = document.body.append.bind(document.body); document.body.append = (...nodes) => { append(...nodes); for (const node of nodes) { if (node.tagName === 'IFRAME') { node.contentWindow.print = () => { window.printed++; }; } } }; return pudlCommands.run('print-document', null, document.querySelector('#document')); });
                await p.waitForFunction(() => window.printed === 1);
                const printed = await p.locator('.ed-print-frame').evaluate(f => {
                    const d = f.contentDocument, text = d.body.textContent, count = re => (text.match(re) || []).length, sheets = d.querySelectorAll('.doc-print-sheet');
                    return { sheets: sheets.length, paragraphs: Array.from({ length: 24 }, (_, i) => count(new RegExp('Paragraph ' + (i + 1) + '\. ', 'g'))), included: Array.from({ length: 10 }, (_, i) => count(new RegExp('Included paragraph ' + (i + 1) + '\. ', 'g'))),
                        rows: Array.from(d.querySelectorAll('tbody tr')).filter(r => /^R-\d+/.test(r.textContent)).length, note: Array.from(d.querySelectorAll('[data-host-shortcode="gknote"] [data-sc-frame]')).map(f => f.getAttribute('data-sc-piece') + ':' + (f.textContent.match(/Mind the gap/g) || []).length), notice: Array.from(d.querySelectorAll('.sc-notice')).map(f => f.getAttribute('data-sc-piece')), tall: (text.match(/T\d+/g) || []).map(t => Number(t.slice(1))), frames: d.querySelectorAll('[data-sc-frame]').length, failed: d.querySelectorAll('.sc-host-failed').length, indivisible: /indivisible/.test(text) };
                });
                assert.ok(printed.sheets >= 6, engine + ': the document prints over several sheets (' + printed.sheets + ')');
                assert.deepEqual(printed.paragraphs, Array(24).fill(3), engine + ': each paragraph of the three bodies prints once'); assert.deepEqual(printed.included, Array(10).fill(1));
                assert.equal(printed.rows, 40, engine + ': each of the numbered rows of the included table prints once'); assert.deepEqual(printed.tall, Array.from({ length: 700 }, (_, i) => i + 1), engine + ': the row taller than a page prints each word once, in order');
                const marks = list => list.map(x => x.split(':')[0]), pieceMarks = (n) => Array.from({ length: n }, (_, i) => n === 1 ? 'only' : i === 0 ? 'first' : i === n - 1 ? 'last' : 'middle');
                assert.ok(printed.note.length >= 2, engine + ': the note is printed in pieces'); assert.deepEqual(marks(printed.note), pieceMarks(printed.note.length), engine + ': its pieces are marked first, middle and last');
                assert.deepEqual(printed.note.map(x => x.split(':')[1]), Array(printed.note.length).fill('1'), engine + ': the repeated title is at the head of each piece, once');
                assert.deepEqual(printed.notice, pieceMarks(printed.notice.length), engine + ': the built-in box is marked the same way');
                assert.ok(printed.frames >= 3 && printed.failed === 0 && !printed.indivisible, engine + ': the frames print and nothing failed ' + JSON.stringify(printed));
                assert.equal(await p.evaluate(() => fixture.hostFlow.calls.length), asked, engine + ': print asked the host for no drawing the page already held');
                phase = 'the host is asked once for each';
                const calls = await p.evaluate(() => fixture.hostFlow.calls);
                assert.equal(new Set(calls).size, calls.length, engine + ': the host was asked twice for the same shortcode: ' + JSON.stringify(calls));
                phase = 'the source';
                const text = (await p.evaluate(() => pudlActions.run('yavc.docs/document@1', {}, { grant: 'all' }))).text;
                assert.equal(text, await p.evaluate(() => fixture.hostFlow.source), engine + ': drawing the shortcodes across pages changed the source');
                // A host's `print: "none"` and a drawing that failed are refused by name, the second with Try Again and the first without.
                phase = 'print refuses by name';
                await p.evaluate(() => { return pudlActions.run('yavc.docs/set-text@1', { text: '# Two\n\n{{gknone}}\n\n{{gkbroken}}\n' }, { grant: 'all' }); });
                await p.waitForFunction(() => document.querySelector('#document [data-host-shortcode="gknone"][data-host-drawn]'));
                await p.evaluate(() => { window.printed = 0; return pudlCommands.run('print-document', null, document.querySelector('#document')); });
                const refusal = p.locator('.yavc-notice:not([hidden])').first(); await refusal.waitFor(); await p.waitForTimeout(3000);
                const said = await refusal.innerText();
                assert.ok(await refusal.isVisible(), engine + ': the refusal stays on the page'); assert.ok(said.includes('{{gknone}}') && said.includes('{{gkbroken}}'), engine + ': it gives both shortcodes: ' + said);
                assert.equal(await p.evaluate(() => window.printed), 0, engine + ': nothing was sent to print');
                assert.equal(await refusal.getByRole('button', { name: 'Try Again' }).count(), 1, engine + ': a drawing that failed can be tried again');
                await p.evaluate(() => pudlActions.run('yavc.docs/set-text@1', { text: '# One\n\n{{gknone}}\n' }, { grant: 'all' }));
                await p.waitForFunction(() => !document.querySelector('#document [data-host-shortcode="gkbroken"]'));
                await p.evaluate(() => pudlCommands.run('print-document', null, document.querySelector('#document')));
                await p.waitForFunction(() => Array.from(document.querySelectorAll('.yavc-notice:not([hidden])')).some(n => /gknone/.test(n.textContent) && !/gkbroken/.test(n.textContent)));
                assert.equal(await p.locator('.yavc-notice:not([hidden]) button', { hasText: 'Try Again' }).count(), 0, engine + ': a drawing the host keeps off paper has no Try Again');
                assert.deepEqual(errors, []);
                console.log(engine + ': a host\'s containers and flowing blocks are laid out across pages, each child once, with the source whole');
            } catch (err) { console.error(engine, phase, errors.length ? 'page errors: ' + errors.join(' / ') : ''); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
