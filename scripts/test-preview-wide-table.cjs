// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A table cell holding one word longer than the pane (a run of joined identifiers) must not widen the page in Preview:
// paragraphs wrap at the pane and only the table scrolls (DESIGN.md, decision 15). All text is invented.
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT;
const words='Invented sentence words that run on long enough to need several lines at this width. ';
const token=Array.from({length:8},(_,i)=>(i+1)+'_IDINPUT_FIELD_'+(i+1)+'_REQUIRED').join('');
const text='# Practice page\n\n'+words.repeat(4)+'\n\n- '+words.repeat(3)+'\n\n| One | Two | Three | Four |\n| --- | --- | --- | --- |\n| '+token+' | '+words+' | Gamma | Delta |\n';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1000,height:900}});p.setDefaultTimeout(20000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const action=(name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
  await p.goto(`http://docs.localhost:${port}/`,{waitUntil:'domcontentloaded'});await p.locator('.yavc-command-toolbar').waitFor();
  await action('new',{text});
  for(const mode of ['preview','visual','preview']){await action('view',{mode});}
  await p.locator('.ed-scroll > .doc-page:not(.page-view) table').waitFor();
  const m=await p.evaluate(()=>{const scroll=[...document.querySelectorAll('.ed-scroll')].find(s=>s.querySelector(':scope > .doc-page:not(.page-view) table')),page=scroll.querySelector(':scope > .doc-page'),table=page.querySelector('table'),para=page.querySelector('p');
   return {scrollSW:scroll.scrollWidth,scrollCW:scroll.clientWidth,page:page.getBoundingClientRect().width,para:para.getBoundingClientRect().width,tableSW:table.scrollWidth,tableCW:table.clientWidth,paraLines:Math.round(para.getBoundingClientRect().height/parseFloat(getComputedStyle(para).lineHeight))};});
  console.log(engine+' '+JSON.stringify(m));
  assert.ok(m.scrollSW<=m.scrollCW+1,'the page must not scroll sideways');
  assert.ok(m.para<=m.page,'paragraphs wrap within the page');
  assert.ok(m.paraLines>1,'the long paragraph wraps');
  assert.ok(m.tableSW>m.tableCW,'the table scrolls within itself');
  assert.equal((await action('document')).text,text,'switching views leaves the document unchanged');
  assert.deepEqual(errors,[]);
  console.log(engine+': a wide table scrolls within itself and the page wraps to the pane');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
