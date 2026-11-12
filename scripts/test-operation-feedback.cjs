// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8447';
const rect=p=>p.locator('.ed-scroll').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const b=await pw[engine].launch({headless:true});try{
  const p=await b.newPage({viewport:{width:1500,height:1050}});await p.goto(`http://docs.localhost:${port}/`);await p.locator('.cm-editor').waitFor({state:'attached'});
  await p.evaluate(async()=>{await pudlActions.run('yavc.docs/new@1',{path:'~/kept.docs.md',text:'# Keep this document\n'},{grant:'all'});const F=await yavcUtil.siteFs();await F.write(F.home(),'unsupported.go','package main\n',false);await document.fonts.ready;});
  // The Files pane is hidden at first (DESIGN.md, decision 74), and this test clicks a file in it.
  await p.evaluate(()=>pudlCommands.run('toggle-files',null,document.querySelector('[data-applet]')));await p.locator('.ed-files-panel a[data-file]').filter({hasText:'unsupported.go'}).first().waitFor({state:'visible'});
  const before=await rect(p),original=await p.evaluate(()=>pudlActions.run('yavc.docs/documents@1',{}, {grant:'all'}));
  await p.locator('.ed-files-panel a[data-file]').filter({hasText:'unsupported.go'}).first().click();
  await p.locator('.toast.danger').filter({hasText:'Docs opens Markdown'}).waitFor();assert.deepEqual(await rect(p),before);assert.equal(await p.locator('.yavc-notice:visible').count(),0);
  assert.deepEqual(await p.evaluate(()=>pudlActions.run('yavc.docs/documents@1',{}, {grant:'all'})),original);
  await p.locator('.toast.danger').filter({hasText:'Docs opens Markdown'}).waitFor({state:'hidden',timeout:8000});
  await p.evaluate(()=>yavcUtil.notice(document.querySelector('.ed-scroll'),'Persistent content warning','warn'));assert.equal(await p.locator('.yavc-notice.warn:visible').count(),1);
  await p.close();
  for(const app of ['slides','diagrams']){
   const q=await b.newPage({viewport:{width:1500,height:1050}});await q.goto(`http://${app}.localhost:${port}/`);await q.waitForFunction(app=>document.querySelector('[data-applet="'+app+'"]')?.getAttribute('data-applet-state')==='running',app);
   await q.evaluate(()=>{pudlHost.fs.open=async()=>{throw new Error('Synthetic open refusal');};});
   await q.evaluate(()=>pudlCommands.run('open',null,document.querySelector('[data-applet]')));await q.locator('.toast.danger').filter({hasText:'Synthetic open refusal'}).waitFor();assert.equal(await q.locator('.yavc-notice:visible').count(),0);await q.close();
  }
  const d=await b.newPage();await d.goto(`http://localhost:${port}/?open=docs`);await d.locator('.ProseMirror').waitFor();const header=await d.locator('.site-header').evaluate(n=>n.getBoundingClientRect().height);
  await d.evaluate(()=>document.querySelector('[data-win-layer]').dispatchEvent(new CustomEvent('pudl:taskbar-activation-end',{detail:{status:'failed'}})));await d.locator('.toast.danger').filter({hasText:'pinned application could not open'}).waitFor();assert.equal(await d.locator('.site-header').evaluate(n=>n.getBoundingClientRect().height),header);await d.close();
  const fallback=await b.newPage();await fallback.route('**/pudl-toast.js*',r=>r.abort());await fallback.goto(`http://docs.localhost:${port}/`);await fallback.locator('.cm-editor').waitFor({state:'attached'});
  await fallback.evaluate(()=>{window.pendingFeedback=yavcUtil.toast('Refused <unsafe> input','danger');});const dialog=fallback.getByRole('dialog',{name:'Operation Could Not Be Completed'});await dialog.waitFor();assert.equal(await dialog.locator('p').textContent(),'Refused <unsafe> input');assert.equal(await dialog.locator('unsafe').count(),0);await dialog.getByRole('button',{name:'OK',exact:true}).click();await fallback.close();
  console.log(engine+': unsupported Docs open, Slides/Diagrams open failures and taskbar refusal use toasts; document/geometry survive and persistent warnings stay inline');
 }finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
