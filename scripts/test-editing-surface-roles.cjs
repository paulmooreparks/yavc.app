// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Both editing surfaces of Docs are multi-line text boxes to a screen reader and to a script that finds them by role (DESIGN.md,
// decision 153). Needs a server on YAVC_CHROME_TEST_PORT.
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8460';
const call=(p,name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const b=await pw[engine].launch({headless:true}),p=await b.newPage({viewport:{width:1500,height:1000}}),errors=[];p.setDefaultTimeout(25000);p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(`http://localhost:${port}/applet/docs`);await p.locator('.cm-content').waitFor({state:'attached'});
  await call(p,'new',{path:'~/Roles.docs.md',text:'# Roles\n\nWords.\n'});await call(p,'view',{mode:'document'});
  const page=p.getByRole('textbox',{name:'The Document, as Its Page'});await page.waitFor();
  assert.equal(await page.getAttribute('aria-multiline'),'true',engine+': the page is multi-line');
  await call(p,'view',{mode:'text'});
  const text=p.getByRole('textbox',{name:'Text of Roles.docs.md'});await text.waitFor();
  assert.equal(await text.getAttribute('aria-multiline'),'true',engine+': the text is multi-line');
  assert.deepEqual(errors,[]);console.log(engine+': both editing surfaces are multi-line text boxes by role and name');
 }finally{await b.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
