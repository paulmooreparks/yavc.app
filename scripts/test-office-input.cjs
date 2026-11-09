// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){const browser=await pw[engine].launch({headless:true});try{
    const p=await browser.newPage();p.on('filechooser',()=>{});await p.goto(`http://localhost:${port}/applet/docs`);await p.locator('.cm-content').waitFor({state:'attached'});await p.evaluate(()=>yavcUtil.loadScript('/applets/md-editor/office-input.js'));
    await p.evaluate(()=>{window.importOwner=true;window.originalFileReader=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){return new Promise(resolve=>{window.releaseFileRead=resolve;});};window.pendingOffice=yavcOfficeInput.pick({root:document.body,extension:'.docx',current:()=>importOwner});});
    await p.locator('body > input[type="file"]').setInputFiles({name:'Delayed.docx',mimeType:'application/octet-stream',buffer:Buffer.from([1,2,3])});await p.waitForFunction(()=>typeof releaseFileRead==='function');
    assert.equal(await p.evaluate(async()=>{importOwner=false;releaseFileRead(new Uint8Array([1,2,3]).buffer);const value=await pendingOffice;File.prototype.arrayBuffer=originalFileReader;return value;}),null);assert.equal(await p.locator('body > input[type="file"]').count(),0);
    assert.equal(await p.evaluate(async()=>{const controller=new AbortController();const pending=yavcOfficeInput.pick({root:document.body,extension:'.docx',signal:controller.signal});controller.abort();return pending;}),null);
    assert.equal(await p.evaluate(async()=>{const pending=yavcOfficeInput.pick({root:document.body,extension:'.docx'});document.querySelector('body > input[type="file"]').dispatchEvent(new Event('cancel'));return pending;}),null);
    console.log(engine+': native Office chooser rejects obsolete reads and releases cancellation state.');
}finally{await browser.close();}}})().catch(error=>{console.error(error);process.exitCode=1;});
