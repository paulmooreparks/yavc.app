// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Only the extracted directory is served, under a deliberately unrelated URL.
const assert=require('node:assert/strict'), http=require('node:http'), fs=require('node:fs/promises'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto'), pw=require('playwright');
const artifact=path.resolve(process.argv[2]||''), prefix='/another-product/releases/proof/';
const evidence=path.join(os.tmpdir(),'yavc-portable-diagrams-evidence');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8'));
 assert.equal(manifest.version,1);
 assert.ok(manifest.files.some(f=>f.path==='LICENSE'));
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex'),manifest.digest);
 const allowed=new Set(['manifest.json']);
 for(const item of manifest.files){assert.ok(typeof item.path==='string'&&!path.isAbsolute(item.path)&&!item.path.split('/').some(p=>p==='..'||p===''));assert.ok(!allowed.has(item.path));allowed.add(item.path);}
 for(const item of manifest.files){const bytes=await fs.readFile(path.join(artifact,item.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256,item.path);}
 await fs.mkdir(evidence,{recursive:true});
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
   const relative=decodeURIComponent(url.pathname.slice(prefix.length));const file=path.resolve(artifact,relative);
   if(!allowed.has(relative)){res.writeHead(404).end();return;}
   if(!file.startsWith(artifact+path.sep)){res.writeHead(403).end();return;}
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");
   if(relative==='content/diagram-kit/worker.js')res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'");
   res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
   const browser=await pw[engine].launch({headless:true});const p=await browser.newPage({viewport:{width:1280,height:1400}});p.setDefaultTimeout(30000);
   const errors=[],badRequests=[];p.on('pageerror',e=>errors.push(e.stack));p.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith(prefix))badRequests.push(r.url());});
   try{
    await p.goto(`http://127.0.0.1:${server.address().port}${prefix}lab/index.html?file=unrelated-query.d2`);
    await p.locator('#one .cm-editor').waitFor({state:'attached'});await p.locator('#two .cm-editor').waitFor({state:'attached'});
    await p.locator('#one .dg-canvas img').waitFor();
    await p.waitForFunction(()=>document.querySelector('#two').dataset.kind==='canvas'&&document.querySelector('#two .dg-canvas').textContent.includes('Canvas'));
    assert.equal(await p.title(),'Independent Diagram Host');
    assert.deepEqual(await p.evaluate(()=>[typeof pcSiteFs,typeof pcConfig,typeof pudlWindows,localStorage.length,sessionStorage.length]),['undefined','undefined','undefined',0,0]);
    const source=p.locator('#one .cm-content');await source.click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('\nc: Submitted');
    await p.evaluate(()=>{fixture.hold();fixture.pending=pudlCommands.run('save',null,document.querySelector('#one'));});
    await p.waitForFunction(()=>fixture.writes.length===1);
    await source.click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('\nd: Newer');
    await p.evaluate(async()=>{fixture.release();await fixture.pending;});
    assert.equal(await p.evaluate(()=>fixture.records.get('memory:first.d2').text.includes('Newer')),false);
    assert.match(await source.innerText(),/Newer/);assert.equal(await p.locator('#one .doc-tab-dirty').count(),1);
    await p.evaluate(()=>pudlCommands.run('save',null,document.querySelector('#one')));
    assert.equal(await p.evaluate(()=>fixture.records.get('memory:first.d2').text.includes('Newer')),true);
    assert.equal(await p.locator('#one .doc-tab-dirty').count(),0);
    await p.evaluate(()=>{fixture.records.get('memory:first.d2').revision++;});
    await source.click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('\ne: Conflict');
    await p.evaluate(async()=>{try{await pudlCommands.run('save',null,document.querySelector('#one'));}catch(e){fixture.conflict=e.message;}});
    assert.equal(await p.evaluate(()=>fixture.records.get('memory:first.d2').text.includes('Conflict')),false);
    assert.equal(await p.locator('#one .doc-tab-dirty').count(),1);
    await p.locator('#one .yavc-notice').filter({hasText:'Conflict'}).waitFor();
    assert.equal(await p.locator('#one [data-role="message"]').innerText(),'');
    assert.equal(await p.evaluate(()=>JSON.parse(fixture.records.get('memory:second.canvas').text).unknownFixture.preserve),true);
    await p.evaluate(()=>{
     fixture.records.set('memory:third.d2',{text:'third: Before\n',revision:1});
     const root=document.createElement('div');root.id='three';root.dataset.applet='diagrams';root.dataset.appletParam='third';root.dataset.resource='memory:third.d2';document.querySelector('main').append(root);pudlApplets.boot(root);
    });
    await p.locator('#three .dg-canvas img').waitFor();
    await p.locator('#three .cm-content').click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('\nlate: Pending');
    await p.evaluate(()=>{fixture.hold();fixture.pendingLate=pudlCommands.run('save',null,document.querySelector('#three'));});
    await p.waitForFunction(()=>fixture.writes.some(w=>w.resource==='memory:third.d2'));
    await p.evaluate(async()=>{const root=document.querySelector('#three');pudlApplets.destroy(root);root.remove();fixture.release();await fixture.pendingLate;});
    assert.match(await p.evaluate(()=>fixture.records.get('memory:third.d2').text),/Pending/);
    assert.equal(await p.evaluate(()=>fixture.records.get('memory:second.canvas').revision),1);
    await p.screenshot({path:path.join(evidence,engine+'-independent-host.png'),fullPage:true});
    await p.evaluate(()=>{const root=document.querySelector('#one');pudlApplets.destroy(root);root.remove();});
    await p.locator('#two .cm-content').click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.press('Space');
    await p.evaluate(()=>pudlCommands.run('save',null,document.querySelector('#two')));
    assert.equal(await p.evaluate(()=>fixture.records.get('memory:second.canvas').revision),2);
    assert.equal(await p.evaluate(()=>JSON.parse(fixture.records.get('memory:second.canvas').text).unknownFixture.preserve),true);
    await p.evaluate(()=>pudlCommands.run('new-mm-flowchart',null,document.querySelector('#two')));
    await p.waitForFunction(()=>document.querySelector('#two').dataset.kind==='mermaid');
    await p.locator('#two .dg-canvas svg').waitFor();
    await p.goto(`http://127.0.0.1:${server.address().port}${prefix}lab/index.html?withRecovery=1`);
    await p.locator('#one[data-applet-state="error"]').waitFor({state:'attached'});
    assert.equal(await p.evaluate(()=>fixture.snapshotJoins),0);
    await p.goto(`http://127.0.0.1:${server.address().port}${prefix}lab/index.html?holdRead=1`);
    await p.waitForFunction(()=>fixture.readPending&&fixture.releaseRead);
    await p.evaluate(async()=>{fixture.removed=document.querySelector('#one');pudlApplets.destroy(fixture.removed);fixture.removed.remove();fixture.releaseRead();await new Promise(requestAnimationFrame);});
    assert.equal(await p.evaluate(()=>fixture.removed.querySelector('.cm-editor')===null),true,'A disposed initial read must not restart the editor');
    assert.deepEqual(badRequests,[]);assert.deepEqual(errors,[]);
    console.log(engine+': extracted assets, D2/WASM, Canvas/Markdown, independent mounts, conditional saves, newer edits, conflict and disposal passed');
   }catch(e){await p.screenshot({path:path.join(evidence,engine+'-failure.png'),fullPage:true});throw e;}finally{await browser.close();}
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
