// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Invented long documents in small desktop windows. Observe the editor's own clipping area.
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const port=process.env.YAVC_CHROME_TEST_PORT,out=path.join(os.tmpdir(),'yavc-selection-scroll');fs.mkdirSync(out,{recursive:true});
const action=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
const command=(p,id)=>p.evaluate(id=>pudlCommands.run(id,null,document.querySelector('[data-applet]')),id);
function geometry(where){
 const rich=typeof where==='object'?where.rich:where,selector=typeof where==='object'?where.selector:null;
 const cm=window.yavcCodeMirror?.EditorView.findFromDOM(document.querySelector('.cm-editor'));
 const node=rich?document.querySelector(selector||'.pm-find-current'):cm?.contentDOM;
 const clip=rich?document.querySelector('.ed-scroll'):cm?.scrollDOM;
 const at=rich?node?.getBoundingClientRect():cm?.coordsAtPos(cm.state.selection.main.head);
 if(!node||!clip||!at)return where?.check?false:{visible:false};
 let top=0,bottom=innerHeight,left=0,right=innerWidth;
 for(let n=node.parentElement;n;n=n.parentElement){const s=getComputedStyle(n);if(/auto|scroll|hidden|clip/.test(s.overflowY)){const r=n.getBoundingClientRect();top=Math.max(top,r.top+n.clientTop);bottom=Math.min(bottom,r.top+n.clientTop+n.clientHeight);}if(/auto|scroll|hidden|clip/.test(s.overflowX)){const r=n.getBoundingClientRect();left=Math.max(left,r.left+n.clientLeft);right=Math.min(right,r.left+n.clientLeft+n.clientWidth);}}
 const bar=Array.from(document.querySelectorAll('.ed-find')).find(n=>n.getClientRects().length)?.getBoundingClientRect();
 if(bar&&bar.left<at.right&&bar.right>at.left&&bar.top<=top+2)top=Math.max(top,bar.bottom);
 const result={visible:at.top>=top-1&&at.bottom<=bottom+1&&at.left>=left-1&&at.right<=right+1,at:{top:at.top,bottom:at.bottom,left:at.left,right:at.right},clip:{top,bottom,left,right},scroll:clip.scrollTop,outer:scrollY,focus:document.activeElement?.getAttribute('data-find')};
 return where?.check?result.visible:result;
}
async function visible(p,rich,label){
 try{await p.waitForFunction(geometry,{rich,check:true},{timeout:4000});}catch(e){throw Error(label+' '+JSON.stringify(await p.evaluate(geometry,rich))+' '+e.message);}
 const state=await p.evaluate(geometry,rich);assert.equal(state.visible,true,label+' is clipped');assert.equal(state.outer,0,label+' moved desktop');assert.equal(state.focus,'search',label+' lost Find field focus');
}
async function count(p,expected){await p.waitForFunction(expected=>Array.from(document.querySelectorAll('.ed-find')).find(n=>n.getClientRects().length)?.querySelector('[data-find=count]').textContent===expected,expected);}
async function commandVisible(p,where,label){
 try{await p.waitForFunction(geometry,{...(typeof where==='object'?where:{rich:where}),check:true},{timeout:4000});}catch(e){throw Error(label+' '+JSON.stringify(await p.evaluate(geometry,where))+' '+e.message);}
 const state=await p.evaluate(geometry,where);assert.equal(state.visible,true,label);assert.equal(state.outer,0,label+' moved desktop');
}
const paragraphs=Array.from({length:101},(_,i)=>(i===0||i===50||i===100?'Needle ':'')+'Paragraph '+i+' contains invented ordinary words for the scrolling check.');
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const b=await pw[engine].launch({headless:true});
 try{for(const app of ['docs','slides','diagrams','editor'])for(const mode of app==='docs'?['visual','text','split','split-text']:app==='slides'?['visual','text','split']:['text']){
  const p=await b.newPage({viewport:{width:1200,height:800}});p.setDefaultTimeout(20000);let phase=app+' '+mode;
  try{
   await p.goto(`http://localhost:${port}/?open=${app}&top=${app}`,{waitUntil:'domcontentloaded'});await p.locator('.yavc-command-toolbar').waitFor();
   await p.locator('.win[data-win="'+app+'"]').evaluate(win=>{Object.assign(win.style,{width:'900px',height:'520px',left:'80px',top:'80px'});});
   const text=app==='diagrams'?paragraphs.map((s,i)=>'node'+i+': '+s).join('\n'):paragraphs.join('\n\n')+'\n';
   if(app==='docs'||app==='editor')await action(p,app,'new',{text});
   else if(app==='slides')await action(p,app,'load',{text});
   else{await action(p,app,'new',{kind:'d2'});await action(p,app,'set-text',{text});}
   const viewMode=mode==='split-text'?'split':mode;
   if(app!=='editor')await action(p,app,'view',{mode:viewMode});
   const rich=app==='docs'&&mode!=='text'&&mode!=='split-text';
   const unchanged=()=>p.evaluate(()=>yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString());
   if(rich){await p.locator('.ProseMirror[aria-busy=false]').waitFor();await p.evaluate(()=>yavcMdEditor._page.selectAll());}
   else if(app!=='slides'||mode!=='visual')await p.locator('.cm-content').evaluate(node=>{const v=yavcCodeMirror.EditorView.findFromDOM(node);v.dispatch({selection:{anchor:0}});v.focus();});
   await command(p,'find');const bar=p.locator('.ed-find:visible').first(),search=bar.getByRole('textbox',{name:'Find',exact:true});await search.fill('Needle');
   if(!rich&&app!=='slides')await bar.getByRole('button',{name:'Next Match',exact:true}).click();
   await count(p,'1 of 3');
   const original=await unchanged();
   await visible(p,rich,phase+' first');
   for(const [name,step,index] of [['Next Match','next',2],['Next Match','next',3],['Previous Match','previous',2],['Previous Match','previous',1],['Previous Match','backward wrap',3],['Next Match','forward wrap',1]]){
    phase=app+' '+mode+' '+step;await bar.getByRole('button',{name,exact:true}).click();await count(p,index+' of 3');await visible(p,rich,phase);assert.equal(await unchanged(),original,phase+' changed the document');
   }
   phase=app+' '+mode+' Enter';await search.press('Enter');await count(p,'2 of 3');await visible(p,rich,phase);
   phase=app+' '+mode+' Shift+Enter';await search.press('Shift+Enter');await count(p,'1 of 3');await visible(p,rich,phase);assert.equal(await unchanged(),original,phase+' changed the document');
   await bar.getByRole('textbox',{name:'Replace With',exact:true}).fill('Changed');await count(p,'1 of 3');await search.focus();
   phase=app+' '+mode+' Replace One';await bar.getByRole('button',{name:'Replace',exact:true}).click();await count(p,'1 of 2');await visible(p,rich,phase);
   if(rich)await p.evaluate(()=>yavcMdEditor._page.sync());
   assert.equal(await unchanged(),original.replace('Needle','Changed'),phase+' changed other text');
   console.log(engine+' '+app+' '+mode+': Next/Previous, Enter/Shift+Enter, both wraps and Replace stay visible');
   if(app!=='slides'&&!rich){
    await bar.getByRole('button',{name:'Close',exact:true}).click();
    const lines=await p.evaluate(()=>yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.lines);
    for(const line of [lines,1]){await command(p,'go-to-line');const field=p.locator('.cm-goto-line input[name=line]');await field.fill(String(line));await field.press('Enter');await field.waitFor({state:'detached'});await commandVisible(p,false,'Go to Line '+line);}
   }
   if(app==='docs'){
    if(rich)await bar.getByRole('button',{name:'Close',exact:true}).click();
    await action(p,app,'view',{mode:'text'});
    await action(p,app,'set-text',{text:'# Upper\n\nStart target.\n\n'+paragraphs.slice(1,-1).join('\n\n')+'\n\n# Lower\n\nEnd target.\n'});await action(p,app,'view',{mode:viewMode});
    const target=rich?{rich:true,selector:'.ProseMirror > p:last-child'}:false;
    if(rich)await p.locator('.ProseMirror h1').filter({hasText:'Lower'}).waitFor();
    await command(p,'toggle-outline');await p.locator('[data-outline-index]').filter({hasText:'Lower'}).click();
    await commandVisible(p,rich?{rich:true,selector:'.ProseMirror h1:last-of-type'}:false,'outline below');
    if(rich)await p.locator('.ProseMirror > p:last-child').click();
    await p.keyboard.press('End');await p.keyboard.type('Z');
    if(rich)await p.evaluate(()=>yavcMdEditor._page.sync());
    await p.evaluate(rich=>{if(rich)document.querySelector('.ed-scroll').scrollTop=0;else yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).scrollDOM.scrollTop=0;},rich);
    phase=app+' '+mode+' Undo off screen';await command(p,'undo');
    if(rich)await p.waitForFunction(()=>!document.querySelector('.ProseMirror > p:last-child').textContent.endsWith('Z'));
    await commandVisible(p,target,phase);
    await p.evaluate(rich=>{if(rich)document.querySelector('.ed-scroll').scrollTop=0;else yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor')).scrollDOM.scrollTop=0;},rich);
    phase=app+' '+mode+' Redo off screen';await command(p,'redo');
    if(rich)await p.waitForFunction(()=>document.querySelector('.ProseMirror > p:last-child').textContent.endsWith('Z'));
    await commandVisible(p,target,phase);
    console.log(engine+' docs '+mode+': off-screen Undo/Redo stay visible');
    await p.locator('[data-outline-index]').filter({hasText:'Upper'}).click();await commandVisible(p,rich?{rich:true,selector:'.ProseMirror h1:first-of-type'}:false,'outline above');await command(p,'toggle-outline');
    if(rich){
     await action(p,app,'view',{mode:'text'});
     await action(p,app,'set-text',{text:'Reference[^one].\n\n'+paragraphs.slice(1,-1).join('\n\n')+'\n\n[^one]: Invented distant footnote.\n'});await action(p,app,'view',{mode:viewMode});await p.locator('.ProseMirror[aria-busy=false]').waitFor();
     await p.locator('.ProseMirror .doc-footnote-ref a').click();await commandVisible(p,{rich:true,selector:'.ProseMirror .doc-footnote'},'footnote below');
     console.log(engine+' docs '+mode+': headings in both directions and footnote scroll');
    }
    if(mode==='visual'){
     await action(p,app,'view',{mode:'text'});
     await action(p,app,'set-text',{text:'{++Upper annotation++}\n\n'+paragraphs.slice(1,-1).join('\n\n')+'\n\n{++Lower annotation++}\n'});await action(p,app,'view',{mode:'visual'});
     for(const label of ['Lower annotation','Upper annotation']){
      await p.evaluate(()=>{void pudlCommands.run('review-changes',null,document.querySelector('[data-applet]'));});
      const dialog=p.getByRole('dialog',{name:'Review Changes',exact:true});await dialog.getByRole('option').filter({hasText:label}).click();await dialog.getByRole('button',{name:'Show in Text',exact:true}).click();await dialog.waitFor({state:'hidden'});
      await commandVisible(p,false,'review '+label);assert.ok((await p.evaluate(()=>{const v=yavcCodeMirror.EditorView.findFromDOM(document.querySelector('.cm-editor'));return v.state.sliceDoc(v.state.selection.main.from,v.state.selection.main.to);})).includes(label),label);
     }
    }
   }
  }catch(e){await p.screenshot({path:path.join(out,engine+'-'+app+'-'+mode+'.png')}).catch(()=>{});console.error(phase);throw e;}finally{await p.close();}
 }}finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
