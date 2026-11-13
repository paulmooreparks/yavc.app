// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Printing and exporting a document with a picture, under a policy that does not allow blob: (DESIGN.md, decision 151):
//   node scripts/test-portable-export-picture.cjs <artifact> [chromium firefox webkit]
// Export decodes a picture from its bytes with createImageBitmap, which needs no address, so a host whose policy has
// `img-src 'self' data:` and no blob: sees no violation. The pictures are a data: address typed into the document and a picture
// from the host's own origin. The policy and headers are PFO's, as the Tester's strict-policy harness uses them.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/pfo/assets/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const policy="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
const headers={'Content-Security-Policy':policy,'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path)),asked=[];
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));
  for(const [k,v] of Object.entries(headers))res.setHeader(k,v);
  if(name==='host.png'){asked.push(name);res.setHeader('Content-Type','image/png');return res.end(pixel);}
  if(!allowed.has(name))return res.writeHead(404).end();res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(await fs.readFile(path.join(artifact,name)));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const b=await pw[engine].launch({headless:true}),ctx=await b.newContext({acceptDownloads:true,viewport:{width:1500,height:1600}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(30000);
  await p.addInitScript(()=>{window.__violations=[];window.__seen=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push(e.effectiveDirective+' '+e.blockedURI));
   document.addEventListener('DOMContentLoaded',()=>new MutationObserver(l=>l.forEach(m=>m.addedNodes.forEach(n=>n.textContent&&window.__seen.push(n.textContent.trim().slice(0,200))))).observe(document.body,{childList:true,subtree:true}));});
  try{
   await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`);await p.locator('#document .ProseMirror').waitFor();
   const text='# Pictures\n\n![Data](data:image/png;base64,'+pixel.toString('base64')+')\n\n![Host](/pfo/assets/host.png)\n';
   await p.evaluate(t=>{fixture.records.set('memory:pictures.docs.md',{text:t,revision:1,name:'Pictures.docs.md'});return pudlActions.run('yavc.docs/open-file@1',{path:'memory:pictures.docs.md'},{grant:'all'});},text);
   await p.locator('#document .ProseMirror').getByRole('heading',{name:'Pictures'}).waitFor();
   // Export to Word, which decodes the same pictures.
   const download=p.waitForEvent('download');await p.evaluate(()=>{pudlCommands.run('export-docx',null,document.querySelector('#document'));});
   const file=await download;assert.match(file.suggestedFilename(),/\.docx$/);
   // Print: the pictures are decoded for the pages.
   await p.evaluate(()=>{window.print=()=>{};pudlCommands.run('print-document',null,document.querySelector('#document'));});
   await p.waitForFunction(()=>window.__seen.some(t=>/Preparing|print/i.test(t))||true);await p.waitForTimeout(2500);
   const seen=await p.evaluate(()=>window.__seen);
   assert.ok(!seen.some(t=>/could not be (exported|printed|decoded)|could not be decoded/i.test(t)),`${engine}: ${JSON.stringify(seen.filter(t=>/could not/i.test(t)))}`);
   assert.ok(asked.length>0,`${engine}: the host's picture was never fetched`);
   assert.deepEqual(await p.evaluate(()=>window.__violations),[],`${engine}: violations of a policy with no blob:`);
   assert.deepEqual(errors,[],`${engine}: page errors`);
   console.log(engine+': print and export decode data: and host pictures with no blob: and no violation ('+manifest.digest+')');
  }catch(err){console.error(engine,errors,await p.evaluate(()=>[window.__violations,window.__seen.slice(-8)]).catch(()=>[]));throw err;}finally{await b.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
