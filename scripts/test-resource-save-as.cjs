// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Explicitly adopt the prepared adapter in a disposable test host only.
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const port=process.env.YAVC_CHROME_TEST_PORT||'8438',evidence=path.join(os.tmpdir(),'yavc-resource-save-as');fs.mkdirSync(evidence,{recursive:true});
const action=(p,name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.diagrams/'+name+'@1',input,{grant:'all'}),{name,input});
const startCopy=p=>p.evaluate(()=>{window.copyDone=pudlCommands.run('save-as',null,document.querySelector('[data-applet]'));});
const read=(p,resource)=>p.evaluate(resource=>pcSiteFs.contentResources.read({resource}),resource);
const adopt=async route=>{const target=new URL(route.request().url());target.hostname='127.0.0.1';const response=await route.fetch({url:target.href});await route.fulfill({response,body:(await response.text())+'\nwindow.pudlHost.contentResources=window.pudlHost.contentResourceAdapter;\n'});};
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),context=await browser.newContext({viewport:{width:1400,height:1000}}),p=await context.newPage();p.setDefaultTimeout(20000);let phase='boot';const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await context.route('**/static/host.js*',adopt);
 try{
  await p.goto(`http://diagrams.localhost:${port}/`);await p.locator('.dg-canvas img').waitFor();
  assert.equal(await p.evaluate(()=>pudlHost.contentResources===pudlHost.contentResourceAdapter),true);
  await p.evaluate(async()=>{const F=await yavcUtil.siteFs();await F.write(F.home(),'original.d2','a: Original\n',false);await F.write(F.home(),'target.d2','target: Before\n',false);});
  await action(p,'open-file',{path:'~/original.d2',view:'split'});await p.locator('.dg-canvas img').waitFor();
  await action(p,'set-text',{text:'a: Original\ncopy: Submitted\n'});
  phase='captured copy';await startCopy(p);const dialog=p.locator('.fb-picker[open]');await dialog.waitFor();await dialog.getByLabel('File Name',{exact:true}).fill('copy.d2');
  await action(p,'set-text',{text:'a: Original\ncopy: Submitted\nlater: Newer\n'});
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await p.evaluate(()=>copyDone);
  assert.doesNotMatch((await read(p,'~/copy.d2')).text,/Newer/);assert.equal((await read(p,'~/original.d2')).text,'a: Original\n');assert.equal(await p.locator('.doc-tab-dirty').count(),1);
  await p.evaluate(()=>pudlCommands.run('save',null,document.querySelector('[data-applet]')));assert.match((await read(p,'~/copy.d2')).text,/Newer/);
  phase='cancellation';await startCopy(p);await dialog.waitFor();await dialog.getByLabel('File Name',{exact:true}).fill('cancelled.d2');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await p.evaluate(()=>copyDone);assert.equal(await p.evaluate(()=>pcSiteFs.resolve(pcSiteFs.home(),'cancelled.d2')),null);assert.equal(await p.locator('[data-role="where"]').innerText(),'~/copy.d2');
  phase='replacement re-confirmation';await startCopy(p);await dialog.waitFor();await dialog.getByLabel('File Name',{exact:true}).fill('target.d2');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.getByRole('button',{name:'Replace',exact:true}).waitFor();
  const other=await context.newPage();await other.goto(`http://diagrams.localhost:${port}/`);await other.evaluate(async()=>{const F=await yavcUtil.siteFs();await F.write(F.home(),'target.d2','target: External\n',false);});await p.evaluate(()=>pcSiteFs.sync());
  await dialog.getByRole('button',{name:'Replace',exact:true}).click();assert.equal((await read(p,'~/target.d2')).text,'target: External\n');assert.equal(await dialog.count(),1);
  await dialog.getByRole('button',{name:'Replace',exact:true}).click();await p.evaluate(()=>copyDone);assert.match((await read(p,'~/target.d2')).text,/Newer/);await other.close();
  phase='explicit create';await action(p,'save',{path:'~/agent-copy.d2'});assert.match((await read(p,'~/agent-copy.d2')).text,/Newer/);assert.match(await action(p,'save',{path:'~/original.d2'}).then(()=>'',e=>e.message),/exists/);assert.equal((await read(p,'~/original.d2')).text,'a: Original\n');
  await p.screenshot({path:path.join(evidence,engine+'-saved-copy.png')});
  phase='abort while selecting';await startCopy(p);await dialog.waitFor();await dialog.getByLabel('File Name',{exact:true}).fill('disposed.d2');await p.evaluate(()=>pudlApplets.destroy(document.querySelector('[data-applet]')));await p.evaluate(()=>copyDone);assert.equal(await p.locator('.fb-picker').count(),0);assert.equal(await p.evaluate(()=>pcSiteFs.resolve(pcSiteFs.home(),'disposed.d2')),null);
  phase='abort before authority commit';await p.reload();await p.locator('.dg-canvas img').waitFor();await startCopy(p);await dialog.waitFor();await dialog.getByLabel('File Name',{exact:true}).fill('blocked.d2');
  await p.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('yavc-vfs',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['state','entries','contents'],'readwrite'),store=tx.objectStore('state');window.releaseBlocker=false;function hold(){const r=store.get('home');r.onsuccess=()=>{if(!window.releaseBlocker)hold();};}hold();tx.oncomplete=()=>db.close();resolve();};}));
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.fb-picker [data-pick="ok"]').disabled);await p.evaluate(()=>{pudlApplets.destroy(document.querySelector('[data-applet]'));window.releaseBlocker=true;});await p.evaluate(()=>copyDone);assert.equal(await p.locator('.fb-picker').count(),0);assert.equal(await p.evaluate(()=>pcSiteFs.resolve(pcSiteFs.home(),'blocked.d2')),null);
  phase='abort before adapter loading';const fresh=await browser.newContext(),boot=await fresh.newPage();boot.setDefaultTimeout(20000);boot.on('pageerror',e=>errors.push(e.message));await fresh.route('**/static/host.js*',adopt);
  let releaseLoad,sawLoad;const loaded=new Promise(resolve=>{sawLoad=resolve;}),gate=new Promise(resolve=>{releaseLoad=resolve;});const delayed=async route=>{sawLoad();await gate;await route.continue();};await fresh.route('**/static/resource-host.js*',delayed);
  await boot.goto(`http://diagrams.localhost:${port}/`,{waitUntil:'domcontentloaded'});await boot.locator('.dg-canvas img').waitFor();await startCopy(boot);let deadline;try{await Promise.race([loaded,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('The lazy adapter request did not start.')),20000);})]);}finally{clearTimeout(deadline);}await boot.evaluate(()=>pudlApplets.destroy(document.querySelector('[data-applet]')));releaseLoad();await boot.evaluate(()=>copyDone);assert.equal(await boot.locator('.fb-picker').count(),0);await fresh.close();
  assert.deepEqual(errors,[]);console.log(engine+': host Save As capture, cancellation, replacement revisions, create-only action and disposal passed');
 }catch(e){await p.screenshot({path:path.join(evidence,engine+'-failure.png')});fs.writeFileSync(path.join(evidence,engine+'-failure.json'),JSON.stringify({phase,errors,text:(await p.locator('body').innerText()).slice(-6000)},null,2));throw e;}finally{await context.close();await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
