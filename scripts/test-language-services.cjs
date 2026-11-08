// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright with NODE_PATH. Use disposable localhost data only.
const { strict: assert } = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const playwright = require('playwright');
const port = process.env.YAVC_LSP_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Use a disposable local port.');
const evidence = path.join(os.tmpdir(), 'yavc-lsp-evidence'); fs.mkdirSync(evidence, { recursive: true });
async function run(engine) {
    const browser = await playwright[engine].launch();
    try {
        for (const app of ['diagrams', 'editor']) {
            const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [], remote = [];
            page.on('pageerror', e => errors.push(e.message));
            page.on('console', m => { if (m.type() === 'error') errors.push(m.text() + ' at ' + m.location().url); });
            page.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && !u.hostname.endsWith('localhost') && !(u.hostname === 'plausible.io' && u.pathname.startsWith('/js/') && r.method() === 'GET')) remote.push(r.url()); });
            await page.route('https://plausible.io/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
            await page.addInitScript(() => {
                const Original = window.Worker;
                window.lspEvidence = { out: [], incoming: [], held: [], hold: [], workers: [] };
                window.Worker = class extends Original {
                    constructor(url, options) {
                        super(url, options);
                        if (!String(url).includes('/language-service/worker.js')) return;
                        window.lspEvidence.workers.push(this);
                        const post = this.postMessage.bind(this), methods = new Map();
                        this.postMessage = data => { const m = JSON.parse(data); window.lspEvidence.out.push(m); if (m.id != null) methods.set(m.id, m.method); post(data); };
                        this.addEventListener('message', event => {
                            const m = JSON.parse(event.data); window.lspEvidence.incoming.push(m);
                            if (m.id != null && window.lspEvidence.hold.includes(methods.get(m.id))) { event.stopImmediatePropagation(); window.lspEvidence.held.push({ worker: this, data: event.data }); }
                        });
                    }
                };
            });
            const action = (name, input = {}) => page.evaluate(({ app, name, input }) => window.pudlActions.run('yavc.' + app + '/' + name + '@1', input, { grant: 'all' }), { app, name, input });
            const text = () => page.locator('.cm-editor').evaluate(e => window.CM.EditorView.findFromDOM(e).state.doc.toString());
            const caret = pos => page.locator('.cm-editor').evaluate((e, pos) => { const v = window.CM.EditorView.findFromDOM(e); v.focus(); v.dispatch({ selection: { anchor: pos }, scrollIntoView: true }); }, pos);
            const make = async (source, name = 'sample.canvas') => {
                if (app === 'diagrams') await action('new', { kind: 'canvas', text: source });
                else await action('new', { path: '~/' + name, text: source });
                await page.waitForFunction(() => {
                    const view = window.CM.EditorView.findFromDOM(document.querySelector('.cm-editor')), plugin = window.CM.LSPPlugin.get(view);
                    return plugin && plugin.client.serverCapabilities;
                });
            };
            try {
                await page.goto(`http://${app}.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
                const source = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":160,"height":80,"text":"Hello","yavc":{"shape":""}}],"edges":[]}';
                await make(source);
                await caret(source.indexOf('"shape":""') + 9); await page.keyboard.press('Control+Space');
                await page.getByRole('option').filter({ hasText: 'rectangle' }).click({ timeout: 4000 });
                assert.equal(JSON.parse(await text()).nodes[0].yavc.shape, 'rectangle');
                await page.keyboard.press('Escape');
                await page.getByText('"width"', { exact: true }).hover();
                await page.waitForFunction(() => Array.from(document.querySelectorAll('.cm-tooltip-hover')).some(e => /width\s+in\s+pixels/i.test(e.textContent.replace(/\u00a0/g, ' '))));
                const beforeFormat = await text();
                await caret(0); await page.keyboard.press('Shift+Alt+f');
                await page.waitForFunction(before => window.CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString() !== before, beforeFormat);
                const formatted = await text(); assert.deepEqual(JSON.parse(formatted), JSON.parse(beforeFormat));
                await page.keyboard.press('Control+z'); assert.equal(await text(), beforeFormat);
                // A formatting reply must not overwrite typing or a new tab.
                const hold = () => page.evaluate(() => { lspEvidence.hold = ['textDocument/formatting']; });
                const release = () => page.evaluate(() => { lspEvidence.hold = []; for (const item of lspEvidence.held.splice(0)) item.worker.dispatchEvent(new MessageEvent('message', { data: item.data })); });
                const awaitHeld = () => page.waitForFunction(() => lspEvidence.held.length > 0);
                await hold(); await caret(0); await page.keyboard.press('Shift+Alt+f'); await awaitHeld();
                await page.keyboard.type(' '); const edited = await text(); await release();
                await page.waitForTimeout(100); assert.equal(await text(), edited);
                await hold(); await page.keyboard.press('Shift+Alt+f'); await awaitHeld();
                const next = '{"nodes":[],"edges":[]}'; await make(next, 'second.canvas'); await release();
                await page.waitForTimeout(100); assert.equal(await text(), next);
                // Reopening another document must have a distinct protocol identity.
                const uris = await page.evaluate(() => lspEvidence.out.filter(m => m.method === 'textDocument/didOpen').map(m => m.params.textDocument.uri));
                assert.equal(new Set(uris).size, uris.length);
                // Completion from a closed open instance cannot surface in its replacement.
                await page.evaluate(() => { lspEvidence.hold = ['textDocument/completion']; });
                await caret(1); await page.keyboard.press('Control+Space'); await awaitHeld();
                const closing = action('close'); await page.getByRole('button', { name: "Don't Save", exact: true }).click(); await closing;
                await make(next, 'second.canvas'); await release();
                await page.waitForTimeout(100); assert.equal(await text(), next);
                assert.equal(await page.getByRole('listbox').count(), 0);
                // Worker failure preserves the buffer and leaves ordinary editing usable.
                await page.evaluate(() => lspEvidence.workers.at(-1).dispatchEvent(new ErrorEvent('error', { message: 'Synthetic worker failure', cancelable: true })));
                await page.waitForFunction(() => !window.CM.LSPPlugin.get(window.CM.EditorView.findFromDOM(document.querySelector('.cm-editor'))));
                await page.locator('.yavc-notice.warn').filter({hasText:'Language assistance is unavailable'}).waitFor();
                assert.equal(await page.locator('.toast').filter({hasText:'Language assistance is unavailable'}).count(),0);
                assert.equal(await text(), next); await caret(0); await page.keyboard.type(' '); await page.keyboard.press('Control+z'); assert.equal(await text(), next);
                await page.evaluate(app => window.pudlCommands.run('language-restart', undefined, document.querySelector(app === 'diagrams' ? '.dg' : '.pc-editor')), app);
                await page.waitForFunction(() => { const p = CM.LSPPlugin.get(CM.EditorView.findFromDOM(document.querySelector('.cm-editor'))); return p && p.client.serverCapabilities; });
                assert.equal(await text(), next);
                await make(source, 'recovered.canvas'); await caret(source.indexOf('"shape":""') + 9); await page.keyboard.press('Control+Space');
                await page.getByRole('option').filter({ hasText: 'rectangle' }).click({ timeout: 4000 });
                assert.equal(JSON.parse(await text()).nodes[0].yavc.shape, 'rectangle');
                await page.keyboard.press('Escape');
                await action('set-text', { text: '{"nodes":false,"edges":[]}' });
                await page.waitForFunction(() => {
                    const p = CM.LSPPlugin.get(CM.EditorView.findFromDOM(document.querySelector('.cm-editor')));
                    return p && lspEvidence.incoming.some(m => m.method === 'textDocument/publishDiagnostics' && m.params.uri === p.uri && m.params.diagnostics.some(d => /array/i.test(d.message)));
                });
                await page.locator('.cm-lintRange-error, .cm-lintRange-warning').first().waitFor();
                await action('set-text', { text: next });
                await page.waitForFunction(() => !document.querySelector('.cm-lintRange-error, .cm-lintRange-warning'));
                if (app === 'editor') {
                    await make('{"enabled":true}', 'plain.json');
                    assert.ok(await page.evaluate(() => CM.LSPPlugin.get(CM.EditorView.findFromDOM(document.querySelector('.cm-editor'))).uri.endsWith('.json')));
                    await page.locator('.cm-editor').evaluate(e => { const v = CM.EditorView.findFromDOM(e); v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ' '.repeat(2097153) } }); });
                    await page.waitForFunction(() => !CM.LSPPlugin.get(CM.EditorView.findFromDOM(document.querySelector('.cm-editor'))));
                    await action('set-text', { text: '{"enabled":false}' });
                    await page.waitForFunction(() => !!CM.LSPPlugin.get(CM.EditorView.findFromDOM(document.querySelector('.cm-editor'))));
                    assert.equal(await text(), '{"enabled":false}');
                    // Exercise initial oversized mounting and read-only guards
                    // directly at the documented shared integration boundary.
                    await page.evaluate(() => {
                        const host = document.body.appendChild(document.createElement('div'));
                        const session = yavcLanguageServices.create(CM, () => {});
                        const view = new CM.EditorView({ parent: host, state: CM.EditorState.create({ doc: ' '.repeat(8388609), extensions: [CM.json(), session.extension('json', true), CM.EditorState.readOnly.of(true)] }) });
                        window.readOnlyFixture = { host, session, view };
                    });
                    await page.waitForFunction(() => !CM.LSPPlugin.get(readOnlyFixture.view));
                    await page.evaluate(() => { const v = readOnlyFixture.view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '{"recovered":true}' } }); });
                    await page.waitForFunction(() => { const p = CM.LSPPlugin.get(readOnlyFixture.view); return p && p.client.serverCapabilities; });
                    assert.equal(await page.evaluate(() => readOnlyFixture.session.format(readOnlyFixture.view)), false);
                    await page.evaluate(() => { const f = readOnlyFixture; f.view.destroy(); f.session.dispose(); f.host.remove(); });
                }
                await page.screenshot({ path: path.join(evidence, engine + '-' + app + '.png') });
                assert.deepEqual(errors, []); assert.deepEqual(remote, []);
                assert.ok(await page.evaluate(() => lspEvidence.out.some(m => m.method === 'initialize') && lspEvidence.out.some(m => m.method === 'textDocument/didOpen')));
            } catch (err) {
                await page.screenshot({ path: path.join(evidence, engine + '-' + app + '-failure.png') });
                const wire = await page.evaluate(() => {
                    if(!window.CM)return {out:window.lspEvidence&&lspEvidence.out,incoming:window.lspEvidence&&lspEvidence.incoming,unavailable:'CodeMirror did not load'};
                    const view = CM.EditorView.findFromDOM(document.querySelector('.cm-editor'));
                    return { out: lspEvidence.out, incoming: lspEvidence.incoming, status: CM.completionStatus(view.state), completions: CM.currentCompletions(view.state).map(c => c.label), selection: view.state.selection.main.toJSON(), tooltips: Array.from(document.querySelectorAll('.cm-tooltip')).map(e => e.outerHTML) };
                });
                fs.writeFileSync(path.join(evidence, engine + '-' + app + '-failure.json'), JSON.stringify({ errors, remote, wire }, null, 2));
                throw err;
            } finally { await page.close(); }
        }
        console.log(engine + ': LSP completion, hover, diagnostics, formatting/undo, stale replies, close/reopen, worker and size recovery passed in Editor and Diagrams');
    } finally { await browser.close(); }
}
(async () => { for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']) await run(name); })().catch(e => { console.error(e); process.exitCode = 1; });
