// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8423', evidence=path.join(os.tmpdir(),'yavc-editor-view-toolbar-evidence');fs.mkdirSync(evidence,{recursive:true});
const action=(page,name,input={})=>page.evaluate(({name,input})=>pudlActions.run('yavc.editor/'+name+'@1',input,{grant:'all'}),{name,input});
const selector=page=>page.locator('.yavc-command-toolbar [data-command-choice="ed-view"]');
async function checked(page,mode){await page.waitForFunction(mode=>document.querySelector('.yavc-command-toolbar [data-command="view-'+mode+'"]')?.getAttribute('aria-pressed')==='true',mode);}
(async()=>{
 for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),page=await browser.newPage({viewport:{width:1700,height:1000}});page.setDefaultTimeout(15000);
  try{
   await page.route('**/api/site/tree',async route=>{const response=await route.fetch({url:`http://127.0.0.1:${port}/api/site/tree`}),tree=await response.json();tree.children.push({name:'readonly.md',kind:'script',source:'# Read-only Markdown\n\n'+('A long safe fixture. '.repeat(30)+'\n\n').repeat(20)+'## Last Heading\n\nEnd.'});await route.fulfill({response,json:tree});});
   await page.goto(`http://editor.localhost:${port}/`,{waitUntil:'domcontentloaded'});await page.locator('.cm-editor').waitFor();await selector(page).waitFor();
   assert.deepEqual(await selector(page).locator('button').allTextContents(),['Document','Visual','Text','Split','Preview']);await checked(page,'text');
   for(const name of ['plain.txt','index.html','script.js','data.json','config.yaml']){
    await action(page,'new',{path:'~/'+name,text:name.endsWith('.html')?'<h1>HTML source</h1>':'Sample source'});await checked(page,'text');
    assert.equal(await selector(page).locator('[data-command="view-document"]').isDisabled(),true);
    await action(page,'view',{mode:'document'});await checked(page,'text');
   }
   await action(page,'new',{path:'~/article.md',text:'# Ordinary Markdown\n\nEditable body.'});await checked(page,'document');await page.locator('.doc-paginated .ProseMirror').waitFor();
   await selector(page).locator('[data-command="view-text"]').click();await checked(page,'text');
   await action(page,'new',{path:'~/other.docs.md',text:'# Other document'});await checked(page,'document');
   await page.getByRole('tab',{name:/article.md/}).click();await checked(page,'text');
   await page.evaluate(()=>pudlHost.config.set('editor',{markdownView:'visual'}));await action(page,'new',{path:'~/preference.md',text:'# Preference'});await checked(page,'visual');assert.equal(await page.locator('.doc-paginated').count(),0);
   await page.evaluate(()=>pudlHost.config.set('editor',{markdownView:'document',documentView:'text'}));await action(page,'new',{path:'~/preference.docs.md',text:'# Document preference'});await checked(page,'text');
   await page.evaluate(()=>pudlHost.config.set('editor',{documentView:'document'}));
   await action(page,'open-file',{path:'/site/readonly.md'});await checked(page,'document');await page.locator('.doc-page-flow').waitFor();assert.equal(await page.locator('.ProseMirror').count(),0);
   assert.equal(await page.locator('[data-role="readonly"]').isVisible(),true);
   await page.evaluate(()=>{pudlCommands.run('toggle-outline',null,document.querySelector('[data-applet]'));});
   for(const mode of ['document','visual','split']) {
    await action(page,'view',{mode});await checked(page,mode);
    await page.locator('[data-outline-index="0"]').click();await page.locator('[data-outline-index="1"]').click();
    await page.waitForFunction(()=>{const h=Array.from(document.querySelectorAll('.ed-page h2')).find(n=>n.textContent==='Last Heading');return h&&h.getBoundingClientRect().top>=0&&h.getBoundingClientRect().top<innerHeight;});
    await page.locator('[data-outline-index="0"]').click();
    await page.evaluate(()=>{const u=new URL(location.href);u.searchParams.set('file','/site/readonly.md');u.searchParams.set('line','43');history.pushState(null,'',u);dispatchEvent(new PopStateEvent('popstate'));});
    await page.waitForFunction(()=>{const h=Array.from(document.querySelectorAll('.ed-page h2')).find(n=>n.textContent==='Last Heading');return h&&h.getBoundingClientRect().top>=0&&h.getBoundingClientRect().top<innerHeight;});
   }
   await action(page,'view',{mode:'document'});
   await page.screenshot({path:path.join(evidence,engine+'-selector.png')});
   await page.locator('.yavc-command-toolbar [data-command="common-toolbar-customize"]').click();
   await page.getByLabel('Toolbar Commands',{exact:true}).selectOption({label:'View'});await page.getByRole('button',{name:'Remove from Toolbar',exact:true}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.yavc-command-toolbar [data-command-choice="ed-view"]'));
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('.cm-editor').waitFor({state:'attached'});assert.equal(await selector(page).count(),0);
   await page.locator('.yavc-command-toolbar [data-command="common-toolbar-customize"]').click();await page.getByRole('button',{name:'Restore Defaults',exact:true}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();await selector(page).waitFor();
   await page.setViewportSize({width:600,height:800});await page.screenshot({path:path.join(evidence,engine+'-narrow.png')});
   assert.equal(await page.locator('.yavc-command-toolbar').evaluate(n=>n.getBoundingClientRect().right>document.documentElement.clientWidth+1),false);
   const failed=await browser.newPage();await failed.route('**/page-view.js*',route=>route.abort());await failed.goto(`http://editor.localhost:${port}/`,{waitUntil:'domcontentloaded'});await failed.locator('.cm-editor').waitFor();
   await action(failed,'new',{path:'~/fallback.md',text:'# Keep this source'});await failed.waitForFunction(()=>Array.from(document.querySelectorAll('.yavc-notice')).some(n=>n.textContent.includes('could not be made')));await checked(failed,'text');assert.equal((await action(failed,'document')).text,'# Keep this source');await failed.close();
   console.log(engine+': selector order, defaults, explicit preferences/tab choice, readonly pages, removal/reset, narrow folding and failed-render fallback passed');
  }catch(err){await page.screenshot({path:path.join(evidence,engine+'-failure.png')});throw err;}finally{await browser.close();}
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
