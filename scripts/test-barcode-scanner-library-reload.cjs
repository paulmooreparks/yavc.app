// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Barcode Scanner reads its layout library whenever something in the home folder changes. A read that began before layouts were imported, and
// answers after the import has been written, must not take the scanner back to the older library: the imported layout stays in the Layout list.
// The test holds one library read's answer until the import has been written and read back, which is the order a busy machine can produce.
// This is the same defect as test-barcode-library-reload.cjs, in the other applet that reads the library.
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8442';
const file={format:'pc-barcode-layouts',version:1,layouts:[{id:'my-layout',name:'My layout',symbology:'ean13',fields:[{id:'prefix',type:'fixed',values:['20']},{id:'item',type:'number',length:10},{id:'check',type:'check',algorithm:'gs1-mod10'}]}]};
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1200,height:900}});p.setDefaultTimeout(15000);
 try{
  await p.goto(`http://barcode-scanner.localhost:${port}/`);await p.locator('[data-applet][data-applet-state="running"]').waitFor();
  await p.locator('[data-role="layout"]').waitFor({state:'attached'});
  // Every read of the library goes through the host's file service. While holding is on, a read takes its answer from the file at once and gives it
  // only when the test releases it; reads made after holding is off answer as usual. Reads still to answer are counted.
  await p.evaluate(()=>{const f=pudlHost.fs,read=f.readText.bind(f);window.readsOut=0;window.held=[];window.holding=false;
   f.readText=function(path){const answer=read(path);window.readsOut++;const settle=x=>{window.readsOut--;return x;};
    if(!window.holding)return answer.then(settle,e=>{settle();throw e;});
    return answer.then(x=>new Promise(resolve=>window.held.push(()=>resolve(settle(x)))));};});
  // Something else in the home folder changes, and the scanner reads its library; that read's answer is held.
  await p.evaluate(async()=>{window.holding=true;const F=await yavcUtil.siteFs();await F.write(F.home(),'~/unrelated.txt','unrelated',false);});
  await p.waitForFunction(()=>window.held.length>=1);await p.evaluate(()=>{window.holding=false;window.heldCount=window.held.length;});
  // The layout file is imported. It is written, and the scanner's own reads after it have answered.
  await p.locator('[data-role="layout-file"]').setInputFiles({name:'layouts.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
  await p.evaluate(async()=>{const limit=Date.now()+15000;for(;;){const text=await pudlHost.fs.readText('~/barcode-layouts.json');if(String(text).includes('My layout')&&window.readsOut===window.heldCount)return;if(Date.now()>limit)throw new Error('The import was not written and read back');await new Promise(resolve=>setTimeout(resolve,50));}});
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('[data-role="layout"] option')).some(o=>o.textContent==='My layout'));
  // Now the read from before the import answers, and every read has answered.
  await p.evaluate(()=>{window.held.splice(0).forEach(release=>release());});await p.waitForFunction(()=>window.readsOut===0);
  assert.equal(await p.locator('[data-role="layout"] option',{hasText:'My layout'}).count(),1,engine+': the imported layout is gone from the list after an older read of the library answered late');
  console.log(engine+': a library read from before an import does not undo the import');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
