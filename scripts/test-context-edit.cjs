// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Exercise the menu and public editor transactions without touching the OS clipboard.
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT;
const action=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
async function context(p,rich){
 const locator=p.locator(rich?'.ProseMirror':'.cm-content').first();
 await locator.click({button:'right',position:{x:20,y:10}});
 const menu=p.locator('.context-menu:visible').first();await menu.waitFor();
 for(const label of ['Cut','Copy','Paste','Select All'])assert.equal(await menu.getByRole('menuitem',{name:new RegExp('^'+label+'(?:\\s+(?:Ctrl|Alt|Shift|Meta|Mod)|$)')}).count(),1,label+' appears once');
 return menu;
}
async function choose(menu,label){await menu.getByRole('menuitem',{name:new RegExp('^'+label+'(?:\\s+(?:Ctrl|Alt|Shift|Meta|Mod)|$)')}).click();}
async function select(p,rich){
 if(rich){await p.evaluate(()=>yavcMdEditor._page.selectAll());}
 else await p.evaluate(()=>{const v=yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor'));v.dispatch({selection:{anchor:0,head:v.state.doc.length}});v.focus();});
}
async function content(p,rich){return rich?p.locator('.ProseMirror').first().innerText():p.evaluate(()=>yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString());}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{for(const app of ['editor','docs','slides','diagrams']){
  const p=await browser.newPage();p.setDefaultTimeout(20000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   await p.addInitScript(()=>{
    window.testClipboard={text:'',reads:0,writes:0,native:0,claimed:0};
    window.pudlClipboard={async readText(){testClipboard.reads++;return testClipboard.text;},async writeText(text){testClipboard.writes++;testClipboard.text=text;}};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async readText(){testClipboard.native++;throw Error('Wrong clipboard');},async writeText(){testClipboard.native++;throw Error('Wrong clipboard');}}});
    document.addEventListener('pudl:contextmenu',e=>{const original=e.detail.handlesEdit;e.detail.handlesEdit=function(){testClipboard.claimed++;if(original)original();};},true);
   });
   await p.route('**/api/site/tree',async route=>{const response=await route.fetch({url:`http://127.0.0.1:${port}/api/site/tree`}),tree=await response.json();tree.children.push({name:'context-readonly.md',kind:'script',source:'Read only words.\n'});await route.fulfill({response,json:tree});});
   await p.goto(`http://${app}.localhost:${port}/`,{waitUntil:'domcontentloaded'});await p.locator('.yavc-command-toolbar').waitFor();
   if(app==='editor'||app==='docs')await action(p,app,'new',{text:'Alpha Beta.\n'});
   else if(app==='slides')await action(p,app,'load',{text:'# Alpha\n\nBeta.\n'});
   else {await action(p,app,'new',{kind:'d2'});await action(p,app,'set-text',{text:'alpha: Beta\n'});}
   for(const rich of app==='docs'||app==='slides'?[false,true]:[false]){
    if(app!=='editor')await action(p,app,'view',{mode:rich?'visual':'text'});
    if(rich)await p.locator('.ProseMirror[aria-busy=false]').waitFor();
    if(!rich&&app!=='slides'){
     const edge=p.locator('.cm-gutters').first();await edge.click({button:'right',position:{x:5,y:8}});
     const menu=p.locator('.context-menu:visible').first();await menu.waitFor();
     for(const label of ['Paste','Select All'])assert.equal(await menu.getByRole('menuitem',{name:new RegExp('^'+label+'(?:\\s+(?:Ctrl|Alt|Shift|Meta|Mod)|$)')}).count(),1,app+' editor edge offers '+label);
     await p.keyboard.press('Escape');
    }
    await select(p,rich);const before=await content(p,rich);assert.ok(before.trim());
    await choose(await context(p,rich),'Cut');
    await p.waitForFunction(()=>testClipboard.writes>0);
    await p.waitForFunction(rich=>rich?!document.querySelector('.ProseMirror').textContent.trim():yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.length===0,rich);
    await choose(await context(p,rich),'Undo');
    await p.waitForFunction(({rich,before})=>rich?document.querySelector('.ProseMirror').innerText.trim()===before.trim():yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()===before,{rich,before});
    await select(p,rich);await choose(await context(p,rich),'Copy');
    await p.evaluate(()=>testClipboard.text='Pasted words');await select(p,rich);await choose(await context(p,rich),'Paste');
    await p.waitForFunction(rich=>rich?document.querySelector('.ProseMirror').textContent.includes('Pasted words'):yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('Pasted words'),rich);
    await choose(await context(p,rich),'Undo');
    await p.waitForFunction(({rich,before})=>rich?document.querySelector('.ProseMirror').innerText.trim()===before.trim():yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()===before,{rich,before});
    await choose(await context(p,rich),'Select All');assert.ok(await p.evaluate(rich=>rich?yavcMdEditor._page.clipboardSelection().empty===false:!yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.selection.main.empty,rich));
    await p.keyboard.press('ArrowRight');const empty=await context(p,rich);
    for(const label of ['Cut','Copy'])assert.equal(await empty.getByRole('menuitem',{name:new RegExp('^'+label+'(?:\\s+(?:Ctrl|Alt|Shift|Meta|Mod)|$)')}).getAttribute('aria-disabled'),'true',label+' without selection');
    await p.keyboard.press('Escape');
   }
   if(app==='docs'){
    await action(p,app,'open-file',{path:'/site/context-readonly.md'});await action(p,app,'view',{mode:'text'});await select(p,false);
    const menu=await context(p,false);for(const label of ['Cut','Paste'])assert.equal(await menu.getByRole('menuitem',{name:new RegExp('^'+label+'(?:\\s+(?:Ctrl|Alt|Shift|Meta|Mod)|$)')}).getAttribute('aria-disabled'),'true',label+' read-only');
    assert.notEqual(await menu.getByRole('menuitem',{name:/^Copy(?:\s|$)/}).getAttribute('aria-disabled'),'true');await p.keyboard.press('Escape');
   }
   if(app==='editor'){
    const before=await content(p,false);
    await p.evaluate(()=>{
     const view=yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor'));window.testReadOnly=false;window.testEditError='';window.savedRead=pudlClipboard.readText;
     pudlClipboard.readText=()=>new Promise(resolve=>window.finishClipboardRead=resolve);
     const edit=yavcMdEditor.editing({source:()=>view,page:()=>null,rich:()=>false,identity:()=>view,alive:()=>true,readOnly:()=>testReadOnly,say:message=>testEditError=message,changed(){}});
     window.pendingPaste=edit.clipboard('paste');
    });
    await p.waitForFunction(()=>!!window.finishClipboardRead);await p.evaluate(()=>{testReadOnly=true;finishClipboardRead('Forbidden paste');});await p.evaluate(()=>pendingPaste);
    assert.equal(await content(p,false),before);assert.match(await p.evaluate(()=>testEditError),/document or selection changed/);await p.evaluate(()=>{pudlClipboard.readText=savedRead;});
   }
   const clip=await p.evaluate(()=>testClipboard);assert.equal(clip.native,0);assert.ok(clip.claimed>0);assert.deepEqual(errors,[]);
   console.log(engine+' '+app+': context Cut/Undo, Copy, Paste/Undo, Select All and PUDL bridge passed');
  }finally{await p.close();}
 }}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
