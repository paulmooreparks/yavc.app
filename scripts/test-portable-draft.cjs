// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The draft a host keeps, in Docs' page view (docs/content-recovery-contract.md, snapshot
// service version 2, DESIGN.md decision 149):
//   node scripts/test-portable-draft.cjs <artifact> [chromium firefox webkit]
// The applet calls changed() on the snapshot handle at once for each edit made on the page,
// and take() returns the current text at once, without waiting for the 300 millisecond pause
// that writes the page into the text. Asking changes nothing a person sees: the caret, the
// words and the undo history are what they would have been. While an input method is
// composing, take() returns the text as it was before the composition began and changed()
// is called when it ends (Chromium only, since only it lets Playwright send a composition).
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");if(name==='content/diagram-kit/worker.js')res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'");res.end(await fs.readFile(path.join(artifact,name)));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const b=await pw[engine].launch({headless:true});
  const open=async()=>{const p=await b.newPage({viewport:{width:1500,height:1600}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(25000);
   await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`);await p.locator('#document .ProseMirror').waitFor();
   await p.locator('#document .ProseMirror p').filter({hasText:'Editable words.'}).click();await p.keyboard.press('ControlOrMeta+End');
   p.errors=errors;return p;};
  // What the host would store if it asked now: the text of the document's tab, and how many times it has been told.
  const draft=p=>p.evaluate(()=>{const s=fixture.takes.document();const t=s.tabs.find(k=>k.path==='memory:document.docs.md');return {text:t?(t.draft??'(clean)'):'(no tab)',changes:fixture.changes.document||0};});
  try{
   // 1. Every edit is announced at once, and what is asked for at once is what was typed.
   let p=await open();
   const before=(await draft(p)).changes;
   for(const [i,word] of ['One','Two','Three'].entries()){
    await p.keyboard.type(' '+word);
    const now=await draft(p);   // asked in the same breath as the typing, before any pause
    assert.ok(now.changes>before+i,`${engine}: changed() was called for ${word}`);
    assert.match(now.text,new RegExp('Editable words\\. One'+(i>0?' Two':'')+(i>1?' Three':'')+'\\n?$'),`${engine}: take() returned the text with ${word}`);
   }
   // The text pane and the page agree once the pause has passed, and the pause did not add a second copy.
   await p.waitForTimeout(600);assert.match((await draft(p)).text,/Editable words\. One Two Three\n?$/);
   // 2. A format applied with the keyboard is a change too.
   await p.keyboard.press('Shift+Home');await p.keyboard.press('ControlOrMeta+b');
   assert.match((await draft(p)).text,/\*\*.*Three.*\*\*/,`${engine}: a format change is in take()`);
   await p.close();
   // 3. Asking in the middle of typing changes nothing a person sees: the same keys with and without the asking end in the same text and the same caret.
   const run=async asking=>{const q=await open();await q.keyboard.type(' alpha');if(asking)await draft(q);await q.keyboard.type(' beta');if(asking)await draft(q);
    await q.keyboard.press('ArrowLeft');await q.keyboard.press('ArrowLeft');if(asking)await draft(q);await q.keyboard.type('X');
    const caret=await q.evaluate(()=>{const s=getSelection();return [s.anchorNode.textContent,s.anchorOffset];});
    await q.keyboard.press('ControlOrMeta+z');await q.waitForTimeout(500);
    const after=await q.evaluate(()=>document.querySelector('#document .ProseMirror').innerText);const caretAfter=await q.evaluate(()=>getSelection().anchorOffset);
    await q.close();return {caret,after,caretAfter};};
   const plain=await run(false),asked=await run(true);
   assert.deepEqual(asked,plain,`${engine}: asking for the draft changed the text, the caret or the undo history`);
   // 4. A composition (Chromium): the draft is what it was before it began, and the host is told when it ends.
   if(engine==='chromium'){
    p=await open();const client=await p.context().newCDPSession(p);
    await p.keyboard.type(' before');await p.waitForTimeout(500);const start=await draft(p);assert.match(start.text,/before\n?$/);
    await client.send('Input.imeSetComposition',{text:'ni',selectionStart:2,selectionEnd:2});
    await client.send('Input.imeSetComposition',{text:'ni hao',selectionStart:6,selectionEnd:6});
    const during=await draft(p);
    assert.equal(during.text,start.text,`${engine}: take() during a composition returned the text as it was before it began`);
    await client.send('Input.insertText',{text:'你好'});
    await p.waitForTimeout(100);
    const ended=await draft(p);
    assert.ok(ended.changes>during.changes,`${engine}: changed() was called when the composition ended`);
    assert.match(ended.text,/你好\n?$/,`${engine}: take() after the composition has the composed text`);
    await p.close();
   }else console.log(engine+': the composition case was not run, since Playwright sends composition events only in Chromium');
   console.log(engine+': the page view announces each edit at once and take() returns the current text ('+manifest.digest+')');
  }catch(err){console.error(engine);throw err;}finally{await b.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
