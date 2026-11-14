// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A change to a settings file that arrives while a save of it is under way is seen once the save is done (DESIGN.md decision 193). It was dropped: config.js's watch() returned when a save was under way and never read the file again, so a change made in another tab at that moment stayed unknown until the next change. Needs a server on YAVC_CHROME_TEST_PORT.
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8460';
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true });
        try {
            const page = await browser.newPage(), errors = [];
            page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(30000);
            await page.goto(`http://localhost:${port}/applet/editor`); await page.locator('.cm-content').waitFor();
            const result = await page.evaluate(async () => {
                await pcConfig.load('watch-test', { a: 0 });
                const F = await yavcUtil.siteFs(), heard = [];
                pcConfig.onChange('watch-test', (all, own) => heard.push(JSON.stringify(own)));
                // A save that has written its file and not yet reported, which is when another tab's change arrives.
                const write = F.write.bind(F); let slow = true;
                F.write = async function (...args) { const r = await write(...args); if (slow && /watch-test\.json$/.test(String(args[1]))) { slow = false; await new Promise(res => setTimeout(res, 600)); } return r; };
                const saving = pcConfig.set('watch-test', { a: 1 });
                await new Promise(res => setTimeout(res, 150));
                // Another tab writes the file, through the original write so that this page's own save is not involved.
                const other = await write(F.home(), '~/.config/watch-test.json', JSON.stringify({ a: 1, b: 2 }, null, 2) + '\n', false);
                if (other.error) throw new Error(other.error);
                const error = await saving; if (error) throw new Error(error);
                await new Promise(res => setTimeout(res, 1500));
                F.write = write;
                return { heard, now: pcConfig.get('watch-test'), text: (await F.read(F.resolve(F.home(), '~/.config/watch-test.json'))) };
            });
            assert.equal(result.now.b, 2, engine + ': the change made during the save is seen once the save is done: ' + JSON.stringify(result));
            assert.ok(result.heard.some(h => /"b":2/.test(h)), engine + ': listeners were told of it: ' + JSON.stringify(result.heard));
            assert.deepEqual(errors, []);
            console.log(engine + ': a settings change that arrives during a save is read when the save is done');
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
