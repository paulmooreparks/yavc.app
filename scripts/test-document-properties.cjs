// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The document properties a host can give as front matter, and what each does (docs/content-workspace-contract.md, "Document properties"; DESIGN.md decision 196): the page views keep the front matter out of the typed text and a save returns it byte for byte, the Document view draws the header and the footer with their placeholders filled, and Word and PDF carry the title, author, subject, keywords and date, with the header and the footer. Needs the full content package. Real keys and real downloads, against a built package in an independent host:
//   node scripts/test-document-properties.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), pw = require('playwright');
const { readPdf } = require('./pdf-reader.cjs');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const JSZip = require(path.join(artifact, 'content', 'md-editor', 'vendor', 'jszip-3.10.1', 'jszip.min.js'));
const BODY = '# Agenda\n\nFirst point of the notes.\n\n' + Array.from({ length: 60 }, (_, i) => 'Paragraph ' + (i + 1) + '. ' + Array.from({ length: 40 }, (_, k) => 'word' + (k % 13)).join(' ')).join('\n\n') + '\n';
const FRONT = '---\ntitle: Meeting Notes\nauthor: Paul Parks\ndate: 2025-03-09\nsubject: Weekly review\nkeywords: agenda, weekly\npage: a4\nheader: { left: "{title}", center: "{date}", right: "{author}" }\nfooter: { center: "Page {page} of {pages}" }\n---\n';
const NODATE = '---\ntitle: Plain Notes\n---\n';
(async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8')); if (manifest.profile) throw new Error('Give the full package, since export needs the Word and PDF libraries.');
    const allowed = new Set(manifest.files.map(f => f.path));
    const server = http.createServer(async (req, res) => {
        try {
            const u = new URL(req.url, 'http://localhost'); if (!u.pathname.startsWith(prefix)) return res.writeHead(404).end();
            const name = decodeURIComponent(u.pathname.slice(prefix.length)); if (!allowed.has(name)) return res.writeHead(404).end();
            res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream'); res.end(await fs.readFile(path.join(artifact, name)));
        } catch (error) { res.writeHead(500).end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'yavc-properties-'));
    try {
        for (const engine of process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit']) {
            const browser = await pw[engine].launch({ headless: true }); let phase = 'startup';
            try {
                const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true }), page = await context.newPage(), errors = []; page.setDefaultTimeout(60000);
                page.on('pageerror', error => errors.push(error.message));
                await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs&plain`); await page.locator('#document .ProseMirror').waitFor();
                const call = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }), { name, input });
                const settle = () => page.waitForFunction(() => document.querySelector('#document .ProseMirror').getAttribute('aria-busy') !== 'true');
                const open = async text => { await call('set-text', { text }); await settle(); await page.waitForTimeout(500); };
                const download = async (command, ext) => {
                    const waiting = page.waitForEvent('download', { timeout: 90000 }); page.evaluate(c => pudlCommands.run(c, null, document.querySelector('#document')), command).catch(() => {});
                    const dialog = page.locator('dialog[open]'); if (await dialog.first().waitFor({ timeout: 2500 }).then(() => true, () => false)) { const go = dialog.first().getByRole('button', { name: /Continue|Export|OK/ }); if (await go.count()) await go.first().click(); }
                    const file = path.join(scratch, engine + '-' + Date.now() + '.' + ext); await (await waiting).saveAs(file); if (process.env.KEEP_DOWNLOADS) await fs.copyFile(file, path.join(process.env.KEEP_DOWNLOADS, path.basename(file))); return fs.readFile(file);
                };
                const text = xml => Array.from(xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)).map(m => m[1]).join(' ');
                const tag = (xml, name) => { const m = new RegExp('<' + name + '[^>]*>([^<]*)</' + name + '>').exec(xml); return m ? m[1] : null; };
                const near = (date, seconds) => Math.abs(Date.now() - new Date(date).getTime()) < seconds * 1000;

                phase = 'the views keep the front matter out of the text';
                await open(FRONT + BODY);
                await call('view', { mode: 'visual' }); await settle(); await page.waitForTimeout(800);
                const visual = await page.evaluate(() => document.querySelector('#document .ProseMirror').innerText);
                assert.ok(/^\s*Agenda/.test(visual) && !/title:|author:|Weekly review|---/.test(visual), engine + ': the typed text starts at the heading and shows no front matter: ' + JSON.stringify(visual.slice(0, 80)));
                assert.equal((await call('document')).text, FRONT + BODY, engine + ': the text read back is the text given');
                await page.locator('#document .ProseMirror p', { hasText: 'First point' }).click(); await page.keyboard.press('End'); await page.keyboard.type(' Typed.');
                const want = (FRONT + BODY).replace('First point of the notes.', 'First point of the notes. Typed.');
                await page.waitForFunction(w => pudlActions.run('yavc.docs/document@1', {}, { grant: 'all' }).then(r => r.text === w), want, { timeout: 15000 });
                assert.ok((await call('document')).text.startsWith(FRONT), engine + ': the front matter is the same byte for byte after typing in the body');

                phase = 'the Document view draws the header and the footer';
                await call('view', { mode: 'document' }); await settle(); await page.waitForTimeout(3500);
                const sheets = await page.evaluate(() => ({ pages: Number((document.querySelector('#document [data-page-count]') || document.body).getAttribute('data-page-count') || 0), headers: Array.from(document.querySelectorAll('#document .doc-header')).map(e => e.textContent.replace(/\s+/g, ' ').trim()), footers: Array.from(document.querySelectorAll('#document .doc-footer')).map(e => e.textContent.replace(/\s+/g, ' ').trim()) }));
                assert.ok(sheets.pages > 1, engine + ': the note has several pages');
                sheets.headers.forEach((h, i) => { assert.equal(h, 'Meeting Notes 2025-03-09 Paul Parks', engine + ': the header of page ' + (i + 1) + ' has its placeholders filled'); });
                sheets.footers.forEach((f, i) => assert.equal(f, 'Page ' + (i + 1) + ' of ' + sheets.pages, engine + ': the footer of page ' + (i + 1)));

                phase = 'Word';
                await open(FRONT + BODY); await call('view', { mode: 'document' });
                const docx = await JSZip.loadAsync(await download('export-docx', 'docx'));
                const core = await docx.file('docProps/core.xml').async('string');
                assert.equal(tag(core, 'dc:title'), 'Meeting Notes', engine + ': Word title'); assert.equal(tag(core, 'dc:creator'), 'Paul Parks', engine + ': Word author');
                assert.equal(tag(core, 'dc:subject'), 'Weekly review', engine + ': Word subject'); assert.equal(tag(core, 'cp:keywords'), 'agenda, weekly', engine + ': Word keywords');
                assert.equal(tag(core, 'dcterms:created'), '2025-03-09T00:00:00Z', engine + ': Word created is the front matter date');
                assert.ok(near(tag(core, 'dcterms:modified'), 600), engine + ': Word modified is the export time: ' + tag(core, 'dcterms:modified'));
                assert.equal(tag(core, 'cp:lastModifiedBy'), 'Paul Parks', engine + ': Word last modified by is the author');
                const headers = (await Promise.all(Object.keys(docx.files).filter(n => /^word\/header\d*\.xml$/.test(n)).map(n => docx.file(n).async('string')))).map(text);
                const footers = await Promise.all(Object.keys(docx.files).filter(n => /^word\/footer\d*\.xml$/.test(n)).map(n => docx.file(n).async('string')));
                assert.ok(headers.some(h => /Meeting Notes/.test(h) && /2025-03-09/.test(h) && /Paul Parks/.test(h)), engine + ': a Word header has the title, the date and the author: ' + JSON.stringify(headers));
                assert.ok(footers.some(f => /PAGE/.test(f) && /NUMPAGES/.test(f) && />Page <\/w:t>/.test(f)), engine + ': a Word footer has Page, a page field and a page count field');
                assert.ok(!/title:|author:|---/.test(text(await docx.file('word/document.xml').async('string'))), engine + ': the front matter is not in the Word body');

                phase = 'Word with no date and no author';
                await open(NODATE + BODY); await call('view', { mode: 'document' });
                const plain = await JSZip.loadAsync(await download('export-docx', 'docx')), plainCore = await plain.file('docProps/core.xml').async('string');
                assert.ok(near(tag(plainCore, 'dcterms:created'), 600), engine + ': Word created is the export time when there is no date: ' + tag(plainCore, 'dcterms:created'));
                assert.equal(tag(plainCore, 'cp:lastModifiedBy'), null, engine + ': there is no last modified by without an author (and not "Un-named")');
                assert.ok(!/Un-named/.test(plainCore));

                phase = 'PDF';
                await open(FRONT + BODY); await call('view', { mode: 'document' });
                const pdf = await readPdf(await download('export-pdf', 'pdf'), artifact);
                assert.deepEqual([pdf.info.title, pdf.info.author, pdf.info.subject, pdf.info.keywords], ['Meeting Notes', 'Paul Parks', 'Weekly review', 'agenda, weekly'], engine + ': PDF title, author, subject and keywords');
                assert.equal(pdf.info.creationDate.toISOString(), '2025-03-09T00:00:00.000Z', engine + ': PDF CreationDate is the front matter date');
                assert.ok(near(pdf.info.modificationDate, 600), engine + ': PDF ModDate is the export time: ' + pdf.info.modificationDate);
                assert.ok(pdf.pageCount > 1, engine + ': the PDF has several pages');
                pdf.pages.forEach((p, i) => {
                    assert.match(p.header, /Meeting Notes.*2025-03-09.*Paul Parks/, engine + ': the PDF header of page ' + (i + 1) + ': ' + p.header);
                    assert.match(p.footer, new RegExp('Page ' + (i + 1) + ' of ' + pdf.pageCount + '\\b'), engine + ': the PDF footer of page ' + (i + 1) + ': ' + p.footer);
                    assert.ok(!p.body.some(l => /title:|author:|^---/.test(l)), engine + ': no front matter in the PDF body');
                });
                phase = 'PDF of a note with a footnote';
                await open(FRONT + 'A sentence with a note.[^1]\n\n[^1]: The note.\n'); await call('view', { mode: 'document' });
                const noted = await readPdf(await download('export-pdf', 'pdf'), artifact);
                assert.deepEqual([noted.info.title, noted.info.author, noted.info.subject, noted.info.keywords], ['Meeting Notes', 'Paul Parks', 'Weekly review', 'agenda, weekly'], engine + ': the PDF of a note with a footnote has the properties too');
                assert.equal(noted.info.creationDate.toISOString(), '2025-03-09T00:00:00.000Z', engine + ': and the date');
                assert.ok(near(noted.info.modificationDate, 600), engine + ': and the export time as ModDate');
                phase = 'PDF with no date';
                await open(NODATE + BODY); await call('view', { mode: 'document' });
                const plainPdf = await readPdf(await download('export-pdf', 'pdf'), artifact);
                assert.ok(near(plainPdf.info.creationDate, 600) && near(plainPdf.info.modificationDate, 600), engine + ': PDF dates are the export time when there is no date');
                assert.deepEqual(errors, []);
                console.log(engine + ': document properties reach the views, Word and PDF as the contract says');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); await fs.rm(scratch, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
