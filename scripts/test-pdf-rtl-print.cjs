// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A PDF export of a document with Hebrew or Arabic text is refused, because the PDF writer has no layout or font for it, and the lasting notice offers Print, where the browser's own Save as PDF lays it out correctly (DESIGN.md decision 192). A host that has taken the file commands away has no export command and so no notice. Real clicks, against a built content package in an independent host:
//   node scripts/test-pdf-rtl-print.cjs <artifact> [chromium firefox webkit]
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
                const open = async setting => {
                    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = []; page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message));
                    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs&plain${setting ? '&editing=' + setting : ''}`); await page.locator('#document .ProseMirror').waitFor();
                    return { page, errors };
                };
                const run = (page, id) => page.evaluate(id => pudlCommands.run(id, null, document.querySelector('#document')), id);
                const setText = (page, text) => page.evaluate(t => pudlActions.run('yavc.docs/set-text@1', { text: t }, { grant: 'all' }), text);
                const notices = page => page.evaluate(() => Array.from(document.querySelectorAll('.yavc-notice:not([hidden])')).map(n => ({ text: n.textContent, buttons: Array.from(n.querySelectorAll('.notice-actions button')).map(b => b.textContent) })));

                for (const [what, text] of [['Hebrew', 'שלום עולם, זה מבחן\n'], ['Arabic', 'مرحبا بالعالم\n']]) {
                    phase = what + ' refused with a Print button';
                    const { page, errors } = await open('');
                    await setText(page, '# Title\n\n' + text); await page.waitForTimeout(800);
                    // Print goes to the browser, which would open its dialog: stand in for it on the print frame.
                    await page.evaluate(() => { window.printed = 0; const append = document.body.append.bind(document.body); document.body.append = (...nodes) => { append(...nodes); for (const node of nodes) { if (node.tagName === 'IFRAME') { node.contentWindow.print = () => { window.printed++; }; } } }; });
                    await run(page, 'export-pdf');
                    await page.waitForFunction(() => document.querySelector('.yavc-notice:not([hidden])'));
                    const shown = await notices(page);
                    assert.equal(shown.length, 1, engine + ' ' + what + ': one notice');
                    assert.match(shown[0].text, /right-to-left/i, engine + ' ' + what + ': the notice says the text is right-to-left: ' + shown[0].text);
                    assert.match(shown[0].text, /Word/, engine + ' ' + what + ': the notice still points to Word');
                    assert.deepEqual(shown[0].buttons, ['Print'], engine + ' ' + what + ': the notice has a Print button');
                    await page.waitForTimeout(5000);
                    assert.equal((await notices(page)).length, 1, engine + ' ' + what + ': the notice stays');
                    await page.locator('.yavc-notice .notice-actions button', { hasText: 'Print' }).click();
                    await page.waitForFunction(() => window.printed === 1, null, { timeout: 30000 });
                    assert.deepEqual(errors, []); await page.close();
                }

                phase = 'a character with no glyph that is not right-to-left';
                {
                    const { page, errors } = await open('');
                    await setText(page, '# Title\n\nSmile \u{1F600}\n'); await page.waitForTimeout(800);
                    await run(page, 'export-pdf');
                    await page.waitForFunction(() => document.querySelector('.yavc-notice:not([hidden]), .pudl-toast, .toast'), null, { timeout: 30000 });
                    assert.deepEqual((await notices(page)).filter(n => n.buttons.includes('Print')), [], engine + ': an emoji refusal has no Print button, since printing would not help the font');
                    assert.deepEqual(errors, []); await page.close();
                }

                phase = 'a host with no file commands';
                {
                    const { page, errors } = await open('no-files');
                    assert.equal(await page.evaluate(() => !!pudlCommands.find('export-pdf', document.querySelector('#document'))), false, engine + ': there is no PDF export command, so no refusal and no button to offer');
                    assert.deepEqual(errors, []); await page.close();
                }
                console.log(engine + ': a PDF refused for right-to-left text offers Print');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
