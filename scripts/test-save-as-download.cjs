// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8493';
const action=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});try{for(const app of ['editor','docs','slides','diagrams']){
 const p=await browser.newPage({viewport:{width:1450,height:1050}});p.setDefaultTimeout(20000);await p.goto(`http://${app}.localhost:${port}/`);
 await p.locator(app==='slides'?'.deck-body':app==='diagrams'?'.dg-canvas':'.cm-content').first().waitFor({state:'attached'});
 const suffix=app==='slides'?'.slides.md':app==='diagrams'?'.d2':'.md',text=app==='diagrams'?'a: Before\n':'# Before\n\nBody.\n';
 const formats=app==='editor'?['utf-8','utf-16le']:['utf-8'];
 for(const encoding of formats){
  const resource='~/source-'+encoding+suffix,name='download-'+encoding+suffix;
  await p.evaluate(async({resource,text,encoding})=>{const F=await yavcUtil.siteFs();await F.contentResources.create({resource,text,encoding,bom:encoding!=='utf-8'});},{resource,text,encoding});
  await action(p,app,app==='slides'?'open':'open-file',{path:resource});
  await action(p,app,'set-text',{text:app==='diagrams'?'a: Captured\n':'# Captured\n\nUnicode café.\n'});
  const readAction=app==='diagrams'?'diagram':app==='slides'?'text':'document',captured=(await action(p,app,readAction)).text;
  await p.evaluate(()=>{window.downloadCopy=pudlCommands.run('save-as',null,document.querySelector('[data-applet]'));});const dialog=p.locator('.fb-picker[open]');await dialog.waitFor();await dialog.getByLabel('File Name',{exact:true}).fill(name);
  await action(p,app,'set-text',{text:app==='diagrams'?'a: Later\n':'# Later\n\nStill unsaved.\n'});
  const pending=p.waitForEvent('download');await dialog.getByRole('button',{name:'Download instead',exact:true}).click();const download=await pending;await p.evaluate(()=>downloadCopy);
  assert.equal(download.suggestedFilename(),name);const bytes=await fs.readFile(await download.path());assert.equal(bytes.toString(encoding==='utf-16le'?'utf16le':'utf8'),(encoding==='utf-16le'?'\ufeff':'')+captured);
  const unchanged=await p.evaluate(async resource=>pcSiteFs.contentResources.read({resource}),resource);assert.equal(unchanged.text,text);
  assert.equal(await p.evaluate(name=>pcSiteFs.resolve(pcSiteFs.home(),name),name),null);assert.equal(await p.locator('[data-role="where"]').innerText(),resource);
  assert.ok(await p.locator('.doc-tab-dirty').count()>0);assert.match((await action(p,app,readAction)).text,/Later/);
 }
 if(engine==='chromium'&&app==='editor'){
  const size=9*1024*1024;await p.evaluate(size=>{window.largeDownload=pudlHost.contentResourceAdapter.saveAs({name:'large.txt',text:'x'.repeat(size),encoding:'utf-16le',bom:true},{host:document.querySelector('[data-applet]')});},size);
  const dialog=p.locator('.fb-picker[open]');await dialog.waitFor();const pending=p.waitForEvent('download');await dialog.getByRole('button',{name:'Download instead',exact:true}).click();const downloaded=await pending;assert.equal(await p.evaluate(()=>largeDownload),null);const bytes=await fs.readFile(await downloaded.path());assert.equal(bytes.length,(size+1)*2);assert.equal(bytes.readUInt16LE(0),0xfeff);assert.equal(bytes.readUInt16LE(bytes.length-2),120);
 }
 await p.close();console.log(engine+' '+app+': Save As download preserves captured bytes, source binding and later unsaved edits');
 }}finally{await browser.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
