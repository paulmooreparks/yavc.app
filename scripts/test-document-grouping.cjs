// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'), pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8456';
const action=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const b=await pw[engine].launch({headless:true});try{
  const p=await b.newPage({viewport:{width:1500,height:1000}});p.setDefaultTimeout(30000);let grouping='tabbed';
  await p.route('**/*',async route=>{if(!route.request().isNavigationRequest())return route.continue();const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/name="yavc-document-grouping" content="[^"]*"/,'name="yavc-document-grouping" content="'+grouping+'"')});});
  try{
   await p.goto(`http://localhost:${port}/?open=docs`);await p.locator('[data-applet="docs"][data-applet-state="running"]').waitFor();
   await action(p,'docs','new',{path:'~/One.docs.md',text:'# First document\n\nOriginal body.\n'});await action(p,'docs','save');
   const first=await action(p,'docs','document');if(first.index>1)await action(p,'docs','close',{index:1});
   await action(p,'docs','view',{mode:'document'});await p.locator('.ProseMirror h1').click();await p.keyboard.press('End');await p.keyboard.type(' pending draft');
   // Open immediately without a manual source/view synchronization workaround.
   await action(p,'docs','new',{path:'~/Two.docs.md',text:'# Second document\n'});await action(p,'docs','save');await action(p,'docs','view',{mode:'visual'});
   const retained=await action(p,'docs','document',{index:1});assert.ok(retained.text.includes('pending draft'));assert.equal(retained.modified,true);
   await p.locator('.doc-tabs [role="tab"]').first().click();const restoredHeading=p.locator('.ProseMirror h1').filter({hasText:'pending draft'});await restoredHeading.waitFor();await restoredHeading.click();await p.keyboard.press('End');await p.keyboard.type(' tab switch draft');
   await p.locator('.doc-tabs [role="tab"]').nth(1).click();await p.waitForFunction(()=>document.querySelector('.win-title').textContent.includes('Two.docs.md'));assert.ok((await action(p,'docs','document',{index:1})).text.includes('tab switch draft'));
   await action(p,'docs','new',{path:'~/Three.docs.md',text:'# Third document\n'});await action(p,'docs','save');await action(p,'docs','view',{mode:'preview'});
   await p.evaluate(()=>yavcSnapshot.keepAll());await p.reload();await p.locator('[data-applet="docs"][data-applet-state="running"]').waitFor();
   for(const [index,mode] of [[0,'document'],[1,'visual'],[2,'preview'],[0,'document']]){
    await p.locator('.doc-tabs [role="tab"]').nth(index).click();await p.waitForFunction(mode=>document.querySelector('.yavc-command-toolbar [data-command="view-'+mode+'"]')?.getAttribute('aria-pressed')==='true',mode);
    assert.equal((await action(p,'docs','document')).index,index+1);
    if(mode==='document')assert.equal(await p.locator('[data-applet="docs"]').evaluate(n=>n.classList.contains('ed-document')),true);
   }
   await p.evaluate(()=>yavcSnapshot.keepAll());grouping='single';let release;const gate=new Promise(resolve=>release=resolve);
   await p.route('**/win/docs-2*',async route=>{await gate;await route.continue();});
   await p.reload();await p.waitForFunction(()=>document.querySelector('.win[data-win="docs"]').inert);
   await p.evaluate(()=>pudlWindows.close('docs'));assert.equal(await p.locator('.win[data-win="docs"]').count(),1);release();
   await p.waitForFunction(()=>document.querySelectorAll('[data-applet="docs"][data-applet-state="running"]').length===3);
   await p.evaluate(()=>pudlApplets.start('docs'));
   assert.equal(await p.locator('.doc-tabs:visible').count(),0);
   const titles=await p.locator('.win-title').allTextContents();for(const name of ['One.docs.md','Two.docs.md','Three.docs.md'])assert.ok(titles.some(t=>t.includes(name)));
   const original=p.locator('.win').filter({has:p.locator('.win-title').filter({hasText:'One.docs.md'})});assert.ok(await original.locator('.ProseMirror').innerText().then(t=>t.includes('pending draft')));
   const originalKey=await original.getAttribute('data-win');
   await p.evaluate(async()=>{const other=Array.from(document.querySelectorAll('.win')).find(win=>win.querySelector('.win-title')?.textContent.includes('Two.docs.md'));await pudlCommands.run('open',{resource:'~/One.docs.md'},other.querySelector('[data-applet="docs"]'));});
   assert.equal(await p.locator('[data-applet="docs"]').count(),3);assert.equal(await p.evaluate(()=>pudlWindows.state().top),originalKey);
   await p.evaluate(async()=>{const F=await yavcUtil.siteFs();await F.write(F.home(),'unsupported.go','package main\n',false);});
   const rejected=await action(p,'docs','open-file',{path:'~/unsupported.go'}).then(()=>'',error=>error.message);assert.match(rejected,/Markdown/);assert.equal(await p.locator('[data-applet="docs"]').count(),3);
   await p.evaluate(()=>yavcSnapshot.keepAll());await p.reload();await p.waitForFunction(()=>document.querySelectorAll('[data-applet="docs"][data-applet-state="running"]').length===3);await p.evaluate(()=>Promise.all(pudlWindows.state().open.map(key=>pudlApplets.start(key))));assert.equal(await p.locator('.doc-tabs:visible').count(),0);
   console.log(engine+': pending rich draft survives New; Document/Visual/Preview restore per tab; legacy tabs migrate to independent recoverable windows');
  }catch(error){console.error(engine,await p.url(),await p.locator('.win-title').allTextContents());throw error;}finally{await p.close();}
  for(const app of ['editor','slides','diagrams']){
   const q=await b.newPage();q.setDefaultTimeout(30000);try{
    await q.goto(`http://localhost:${port}/?open=${app}`);await q.locator(`[data-applet="${app}"][data-applet-state="running"]`).waitFor();
    const create=text=>action(q,app,app==='slides'?'load':'new',app==='diagrams'?{kind:'canvas',text:'{"nodes":[],"edges":[]}'}:{text});
    await create('# First unsaved document\n');await create('# Second unsaved document\n');
    await q.waitForFunction(app=>document.querySelectorAll(`[data-applet="${app}"][data-applet-state="running"]`).length===2,app);assert.equal(await q.locator('.doc-tabs:visible').count(),0);
    assert.equal(await q.locator('.win-title').count(),2);
    if(app==='editor'){
     await q.evaluate(async()=>{await pudlHost.config.set('editor',{keys:{'Mod-Alt-n':'new'}});pudlWindows.raise('editor');});await q.locator('.win[data-win="editor"] .cm-content').click();await q.keyboard.press('Control+Alt+n');
     await q.waitForFunction(()=>document.querySelectorAll('[data-applet="editor"]').length===3);
    }
    const expected=app==='editor'?3:2;await q.evaluate(()=>yavcSnapshot.keepAll());await q.reload();await q.waitForFunction(({app,expected})=>document.querySelectorAll(`[data-applet="${app}"][data-applet-state="running"]`).length===expected,{app,expected});await q.evaluate(()=>Promise.all(pudlWindows.state().open.map(key=>pudlApplets.start(key))));assert.equal(await q.locator('.doc-tabs:visible').count(),0);
    console.log(engine+': '+app+' creates and restores one window per document');
   }finally{await q.close();}
  }
 }finally{await b.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
