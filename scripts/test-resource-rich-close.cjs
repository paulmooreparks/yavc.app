// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8440';
const action=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit'])for(const app of ['editor','slides']){
 const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1450,height:1050}});p.setDefaultTimeout(20000);
 try{
  await p.goto(`http://localhost:${port}/?open=${app}`);const win=p.locator('.win[data-win="'+app+'"]');await win.waitFor();
  await p.evaluate(async()=>{const F=await yavcUtil.siteFs();await F.write(F.home(),'close.md','# Base\n',false);});
  await action(p,app,app==='editor'?'open-file':'open',{path:'~/close.md'});await action(p,app,'view',{mode:'split'});
  const rich=win.locator('.ProseMirror[contenteditable="true"]');await rich.waitFor();await rich.click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('Pending close');
  await p.evaluate(app=>pudlWindows.close(app),app);const dialog=p.locator('dialog[open]');await dialog.waitFor();
  if(app==='slides')assert.doesNotMatch((await action(p,app,'text')).text,/Pending close/,'This test must reach the close prompt before rich autosync.');
  // Editor's document action flushes rich edits before returning its text.
  // Verify the actual close/save result below without using that flushing read.
  assert.doesNotMatch(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'close.md'))),/Pending close/);
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await win.waitFor({state:'detached'});
  assert.match(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'close.md'))),/Pending close/);
  await p.evaluate(app=>pudlWindows.open(app),app);await win.waitFor();await action(p,app,app==='editor'?'open-file':'open',{path:'~/close.md'});await action(p,app,'view',{mode:'split'});await rich.waitFor();await rich.click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('Pending tab');
  await p.evaluate(app=>{window.pendingClose=pudlActions.run('yavc.'+app+'/close@1',{}, {grant:'all'});},app);await dialog.waitFor();if(app==='slides')assert.doesNotMatch((await action(p,app,'text')).text,/Pending tab/);await dialog.getByRole('button',{name:'Save',exact:true}).click();await p.evaluate(()=>pendingClose);assert.match(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'close.md'))),/Pending tab/);
  console.log(engine+' '+app+': window/tab Save includes a draft pending only in the rich surface');
 }finally{await browser.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
