// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The host's file-command settings (docs/editing-settings-contract.md): fileCommands: false takes New, Open, Save As, Export and Print away from Docs, with their keys and the actions
// that do their work, and save: "host" takes Docs' own Save away. export@1, print@1 and the other actions the host calls stay. Against a built content package:
//   node scripts/test-docs-file-commands.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const FILE = ['new', 'new-template', 'new-markdown', 'open', 'save-as', 'import-docx', 'export-docx', 'export-pdf', 'print-document'];
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
                for (const setting of ['', 'no-files', 'host-saves']) {
                    phase = 'setting ' + (setting || 'none');
                    const p = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = []; p.setDefaultTimeout(30000); p.on('pageerror', e => errors.push(e.message));
                    await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs&plain${setting ? '&editing=' + setting : ''}`); await p.locator('#document .ProseMirror').waitFor();
                    // Whether a command is there: PUDL finds it from the instance's root, and a command that is not in the table is not found.
                    const exists = id => p.evaluate(id => !!pudlCommands.find(id, document.querySelector('#document')), id);
                    const act = (name, input = {}) => p.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }).then(v => ({ ok: v }), e => ({ error: String(e.message || e) })), { name, input });
                    if (setting === 'no-files') {
                        for (const id of FILE) { assert.equal(await exists(id), false, engine + ': ' + id + ' does not exist when the host took the file commands away'); }
                        assert.equal(await exists('save'), true, engine + ': Save is still there');
                        for (const name of ['new', 'open-file', 'new-template']) { const r = await act(name, name === 'open-file' ? { path: 'memory:document.docs.md' } : name === 'new-template' ? { template: 'blank' } : {}); assert.ok(r.error && /file commands/.test(r.error), engine + ': ' + name + ' is refused: ' + JSON.stringify(r)); }
                        const exported = await act('export', { format: 'docx' }); assert.ok(exported.ok, engine + ': export@1 stays callable: ' + JSON.stringify(exported).slice(0, 200));
                        await p.evaluate(() => { const append = document.body.append.bind(document.body); document.body.append = (...nodes) => { append(...nodes); for (const node of nodes) { if (node.tagName === 'IFRAME') { node.contentWindow.print = () => { window.printed = true; }; } } }; });
                        const printed = await act('print'); assert.ok(printed.ok, engine + ': print@1 stays callable for the host: ' + JSON.stringify(printed).slice(0, 200));
                    } else if (setting === 'host-saves') {
                        assert.equal(await exists('save'), false, engine + ': Docs has no Save when the host saves');
                        for (const id of ['save-as', 'print-document']) { assert.equal(await exists(id), true, engine + ': ' + id + ' stays'); }
                        await p.locator('#document .ProseMirror p').last().click(); await p.keyboard.type('x'); await p.keyboard.press('ControlOrMeta+s'); await p.waitForTimeout(600);
                        assert.equal(await p.evaluate(() => fixture.writes.length), 0, engine + ': Ctrl+S writes nothing when the host saves');
                    } else {
                        for (const id of ['save', 'save-as', 'print-document']) { assert.equal(await exists(id), true, engine + ': ' + id + ' exists with no setting'); }
                    }
                    assert.deepEqual(errors, [], engine + ': no page errors'); await p.close();
                }
                console.log(engine + ': fileCommands and save take the commands, their keys and their actions away, and leave the host export@1 and print@1');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
