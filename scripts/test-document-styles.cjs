// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Supply Playwright through NODE_PATH and use a disposable local server.
const assert = require('node:assert/strict');
const { chromium, firefox, webkit } = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8412';
if (!/^\d+$/.test(port)) throw new Error('Invalid test port');
(async () => {
    for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
        const browser = await engine.launch({ headless: true });
        try {
            const page = await browser.newPage();
            await page.goto(`http://localhost:${port}/`);
            await page.addScriptTag({ url: '/applets/md-editor/document-style.js' });
            const result = await page.evaluate(() => {
                const compile = yavcDocumentStyle.compile;
                const good = compile('test', '--doc-ink: rgb(10, 20, 30); .callout { color: rgb(20, 40, 60); padding: 3px; }');
                const bad = compile('test', '} body { color: red !important; } .callout { color: blue; }');
                const loads = compile('test', '@import "https://example.invalid/spy.css"; @font-face { font-family: spy; src: url(https://example.invalid/spy); } .x { background: url(https://example.invalid/spy); color: red; contain: none; position: fixed; animation: spy 1s; }');
                const escaped = compile('test', '.x { background: u\\72l(https://example.invalid/spy); }');
                const big = compile('test', ' '.repeat(256 * 1024 + 1));
                const surface = document.createElement('div'); surface.dataset.mdStyle = 'test'; surface.style.contain = 'paint';
                const own = document.createElement('p'); own.className = 'callout'; surface.append(own);
                const other = document.createElement('p'); other.className = 'callout';
                const baseline = document.createElement('style'); baseline.textContent = '.callout { color: rgb(1, 2, 3); }';
                const style = document.createElement('style'); style.textContent = good.css;
                document.head.append(baseline, style); document.body.append(surface, other);
                return { good, bad, loads, escaped, big, own: getComputedStyle(own).color, other: getComputedStyle(other).color, containment: getComputedStyle(surface).contain };
            });
            assert.deepEqual(result.good.classes, ['callout']); assert.deepEqual(result.good.problems, []);
            assert.equal(result.own, 'rgb(20, 40, 60)'); assert.equal(result.other, 'rgb(1, 2, 3)');
            assert.equal(result.containment, 'paint'); assert.equal(result.bad.css, '');
            assert.ok(result.bad.problems.length); assert.ok(result.loads.problems.length);
            assert.doesNotMatch(result.loads.css, /url|spy|position|contain|animation|@font|@import/);
            assert.equal(result.escaped.css, ''); assert.equal(result.big.css, '');
            console.log(name + ': style isolation, class discovery, scope escape, resource and containment protection passed');
            const lifecycle = await page.evaluate(async () => {
                const make = () => { const boundary = document.createElement('div'), root = document.createElement('div'); root.innerHTML = '<p class="owned">Owned</p>'; boundary.append(root); document.body.append(boundary); return root; };
                const a = make(), b = make(); a.parentElement.style.contain = 'layout';
                const pending = {}, reads = [], notices = [];
                const styles = yavcDocumentStyle.attach({ surfaces: () => [a], boundaries: [a.parentElement], read: path => { reads.push(path); return new Promise(resolve => { pending[path] = resolve; }); }, onProblems: p => notices.push(p) });
                const color = root => getComputedStyle(root.firstChild).color;
                await styles.update({ identity: 'a', inline: ['.owned { color: rgb(10, 30, 50); }'] });
                const first = { color: color(a), other: color(b), contain: getComputedStyle(a.parentElement).contain };
                const stale = styles.update({ identity: 'a', stylesheet: '~/old.css', inline: [] }); await Promise.resolve();
                const fresh = styles.update({ identity: 'b', stylesheet: '~/new.css', inline: ['.owned { color: rgb(20, 40, 60); }'] }); await Promise.resolve();
                pending['~/new.css']('.owned { color: rgb(99, 99, 99); } .from-file { font-weight: bold; }'); await fresh;
                pending['~/old.css']('.owned { color: rgb(200, 0, 0); }');
                const ignored = await stale, latest = color(a), classes = styles.state().classes;
                await styles.update({ identity: 'b', stylesheet: '~/new.css', inline: [] });
                const sharedColor = color(a), readCount = reads.length;
                const boundary = a.parentElement;
                boundary.style.cssText += ';position:fixed;top:10px;left:10px;width:80px;height:60px;z-index:2147483000';
                a.firstChild.style.cssText = 'position:fixed;top:0;left:0;width:500px;height:500px;background:red';
                await styles.update({ identity: 'attack', inline: ['display:contents!important;'] });
                const attack = { display: getComputedStyle(a).display, inside: document.elementFromPoint(20, 40) === a.firstChild, outside: document.elementFromPoint(100, 40) === a.firstChild };
                await styles.update({ identity: 'c', stylesheet: 'https://example.invalid/leak.css', inline: [] });
                const refused = styles.state().problems;
                const peer = yavcDocumentStyle.attach({ surfaces: [a], boundaries: [boundary] }); await peer.update({ inline: ['.owned { font-weight: bold; }'] });
                styles.destroy(); const stillContained = getComputedStyle(boundary).contain; peer.destroy();
                const restored = { contain: boundary.style.contain, attribute: a.hasAttribute('data-md-style'), owners: document.querySelectorAll('[data-md-style-owner]').length };
                let disposedRead = 0;
                const closing = yavcDocumentStyle.attach({ surfaces: [b], boundaries: [b.parentElement], read: () => { disposedRead++; return ''; } });
                const done = closing.update({ stylesheet: '~/closed.css' }); closing.destroy(); const closed = await done;
                let replacedRead = 0;
                const replacement = yavcDocumentStyle.attach({ surfaces: [b], boundaries: [b.parentElement], read: () => { replacedRead++; return ''; } });
                const replaced = replacement.update({ identity: 1, stylesheet: '~/stale.css' });
                await replacement.update({ identity: 2, inline: [] }); await replaced; replacement.destroy();
                const strengths = [];
                for (const value of ['strict', 'content', 'size', 'layout']) {
                    const root = make(), box = root.parentElement, host = document.createElement('style');
                    box.className = 'host-containment'; host.textContent = '.host-containment { contain:' + value + '; }'; document.head.append(host);
                    const before = getComputedStyle(box).contain;
                    const owner = yavcDocumentStyle.attach({ surfaces: [root], boundaries: [box] }); await owner.update({ inline: [] });
                    const during = getComputedStyle(box).contain; owner.destroy();
                    strengths.push({ before, during, after: getComputedStyle(box).contain, inline: box.style.contain }); host.remove(); box.remove();
                }
                const invalid = [];
                for (const mode of ['same', 'contents', 'inline']) {
                    const root = make(), box = root.parentElement, outer = document.createElement('div');
                    box.parentNode.insertBefore(outer, box); outer.append(box); if (mode !== 'same') box.style.display = mode;
                    const owner = yavcDocumentStyle.attach({ surfaces: [root], boundaries: [mode === 'same' ? root : box] });
                    try { await owner.update({ inline: ['color:red'] }); invalid.push(false); } catch (err) { invalid.push(true); } finally { owner.destroy(); outer.remove(); }
                }
                const changed = make(), changing = yavcDocumentStyle.attach({ surfaces: [changed], boundaries: [changed.parentElement] });
                await changing.update({ inline: [] }); changed.parentElement.style.contain = 'size'; changing.destroy();
                const hostChange = changed.parentElement.style.contain; changed.parentElement.remove();
                return { first, latest, ignored, classes, sharedColor, readCount, refused, stillContained, restored, disposedRead, closed, replacedRead, reads, notices: notices.length, attack, strengths, invalid, hostChange };
            });
            assert.equal(lifecycle.first.color, 'rgb(10, 30, 50)'); assert.notEqual(lifecycle.first.other, lifecycle.first.color);
            assert.match(lifecycle.first.contain, /paint/); assert.match(lifecycle.first.contain, /layout/); assert.equal(lifecycle.latest, 'rgb(20, 40, 60)');
            assert.equal(lifecycle.ignored.applied, false); assert.deepEqual(lifecycle.classes, ['from-file', 'owned']);
            assert.equal(lifecycle.sharedColor, 'rgb(99, 99, 99)'); assert.equal(lifecycle.readCount, 2);
            assert.match(lifecycle.refused[0], /resolved local/); assert.equal(lifecycle.reads.length, 2);
            assert.match(lifecycle.stillContained, /paint/); assert.deepEqual(lifecycle.restored, { contain: 'layout', attribute: false, owners: 0 });
            assert.equal(lifecycle.disposedRead, 0); assert.equal(lifecycle.closed.applied, false); assert.equal(lifecycle.replacedRead, 0);
            assert.deepEqual(lifecycle.attack, { display: 'contents', inside: true, outside: false });
            for (const value of lifecycle.strengths) { assert.equal(value.before, value.after); assert.equal(value.inline, ''); assert.ok(value.during === value.before || value.during.includes(value.before)); }
            assert.deepEqual(lifecycle.invalid, [true, true, true]); assert.equal(lifecycle.hostChange, 'size');
            console.log(name + ': style controller containment, cascade, stale reads, path refusal, shared ownership and disposal passed');
        } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
