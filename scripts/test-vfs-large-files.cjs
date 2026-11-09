// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),path=require('node:path'),os=require('node:os');
const port=process.env.YAVC_CHROME_TEST_PORT||'8493';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),page=await browser.newPage();const errors=[];try{
  page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://editor.localhost:'+port+'/?view=text');await page.locator('.cm-editor').waitFor();await page.evaluate(()=>yavcUtil.siteFs());
  const limits=await page.evaluate(()=>pcSiteFs.limits);assert.equal(limits.file,100*1048576);assert.equal(limits.home,1024*1048576);assert.equal(limits.text,10*1048576);
  const bytes=await page.evaluate(async()=>{
   const F=pcSiteFs,size=9*1048576,text=('a'.repeat(127)+'\n').repeat(size/128);const created=await F.write(F.home(),'large.txt',text,false);if(created.error)throw new Error(created.error);
   const imported=await F.writeBytes(F.home(),'over-editor.txt',new Uint8Array(11*1048576).fill(65).buffer,'text/plain');if(imported.error)throw new Error(imported.error);
   let refusal;try{await F.contentResources.read({resource:'~/over-editor.txt'});}catch(error){refusal=error.message;}
   const before=await yavcHomeStore.read(),ids=Object.fromEntries(Object.entries(before.data.files).map(([key,value])=>[key,value.id]));
   await F.contentResources.create({resource:'~/encoding.txt',text:'α\r\nβ\n',encoding:'utf-16be',bom:true});
   const encoded=await F.contentResources.read({resource:'~/encoding.txt'}),download=await F.readBytes(F.resolve(F.home(),'over-editor.txt'));
   const after=await yavcHomeStore.read();return {refusal,encoded,download:download.byteLength,used:after.used,stable:Object.entries(ids).every(([key,id])=>after.data.files[key].id===id),lazy:F.resolve(F.home(),'large.txt').content===undefined};
  });assert.match(bytes.refusal,/editing limit/);assert.equal(bytes.download,11*1048576);assert.equal(bytes.encoded.encoding,'utf-16be');assert.equal(bytes.encoded.bom,true);assert.equal(bytes.encoded.text,'α\r\nβ\n');assert.ok(bytes.used>=20*1048576);assert.equal(bytes.stable,true);assert.equal(bytes.lazy,true);
  await page.evaluate(()=>pudlActions.run('yavc.editor/open-file@1',{path:'~/large.txt'},{grant:'all'}));
  await page.waitForFunction(()=>document.querySelector('[data-role="where"]').textContent.includes('large.txt'));
  await page.locator('.cm-content').click();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.type('Z');
  await page.evaluate(()=>pudlActions.run('yavc.editor/save@1',{}, {grant:'all'}));
  const saved=await page.evaluate(async()=>{const value=await pcSiteFs.contentResources.read({resource:'~/large.txt'});return {length:value.text.length,last:value.text.slice(-1)};});assert.equal(saved.length,9*1048576+1);assert.equal(saved.last,'Z');
  await page.evaluate(async()=>{const result=await pcSiteFs.write(pcSiteFs.home(),'giant-line.txt','a'.repeat(9*1048576),false);if(result.error)throw new Error(result.error);await pudlActions.run('yavc.editor/open-file@1',{path:'~/giant-line.txt'},{grant:'all'});});
  await page.waitForFunction(()=>document.querySelector('[data-role="where"]').textContent.includes('giant-line.txt'));
  assert.equal(await page.locator('.cm-content').evaluate(node=>node.classList.contains('cm-lineWrapping')),false);
  await page.evaluate(()=>{window.wrapProofButton=document.createElement('button');wrapProofButton.type='button';wrapProofButton.dataset.command='toggle-wrap';document.querySelector('[data-applet]').append(wrapProofButton);});await page.waitForFunction(()=>wrapProofButton.disabled);
  assert.ok(await page.evaluate(async()=>{try{await pudlCommands.run('toggle-wrap',null,document.querySelector('[data-applet]'));return false;}catch(error){return /65,536/.test(error.message);}}));
  await page.evaluate(async()=>{await pcConfig.set('editor',{wrap:false});await pcConfig.set('editor',{wrap:true});});
  assert.equal(await page.locator('.cm-content').evaluate(node=>node.classList.contains('cm-lineWrapping')),false);
  await page.locator('.cm-content').click();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.type('Z');await page.evaluate(()=>pudlActions.run('yavc.editor/save@1',{}, {grant:'all'}));
  assert.equal(await page.evaluate(async()=>{const r=await pcSiteFs.contentResources.read({resource:'~/giant-line.txt'});return r.text.length;}),9*1048576+1);
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Backspace');await page.waitForFunction(()=>document.querySelector('.cm-content').classList.contains('cm-lineWrapping'));
  await page.waitForFunction(()=>!wrapProofButton.disabled);
  await page.keyboard.press('ControlOrMeta+Z');await page.waitForFunction(()=>!document.querySelector('.cm-content').classList.contains('cm-lineWrapping'));
  await page.evaluate(()=>pudlActions.run('yavc.editor/open-file@1',{path:'~/large.txt'},{grant:'all'}));
  assert.equal(await page.locator('.cm-content').evaluate(node=>node.classList.contains('cm-lineWrapping')),true);
  assert.deepEqual(errors,[]);console.log(engine+': 9 MiB text editing/save, 11 MiB stored download, UTF-16 and lazy per-file contents pass');
 }catch(error){console.error(engine,errors,await page.locator('.toast,.notice,[data-role="where"]').allTextContents().catch(()=>[]));await page.screenshot({path:path.join(os.tmpdir(),'yavc-vfs-large-'+engine+'-failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
