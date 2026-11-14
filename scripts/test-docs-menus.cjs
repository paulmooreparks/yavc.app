// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Where Docs' menus are (docs/editing-settings-contract.md, "Where the menus are"): on a page with no PUDL menu bar Docs draws its own, in its area, and the menus open and hold the commands;
// with a menu bar on the page, or editing.menus "host", it draws none; editing.menus "own" draws them in any case. A hint on a button of Docs' bars is PUDL's data-tooltip when the page loads
// PUDL's tooltip script, and the title otherwise, so that no glyph-only button is left without one. Against a built content package in an independent host:
//   node scripts/test-docs-menus.cjs <artifact> [chromium firefox webkit]
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
            const open = async query => { const p = await browser.newPage({ viewport: { width: 1400, height: 900 } }); p.setDefaultTimeout(30000); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs&plain${query}`); await p.locator('#document .ProseMirror').waitFor(); await p.waitForTimeout(800); return p; };
            const bar = p => p.evaluate(() => { const b = document.querySelector('#document .ed-own-menubar'); return b ? Array.from(b.querySelectorAll('[data-command]')).map(x => x.getAttribute('data-command')) : null; });
            const opened = p => p.evaluate(() => Array.from(document.querySelectorAll('.menu-panel:popover-open .menu-action')).map(r => r.textContent.replace(/\s+/g, ' ').trim()));
            try {
                phase = 'a page with no menu bar';
                let p = await open('');
                const own = await bar(p); assert.ok(own && ['menu-docs', 'menu-file', 'menu-edit', 'menu-insert', 'menu-view'].every(id => own.includes(id)), engine + ': Docs draws its own menus ' + JSON.stringify(own));
                await p.locator('#document .ed-own-menubar [data-command="menu-file"]').click();
                const rows = await opened(p);
                assert.ok(rows.some(r => /^Save\b/.test(r)) && rows.some(r => /^Save As/.test(r)) && rows.some(r => /Print/.test(r)), engine + ': the File menu holds Save, Save As and Print ' + JSON.stringify(rows));
                await p.keyboard.press('Escape');
                await p.locator('#document .ed-own-menubar [data-command="menu-view"]').click();
                const view = await opened(p);
                assert.ok(view.some(r => /Document/.test(r)) && view.some(r => /Text/.test(r)), engine + ': the View menu holds the views, so the Markdown view is in it on every page ' + JSON.stringify(view));
                await p.keyboard.press('Escape');
                // A menu row runs its command.
                await p.locator('#document .ed-own-menubar [data-command="menu-edit"]').click();
                await p.locator('.menu-panel:popover-open .menu-action', { hasText: /^Find/ }).first().click();
                await p.waitForFunction(() => { const f = document.querySelector('#document [data-role="find-place"]'); return f && !f.hidden; });
                assert.deepEqual(p.errors, []); await p.close();
                phase = 'a page with a menu bar, and the host choice';
                for (const [query, expected] of [['&menubar', false], ['&editing=menus-host', false], ['&editing=menus-own', true], ['&menubar&editing=menus-own', true]]) {
                    p = await open(query); const found = !!(await bar(p)); assert.equal(found, expected, engine + ': ' + query + ' has own menus ' + found); assert.deepEqual(p.errors, []); await p.close();
                }
                phase = 'a hint on a button';
                p = await open('&tooltips');
                const withTip = await p.evaluate(() => Array.from(document.querySelectorAll('#document .ed-own-menubar [data-command], #document .yavc-fallback-toolbar [data-command]')).map(b => [b.hasAttribute('title'), b.getAttribute('data-tooltip') || '']));
                assert.ok(withTip.length > 10 && withTip.every(([title]) => !title) && withTip.every(([, tip]) => tip), engine + ': with the tooltip script each button has data-tooltip and no title ' + JSON.stringify(withTip.filter(([t, tip]) => t || !tip)));
                await p.close();
                p = await open('');
                const noTip = await p.evaluate(() => Array.from(document.querySelectorAll('#document .ed-own-menubar [data-command], #document .yavc-fallback-toolbar [data-command]')).map(b => [b.getAttribute('title') || '', b.getAttribute('data-tooltip') || '']));
                assert.ok(noTip.every(([title, tip]) => title && !tip), engine + ': without it each button keeps its title ' + JSON.stringify(noTip.filter(([t]) => !t)));
                await p.close();
                console.log(engine + ': Docs has its menus on a page with no menu bar, the host can choose, and a hint is data-tooltip where PUDL shows it');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
