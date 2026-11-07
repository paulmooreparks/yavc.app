// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const port=process.env.YAVC_CHROME_TEST_PORT||'8436';
const evidence=path.join(os.tmpdir(),'yavc-resource-evidence');fs.mkdirSync(evidence,{recursive:true});
const action=(p,app,name,input)=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
(async()=>{
 for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),context=await browser.newContext({viewport:{width:1400,height:900}}),p=await context.newPage();p.setDefaultTimeout(20000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  let phase='Terminal';
  try{
   await p.goto(`http://terminal.localhost:${port}/`);await p.locator('.xterm-screen').waitFor();
   await p.waitForFunction(()=>document.querySelector('.xterm-rows')?.textContent.includes('~'));
   const terminal=await action(p,'terminal','run',{command:'touch ~/probe.txt; touch ~/probe.txt; echo queued > ~/probe.txt; cat ~/probe.txt'});
   assert.equal(terminal.status,0);assert.match(terminal.output,/queued/);assert.doesNotMatch(terminal.output,/Promise|touch:/);
   assert.equal(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'probe.txt'))),'queued\n');
   await action(p,'terminal','run',{command:'mkdir ~/working; cd ~/working'});
   const other=await context.newPage();await other.goto(`http://terminal.localhost:${port}/`);await other.evaluate(()=>yavcUtil.siteFs());
   await other.evaluate(async()=>{const F=pcSiteFs;await F.remove(F.resolve(F.home(),'working'),true);await F.write(F.home(),'working','replacement',false);});
   const cwd=await action(p,'terminal','run',{command:'pwd'});assert.equal(cwd.cwd,'~');assert.match(cwd.output,/home\/guest/);await other.close();
   for(const app of ['editor','slides','diagrams']){
    phase=app+' initial load';
    await p.goto(`http://${app}.localhost:${port}/`);await p.waitForFunction(()=>{const save=document.querySelector('.yavc-command-toolbar [data-command="save"]');return save&&!save.disabled;});
    if(app==='diagrams')await p.locator('.dg-canvas img').waitFor();
    if(app==='editor'){await action(p,app,'new',{path:'~/consumer.md',text:'# VFS document\n\nEditable.'});await action(p,app,'save',{path:'~/consumer.md'});}
    if(app==='slides'){await action(p,app,'load',{text:'# VFS deck\n\nEditable.'});await action(p,app,'save',{path:'~/consumer.slides.md'});}
    if(app==='diagrams'){await action(p,app,'new',{kind:'canvas',text:'{"nodes":[],"edges":[]}'});await action(p,app,'save',{path:'~/consumer.canvas'});}
    const name=app==='editor'?'consumer.md':app==='slides'?'consumer.slides.md':'consumer.canvas';
    if(app==='editor'||app==='slides'){await p.waitForFunction(()=>typeof yavcMdEngine==='function');await p.evaluate(()=>yavcMdEngine());}
    const saved=await p.evaluate(name=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),name)),name);assert.ok(saved);
    await p.reload();await p.waitForFunction(()=>{const save=document.querySelector('.yavc-command-toolbar [data-command="save"]');return save&&!save.disabled;});
    assert.equal(await p.evaluate(name=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),name)),name),saved);
   }
   await p.evaluate(()=>localStorage.setItem('pc-terminal-home',JSON.stringify({files:{'/legacy.md':{t:'f',c:'retained older copy'}}})));
   await p.reload();await p.locator('.site-header .notice.warn').waitFor();
   const notice=p.locator('.site-header .notice.warn'),button=notice.getByRole('button',{name:'Download File Records'});
   assert.equal(await button.evaluate(n=>n.classList.contains('btn')),true);
   const box=await notice.boundingBox();assert.ok(box.y>=0&&box.y+box.height<900);
   const download=p.waitForEvent('download');await button.click();assert.equal((await download).suggestedFilename(),'yavc-file-records.json');
   await p.screenshot({path:path.join(evidence,engine+'-legacy-fork.png')});
   assert.deepEqual(errors,[]);
   console.log(engine+': real Terminal touch, Editor/Slides/Diagrams save and reload, visible fork warning and download passed');
  }catch(e){await p.screenshot({path:path.join(evidence,engine+'-failure.png')});fs.writeFileSync(path.join(evidence,engine+'-failure.txt'),JSON.stringify({phase,url:p.url(),errors,text:(await p.locator('body').innerText()).slice(-8000)},null,2));throw e;}finally{await context.close();await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
