// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Closing a window while its language service is still starting leaves no unhandled rejection (DESIGN.md decision 194): the start is cancelled quietly, and an unrelated unhandled rejection is still reported. Needs a server on YAVC_CHROME_TEST_PORT.
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8460';
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true });
        try {
            const page = await browser.newPage(), errors = [];
            // An unhandled rejection reaches a page as an event whose reason is the error, which Playwright shows as "Object" for the plain object the language client rejects with, so the page records the reasons itself, after every listener has run, and counts only those no listener marked as handled.
            await page.addInitScript(() => { window.__rejections = []; window.addEventListener('unhandledrejection', e => { setTimeout(() => { if (!e.defaultPrevented) window.__rejections.push((e.reason && e.reason.message || String(e.reason)) + ' ' + (e.reason && e.reason.code)); }, 0); }); });
            page.on('pageerror', e => errors.push(String(e && e.message))); page.setDefaultTimeout(30000);
            await page.goto(`http://localhost:${port}/applet/diagrams`); await page.locator('body').waitFor(); await page.waitForTimeout(500);
            // A language session whose editor has opened its file, closed before the server has answered the start.
            await page.evaluate(async () => {
                await yavcMdEditor.libs(); const CM = window.CM, services = await yavcMdEditor.languageServices(), session = services.create(CM, () => {});
                const host = document.createElement('div'); document.body.append(host);
                const view = new CM.EditorView({ doc: '{"a":1}', parent: host, extensions: [session.extension('json', false)] });
                await new Promise(resolve => setTimeout(resolve, 20)); view.destroy(); session.dispose(); host.remove();
                await new Promise(resolve => setTimeout(resolve, 1500));
            });
            assert.deepEqual(await page.evaluate(() => window.__rejections), [], engine + ': a start cancelled by closing the window leaves no unhandled rejection');
            // The quiet handling is for that one rejection: another is still reported.
            await page.evaluate(() => { Promise.reject(new Error('an unrelated rejection')); });
            await page.waitForTimeout(500);
            assert.deepEqual(await page.evaluate(() => window.__rejections), ['an unrelated rejection undefined'], engine + ': an unrelated unhandled rejection is still reported');
            console.log(engine + ': closing a window during the language start leaves no unhandled rejection');
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
