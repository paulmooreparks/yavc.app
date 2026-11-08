// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const port=process.env.YAVC_CHROME_TEST_PORT||'8442',out=path.join(os.tmpdir(),'yavc-content-dialog-evidence');fs.mkdirSync(out,{recursive:true});
const action=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
const command=(p,id)=>p.evaluate(id=>{window.contentDialogCommand=pudlCommands.run(id,null,document.querySelector('[data-applet]'));},id);
async function review(p,app,id,engine){
 const dialog=p.locator('dialog[open]').last();await dialog.waitFor();
 if(id==='insert-sc-toc'){
  const field=dialog.getByLabel('From Heading Level',{exact:true});await field.fill('invalid');await field.press('Tab');await dialog.getByRole('button',{name:'Insert',exact:true}).click();assert.equal(await dialog.isVisible(),true);assert.equal(await field.getAttribute('aria-invalid'),'true');await field.fill('2');await field.press('Tab');
 }
 if(id==='cv-resize'){
  const before=(await action(p,app,'diagram')).text,field=dialog.getByLabel('Width (px)',{exact:true});await field.fill('invalid');await field.press('Tab');await dialog.getByRole('button',{name:'Resize',exact:true}).click();assert.equal(await dialog.isVisible(),true);assert.equal((await action(p,app,'diagram')).text,before);await field.fill('200');await field.press('Tab');await dialog.getByRole('button',{name:'Resize',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(JSON.parse((await action(p,app,'diagram')).text).nodes[0].width,200);await command(p,id);await dialog.waitFor();
 }
 if(id==='typography')await p.waitForFunction(()=>document.querySelector('.md-typography-dialog .dialog-body')?.getAttribute('aria-busy')!=='true');
 const title=await dialog.evaluate(d=>d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' '));assert.ok(title.trim(),id+' has no name');
 for(const width of [1200,360]){await p.setViewportSize({width,height:900});await p.evaluate(theme=>pudlSetTheme(theme),width===360?'dark':'light');assert.equal(await dialog.evaluate(d=>d.scrollWidth>d.clientWidth+2),false,app+' '+id+' overflow');await p.screenshot({animations:'disabled',path:path.join(out,engine+'-'+app+'-'+id+'-'+width+'.png')});}
 for(let i=0;i<8;i++){await p.keyboard.press(i%2?'Shift+Tab':'Tab');assert.equal(await dialog.evaluate(d=>d.contains(document.activeElement)||d===document.activeElement),true,id+' loses focus');}
 const cancel=dialog.getByRole('button',{name:'Cancel',exact:true});if(await cancel.count())await cancel.click();else await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await p.setViewportSize({width:1200,height:900});
 return {engine,app,id,title,result:'rendered, narrow layout, cancellation and keyboard checked'};
}
(async()=>{const results=[];for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{for(const app of ['editor','slides','diagrams']){
  const p=await browser.newPage({viewport:{width:1200,height:900}});p.setDefaultTimeout(20000);let phase='boot';
  try{
   await p.goto(`http://${app}.localhost:${port}/`);await p.locator('[data-applet][data-applet-state="running"]').waitFor();
   if(app==='editor')await p.locator('.cm-content').waitFor({state:'attached'});
   if(app==='diagrams'){
    await action(p,app,'new',{kind:'canvas'});await action(p,app,'set-text',{text:JSON.stringify({nodes:[{id:'a',type:'text',x:0,y:0,width:160,height:80,text:'First shape'},{id:'b',type:'text',x:240,y:80,width:160,height:80,text:'Second shape'}],edges:[{id:'ab',fromNode:'a',toNode:'b'}]})});
    for(const id of ['cv-select-items','cv-connect','cv-resize','cv-reconnect-start','cv-reconnect-end','common-toolbar-customize']){phase=id;await action(p,app,'canvas-view',{op:'select',kind:id.includes('reconnect')?'edge':'node',key:id.includes('reconnect')?'ab':'a'});await command(p,id);results.push(await review(p,app,id,engine));}
    phase='canvas searchable selection';await action(p,app,'canvas-view',{op:'select',key:'a'});await command(p,'cv-select-items');let d=p.getByRole('dialog',{name:'Select Canvas Items',exact:true});await d.getByLabel('Find an Item',{exact:true}).fill('Second shape');const list=d.getByRole('listbox');await list.focus();await p.keyboard.press('Home');await p.keyboard.press('Space');assert.match(await d.locator('[data-selection-count]').innerText(),/2 selected/);await d.getByLabel('Find an Item',{exact:true}).fill('no match');assert.equal(await d.locator('[data-no-items]').isVisible(),true);await d.getByRole('button',{name:'Select',exact:true}).click();await d.waitFor({state:'hidden'});await command(p,'cv-select-items');d=p.getByRole('dialog',{name:'Select Canvas Items',exact:true});await d.waitFor();assert.equal(await d.locator('[data-item-row][aria-selected="true"]').count(),2);await d.getByRole('button',{name:'Cancel',exact:true}).click();
    phase='D2 forms';await action(p,app,'new',{kind:'d2'});await action(p,app,'set-text',{text:'a: First\nb: Second\nbox: Container\na -> b: Next\n'});await action(p,app,'view',{mode:'preview'});await action(p,app,'render');
    for(const id of ['shape-label','shape-rename','shape-move-into']){phase=id;await p.locator('.dg-hit-shape').first().click({force:true});await command(p,id);results.push(await review(p,app,id,engine));}
    phase='connection label';await p.locator('.dg-hit-line .dg-hit-wide').first().click({force:true});await command(p,'shape-label');results.push(await review(p,app,'connection-label',engine));
   }else{
    if(app==='editor')await action(p,app,'new',{path:'~/dialog-review.docs.md',text:'# Review\n\nEditable paragraph.\n'});
    else await action(p,app,'load',{text:'# Review\n\nEditable paragraph.\n\n---\n\n# Second\n\nOther paragraph.\n'});
    await action(p,app,'view',{mode:'visual'});await p.locator('.ProseMirror').waitFor();
    const before=(await action(p,app,app==='editor'?'document':'text')).text;
    const base=app==='editor'?['page-setup','typography','header-footer','properties','stylesheet','custom-shortcodes','document-zoom-custom']:['deck-colours','slide-colours','deck-stylesheet','deck-style-block','custom-shortcodes','slide-class','background-image','deck-title','slide-delete'];
    const ids=base.concat(['color','class','link','common-toolbar-customize'],['figure','video','applet','code','toc','status','kbd','glyph','page','anchor'].map(n=>'insert-sc-'+n));
    for(const id of ids){phase=id;await p.locator('.ProseMirror h1').first().click();await command(p,id);results.push(await review(p,app,id,engine));assert.equal((await action(p,app,app==='editor'?'document':'text')).text,before,app+' '+id+' changed on cancellation');}
   }
   assert.equal(await p.locator('.site-menubar .menubar-title[data-menu-id="go"]').count(),0);console.log(engine+' '+app+': content dialog rendering and cancellation checked');
  }catch(error){await p.screenshot({animations:'disabled',path:path.join(out,engine+'-'+app+'-failed.png')}).catch(()=>{});throw new Error(engine+' '+app+' '+phase+': '+error.message);}finally{await p.close();}
 }}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
}})().catch(error=>{console.error(error);process.exitCode=1;});
