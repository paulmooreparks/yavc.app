// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// yavc.docs/insert@1 (docs/editing-settings-contract.md, "Inserting text"): as plain, the words go in as they are, in the page and in the text, replacing a selection, in one step of
// Undo, with the caret after them and no use of the clipboard; as Markdown, the default, the text is read as Markdown and replaces a selection on the page too. Real keys select
// and undo. Run against a built content package in an independent host:
//   node scripts/test-docs-insert.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const ORIGINAL = '# Words\n\nAlpha beta gamma.\n';
const WORDS = 'one *two* [three] & #four', MULTI = 'line one\nline two\n\nsecond paragraph';
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
            const browser = await pw[engine].launch({ headless: true }), p = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = []; p.setDefaultTimeout(30000);
            await p.addInitScript(() => { window.clipboardUse = 0; for (const e of ['copy', 'cut', 'paste']) { document.addEventListener(e, () => { window.clipboardUse++; }, true); } if (navigator.clipboard) { for (const m of ['writeText', 'readText', 'write', 'read']) { if (navigator.clipboard[m]) { const o = navigator.clipboard[m].bind(navigator.clipboard); navigator.clipboard[m] = (...a) => { window.clipboardUse++; return o(...a); }; } } } });
            p.on('pageerror', e => errors.push(e.message)); let phase = 'startup';
            const act = (name, input = {}) => p.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }).then(v => ({ ok: v }), e => ({ error: String(e.message || e) })), { name, input });
            const text = async () => (await act('document')).ok.text;
            const until = async (want, label) => { const end = Date.now() + 5000; let got; while (Date.now() < end) { got = await text(); if (got === want) return; await p.waitForTimeout(100); } assert.equal(got, want, label); };
            const rendered = async () => { await act('view', { mode: 'preview' }); await p.waitForTimeout(800); return p.evaluate(() => { const r = document.querySelector('#document [data-role="page"]'); return { text: Array.from(r.querySelectorAll('p')).map(x => x.textContent), breaks: r.querySelectorAll('p br').length }; }); };
            try {
                await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs&plain`); await p.locator('#document .ProseMirror').waitFor();
                for (const view of ['visual', 'text']) {
                    const line = () => view === 'text' ? p.locator('#document .cm-line', { hasText: /^Alpha/ }) : p.locator('#document .ProseMirror p', { hasText: /^Alpha/ });
                    // Selects "beta" with keys: the caret to the start of the line, over "Alpha ", then four letters with Shift.
                    const select = async () => { await act('set-text', { text: ORIGINAL }); await act('view', { mode: view }); await p.waitForTimeout(800); await line().click(); await p.keyboard.press('Home'); for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowRight'); for (let i = 0; i < 4; i++) await p.keyboard.press('Shift+ArrowRight'); };
                    const undo = async () => { await p.keyboard.press('ControlOrMeta+z'); await p.waitForTimeout(500); };
                    phase = view + ' plain words';
                    await select(); const ins = await act('insert', { text: WORDS, format: 'plain' }); assert.ok(ins.ok, engine + ' ' + phase + ': ' + JSON.stringify(ins));
                    await p.keyboard.type('Z'); await p.waitForTimeout(500);
                    const after = await text(); assert.ok(!after.includes('beta') && after.includes('Alpha ') && after.includes(' gamma.'), engine + ' ' + phase + ': the selection is replaced: ' + JSON.stringify(after));
                    assert.ok(/Alpha one .*four ?Z gamma\./.test(after.replace(/\\/g, '')), engine + ' ' + phase + ': the caret is after the words (a typed Z follows them): ' + JSON.stringify(after));
                    const shown = await rendered(); assert.ok(shown.text.some(t => t.includes('Alpha one *two* [three] & #four')), engine + ' ' + phase + ': it reads back as the same words: ' + JSON.stringify(shown));
                    await act('view', { mode: view }); await p.waitForTimeout(800);
                    await select(); await act('insert', { text: WORDS, format: 'plain' }); await undo();
                    await until(ORIGINAL, engine + ' ' + phase + ': one Undo puts the original back');
                    phase = view + ' plain lines';
                    await select(); await act('insert', { text: MULTI, format: 'plain' }); await p.waitForTimeout(500);
                    const lines = await rendered(); assert.ok(lines.text.some(t => t.includes('line one') && t.includes('line two')) && lines.text.some(t => t === 'second paragraph gamma.' || t.startsWith('second paragraph')), engine + ' ' + phase + ': a line break stays in its paragraph and a blank line starts one: ' + JSON.stringify(lines));
                    assert.ok(lines.breaks >= 1, engine + ' ' + phase + ': the line break is a hard break');
                    phase = view + ' markdown replaces a selection';
                    await act('view', { mode: view }); await p.waitForTimeout(800);
                    await select(); const md = await act('insert', { text: '**bold** words' }); assert.ok(md.ok, engine + ' ' + phase + ': ' + JSON.stringify(md));
                    await p.waitForTimeout(600); const mdText = await text(); assert.ok(!mdText.includes('beta') && mdText.includes('**bold** words'), engine + ' ' + phase + ': the selection is replaced and the Markdown is read: ' + JSON.stringify(mdText));
                    await undo(); await until(ORIGINAL, engine + ' ' + phase + ': one Undo puts the original back');
                }
                phase = 'refusals and the clipboard';
                const bad = await act('insert', { text: 'x', format: 'html' }); assert.ok(bad.error, engine + ': an unknown format is refused ' + JSON.stringify(bad));
                assert.equal(await p.evaluate(() => window.clipboardUse), 0, engine + ': the clipboard was not used');
                assert.deepEqual(errors, [], engine + ': no page errors');
                console.log(engine + ': insert plain and Markdown, in the page and in the text, replace a selection, one Undo, caret after, no clipboard');
            } catch (err) { console.error(engine, phase, errors.length ? 'page errors: ' + errors.join(' / ') : ''); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
