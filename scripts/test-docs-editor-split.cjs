// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const port=process.env.YAVC_CHROME_TEST_PORT||'8444',out=path.join(os.tmpdir(),'yavc-docs-editor-split-evidence');fs.mkdirSync(out,{recursive:true});
const action=(page,app,name,input={})=>page.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
const command=(page,id)=>page.evaluate(id=>pudlCommands.run(id,null,document.querySelector('[data-applet]')),id);
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const b=await pw[engine].launch({headless:true});try{for(const app of ['editor','docs']){
 const p=await b.newPage({viewport:{width:1500,height:1000}}),errors=[];p.on('pageerror',err=>errors.push(err.message));p.setDefaultTimeout(20000);let phase='boot';try{
  await p.goto(`http://${app}.localhost:${port}/`);await p.locator('.cm-content').waitFor({state:'attached'});assert.match(await p.title(),app==='docs'?/Docs/:/Editor/);
  phase='fixed identity and native creation';await action(p,app,'new',{path:'~/split.md',text:'# Shared workspace\n\nAn **editable** document.\n\n## Section\n\nText.'});
  await p.waitForFunction(app=>document.querySelector('[data-command="view-'+(app==='docs'?'visual':'text')+'"]')?.getAttribute('aria-pressed')==='true',app);
  const views=await p.locator('[data-command-choice="ed-view"] button').allTextContents();assert.deepEqual(views,app==='docs'?['Document','Visual','Text','Split','Preview']:['Text','Split','Preview']);
  assert.equal(await p.locator('[data-applet="'+app+'"]').count(),1);
  phase='read-only source preview';await action(p,app,'view',{mode:'split'});await p.locator('.doc-page').waitFor({state:'visible'});assert.equal(await p.locator('.doc-page [contenteditable="true"]').count(),app==='docs'?1:0);await action(p,app,'view',{mode:'text'});
  if(app==='editor'){
   await assert.rejects(()=>action(p,app,'view',{mode:'document'}),/unavailable/);await assert.rejects(()=>action(p,app,'page-setup',{page:'a4'}),/moved/);
   await action(p,app,'new',{path:'~/code.go',text:'package main\n'});await p.waitForFunction(()=>document.querySelector('[data-command="view-text"]')?.getAttribute('aria-pressed')==='true');
  }else{
   const before=await action(p,app,'documents');await assert.rejects(()=>action(p,app,'new',{path:'~/code.go',text:'package main'}),/Docs opens/);assert.equal((await action(p,app,'documents')).documents.length,before.documents.length);
   await assert.rejects(()=>action(p,app,'new',{path:'~/deck.slides.md',text:'# Deck'}),/Docs opens/);
   await action(p,app,'view',{mode:'document'});await p.locator('.doc-paginated .ProseMirror').waitFor();await command(p,'new-markdown');await p.locator('.ProseMirror').waitFor();
  }
  phase='save and reopen';await action(p,app,'save',{path:app==='docs'?'~/new.md':'~/code.go'});await p.reload();await p.locator('.cm-content').waitFor({state:'attached'});const docs=await action(p,app,'documents');assert.ok(docs.documents.some(d=>d.path===(app==='docs'?'~/new.md':'~/code.go')));assert.deepEqual(errors,[]);
  await p.screenshot({path:path.join(out,engine+'-'+app+'.png')});console.log(engine+' '+app+': identity, views, native boundaries, source access, saves and independent recovery passed');
 }catch(err){console.error(app,phase,await p.evaluate(async()=>({body:document.body.innerText,problems:await window.pudlActions.problems()})));throw err;}finally{await p.close();}
 }}finally{await b.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
