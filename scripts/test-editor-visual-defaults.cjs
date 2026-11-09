// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8493';
const action=(p,name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.editor/'+name+'@1',input,{grant:'all'}),{name,input});
async function mode(p,value){await p.waitForFunction(value=>document.querySelector('[data-command="view-'+value+'"]')?.getAttribute('aria-pressed')==='true',value);}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1500,height:1000}});p.setDefaultTimeout(20000);
 try{
  const cold=await browser.newPage(),markdownRequests=[];
  await cold.route('**/md-engine/**',route=>{if(new URL(route.request().url()).pathname.endsWith('/safe-html.js'))return route.continue();markdownRequests.push(route.request().url());return route.abort();});
  await cold.goto(`http://editor.localhost:${port}/`);await cold.locator('.cm-content').waitFor({state:'attached'});
  await action(cold,'new',{path:'~/cold.txt',text:'Plain source without a Markdown engine.'});await mode(cold,'text');assert.deepEqual(markdownRequests,[]);await cold.close();
  await p.goto(`http://editor.localhost:${port}/`);await p.locator('.cm-content').waitFor({state:'attached'});
  await action(p,'new',{path:'~/visual.md',text:'# Markdown\n\nEditable body.'});await mode(p,'visual');
  const rich=p.locator('.ProseMirror');await p.locator('.ProseMirror[aria-busy="false"]').waitFor();await rich.locator('p').click();await p.keyboard.press('End');await p.keyboard.type(' New words.',{delay:50});
  await p.waitForFunction(()=>document.querySelector('.cm-content').textContent.includes('New words.'));
  await action(p,'save',{path:'~/visual.md'});await p.reload();await p.locator('.ProseMirror').waitFor();await mode(p,'visual');assert.match((await action(p,'document')).text,/New words\./);
  await action(p,'view',{mode:'split'});await rich.waitFor();await rich.locator('p').click();await p.keyboard.press('End');await p.keyboard.type(' Split edit.');await p.waitForFunction(()=>document.querySelector('.cm-content').textContent.includes('Split edit.'));
  await action(p,'save',{path:'~/visual.md'});
  for(const preference of ['text','split','preview','visual']){
   await p.evaluate(preference=>pudlCommands.run('md-default-'+preference,null,document.querySelector('[data-applet]')),preference);
   await action(p,'new',{path:'~/preference-'+preference+'.md',text:'# Preference\n\nBody.'});await mode(p,preference);
   await p.waitForFunction(async preference=>(await pudlHost.config.stored('editor')).markdownView===preference,preference);
   if(preference==='preview')assert.equal(await p.locator('.ed-page [contenteditable="true"]').count(),0);
  }
  await p.reload();await p.locator('.cm-content').waitFor({state:'attached'});await action(p,'new',{path:'~/persisted.docs.md',text:'# Still Editor'});await mode(p,'visual');
  await assert.rejects(()=>action(p,'view',{mode:'document'}),/unavailable/);
  for(const suffix of ['go','cpp','json','html','txt']){
   await action(p,'new',{path:'~/source.'+suffix,text:'source'});await mode(p,'text');await assert.rejects(()=>action(p,'view',{mode:'visual'}),/unavailable/);
  }
  await p.evaluate(()=>pudlHost.config.set('editor',{markdownView:'text'}));await p.reload();await p.locator('.cm-content').waitFor({state:'attached'});await action(p,'new',{path:'~/explicit.md',text:'# Explicit preference'});await mode(p,'text');
  console.log(engine+': editable Visual/Split, byte-storage save/reload, configurable persisted Markdown defaults and source-only file boundaries passed');
 }catch(err){console.error(engine,await p.evaluate(()=>({focus:document.activeElement?.outerHTML.slice(0,250),rich:document.querySelector('.ProseMirror')?.textContent,source:document.querySelector('.cm-content')?.textContent,notices:Array.from(document.querySelectorAll('.notice')).map(n=>n.textContent)})));throw err;}finally{await browser.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
