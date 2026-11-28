// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The real slash-menu journey against a portable package and an invented host.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/forms/',types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
 const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(await fs.readFile(path.join(artifact,name)));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),page=await browser.newPage({viewport:{width:1500,height:1500}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const action=(name,input={})=>page.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
  const form=()=>page.getByRole('dialog',{name:'Insert a Diagram from a File',exact:true});
  async function open(){
   await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);await page.locator('#document .ProseMirror').waitFor();
   await page.evaluate(()=>{fixture.choices=0;pudlHost.fileFields={version:1,choose:async()=>{fixture.choices++;return '~/portable/plan.canvas';}};});
   await action('set-text',{text:'# Invented note\n\nInsert here.\n'});await action('view',{mode:'visual'});
   const paragraph=page.locator('#document .ProseMirror p').filter({hasText:'Insert here.'});await paragraph.click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('/Diagram');
   await page.evaluate(async()=>{const CM=await yavcMdEditor.libs(),limit=Date.now()+25000;for(;;){const view=CM.EditorView.findFromDOM(document.querySelector('#document .cm-editor'));if(view&&view.state.doc.toString().includes('/Diagram'))return;if(Date.now()>limit)throw new Error('The typed /Diagram never reached the text');await new Promise(resolve=>setTimeout(resolve,50));}});
   await page.locator('.page-slash').getByRole('option',{name:/Diagram from a File/}).waitFor();await page.keyboard.press('Enter');await form().waitFor();
   // Observe the delayed source copy without flushing it through an action.
   await page.evaluate(async()=>{const CM=await yavcMdEditor.libs(),limit=Date.now()+25000;for(;;){const view=CM.EditorView.findFromDOM(document.querySelector('#document .cm-editor'));if(view&&!view.state.doc.toString().includes('/Diagram'))return;if(Date.now()>limit)throw new Error('The typed /Diagram never left the text');await new Promise(resolve=>setTimeout(resolve,50));}});
  }
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);await page.locator('#document .ProseMirror').waitFor();
   await page.evaluate(()=>{fixture.choices=0;pudlHost.fileFields={version:1,choose:async()=>{fixture.choices++;return '~/portable/plan.canvas';}};});
   // Hold the source copy behind the page, as an integrated host can do while a form opens.
   await page.evaluate(()=>{
    fixture.heldSource='/Diagram';fixture.pageSource='';
    fixture.answer=yavcMdEditor.askShortcode('diagram',null,{site:()=>Promise.resolve({}),root:document.querySelector('#document'),dir:()=> '~/portable',
     text:()=>fixture.heldSource,flush:()=>{fixture.heldSource=fixture.pageSource;return true;}});
   });await form().waitFor();await page.evaluate(()=>{fixture.heldSource=fixture.pageSource;});
   await form().getByRole('button',{name:'Browse…',exact:true}).click();assert.equal(await page.evaluate(()=>fixture.choices),1,'a delayed source copy must not invalidate Browse');
   await page.waitForFunction(()=>document.querySelector('dialog[open] [data-key="src"]').value==='plan.canvas');
   await form().getByRole('button',{name:'Insert',exact:true}).click();await form().waitFor({state:'hidden'});assert.match(await page.evaluate(()=>fixture.answer),/\{\{diagram:plan.canvas/);
   await open();await form().getByRole('button',{name:'Browse…',exact:true}).click();
   assert.equal(await page.evaluate(()=>fixture.choices),1,'Browse must call the host after slash removal');
   await page.waitForFunction(()=>document.querySelector('dialog[open] [data-key="src"]').value==='plan.canvas');
   assert.doesNotMatch(await form().innerText(),/The document changed/);
   assert.equal(await form().locator('.form-group:has([data-key="src"]) .form-help, .form-group:has([data-key="alt"]) .form-help, .form-group:has([data-key="width"]) .form-help').count(),0,'diagram fields have no help paragraphs');
   await form().getByRole('button',{name:'Insert',exact:true}).click();await form().waitFor({state:'hidden'});assert.match((await action('document')).text,/\{\{diagram:plan.canvas/);
   for(const button of ['Browse…','Insert']){
    await open();await form().getByLabel('Diagram File',{exact:true}).fill('plan.canvas');
    await page.evaluate(()=>yavcMdEditor._page.insertMarkdown('A real edit.'));
    const choices=await page.evaluate(()=>fixture.choices);await form().getByRole('button',{name:button,exact:true}).click();
    await form().getByText('The document changed. Close and reopen this form.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>fixture.choices),choices,'stale Browse must not call the host');assert.doesNotMatch((await action('document')).text,/\{\{diagram:/);
    await form().getByRole('button',{name:'Cancel',exact:true}).click();
   }
   assert.deepEqual(errors,[]);console.log(engine+': slash removal permits Browse and Insert; real pending edits reject both; diagram fields stay concise');
  }catch(error){failures.push(engine+': '+error.stack);}finally{await browser.close();}
 }}finally{server.close();}
 assert.deepEqual(failures,[],failures.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1;});
