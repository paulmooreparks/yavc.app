// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Barcode Tool reloads its layout library whenever something in the home folder changes. A reload that read the library before a layout was saved,
// and answers after the save, must not take the tool back to the older library: the saved layout stays in the library and stays selected, so
// "Remove this layout…" is enabled for it. A person meets this when a settings file or any other file in the home folder is written as they save.
// The test holds one library read's answer until the save has been written and read back, which is the order a busy machine can produce.
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8442';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1200,height:900}});p.setDefaultTimeout(15000);
 try{
  await p.goto(`http://barcodes.localhost:${port}/`);await p.locator('[data-applet][data-applet-state="running"]').waitFor();
  // Every read of the library goes through the host's file service. While holding is on, a read takes its answer from the file at once and gives it
  // only when the test releases it; reads made after holding is off answer as usual. Reads still to answer are counted.
  await p.evaluate(()=>{const f=pudlHost.fs,read=f.readText.bind(f);window.readsOut=0;window.held=[];window.holding=false;
   f.readText=function(path){const answer=read(path);window.readsOut++;const settle=x=>{window.readsOut--;return x;};
    if(!window.holding)return answer.then(settle,e=>{settle();throw e;});
    return answer.then(x=>new Promise(resolve=>window.held.push(()=>resolve(settle(x)))));};});
  const layoutMenu=async name=>{await p.locator('.menubar-title').filter({hasText:/^Layout$/}).click();await p.getByRole('menuitem',{name,exact:true}).click();};
  await layoutMenu('New layout from JSON…');
  const json=p.locator('[data-role="json-dialog"]');await json.getByRole('button',{name:'Save layout',exact:true}).waitFor();
  // Something else in the home folder changes, and the tool reads its library; that read's answer is held.
  await p.evaluate(async()=>{window.holding=true;const F=await yavcUtil.siteFs();await F.write(F.home(),'~/unrelated.txt','unrelated',false);});
  await p.waitForFunction(()=>window.held.length===1);await p.evaluate(()=>{window.holding=false;});
  // The person saves the layout. The save is written, and the tool's own reload after it has answered.
  await json.getByRole('button',{name:'Save layout',exact:true}).click();await json.waitFor({state:'hidden'});
  await p.evaluate(async()=>{const limit=Date.now()+15000;for(;;){const text=await pudlHost.fs.readText('~/barcode-layouts.json');if(String(text).includes('My layout')&&window.readsOut===1)return;if(Date.now()>limit)throw new Error('The save was not written and read back');await new Promise(resolve=>setTimeout(resolve,50));}});
  // Now the read from before the save answers, and every read has answered.
  await p.evaluate(()=>window.held.shift()());await p.waitForFunction(()=>window.readsOut===0);
  await p.locator('.menubar-title').filter({hasText:/^Layout$/}).click();
  const remove=p.getByRole('menuitem',{name:'Remove this layout…',exact:true});await remove.waitFor();
  assert.equal(await remove.getAttribute('aria-disabled'),null,engine+': Remove this layout is disabled after an older read of the library answered late');
  assert.equal(await p.getByRole('menuitem',{name:'Edit My layout…',exact:true}).count(),1,engine+': My layout is not the selected layout');
  console.log(engine+': a library read from before a save does not undo the save or its selection');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
