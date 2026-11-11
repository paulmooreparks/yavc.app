// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The Editor is a text editor and Docs draws every Markdown view (DESIGN.md,
// decision 131). This test holds both halves: the Editor opens every file,
// Markdown too, as text and offers no view choice, and Docs opens Markdown in
// Visual unless the person has chosen another view.
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8493';
const VIEW_COMMANDS=['view-text','view-visual','view-split','view-preview','view-document','md-default','view-mode'];
const run=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
const action=(p,name,input)=>run(p,'editor',name,input),docs=(p,name,input)=>run(p,'docs',name,input);
async function mode(p,value){await p.waitForFunction(value=>document.querySelector('[data-command="view-'+value+'"]')?.getAttribute('aria-pressed')==='true',value);}
// The Editor shows the current document as text: no view command is offered, no view control is drawn and no page is drawn.
async function textOnly(p,text){
 await p.waitForFunction(text=>document.querySelector('.cm-content').textContent.includes(text),text);
 assert.deepEqual(await p.evaluate(ids=>ids.filter(id=>{const c=pudlCommands.find(id,document.querySelector('[data-applet]'));return c&&!pudlCommands.value(c,'hidden');}),VIEW_COMMANDS),[]);
 assert.equal(await p.locator('[data-command^="view-"]:visible, [data-command^="md-default"]:visible').count(),0);
 assert.equal(await p.locator('.ProseMirror:visible, .doc-page:visible').count(),0);
 assert.equal((await action(p,'view',{mode:'text'})).mode,'text');
 for(const drawn of ['visual','split','preview','document'])await assert.rejects(()=>action(p,'view',{mode:drawn}),/view@1/);
}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1500,height:1000}});p.setDefaultTimeout(20000);
 try{
  const cold=await browser.newPage(),markdownRequests=[];
  await cold.route('**/md-engine/**',route=>{if(new URL(route.request().url()).pathname.endsWith('/safe-html.js'))return route.continue();markdownRequests.push(route.request().url());return route.abort();});
  await cold.goto(`http://editor.localhost:${port}/`);await cold.locator('.cm-content').waitFor({state:'attached'});
  await action(cold,'new',{path:'~/cold.txt',text:'Plain source without a Markdown engine.'});await textOnly(cold,'Plain source without a Markdown engine.');assert.deepEqual(markdownRequests,[]);await cold.close();
  // The Editor: Markdown opens as text, whatever view an older Editor stored as the person's choice.
  await p.goto(`http://editor.localhost:${port}/`);await p.locator('.cm-content').waitFor({state:'attached'});
  await action(p,'new',{path:'~/visual.md',text:'# Markdown\n\nEditable body.'});await textOnly(p,'# Markdown');
  await p.locator('.cm-content').click();await p.keyboard.press('Control+End');await p.keyboard.type(' New words.',{delay:50});
  await p.waitForFunction(()=>document.querySelector('.cm-content').textContent.includes('New words.'));
  await action(p,'save',{path:'~/visual.md'});await p.reload();await p.locator('.cm-content').waitFor({state:'attached'});await textOnly(p,'New words.');assert.match((await action(p,'document')).text,/Editable body\. New words\.$/);
  for(const stored of ['visual','split','preview']){
   await p.evaluate(stored=>pudlHost.config.set('editor',{markdownView:stored}),stored);await p.reload();await p.locator('.cm-content').waitFor({state:'attached'});
   await action(p,'new',{path:'~/stored-'+stored+'.md',text:'# Stored '+stored});await textOnly(p,'# Stored '+stored);
  }
  await action(p,'new',{path:'~/persisted.docs.md',text:'# Still Editor'});await textOnly(p,'# Still Editor');
  for(const suffix of ['go','cpp','json','html','txt']){await action(p,'new',{path:'~/source.'+suffix,text:'source '+suffix});await textOnly(p,'source '+suffix);}
  // Docs: Markdown opens in Visual, Visual and Split edit the source, and the person's choice of view persists.
  await p.goto(`http://docs.localhost:${port}/`);await p.locator('.cm-content').waitFor({state:'attached'});
  await docs(p,'new',{path:'~/visual.md',text:'# Markdown\n\nEditable body.'});await mode(p,'visual');
  const rich=p.locator('.ProseMirror');await p.locator('.ProseMirror[aria-busy="false"]').waitFor();await rich.locator('p').click();await p.keyboard.press('End');await p.keyboard.type(' Drawn words.',{delay:50});
  await p.waitForFunction(()=>document.querySelector('.cm-content').textContent.includes('Drawn words.'));
  await docs(p,'save',{path:'~/visual.md'});await p.reload();await p.locator('.ProseMirror').waitFor();await mode(p,'visual');assert.match((await docs(p,'document')).text,/Editable body\. Drawn words\./);
  await docs(p,'view',{mode:'split'});await rich.waitFor();await rich.locator('p').click();await p.keyboard.press('End');await p.keyboard.type(' Split edit.');await p.waitForFunction(()=>document.querySelector('.cm-content').textContent.includes('Split edit.'));
  await docs(p,'save',{path:'~/visual.md'});
  for(const preference of ['text','split','preview','visual']){
   await p.evaluate(preference=>pudlCommands.run('md-default-'+preference,null,document.querySelector('[data-applet]')),preference);
   await docs(p,'new',{path:'~/preference-'+preference+'.md',text:'# Preference\n\nBody.'});await mode(p,preference);
   await p.waitForFunction(async preference=>(await pudlHost.config.stored('docs')).markdownView===preference,preference);
   if(preference==='preview')assert.equal(await p.locator('.ed-page [contenteditable="true"]').count(),0);
  }
  // A .docs.md document has its own default, the page, which the Markdown choice does not move.
  await p.reload();await p.locator('.cm-content').waitFor({state:'attached'});await docs(p,'new',{path:'~/persisted-page.docs.md',text:'# Page document'});await mode(p,'document');
  await docs(p,'new',{path:'~/persisted.md',text:'# Still Visual'});await mode(p,'visual');
  for(const suffix of ['go','cpp','json','html','txt']){
   // Source files are the Editor's: Docs refuses one and says where it opens.
   await assert.rejects(()=>docs(p,'new',{path:'~/docs-source.'+suffix,text:'source'}),/Docs opens Markdown documents\. Open this source in Editor/);
  }
  assert.equal((await docs(p,'document')).name,'persisted.md');await mode(p,'visual');
  await p.evaluate(()=>pudlHost.config.set('docs',{markdownView:'text'}));await p.reload();await p.locator('.cm-content').waitFor({state:'attached'});await docs(p,'new',{path:'~/explicit.md',text:'# Explicit preference'});await mode(p,'text');
  console.log(engine+': Editor text only with no view choice, Docs editable Visual/Split, byte-storage save/reload, configurable persisted Markdown defaults and source-only file boundaries passed');
 }catch(err){console.error(engine,await p.evaluate(()=>({focus:document.activeElement?.outerHTML.slice(0,250),rich:document.querySelector('.ProseMirror')?.textContent,source:document.querySelector('.cm-content')?.textContent,notices:Array.from(document.querySelectorAll('.notice')).map(n=>n.textContent)})));throw err;}finally{await browser.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
