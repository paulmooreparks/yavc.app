// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A read-only Docs instance (docs/editing-settings-contract.md, "A read-only instance"): three of them, at 320, 450 and 600 pixels (the last as pages), beside one
// editable instance on one page. Each draws the note and has nothing with which to change it, shares the page and the engine, keeps no draft and stores nothing, takes
// keys only when it has the focus, and gives its place back to a new instance. Run against a built content package in an independent host:
//   node scripts/test-docs-read-only.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const para = (n, w = 60) => 'Paragraph ' + n + '. ' + Array.from({ length: w }, (_, i) => 'word' + (i % 13)).join(' ');
const NOTE = '# The Note\n\nIntroduction with a [link to the second part](#second-part).\n\n' + Array.from({ length: 12 }, (_, i) => para(i + 1)).join('\n\n') +
    '\n\n## Second Part\n\n| Name | Value |\n| --- | --- |\n| One | 1 |\n| Two | 2 |\n\n- A list item\n- Another list item\n\n' + Array.from({ length: 24 }, (_, i) => para(i + 13)).join('\n\n') + '\n\n## Last Part\n\nThe end.\n';
const host = `
(function(){
    fixture.records.set('memory:note.docs.md',{text:${JSON.stringify(NOTE)},revision:1,name:'Note.docs.md'});
    fixture.joins=[];fixture.configSets=[];fixture.snapshotChanges=0;
    var join=pudlHost.snapshot.join;
    pudlHost.snapshot=Object.assign({},pudlHost.snapshot,{join:function(root,take,options){fixture.joins.push(root.id);var h=join.apply(this,arguments);var changed=h.changed;h.changed=function(){fixture.snapshotChanges++;return changed.apply(this,arguments);};return h;}});
    var set=pudlHost.config.set;pudlHost.config.set=function(app,value){fixture.configSets.push([app,JSON.stringify(value)]);return set.apply(this,arguments);};
    document.addEventListener('pudl:applet-state',function(event){if(/^note/.test(event.target.id))event.detail.state='file='+encodeURIComponent('memory:note.docs.md');});
})();`;
const page = html => html.replace('<section><h2>Deck</h2>', '<section><h2>Notes</h2>' +
    '<div style="width:320px"><div id="note320" data-applet="docs" data-docs-mode="read" data-applet-flush></div></div>' +
    '<div style="width:450px"><div id="note450" data-applet="docs" data-docs-mode="read" data-applet-flush></div></div>' +
    '<div style="width:600px"><div id="note600" data-applet="docs" data-docs-mode="read" data-docs-layout="pages" data-applet-flush></div></div></section><section><h2>Deck</h2>');
(async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8')), allowed = new Set(manifest.files.map(f => f.path));
    const server = http.createServer(async (req, res) => {
        try {
            const u = new URL(req.url, 'http://localhost'); if (!u.pathname.startsWith(prefix)) return res.writeHead(404).end();
            const name = decodeURIComponent(u.pathname.slice(prefix.length)); if (!allowed.has(name)) return res.writeHead(404).end();
            let body = await fs.readFile(path.join(artifact, name));
            if (name === 'workspace-lab/host.js') body = Buffer.from(body + '\n' + host);
            if (name === 'workspace-lab/index.html') body = Buffer.from(page(body.toString()));
            res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream'); res.end(body);
        } catch (error) { res.writeHead(500).end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const engine of process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit']) {
            const browser = await pw[engine].launch({ headless: true }), p = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [], wasm = []; p.setDefaultTimeout(30000);
            // Observers that are connected: each observe() adds one and disconnect() takes it away, so a disposed instance that leaves one behind shows as growth.
            await p.addInitScript(() => { window.liveObservers = new Set(); for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) { const C = window[name]; if (!C) continue; const observe = C.prototype.observe, disconnect = C.prototype.disconnect; C.prototype.observe = function () { window.liveObservers.add(this); return observe.apply(this, arguments); }; C.prototype.disconnect = function () { window.liveObservers.delete(this); return disconnect.apply(this, arguments); }; } });
            p.on('pageerror', e => errors.push(e.message)); p.on('request', r => { if (/\.wasm(\?|$)/.test(r.url())) wasm.push(r.url()); }); let phase = 'startup';
            const act = (id, name, input = {}) => p.evaluate(({ id, name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all', target: document.getElementById(id) }).then(v => ({ ok: v }), e => ({ error: String(e.message || e) })), { id, name, input });
            try {
                await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);
                await p.waitForFunction(() => ['note320', 'note450', 'note600'].every(id => document.querySelector('#' + id + ' [data-ed-page]') && /The Note/.test(document.querySelector('#' + id).textContent)));
                await p.locator('#document .ProseMirror').waitFor();
                phase = 'what each draws';
                // The pages are laid out a moment after the note is drawn, which a slow browser takes longer to do.
                await p.waitForFunction(() => document.querySelectorAll('#note600 .doc-page-gap').length > 0, null, { timeout: 20000 }).catch(() => {});
                const shape = await p.evaluate(() => ['note320', 'note450', 'note600'].map(id => {
                    const r = document.getElementById(id), vis = e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
                    return { id, width: r.clientWidth, overflow: r.scrollWidth - r.clientWidth, editable: Array.from(r.querySelectorAll('[contenteditable="true"],textarea')).filter(vis).length,
                        commands: Array.from(r.querySelectorAll('[data-command]')).filter(vis).map(e => e.getAttribute('data-command')).sort(), views: Array.from(r.querySelectorAll('[data-command^="view-"],[data-command-choice="ed-view"]')).filter(vis).length,
                        tabs: Array.from(r.querySelectorAll('[data-role="tabs"],[data-role="status-bar"]')).filter(vis).length, link: !!r.querySelector('a[href="#second-part"]'), table: !!r.querySelector('table'), pages: r.querySelectorAll('.doc-page-gap,.doc-print-sheet').length };
                }));
                for (const s of shape) {
                    assert.ok(s.overflow <= 1, engine + ' ' + s.id + ': the note does not overflow its pane (' + s.overflow + ' px at ' + s.width + ')');
                    assert.equal(s.editable, 0, engine + ' ' + s.id + ': nothing in it can be typed in'); assert.equal(s.views, 0, engine + ' ' + s.id + ': no view switch'); assert.equal(s.tabs, 0, engine + ' ' + s.id + ': no tabs and no status bar');
                    assert.ok(s.commands.every(c => ['find', 'toggle-outline', 'print-document', 'copy', 'select-all'].includes(c)), engine + ' ' + s.id + ': only reading commands exist: ' + s.commands.join(', '));
                    assert.ok(s.link && s.table, engine + ' ' + s.id + ': the links and the table are drawn');
                }
                // The tab's tooltip is the name the host gave the document, as the status line shows it, and not the resource's ID.
                const tips = await p.evaluate(() => Array.from(document.querySelectorAll('#note320 [role="tab"]')).map(t => t.title)); assert.deepEqual(tips, ['Note.docs.md'], engine + ': the tooltip is the name ' + JSON.stringify(tips));
                assert.ok(shape[2].pages >= 1, engine + ': with data-docs-layout="pages" it is drawn in pages');
                phase = 'the actions';
                // Actions reach the instance that started last, so start a read-only one last.
                await p.evaluate(() => { const r = document.getElementById('note320'); pudlApplets.destroy(r.parentNode); pudlApplets.boot(r.parentNode); });
                await p.waitForFunction(() => /The Note/.test(document.getElementById('note320').textContent));
                for (const [name, input] of [['set-text', { text: 'x' }], ['view', { mode: 'text' }], ['open-file', { path: 'memory:document.docs.md' }], ['new', {}], ['save', {}], ['insert', { text: 'x' }]]) {
                    const r = await act('note320', name, input); assert.ok(r.error && /read-only/.test(r.error), engine + ': ' + name + ' is refused with its reason: ' + JSON.stringify(r));
                }
                const read = await act('note320', 'document'); assert.ok(read.ok && read.ok.readOnly === true && /The Note/.test(read.ok.text), engine + ': the document can be read');
                const where = await act('note320', 'position'); assert.ok(where.ok && /^v1:\d+:/.test(where.ok.output ? where.ok.output.position : where.ok.position), engine + ': there is a place to read ' + JSON.stringify(where));
                phase = 'select and find';
                await p.locator('#note450 [data-ed-page] p', { hasText: 'Paragraph 3.' }).first().click({ clickCount: 3 });
                assert.match(await p.evaluate(() => String(getSelection())), /Paragraph 3\./, engine + ': text can be selected');
                await p.evaluate(() => pudlCommands.run('find', null, document.getElementById('note450')));
                await p.waitForTimeout(500);
                const finds = await p.evaluate(() => ['note320', 'note450', 'note600', 'document'].map(id => { const r = document.getElementById(id), f = r.querySelector('[data-role="find-place"]'); return { id, open: !!f && !f.hidden && f.children.length > 0, replace: !!(f && /replace/i.test(f.textContent + Array.from(f.querySelectorAll('input')).map(i => i.name + i.getAttribute('aria-label')).join(''))) }; }));
                assert.ok(finds.find(f => f.id === 'note450').open && !finds.find(f => f.id === 'note450').replace, engine + ': Find opens in that instance, without Replace: ' + JSON.stringify(finds));
                assert.ok(finds.filter(f => f.id !== 'note450').every(f => !f.open), engine + ': and in no other instance');
                await p.keyboard.press('Escape');
                phase = 'a link in a note stays in the note';
                // The first paragraph holds a link to a later heading. Following it moves that note and no other, leaves the address of the page alone and keeps the keyboard in the note, so that a key such as Ctrl+F still reaches it.
                const scrolls = () => p.evaluate(() => ['note320', 'note450', 'note600'].map(id => document.querySelector('#' + id + ' [data-role="scroll"]').scrollTop));
                const beforeLink = await scrolls(); await p.locator('#note320 [data-ed-page] a[href="#second-part"]').first().click(); await p.waitForTimeout(400);
                const afterLink = await scrolls();
                assert.ok(afterLink[0] > beforeLink[0] + 100 && afterLink[1] === beforeLink[1] && afterLink[2] === beforeLink[2], engine + ': the link moves its own note only ' + JSON.stringify([beforeLink, afterLink]));
                assert.equal(await p.evaluate(() => location.hash), '', engine + ': and the address of the page is not changed');
                assert.equal(await p.evaluate(() => document.activeElement.closest('[data-applet]') && document.activeElement.closest('[data-applet]').id), 'note320', engine + ': the keyboard stays in the note');
                phase = 'keys act on the focused instance';
                await p.locator('#note320 [data-ed-page] p', { hasText: 'Paragraph 1.' }).first().click();
                // The instance has a key for Find once it is ready, which a slow machine reaches later than the click.
                await p.waitForFunction(() => { const c = pudlCommands.find('find', document.getElementById('note320')); const k = c && (typeof c.shortcut === 'function' ? c.shortcut() : c.shortcut); return !!k; });
                await p.keyboard.press('ControlOrMeta+s'); await p.keyboard.press('ControlOrMeta+f'); await p.waitForTimeout(500);
                const keyed = await p.evaluate(() => ['note320', 'note450', 'note600', 'document'].map(id => { const f = document.getElementById(id).querySelector('[data-role="find-place"]'); return [id, !!f && !f.hidden && f.children.length > 0]; }));
                assert.deepEqual(keyed.filter(k => k[1]).map(k => k[0]), ['note320'], engine + ': Ctrl+F opens Find only in the focused instance ' + JSON.stringify(keyed));
                assert.equal(await p.evaluate(() => fixture.writes.length), 0, engine + ': Ctrl+S wrote nothing');
                phase = 'the outline';
                await p.evaluate(() => pudlCommands.run('toggle-outline', null, document.getElementById('note600')));
                await p.waitForFunction(() => { const o = document.querySelector('#note600 [data-role="outline-pane"]'); return o && !o.hidden && /Second Part/.test(o.textContent); });
                phase = 'nothing is kept';
                const kept = await p.evaluate(() => ({ joins: fixture.joins, sets: fixture.configSets, writes: fixture.writes.length, local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
                assert.ok(!kept.joins.some(id => /^note/.test(id)), engine + ': a read-only instance joins no snapshot ' + JSON.stringify(kept.joins));
                assert.equal(kept.writes, 0); assert.deepEqual(kept.local.filter(k => /session|docs|note/i.test(k)), [], engine + ': it stores nothing in the page: ' + kept.local.join(','));
                assert.equal(wasm.length, 1, engine + ': the engine is fetched once for the page ' + wasm.join(' '));
                phase = 'its place goes to the next instance';
                await p.evaluate(() => { const s = document.querySelector('#note450 [data-role="scroll"]'); s.scrollTop = s.scrollHeight * 0.55; });
                await p.waitForTimeout(400);
                const place = await p.evaluate(() => { const detail = {}; document.getElementById('note450').dispatchEvent(new CustomEvent('yavc-docs-position', { detail })); return detail.position; });
                assert.ok(!/^v1:1:/.test(place), engine + ': the place moved with the scroll: ' + place);
                await p.evaluate(() => { const r = document.getElementById('note450'); pudlApplets.destroy(r.parentNode); });
                const left = await p.evaluate(() => ({ children: document.getElementById('note450').children.length, joins: fixture.joins.slice() }));
                assert.equal(left.children, 0, engine + ': disposing leaves nothing drawn');
                await p.evaluate(place => { const r = document.getElementById('note450'); window.placeEvents = []; r.addEventListener('yavc-docs-place', e => window.placeEvents.push(e.detail.used)); r.setAttribute('data-docs-position', place); pudlApplets.boot(r.parentNode); }, place);
                await p.waitForFunction(() => /The Note/.test(document.getElementById('note450').textContent));
                await p.waitForTimeout(1500);
                const back = await p.evaluate(() => document.querySelector('#note450 [data-role="scroll"]').scrollTop);
                assert.ok(back > 300, engine + ': the new instance opens at the place (' + back + ')');
                // The host is told that the place was used, by the event, by the position event and by position@1, so that it can say a note has changed when it was not.
                phase = 'whether the place was used';
                assert.deepEqual(await p.evaluate(() => window.placeEvents), [true], engine + ': yavc-docs-place said the place was used, once');
                assert.equal(await p.evaluate(() => { const detail = {}; document.getElementById('note450').dispatchEvent(new CustomEvent('yavc-docs-position', { detail })); return detail.placeUsed; }), true, engine + ': the position event says it was used');
                const usedByAction = await p.evaluate(() => { const detail = { ref: 'yavc.docs/position@1', input: {}, grant: 'all' }; document.getElementById('note450').dispatchEvent(new CustomEvent('yavc-docs-action', { detail })); return detail.result.then(v => v.placeUsed !== undefined ? v.placeUsed : v.output && v.output.placeUsed); });
                assert.equal(usedByAction, true, engine + ': position@1 says it was used');
                // A place whose text is no longer in the note, a string that cannot be read, and none at all.
                for (const [given, expected, what] of [['v1:3:zzzzzz', false, 'a place whose text is gone'], ['not a place', false, 'a string that cannot be read'], [null, null, 'no place']]) {
                    await p.evaluate(() => { const r = document.getElementById('note450'); pudlApplets.destroy(r.parentNode); });
                    await p.evaluate(given => { const r = document.getElementById('note450'); window.placeEvents = []; if (given === null) r.removeAttribute('data-docs-position'); else r.setAttribute('data-docs-position', given); pudlApplets.boot(r.parentNode); }, given);
                    await p.waitForFunction(() => /The Note/.test(document.getElementById('note450').textContent)); await p.waitForTimeout(1200);
                    assert.deepEqual(await p.evaluate(() => window.placeEvents), expected === null ? [] : [expected], engine + ': ' + what + ': the event');
                    assert.equal(await p.evaluate(() => { const detail = {}; document.getElementById('note450').dispatchEvent(new CustomEvent('yavc-docs-position', { detail })); return detail.placeUsed; }), expected, engine + ': ' + what + ': placeUsed is ' + expected);
                }
                // Actions go to the instance that started last, which here is a read-only one, so a host that writes in the editable note asks it by an event on its root
                // (docs/editing-settings-contract.md, "Running an action on one instance"): the same actions, the same input, and the answer in detail.result.
                phase = 'an action on one instance';
                const onRoot = (id, ref, input) => p.evaluate(({ id, ref, input }) => { const detail = { ref, input, grant: 'all' }; document.getElementById(id).dispatchEvent(new CustomEvent('yavc-docs-action', { detail })); return detail.result.then(v => ({ ok: v }), e => ({ error: String(e.message || e) })); }, { id, ref, input });
                const editable = await onRoot('document', 'yavc.docs/document@1', {}), note = await onRoot('note450', 'yavc.docs/document@1', {});
                assert.ok(editable.ok && /Editable words/.test(editable.ok.text) && editable.ok.readOnly === false, engine + ': document@1 on the editable root reaches the editable note: ' + JSON.stringify(editable).slice(0, 200));
                assert.ok(note.ok && /The Note/.test(note.ok.text) && note.ok.readOnly === true, engine + ': and on a read-only root, that note: ' + JSON.stringify(note).slice(0, 200));
                await p.locator('#document .ProseMirror p', { hasText: 'Editable words.' }).first().click(); await p.keyboard.press('End');
                const typed = await onRoot('document', 'yavc.docs/insert@1', { text: ' *PLAIN*', format: 'plain' });
                assert.ok(typed.ok, engine + ': insert@1 plain on the editable root: ' + JSON.stringify(typed).slice(0, 200));
                await p.waitForTimeout(600);
                const after = await onRoot('document', 'yavc.docs/document@1', {}), noteAfter = await onRoot('note450', 'yavc.docs/document@1', {});
                assert.ok(/Editable words\. ?\\\*PLAIN\\\*/.test(after.ok.text), engine + ': the words went into the editable note: ' + JSON.stringify(after.ok.text));
                assert.equal(noteAfter.ok.text, note.ok.text, engine + ': and no read-only note changed');
                const refused = await onRoot('note450', 'yavc.docs/insert@1', { text: 'x', format: 'plain' }); assert.ok(refused.error && /read-only/.test(refused.error), engine + ': a read-only root refuses insert@1 with its reason: ' + JSON.stringify(refused));
                await onRoot('document', 'yavc.docs/set-text@1', { text: '# Plain\n\nWords only.\n' });
                const exported = await onRoot('document', 'yavc.docs/export@1', { format: 'docx' }); assert.ok(exported.ok, engine + ': export@1 on the editable root: ' + JSON.stringify(exported).slice(0, 200));
                const where2 = await onRoot('note450', 'yavc.docs/position@1', {}); assert.ok(where2.ok && /^v1:/.test(where2.ok.position || ''), engine + ': position@1 on a read-only root: ' + JSON.stringify(where2));
                // The host's own search lands on a match: Find opens with the words, the first match is selected, and no match refuses.
                await p.evaluate(() => document.querySelectorAll('[data-role="find-place"]').forEach(f => { f.hidden = true; }));
                const hit = await onRoot('note450', 'yavc.docs/find@1', { text: 'paragraph 7' }); assert.ok(hit.ok && hit.ok.matches === 1 && hit.ok.index === 1, engine + ': find@1 on a read-only root finds the match: ' + JSON.stringify(hit));
                assert.match(await p.evaluate(() => String(getSelection())), /^Paragraph 7$/i, engine + ': and selects it');
                assert.deepEqual(await p.evaluate(() => ['note320', 'note450', 'note600'].map(id => { const f = document.querySelector('#' + id + ' [data-role="find-place"]'); return !!f && !f.hidden && f.children.length > 0; })), [false, true, false], engine + ': and opens Find in that instance only');
                const miss = await onRoot('note450', 'yavc.docs/find@1', { text: 'no such words here' }); assert.ok(miss.error && /no match/i.test(miss.error), engine + ': no match refuses with its reason: ' + JSON.stringify(miss));
                const hitEditable = await onRoot('document', 'yavc.docs/find@1', { text: 'words' }); assert.ok(hitEditable.ok && hitEditable.ok.matches >= 1, engine + ': find@1 on the editable root: ' + JSON.stringify(hitEditable));
                const alien = await onRoot('note450', 'yavc.other/anything@1', {}); assert.ok(alien.error, engine + ': a reference that is not a Docs action is refused');
                phase = 'disposing leaves no observer';
                const cycle = () => p.evaluate(async () => { const r = document.getElementById('note600'); pudlApplets.destroy(r.parentNode); await new Promise(f => setTimeout(f, 300)); pudlApplets.boot(r.parentNode); await new Promise(f => setTimeout(f, 1500)); pudlApplets.destroy(r.parentNode); await new Promise(f => setTimeout(f, 300)); return window.liveObservers.size; });
                const first = await cycle(), later = [await cycle(), await cycle()];
                assert.deepEqual(later, [first, first], engine + ': each dispose of a read-only instance leaves no observer connected (' + first + ' then ' + later.join(', ') + ')');
                assert.deepEqual(errors, [], engine + ': no page errors');
                console.log(engine + ': three read-only instances beside an editable one: drawn, nothing to change them, nothing kept, keys only on the focused one, place given back');
            } catch (err) { console.error(engine, phase, errors.length ? 'page errors: ' + errors.join(' / ') : ''); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
