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
        } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
