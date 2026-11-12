// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_LSP_TEST_PORT || '8461';
if (!/^\d+$/.test(port)) throw new Error('Use a disposable localhost port.');
(async function () {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium','firefox','webkit']) {
        const browser = await pw[engine].launch({headless:true});
        try {
            const context = await browser.newContext({viewport:{width:1400,height:950}}), page = await context.newPage(), errors = [], remote = [];
            page.on('pageerror', e => errors.push(e.message));
            page.on('request', r => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !/^(localhost|.*\.localhost|127\.0\.0\.1)$/.test(u.hostname) && u.hostname !== 'plausible.io') remote.push(r.url()); });
            await page.route('https://plausible.io/**', r => r.fulfill({status:200,body:''}));
            await page.goto(`http://localhost:${port}/applet/editor`);
            await page.locator('.cm-content').waitFor();
            const action = (name,input) => page.evaluate(({name,input}) => pudlActions.run('yavc.editor/'+name+'@1',input,{grant:'all'}), {name,input});
            for (const item of [{name:'web.css',text:'p { col }',at:7,label:'color'}, {name:'web.html',text:'<but',at:4,label:'button'}]) {
                await action('new',{path:'~/'+item.name,text:item.text});
                await page.waitForFunction(() => { const v=CM.EditorView.findFromDOM(document.querySelector('.cm-editor')),p=CM.LSPPlugin.get(v); return p&&p.client.serverCapabilities; });
                await context.setOffline(true);
                await page.locator('.cm-editor').evaluate((e,at) => {const v=CM.EditorView.findFromDOM(e);v.focus();v.dispatch({selection:{anchor:at}});CM.startCompletion(v);},item.at);
                await page.waitForFunction(label => {const v=CM.EditorView.findFromDOM(document.querySelector('.cm-editor'));return CM.currentCompletions(v.state).some(c=>c.label===label);},item.label);
                const option = page.getByRole('option').filter({hasText:new RegExp('^'+item.label+'$')}).first();
                await option.click();
                await page.keyboard.press('Escape');
                assert.ok((await page.locator('.cm-content').innerText()).includes(item.label));
                // Formatting is an explicit, undoable edit in the same document.
                if (item.name.endsWith('.css')) {
                    await page.locator('.cm-editor').evaluate(e => {const v=CM.EditorView.findFromDOM(e);v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'p{color:red;}'},annotations:CM.isolateHistory.of('full')});});
                    await page.keyboard.press('Shift+Alt+f');
                    await page.waitForFunction(() => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('\n'));
                    // Undo is what a person presses. The editor keeps its history in the workspace, so CodeMirror's own undo function finds none.
                    await page.locator('.cm-content').click(); await page.keyboard.press('ControlOrMeta+z');
                    await page.waitForFunction(() => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString() === 'p{color:red;}');
                    assert.equal(await page.locator('.cm-content').innerText(),'p{color:red;}');
                }
                await context.setOffline(false);
            }
            assert.deepEqual(errors,[]); assert.deepEqual(remote,[]);
            console.log(engine+' CSS/HTML offline completion and source formatting passed.');
            await context.close();
        } finally { await browser.close(); }
    }
})().catch(e=>{console.error(e);process.exitCode=1;});
