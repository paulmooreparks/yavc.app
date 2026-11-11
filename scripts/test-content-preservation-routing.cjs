// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const port=process.env.YAVC_CHROME_TEST_PORT||'8441',evidence=path.join(os.tmpdir(),'yavc-preservation-routing-evidence');fs.mkdirSync(evidence,{recursive:true});
const action=(p,name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.slides/'+name+'@1',input,{grant:'all'}),{name,input});
const sources=[
 '',
 '# Heading with trailing spaces  \n\nUnknown {{future-widget:option=keep}}.\n\n<!-- retained -->',
 '\ufeff---\r\n# keep this front comment\r\ntitle: "Preserved title"\r\ncustom: untouched\r\n---\r\n\r\n{{slide}}\r\n# One  \r\n\r\n--- \t\r\n\r\n## Two\r\n\r\n```md\r\n---\r\n```\r\n',
 '# Mixed first\r\n\r\n---  \n\n# Mixed second  \r\n\r\n---\r\n\n# Final without newline',
 '# Legacy CR\r\r--- \r\r# Second\r'
];
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1450,height:1000}});p.setDefaultTimeout(25000);let phase='boot';const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  phase='Editor native no-op saves';await p.goto(`http://editor.localhost:${port}/`);await p.locator('.cm-content').waitFor({state:'attached'});
  for(let i=0;i<sources.length;i++){
   const name='editor-preserve-'+i+'.md',source=sources[i];await p.evaluate(async({name,source})=>{const F=await yavcUtil.siteFs();await F.write(F.home(),name,source,false);},{name,source});
   /* The Editor opens a Markdown file only as its text, and only when asked for the text (DESIGN.md, decision 131). */
   await assert.rejects(p.evaluate(name=>pudlActions.run('yavc.editor/open-file@1',{path:'~/'+name},{grant:'all'}),name),/A Markdown document opens in Docs\. Use yavc\.docs\/open-file@1/);
   await p.evaluate(async name=>{await pudlActions.run('yavc.editor/open-file@1',{path:'~/'+name,view:'text'},{grant:'all'});await pudlActions.run('yavc.editor/save@1',{}, {grant:'all'});},name);
   assert.equal(await p.evaluate(name=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),name)),name),source);
   assert.equal((await p.evaluate(()=>pudlActions.run('yavc.editor/document@1',{}, {grant:'all'}))).modified,false);
  }
  /* Split is drawn by Docs now, so the save that follows a drawn view is tested there. */
  phase='Docs Split no-op saves';const docs=await browser.newPage({viewport:{width:1450,height:1000}});docs.setDefaultTimeout(25000);docs.on('pageerror',e=>errors.push(e.message));await docs.goto(`http://docs.localhost:${port}/`);await docs.locator('.cm-content').waitFor({state:'attached'});
  for(let i=0;i<sources.length;i++){
   const name='docs-preserve-'+i+'.md',source=sources[i];await docs.evaluate(async({name,source})=>{const F=await yavcUtil.siteFs();await F.write(F.home(),name,source,false);},{name,source});
   await docs.evaluate(async name=>{await pudlActions.run('yavc.docs/open-file@1',{path:'~/'+name},{grant:'all'});await pudlActions.run('yavc.docs/view@1',{mode:'split'},{grant:'all'});await pudlActions.run('yavc.docs/save@1',{}, {grant:'all'});},name);
   assert.equal(await docs.evaluate(name=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),name)),name),source);
   assert.equal((await docs.evaluate(()=>pudlActions.run('yavc.docs/document@1',{}, {grant:'all'}))).modified,false);
  }
  await docs.close();
  phase='native Editor copy';await p.evaluate(()=>pudlActions.run('yavc.editor/open-file@1',{path:'~/editor-preserve-3.md',view:'text'},{grant:'all'}));await p.evaluate(()=>{window.copyDone=pudlCommands.run('save-as',null,document.querySelector('[data-applet]'));});const picker=p.locator('.fb-picker[open]');await picker.waitFor();await picker.getByLabel('File Name',{exact:true}).fill('native-copy.md');await picker.getByRole('button',{name:'Save',exact:true}).click();await p.evaluate(()=>copyDone);assert.equal(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'native-copy.md'))),sources[3]);
  phase='Markdown typed preservation';const markdown='# Heading\r\n\r\n<!-- retain this comment -->\r\n\r\n{{future-widget:mode=keep}}\r\n\r\n```custom language=keep\r\nraw <tag>\r\n```\r\n';const typed=await p.evaluate(async source=>{const m=await yavcMdEngine();const doc=m.doc(source);const unchanged=m.markdown(JSON.parse(JSON.stringify(doc)));doc.content[0].content[0].text='Edited';return {unchanged,edited:m.markdown(doc)};},markdown);assert.equal(typed.unchanged,markdown);assert.match(typed.edited,/Edited/);assert.ok(typed.edited.includes('<!-- retain this comment -->'));assert.ok(typed.edited.includes('{{future-widget:mode=keep}}'));assert.ok(typed.edited.includes('```custom language=keep\r\nraw <tag>\r\n```'));
  await p.evaluate(()=>pudlHost.config.set('editor',{}));
  await p.goto(`http://slides.localhost:${port}/`);await action(p,'deck');
  for(let i=0;i<sources.length;i++){
   phase='unchanged source '+i;const name='preserve-'+i+'.slides.md',source=sources[i];await p.evaluate(async({name,source})=>{const F=await yavcUtil.siteFs();await F.write(F.home(),name,source,false);},{name,source});await action(p,'open',{path:'~/'+name});
   assert.equal((await action(p,'text')).text,source);for(const mode of ['text','visual','split'])await action(p,'view',{mode});await action(p,'save');assert.equal(await p.evaluate(name=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),name)),name),source);
  }
  phase='one slide edit';await action(p,'open',{path:'~/preserve-2.slides.md'});await action(p,'set-text',{index:1,text:'# Edited first\n'});const edited=(await action(p,'text')).text;assert.match(edited,/^\ufeff---\r\n# keep this front comment\r\ntitle: "Preserved title"\r\ncustom: untouched\r\n---\r\n/);assert.ok(edited.endsWith('--- \t\r\n\r\n## Two\r\n\r\n```md\r\n---\r\n```\r\n'));await action(p,'save');
  phase='metadata edit';await action(p,'set-deck',{title:'Changed title'});const changed=(await action(p,'text')).text;assert.match(changed,/custom: untouched/);assert.match(changed,/# keep this front comment/);assert.ok(changed.endsWith('--- \t\r\n\r\n## Two\r\n\r\n```md\r\n---\r\n```\r\n'));
  phase='plan-only host';const windows=await p.locator('.win').count();const plan=await p.evaluate(()=>pudlHost.fileResolution.resolve({name:'intro.slides.md',mime:'text/plain',verifiedText:true,writable:true}));assert.equal(plan.plan.applet,'slides');assert.equal(plan.plan.view,'visual');assert.equal(await p.locator('.win').count(),windows);
  const missing=await p.evaluate(()=>pudlHost.fileResolution.resolve({name:'notes.md',verifiedText:true}));assert.equal(missing.status,'resolved');assert.equal(missing.plan.applet,'docs');assert.equal(missing.plan.view,'visual');
  phase='valid preferences';const preferences={version:1,rules:[{id:'markdown-source',match:{suffix:'.md'},type:'markdown',applet:'editor',operation:'open',view:'text'}]};await p.evaluate(value=>pudlHost.config.set('file-associations',value),preferences);assert.equal((await p.evaluate(()=>pudlHost.fileResolution.resolve({name:'notes.md',verifiedText:true}))).plan.applet,'editor');
  phase='invalid preferences';await p.evaluate(()=>pudlHost.config.set('file-associations',{version:99,rules:[]}));const retained=await p.evaluate(()=>pudlHost.fileResolution.resolve({name:'notes.md',verifiedText:true}));assert.equal(retained.plan.applet,'editor');assert.match(retained.preferenceError,/retained/);assert.equal((await p.evaluate(()=>pudlHost.config.load('file-associations',{}))).version,99);
  assert.deepEqual(errors,[]);await p.screenshot({path:path.join(evidence,engine+'.png')});console.log(engine+': native deck source, untouched spans, metadata and plan-only host resolution passed');
 }catch(err){await p.screenshot({path:path.join(evidence,engine+'-failed.png')}).catch(()=>{});fs.writeFileSync(path.join(evidence,engine+'-failed.txt'),phase+'\n'+err.stack+'\n'+errors.join('\n'));throw new Error(engine+' '+phase+': '+err.message);}finally{await browser.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
