// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The toolbar a person can change, offered by an independent host from the content
// package's own controller (docs/command-toolbar-design.md, decision 9):
//   node scripts/test-portable-toolbar.cjs <artifact> [chromium firefox webkit]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
 assert.ok(allowed.has('support/command-toolbar.js')&&allowed.has('support/command-toolbar.css'));
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");if(name==='content/diagram-kit/worker.js')res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'");res.end(await fs.readFile(path.join(artifact,name)));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const b=await pw[engine].launch({headless:true}),p=await b.newPage({viewport:{width:1500,height:1600}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(25000);
  try{await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?toolbar=1`);await p.locator('#source .cm-content').waitFor({state:'attached'});await p.locator('#document .ProseMirror').waitFor();await p.locator('#deck .deck-canvas').waitFor();
   // Each applet draws the shared toolbar, and its last control opens the dialog that changes it.
   for(const id of ['source','document','deck']){const last=p.locator('#'+id+' .yavc-command-toolbar [data-toolbar-end] [data-command="common-toolbar-customize"]');await last.waitFor();assert.equal(await last.getAttribute('data-toolbar-glyph-only'),'');assert.match(await last.evaluate(e=>e.getAttribute('aria-label')||e.title||e.textContent),/Customize Toolbar/);}
   const rule=await p.evaluate(()=>Array.from(document.styleSheets).some(s=>/command-toolbar\.css$/.test(s.href||'')&&s.cssRules.length>10));assert.equal(rule,true);
   const has=(id,command)=>p.locator('#'+id+' .yavc-command-toolbar [data-command="'+command+'"]').count();
   assert.equal(await has('source','save'),1);assert.equal(await has('document','save'),1);
   await p.locator('#source .yavc-command-toolbar [data-command="common-toolbar-customize"]').click();
   const dialog=p.getByRole('dialog',{name:'Customize Editor Toolbar',exact:true});await dialog.waitFor();
   assert.match(await dialog.locator('[data-selected] option').first().textContent(),/Save/);
   await dialog.locator('[data-selected]').selectOption({index:0});await dialog.locator('[data-edit="remove"]').click();await dialog.getByRole('button',{name:'Apply',exact:true}).click();await dialog.waitFor({state:'hidden'});
   // The arrangement is the Editor's own: Docs keeps its Save button.
   await p.waitForFunction(()=>!document.querySelector('#source .yavc-command-toolbar [data-command="save"]'));assert.equal(await has('document','save'),1);
   assert.equal(await has('source','common-toolbar-customize'),1);
   assert.deepEqual(errors,[]);console.log(engine+': an independent host offers the toolbar a person can change from the package\'s controller ('+manifest.digest+')');
  }catch(err){console.error(engine,errors);throw err;}finally{await b.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
