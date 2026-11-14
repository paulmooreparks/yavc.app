// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The draft notification of the snapshot service (docs/content-recovery-contract.md, Snapshot service version 2), in both Docs views: the applet calls
// changed() on the snapshot handle at once for each edit to the text, and take() returns the current text at once, in the rich view as well as the
// Markdown view. While an input method is composing, take() returns the text as it was before the composition began, and changed() is called when it ends.
// A take() must not change what the person sees. The test keeps running after a failure so that one run reports every view. Usage:
//   node scripts/test-docs-draft-notification.cjs <package folder> [browsers]
// Composition is driven through the Chrome DevTools protocol, which only Chromium offers, so Firefox and WebKit run every check but that one.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();res.writeHead(200,{'content-type':types[path.extname(u.pathname)]||'application/octet-stream'}).end(await fs.readFile(path.join(artifact,decodeURIComponent(u.pathname.slice(prefix.length)))));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[],notes=[];
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});
  async function open(view){
   const page=await browser.newPage({viewport:{width:1500,height:1600}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`);await page.locator('#document .ProseMirror').waitFor();
   await page.evaluate(name=>pudlCommands.run(name,null,document.querySelector('#document')),view==='text'?'view-text':'view-visual');
   if(view==='text'){await page.locator('#document .cm-content').click();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.press('Enter');}
   else{
    await page.waitForFunction(()=>{const p=document.querySelector('#document .ProseMirror');return p&&p.getAttribute('aria-busy')!=='true'&&p.textContent.includes('Independent host diagram');});
    await page.locator('#document .ProseMirror p').filter({hasText:'Editable words.'}).click();
    const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await frames();await page.keyboard.press('ControlOrMeta+End');await page.waitForFunction(()=>{const node=getSelection().anchorNode;return !!node&&getSelection().anchorOffset===node.length;});await frames();await page.keyboard.press('Enter');
   }
   return {page,errors};
  }
  const count=page=>page.evaluate(()=>fixture.changes.document||0);
  const draft=page=>page.evaluate(()=>{const snapshot=fixture.takes.document();const tab=snapshot&&snapshot.tabs&&snapshot.tabs.find(t=>typeof t.draft==='string');return tab?tab.draft:null;});
  const shape=(page,view)=>page.evaluate(view=>{const selection=getSelection(),node=selection.anchorNode;return {text:document.querySelector(view==='text'?'#document .cm-content':'#document .ProseMirror').innerText,caret:node?(node.data||node.textContent).slice(0,40)+'@'+selection.anchorOffset:null};},view);
  try{for(const view of ['text','visual']){
   const label=`${engine} ${view==='text'?'Markdown view':'rich view'}`;
   // 1. Every key calls changed() and take() has the text, with no wait between keys.
   {const {page,errors}=await open(view);const typed='314159265358';let missedCall=0,missedText=0,first=null,sofar='';
    for(const key of typed){const before=await count(page);await page.keyboard.press(key);sofar+=key;const after=await count(page),text=await draft(page);
     if(after<=before){missedCall++;first=first||`key ${sofar.length}`;}
     if(typeof text!=='string'||!text.includes(sofar)){missedText++;}}
    if(missedCall)failures.push(`${label}: changed() was not called at once for ${missedCall} of ${typed.length} keys (first: ${first}).`);
    if(missedText)failures.push(`${label}: take() lacked the typed text at once after ${missedText} of ${typed.length} keys.`);
    // 2. A burst with no pause: the whole of it is in take() when the last key returns.
    const burst='271828182845904523536';await page.keyboard.type(burst);const text=await draft(page);
    if(typeof text!=='string'||!text.includes(sofar+burst))failures.push(`${label}: after ${burst.length} keys typed without a pause, take() returned ${JSON.stringify(typeof text==='string'?text.slice(-50):text)} and not the whole of the typed text.`);
    // 3. A take() leaves what the person sees as it was: the text, the caret, and the next key.
    const before=await shape(page,view);await draft(page);const after=await shape(page,view);
    if(before.text!==after.text||before.caret!==after.caret)failures.push(`${label}: take() changed what the page shows or where the caret is (${JSON.stringify(before.caret)} then ${JSON.stringify(after.caret)}).`);
    await page.keyboard.type('77');const tail=await draft(page);if(typeof tail!=='string'||!tail.endsWith(sofar+burst+'77')&&!tail.includes(sofar+burst+'77'))failures.push(`${label}: after a take() the next keys did not land where the person was typing (${JSON.stringify(typeof tail==='string'?tail.slice(-40):tail)}).`);
    if(errors.length)failures.push(`${label}: page errors ${errors.join(' | ')}`);await page.close();}
   // 4. Undo is the same with a take() in the middle of typing as without one. Undo groups typing by the time between key presses (the
   //    source history and CodeMirror both merge edits less than 500 ms apart), so two runs are comparable only if no gap between their
   //    keys came near that. The gaps are measured in the page. A pair in which any gap passed 400 ms is discarded and the pair run again,
   //    at most five times; a test that finds no such pair fails and says why, and one that discards a pair says it compared fewer.
   {const attempts=5;let compared=0,discarded=0,different=null;
    for(let attempt=0;attempt<attempts&&!compared;attempt++){const results=[],gaps=[];
     for(const withTake of [false,true]){const {page}=await open(view);
      await page.evaluate(()=>{window.__keys=[];document.addEventListener('keydown',e=>{if(/^[0-9]$/.test(e.key))window.__keys.push(performance.now());},true);});
      await page.keyboard.type('1234');await page.waitForTimeout(0);
      if(withTake)await draft(page);await page.keyboard.type('5678');
      gaps.push(await page.evaluate(()=>{const k=window.__keys;let widest=0;for(let i=1;i<k.length;i++)widest=Math.max(widest,k[i]-k[i-1]);return {keys:k.length,widest:Math.round(widest)};}));
      await page.keyboard.press('ControlOrMeta+z');
      // The undo is applied a moment after the key in a slow browser (WebKit's, under load), so the text is read once it has stopped changing: three samples 100 ms apart that agree.
      let seen='',stable=0;for(let n=0;n<40&&stable<3;n++){await page.waitForTimeout(100);const now=(await shape(page,view)).text.replace(/\s+/g,' ');stable=now===seen?stable+1:0;seen=now;}
      results.push(seen);await page.close();}
     if(gaps.some(g=>g.keys!==8||g.widest>400)){discarded++;continue;}
     compared++;if(results[0]!==results[1])different=`${label}: undo gave different text with a take() in the middle of typing: without ${JSON.stringify(results[0].slice(-40))}, with ${JSON.stringify(results[1].slice(-40))}.`;}
    if(!compared)failures.push(`${label}: no pair of runs had every gap between its key presses under 400 ms in ${attempts} tries, so undo could not be compared (undo groups typing by time).`);
    else if(different)failures.push(different);
    if(discarded)console.log(`${label}: discarded ${discarded} pair${discarded===1?'':'s'} of runs in which a gap between key presses reached 400 ms, so undo was compared in fewer runs than planned.`);}
   // 4b. If the engine that converts the page is not ready, take() returns the text without the page's latest edit, and the host is told again once the conversion succeeds.
   if(view==='visual'){const {page,errors}=await open(view);
    await page.evaluate(()=>{const engine=window.yavcMdEngine,real=engine.current;fixture.engineDown=true;engine.current=function(){if(fixture.engineDown)throw new Error('The engine is not ready.');return real.apply(engine,arguments);};});
    const before=await count(page);await page.keyboard.type('4242');const calls=await count(page),without=await draft(page);
    if(calls-before<4)failures.push(`${label}: with the engine not ready, changed() was called ${calls-before} times for four keys, and not once for each.`);
    if(typeof without==='string'&&without.includes('4242'))failures.push(`${label}: with the engine not ready, take() returned the page's latest edit.`);
    await page.evaluate(()=>{fixture.engineDown=false;});
    await page.waitForFunction(()=>(fixture.changes.document||0)>0&&fixture.takes.document().tabs.some(t=>typeof t.draft==='string'&&t.draft.includes('4242')),null,{timeout:10000}).catch(()=>failures.push(`${label}: after the engine was ready again, take() still lacked the edit that was waiting.`));
    if(await count(page)<=calls)failures.push(`${label}: the host was not told again with changed() when the waiting edit was written into the text.`);
    if(errors.length)failures.push(`${label}: page errors ${errors.join(' | ')}`);await page.close();}
   // 5. Composition, in Chromium.
   if(engine!=='chromium'){notes.push(`${label}: composition not run, ${engine} has no way to drive an input method from a test.`);continue;}
   {const {page,errors}=await open(view);const client=await page.context().newCDPSession(page);
    // A host that keeps a draft takes one on each changed(), so keep what it would have stored, as a host does.
    await page.evaluate(()=>{const real=fixture.takes.document;fixture.stored=null;fixture.changes=new Proxy(fixture.changes,{set(target,key,value){target[key]=value;const s=real(),tab=s&&s.tabs&&s.tabs.find(t=>typeof t.draft==='string');fixture.stored=tab?tab.draft:null;return true;}});});
    const stored=()=>page.evaluate(()=>fixture.stored);
    await page.keyboard.type('55');
    // The third promise: while composing, take() may or may not include what is not committed, so only that it answers is asked.
    await client.send('Input.imeSetComposition',{text:'ni',selectionStart:2,selectionEnd:2});
    const during=await draft(page);if(during!==null&&typeof during!=='string')failures.push(`${label}: take() during a composition did not return text.`);
    // The committed text differs from what was being composed, so a host told only of the composing text would hold the wrong one.
    await client.send('Input.insertText',{text:'nǚ'});
    const ended=await draft(page),kept=await stored();
    if(typeof ended!=='string'||!ended.includes('55nǚ'))failures.push(`${label}: after the composition ended, take() returned ${JSON.stringify(typeof ended==='string'?ended.slice(-30):ended)} and not the committed text.`);
    if(kept!==ended)failures.push(`${label}: a host that takes a draft on each changed() held ${JSON.stringify(typeof kept==='string'?kept.slice(-30):kept)} after the composition ended, and take() returned ${JSON.stringify(typeof ended==='string'?ended.slice(-30):ended)}.`);
    if(errors.length)failures.push(`${label}: page errors ${errors.join(' | ')}`);await page.close();}
  }}catch(error){failures.push(`${engine}: ${String(error.message).split('\n')[0]}`);}finally{await browser.close();}
 }}finally{server.close();}
 notes.forEach(n=>console.log('Not checked: '+n));
 if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Docs called changed() for each edit and take() returned the current text, in both views.');
})().catch(error=>{console.error(error);process.exitCode=1;});
