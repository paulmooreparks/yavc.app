// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), pw = require('playwright'), fs = require('node:fs'), path = require('node:path');
const sample = fs.readFileSync(path.join(__dirname,'../site/home/Howto/Feature Playground/Document Pages.docs.md'),'utf8');
const port = process.env.YAVC_CHROME_TEST_PORT || '8442';
const action = (p, name, input = {}) => p.evaluate(({name,input}) => pudlActions.run('yavc.editor/' + name + '@1', input, {grant:'all'}), {name,input});
(async () => {
 for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium','firefox','webkit']) {
  const browser = await pw[engine].launch({headless:true}), page = await browser.newPage();
  try {
   await page.goto(`http://editor.localhost:${port}/`);
   await page.locator('.cm-content').waitFor({state:'attached'});
   await page.evaluate(async sample => {
    const F = await yavcUtil.siteFs();
    for (const name of ['one.txt','two.txt','Document Pages.docs.md']) await F.write(F.home(), name, name.endsWith('.md') ? sample : '# Saved sample\n', false);
    pudlApplets.destroy(document.querySelector('[data-applet]'));
   },sample);
   await page.evaluate(sample => {
    localStorage.setItem('pc-editor-session', JSON.stringify({tabs:['one.txt','two.txt','Document Pages.docs.md'].map(name => ({path:'~/' + name,name,lang:name.endsWith('.md')?'markdown':'text',draft:name.endsWith('.md')?sample.replace(/\r\n?/g,'\n'):null})),front:0}));
    for (const key of Object.keys(sessionStorage).filter(k => k.startsWith('pc-snap:'))) sessionStorage.removeItem(key);
    for (const key of Object.keys(localStorage).filter(k=>k.startsWith('pc-resume:editor'))) localStorage.removeItem(key);
   },sample);
   await page.reload();await page.locator('.cm-content').waitFor({state:'attached'});
   await page.waitForFunction(async () => (await pudlActions.run('yavc.editor/documents@1',{}, {grant:'all'})).documents.length === 3);
   await page.waitForFunction(() => Object.keys(localStorage).filter(k=>k.startsWith('pc-resume:editor:')).some(k=>JSON.parse(localStorage.getItem(k))?.v.tabs.length === 3));
   await action(page,'close',{index:1});
   assert.equal((await action(page,'documents')).documents.length,2);
   await action(page,'open-file',{path:'~/Document Pages.docs.md'});
   assert.equal((await action(page,'document')).modified,false);
   await action(page,'save');assert.equal((await action(page,'document')).modified,false);
   await page.evaluate(() => pudlApplets.destroy(document.querySelector('[data-applet]')));
   await page.evaluate(() => {for(const key of Object.keys(sessionStorage).filter(k=>k.startsWith('pc-snap:')))sessionStorage.removeItem(key);});
   await page.reload();await page.locator('.cm-content').waitFor({state:'attached'});
   await page.waitForFunction(async () => (await pudlActions.run('yavc.editor/documents@1',{}, {grant:'all'})).documents.length === 2);
   const docs=(await action(page,'documents')).documents;
   assert.ok(docs.every(d=>!d.path.endsWith('/one.txt')));
   assert.ok(docs.every(d=>d.modified===false));
   await action(page,'set-text',{text:'# Kept unsaved draft\n'});
   await page.evaluate(() => pudlApplets.destroy(document.querySelector('[data-applet]')));
   await page.reload();await page.locator('.cm-content').waitFor({state:'attached'});
   await page.waitForFunction(async()=> (await pudlActions.run('yavc.editor/document@1',{}, {grant:'all'})).text.includes('Kept unsaved draft'));
   // Showing the restored view used to clear this message before anyone could read it.
   await page.waitForFunction(()=>/Your unsaved changes to .+ are back\./.test(document.querySelector('[data-role=message]').textContent),null,{timeout:8000});
   await page.waitForTimeout(1500);assert.match(await page.locator('[data-role=message]').textContent(),/are back\./);
   await action(page,'save');assert.equal((await action(page,'document')).modified,false);
   const desktop=await browser.newPage();
   await desktop.goto(`http://localhost:${port}/?open=editor`);
   await desktop.locator('.win[data-win="editor"] .cm-content').waitFor({state:'attached'});
   await action(desktop,'new',{text:'Desktop unsaved draft'});
   await desktop.evaluate(()=>pudlWindows.close('editor'));
   await desktop.locator('.win[data-win="editor"]').waitFor({state:'hidden'});
   assert.equal(await desktop.locator('dialog[open]').count(),0);
   await desktop.evaluate(()=>pudlWindows.open('editor'));
   await desktop.locator('.win[data-win="editor"] .cm-content').waitFor({state:'attached'});
   await desktop.waitForFunction(async()=> (await pudlActions.run('yavc.editor/document@1',{}, {grant:'all'})).text === 'Desktop unsaved draft');
   assert.equal((await action(desktop,'document')).modified,true);
   await desktop.close();
   console.log(engine + ': closed tabs stay closed, saved pages stay clean, unsaved drafts survive reopening');
  } finally {await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
