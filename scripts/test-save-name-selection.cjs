// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8472';
async function selection(page,name,stem){const input=page.locator('.fb-picker[open] [data-pick="input"]');await input.waitFor();assert.deepEqual(await input.evaluate(el=>({value:el.value,from:el.selectionStart,to:el.selectionEnd,focused:document.activeElement===el})),{value:name,from:0,to:stem.length,focused:true});return input;}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});try{for(const app of ['docs','slides','editor','diagrams']){
  const page=await browser.newPage({viewport:{width:1500,height:1100}});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto('http://localhost:'+port+'/applet/'+app);await page.locator('[data-applet][data-applet-state="running"]').waitFor();
   if(app==='docs'){await page.locator('.ProseMirror').waitFor();await page.locator('.ProseMirror').click();await page.keyboard.type('A document.');}
   await page.waitForFunction(()=>{const command=pudlCommands.find('save-as',document.querySelector('[data-applet]'));return command&&!(typeof command.disabled==='function'?command.disabled():command.disabled);});
   await page.evaluate(app=>{window.filenameSave=pudlCommands.run(app==='docs'?'save':'save-as',null,document.querySelector('[data-applet]'));},app);
   const input=page.locator('.fb-picker[open] [data-pick="input"]');await input.waitFor();const name=await input.inputValue(),suffix=app==='docs'?'.docs.md':app==='slides'?'.slides.md':app==='diagrams'?'.d2':'';
   assert.ok(name.endsWith(suffix));if(app==='docs')assert.equal(name,'untitled-1.docs.md');
   await selection(page,name,name.slice(0,name.length-suffix.length));await page.keyboard.type('Renamed');assert.equal(await input.inputValue(),'Renamed'+suffix);
   await page.locator('.fb-picker[open] [data-pick="cancel"]').click();await page.evaluate(()=>filenameSave);
   if(app==='editor'){
    for(const [suggested,stem] of [['report.v2.DOCS.MD','report.v2'],['notes.md','notes'],['Makefile','Makefile'],['.env','.env'],['résumé.slides.md','résumé']]){
     await page.evaluate(async name=>{window.nameChoice=pcFileBrowser.pick(await yavcUtil.siteFs(),{mode:'save',name,host:document.querySelector('[data-applet]')});},suggested);
     await selection(page,suggested,stem);await page.locator('.fb-picker[open] [data-pick="cancel"]').click();await page.evaluate(()=>nameChoice);
    }
    await page.evaluate(async()=>{window.originalStem=pudlHost.fileResolution.stem;pudlHost.fileResolution.stem=()=>Promise.reject(new Error('Synthetic naming failure'));window.nameChoice=pcFileBrowser.pick(await yavcUtil.siteFs(),{mode:'save',name:'fallback.txt'});});
    await selection(page,'fallback.txt','fallback');await page.locator('.fb-picker[open] [data-pick="cancel"]').click();await page.evaluate(()=>nameChoice);
    await page.evaluate(async()=>{pudlHost.fileResolution.stem=()=>new Promise(()=>{});window.nameChoice=pcFileBrowser.pick(await yavcUtil.siteFs(),{mode:'save',name:'timeout.txt'});});
    await selection(page,'timeout.txt','timeout');await page.locator('.fb-picker[open] [data-pick="cancel"]').click();await page.evaluate(()=>nameChoice);
    await page.evaluate(async()=>{pudlHost.fileResolution.stem=()=>new Promise(resolve=>{window.releaseName=resolve;});window.nameAbort=new AbortController();window.nameChoice=pcFileBrowser.pick(await yavcUtil.siteFs(),{mode:'save',name:'cancelled.docs.md',signal:nameAbort.signal});});
    await page.waitForFunction(()=>typeof releaseName==='function');await page.evaluate(()=>{nameAbort.abort();releaseName('cancelled');});assert.equal(await page.evaluate(()=>nameChoice),null);assert.equal(await page.locator('.fb-picker').count(),0);
   }
   assert.deepEqual(errors,[]);console.log(engine+': '+app+' selects only the suggested basename and retains its suffix');
  }finally{await page.close();}
 }}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
