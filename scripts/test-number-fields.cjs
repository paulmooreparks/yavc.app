// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8448';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),p=await browser.newPage();try{
  await p.goto(`http://localhost:${port}/`);await p.waitForFunction(()=>window.yavcDialog&&window.pudlFields);
  await p.evaluate(()=>{window.numberSubmission=null;window.numberDialog=yavcDialog.open({title:'Number Field Verification',body:'<div class="form-group"><label class="form-label" for="number-any">Measurement</label><span class="number-field"><input class="form-input" type="number" id="number-any" name="measurement" value="25.4321" step="any" min="0" max="100"></span></div><div class="form-group"><label class="form-label" for="number-bounded">Bounded Amount</label><span class="number-field"><input class="form-input" type="number" id="number-bounded" name="bounded" value="2.4" step="0.1" min="0" max="10"></span></div>',buttons:[{id:'cancel',label:'Cancel'},{id:'apply',label:'Apply',primary:true}],check(value,body){if(body.querySelector('[role=spinbutton][aria-invalid=true]'))return true;window.numberSubmission=Object.fromEntries(new FormData(body.closest('form')));return true;}});});
  const d=p.getByRole('dialog',{name:'Number Field Verification',exact:true}),any=d.getByRole('spinbutton',{name:'Measurement',exact:true}),bounded=d.getByRole('spinbutton',{name:'Bounded Amount',exact:true});await d.waitFor();
  await any.fill('25.4321');await any.press('Tab');assert.equal(await d.locator('[name=measurement]').inputValue(),'25.4321');
  await any.focus();await any.hover();await p.mouse.wheel(0,-100);await p.waitForFunction(()=>document.querySelector('[name=measurement]').value==='26.4321');
  await d.getByRole('button',{name:'Cancel',exact:true}).focus();await any.hover();await p.mouse.wheel(0,100);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await d.locator('[name=measurement]').inputValue(),'26.4321');
  await bounded.fill('11');await bounded.press('Tab');assert.equal(await d.locator('[name=bounded]').inputValue(),'10');await bounded.fill('-1');await bounded.press('Tab');assert.equal(await d.locator('[name=bounded]').inputValue(),'0');
  await bounded.fill('invalid');await bounded.press('Tab');await d.getByRole('button',{name:'Apply',exact:true}).click();assert.equal(await p.evaluate(()=>numberSubmission),null);assert.equal(await bounded.getAttribute('aria-invalid'),'true');
  await bounded.fill('3.7');await bounded.press('Tab');await p.evaluate(()=>{const input=document.querySelector('[name=bounded]');input.value='4.2';pudlFields.refresh(input);});assert.equal(await bounded.inputValue(),'4.2');
  await d.getByRole('button',{name:'Apply',exact:true}).click();assert.deepEqual(await p.evaluate(()=>numberSubmission),{measurement:'26.4321',bounded:'4.2'});await d.getByRole('button',{name:'Cancel',exact:true}).click();await d.waitFor({state:'hidden'});
  console.log(engine+': fractional parsing, step=any precision/current unit spin, bounds, invalid submission, refresh and unfocused wheel guard passed');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
