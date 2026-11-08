// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const dialogLayout=require('./dialog-layout.cjs');
const port=process.env.YAVC_CHROME_TEST_PORT||'8447',out=path.join(os.tmpdir(),'yavc-key-bindings-evidence'+(process.env.YAVC_DIALOG_LARGE_TEXT==='1'?'-large':''));fs.mkdirSync(out,{recursive:true});
const action=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
const stored=(p,app)=>p.evaluate(app=>pudlHost.config.stored(app),app);
const open=async p=>{await p.evaluate(()=>{window.pendingKeys=pudlCommands.run('key-bindings',null,document.querySelector('[data-applet]'));});await p.locator('.ed-key-bindings[open]').waitFor();};
async function layout(p,app,engine){
 const dialog=p.locator('.ed-key-bindings[open]');
 for(const theme of ['light','dark']){
  await p.evaluate(theme=>pudlSetTheme(theme),theme);
  const geometry=await dialog.evaluate(d=>{
   const box=d.getBoundingClientRect(),fieldset=d.querySelector('fieldset').getBoundingClientRect(),reset=d.querySelector('[data-reset-bindings]').getBoundingClientRect();
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
   return {width:box.width,gap:reset.top-fieldset.bottom,clipped:Array.from(d.querySelectorAll('select')).flatMap(s=>{const css=getComputedStyle(s);ctx.font=css.font;const usable=s.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-24;return Array.from(s.options).filter(o=>ctx.measureText(o.textContent).width>usable).map(o=>o.textContent);})};
  });
  assert.ok(geometry.width>=800,app+' dialog still capped at default width');assert.ok(geometry.gap>=15,app+' defaults button needs separation');assert.deepEqual(geometry.clipped,[],app+' command names clipped at desktop width');
  await dialog.screenshot({animations:'disabled',path:path.join(out,engine+'-'+app+'-'+theme+'-wide.png')});
 }
}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});try{for(const app of ['docs','editor']){
  const p=await browser.newPage({viewport:{width:1500,height:1050}});await dialogLayout.prepare(p);try{
   await p.goto(`http://${app}.localhost:${port}/`);await p.locator('.cm-editor').waitFor({state:'attached'});await action(p,app,'new',{path:'~/kept.md',text:'# Keep my document\n'});
   const before=await action(p,app,'documents'),settings=await stored(p,app);await open(p);await layout(p,app,engine);await p.locator('[data-binding-key="Mod-s"]').selectOption('!disabled');await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await stored(p,app),settings);assert.deepEqual(await action(p,app,'documents'),before);
   await open(p);await p.locator('[data-new-key]').fill('Bad-Shift-k');await p.locator('[data-new-command]').selectOption('find');await p.getByRole('button',{name:'Add',exact:true}).click();assert.equal(await p.locator('[data-new-key]').getAttribute('aria-invalid'),'true');
   await p.locator('[data-new-key]').fill('Mod-Shift-k');await p.getByRole('button',{name:'Add',exact:true}).click();await p.locator('[data-binding-key="Mod-s"]').selectOption('!disabled');await p.getByRole('button',{name:'Apply',exact:true}).click();await p.locator('.ed-key-bindings[open]').waitFor({state:'hidden'});assert.equal((await stored(p,app)).keys['Mod-s'],null);assert.equal((await stored(p,app)).keys['Mod-Shift-k'],'find');assert.deepEqual(await action(p,app,'documents'),before);
   await p.locator(app==='docs'?'.ProseMirror':'.cm-content').focus();await p.keyboard.press('Control+s');assert.equal(await p.locator('dialog[open]').count(),0);await p.keyboard.press('Control+Shift+k');await p.getByRole('search',{name:'Find and Replace',exact:true}).waitFor();await p.keyboard.press('Escape');assert.deepEqual(await action(p,app,'documents'),before);
   await open(p);await p.setViewportSize({width:390,height:844});await p.evaluate(()=>pudlSetTheme('dark'));assert.equal(await p.locator('.ed-key-bindings[open]').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);await p.screenshot({path:path.join(out,engine+'-'+app+'-narrow.png')});await p.getByRole('button',{name:'Restore Defaults',exact:true}).click();await p.getByRole('button',{name:'Apply',exact:true}).click();await p.locator('.ed-key-bindings[open]').waitFor({state:'hidden'});assert.deepEqual((await stored(p,app)).keys,{});
   await p.setViewportSize({width:1500,height:1050});await open(p);await p.evaluate(app=>pudlHost.config.set(app,{keys:{'Mod-x':null}}),app);await p.getByRole('button',{name:'Apply',exact:true}).click();await p.getByText('The key bindings changed elsewhere. Close and reopen this dialog.',{exact:true}).waitFor();await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await stored(p,app)).keys,{'Mod-x':null});
   await open(p);await p.evaluate(()=>{window.originalConfigSet=pudlHost.config.set;pudlHost.config.set=async()=>{throw new Error('Synthetic settings failure');};});await p.getByRole('button',{name:'Apply',exact:true}).click();await p.getByText('The key bindings were not saved: Synthetic settings failure',{exact:true}).waitFor();await p.getByRole('button',{name:'Cancel',exact:true}).click();await p.evaluate(()=>{pudlHost.config.set=originalConfigSet;});assert.deepEqual((await stored(p,app)).keys,{'Mod-x':null});assert.deepEqual(await action(p,app,'documents'),before);
   console.log(engine+' '+app+': owned key-binding dialog applies/cancels, validates, resets, rejects stale settings and retains failed saves without opening JSON');
  }finally{await p.close();}
 }}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
