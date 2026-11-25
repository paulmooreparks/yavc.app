// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT;
const ids = ['cut', 'copy', 'paste', 'select-all', 'link', 'table', 'box'];
(async () => { for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
    const browser = await pw[engine].launch({headless:true});
    try { for (const app of ['docs', 'editor']) { for (const host of ['desktop', 'standalone']) {
        const page = await browser.newPage({viewport:{width:1440,height:900}}), warnings = [], errors = [];
        page.setDefaultTimeout(20000);
        page.on('console', msg => { if (/^pudl-(commands|menubar):/.test(msg.text())) warnings.push(msg.text()); });
        page.on('pageerror', error => errors.push(error.message));
        let release; const gate = new Promise(resolve => { release = resolve; });
        await page.route('**/md-editor/kit.js*', async route => { await gate; await route.continue(); });
        try {
            await page.goto(host === 'desktop' ? `http://localhost:${port}/?open=${app}&top=${app}` : `http://${app}.localhost:${port}/`, {waitUntil:'domcontentloaded'});
            await page.waitForFunction(app => {
                const root = document.querySelector('[data-applet="'+app+'"]');
                return root && window.pudlCommands && pudlCommands.find('undo', root);
            }, app);
            const early = await page.evaluate(({app,ids}) => {
                const root = document.querySelector('[data-applet="'+app+'"]');
                // Exercise the same scoped resolver used by the host menubar,
                // while the kit request is held rather than relying on timing.
                pudlCommands.menuRows(ids, root);
                return ids.map(id => { const c = pudlCommands.find(id, root); return {id, present:!!c, disabled:c && !!pudlCommands.value(c,'disabled')}; });
            }, {app,ids});
            release();
            await page.locator(`[data-applet="${app}"] .cm-content`).waitFor({state:'attached'});
            await page.waitForFunction(({app,ids}) => ids.every(id => pudlCommands.find(id,document.querySelector('[data-applet="'+app+'"]'))), {app,ids});
            const titles = page.locator('[data-menubar] .menubar-title:visible, .yavc-command-toolbar [data-command^="menu-"]:visible');
            assert.ok(await titles.count() > 0, 'The real host menubar must be present.');
            for (let i=0;i<await titles.count();i++) { await titles.nth(i).click(); await page.keyboard.press('Escape'); }
            console.log(engine+' '+app+' '+host+' startup registrations '+JSON.stringify(early)+'; warnings '+JSON.stringify(warnings));
            assert.deepEqual(early,ids.map(id=>({id,present:true,disabled:true})), 'Menu commands exist and are disabled before the kit loads.');
            // PUDL 0.109.0 keeps the display-only Cut, Copy, Paste and Select All keys (pudl issue 40), so no warning is expected.
            assert.deepEqual(warnings,[], 'Unexpected PUDL command/menu warning.');
            assert.deepEqual(errors,[]);
        } finally { release(); await page.close(); }
    } } } finally { await browser.close(); }
} })().catch(error=>{console.error(error);process.exitCode=1;});
