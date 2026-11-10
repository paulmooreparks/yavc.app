// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The slide show in a window of its own (docs/presentation-contract.md; DESIGN.md,
// decision 121), run against a built content package in an independent host:
//   node scripts/test-detached-show.cjs <artifact> [chromium firefox webkit]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/independent/content-release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path)),addon=await fs.readFile(path.join(__dirname,'fixtures/detached-show.js'),'utf8');
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();let body=await fs.readFile(path.join(artifact,name));if(name==='workspace-lab/host.js')body=Buffer.from(body+'\n'+addon);res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");res.end(body);}catch(e){res.writeHead(500).end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const lab=`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`;
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),context=await browser.newContext({viewport:{width:1400,height:900}}),errors=[];
  const editor=await context.newPage(),show=await context.newPage();
  for(const p of [editor,show]){p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));}
  const current=p=>p.locator('#deck .deck-show:not(.deck-show-waiting) .deck-current');
  try{
   // The editing window asks the host for a show elsewhere and stays as it is.
   await editor.goto(lab);await editor.locator('#deck .deck-slide').first().waitFor();
   await editor.evaluate(()=>pudlActions.run('yavc.slides/view@1',{mode:'visual'},{grant:'all'}));await editor.locator('#deck .deck-slide .ProseMirror').waitFor();
   await editor.evaluate(()=>pudlCommands.run('present',null,document.querySelector('#deck')));
   await editor.waitForFunction(()=>fixture.show.opened.length===1&&document.querySelector('#deck').classList.contains('deck-show-elsewhere'));
   const asked=await editor.evaluate(()=>fixture.show.opened[0]);
   assert.equal(asked.application,'slides');assert.equal(asked.resource,'memory:deck.slides.md');assert.equal(typeof asked.channel,'string');
   assert.equal(await editor.locator('#deck .deck-show').count(),0);
   assert.equal(await editor.locator('#deck .deck-slide .ProseMirror').isVisible(),true);
   assert.match(await editor.locator('#deck [data-role="position"]').textContent(),/The show is running in a window of its own/);
   // The show's page says it is ready, is sent the deck, and draws it and nothing else.
   await show.goto(lab+'?show=1');await current(show).waitFor();
   assert.match(await current(show).innerText(),/Slide one/);
   assert.equal(await show.locator('#deck .deck-toolbar-slot:visible, #deck [data-role="status"]:visible, #deck .deck-film:visible').count(),0);
   const first=await show.evaluate(()=>fixture.show.received.find(m=>m.type==='state'));
   assert.equal(first.v,1);assert.equal(first.resource,'memory:deck.slides.md');assert.equal(first.slide,0);
   assert.ok(await show.evaluate(()=>fixture.show.sent.every(m=>m.v===1)&&fixture.show.sent[0].type==='ready'));
   // The show's own keys move it, and the editing window follows.
   await show.locator('#deck .deck-show:not(.deck-show-waiting)').focus();await show.keyboard.press('ArrowRight');
   await show.waitForFunction(()=>/Slide two/.test(document.querySelector('#deck .deck-show:not(.deck-show-waiting) .deck-current').innerText));
   await editor.waitForFunction(()=>/Slide 2 of 2/.test(document.querySelector('#deck [data-role="position"]').textContent));
   // The show's page has no resource service; it asks the host for the deck's folder, so a diagram beside the deck is drawn.
   await show.locator('#deck .deck-show:not(.deck-show-waiting) .deck-current [data-diagram-src="plan.canvas"] :is(img,svg)').first().waitFor();
   assert.equal(await show.locator('#deck .deck-show .notice',{hasText:'could not be loaded'}).count(),0);
   assert.ok(await show.evaluate(()=>fixture.show.directories.includes('memory:deck.slides.md')&&!pudlHost.contentResources));
   // The show fills its window, whatever height its mount has.
   const box=await show.locator('#deck').boundingBox(),size=show.viewportSize();
   assert.deepEqual([Math.round(box.x),Math.round(box.y),Math.round(box.width),Math.round(box.height)],[0,0,size.width,size.height]);
   // Moving between slides does not send the deck again, and the show keeps the stage it drew: a stage built
   // again on every slide showed as a slide that vanished and grew back after each transition.
   const stageBefore=await show.evaluateHandle(()=>document.querySelector('#deck .deck-show:not(.deck-show-waiting)'));
   const statesBefore=await show.evaluate(()=>fixture.show.received.filter(m=>m.type==='state').length);
   for(const [key,title] of [['ArrowLeft','Slide one'],['ArrowRight','Slide two']]){
    await show.locator('#deck .deck-show:not(.deck-show-waiting)').focus();await show.keyboard.press(key);
    await show.waitForFunction(title=>new RegExp(title).test(document.querySelector('#deck .deck-show:not(.deck-show-waiting) .deck-current').innerText),title);
    await editor.waitForFunction(n=>new RegExp('Slide '+n+' of 2').test(document.querySelector('#deck [data-role="position"]').textContent),title==='Slide one'?1:2);
    await show.waitForTimeout(800);
   }
   assert.equal(await show.evaluate(()=>fixture.show.received.filter(m=>m.type==='state').length),statesBefore);
   assert.equal(await show.evaluate(stage=>stage===document.querySelector('#deck .deck-show:not(.deck-show-waiting)')&&stage.isConnected,stageBefore),true);
   // The editing window's navigation moves the show.
   await editor.locator('#deck [data-slide="0"]').click();
   await show.waitForFunction(()=>/Slide one/.test(document.querySelector('#deck .deck-show:not(.deck-show-waiting) .deck-current').innerText));
   // An edit in the editing window reaches the show, which keeps its place.
   await editor.locator('#deck .deck-slide .ProseMirror p',{hasText:'First.'}).click();await editor.keyboard.press('End');await editor.keyboard.type(' Edited');
   await show.waitForFunction(()=>/First\. Edited/.test(document.querySelector('#deck .deck-show:not(.deck-show-waiting) .deck-current').innerText));
   // Escape in the show ends it in both; the editing window is told and closes the port.
   await show.locator('#deck .deck-show:not(.deck-show-waiting)').focus();await show.keyboard.press('Escape');
   await editor.waitForFunction(()=>!document.querySelector('#deck').classList.contains('deck-show-elsewhere')&&fixture.show.closed);
   await show.locator('#deck .deck-show-waiting',{hasText:'The show has ended.'}).waitFor();
   assert.equal(await current(show).count(),0);
   assert.equal(await editor.evaluate(()=>fixture.show.sent.some(m=>m.type==='end')),true);
   assert.doesNotMatch(await editor.locator('#deck [data-role="position"]').textContent(),/running in a window/);
   // A second show, ended from the editing window with Leave the Show.
   await editor.evaluate(()=>pudlCommands.run('present-here',null,document.querySelector('#deck')));
   await editor.waitForFunction(()=>fixture.show.opened.length===2&&document.querySelector('#deck').classList.contains('deck-show-elsewhere'));
   await show.goto(lab+'?show=1');await current(show).waitFor();
   await editor.evaluate(()=>pudlCommands.run('leave',null,document.querySelector('#deck')));
   await show.locator('#deck .deck-show-waiting',{hasText:'The show has ended.'}).waitFor();
   // A window the person closes some other way: the editing window says so and does not go full screen.
   await editor.evaluate(()=>pudlCommands.run('present',null,document.querySelector('#deck')));
   await editor.waitForFunction(()=>fixture.show.opened.length===3&&document.querySelector('#deck').classList.contains('deck-show-elsewhere'));
   await editor.evaluate(()=>fixture.show.port.onclose());
   await editor.waitForFunction(()=>!document.querySelector('#deck').classList.contains('deck-show-elsewhere'));
   assert.equal(await editor.locator('#deck .deck-show').count(),0);
   // With one display the host has nowhere else, and the show is in this window as before.
   // The page asking for full screen is in front, as it is when a person presses Present.
   await editor.bringToFront();await editor.goto(lab+'?one-display=1');await editor.locator('#deck .deck-slide').first().waitFor();
   await editor.waitForFunction(()=>{const c=pudlCommands.find('present',document.querySelector('#deck'));return c&&!(typeof c.disabled==='function'?c.disabled():c.disabled);});
   // Present pressed while the deck is still being restored after the reload is dropped, as it was before this
   // change, so the press is repeated until the deck has settled; a show that had hung could not start again.
   let shown=false;
   for(let attempt=0;attempt<4&&!shown;attempt++){
    await editor.evaluate(()=>{pudlCommands.run('present',null,document.querySelector('#deck'));});
    shown=await editor.locator('#deck .deck-show .deck-current').waitFor({timeout:5000}).then(()=>true,()=>false);
    if(!shown)console.log(engine+': Present was pressed again after the deck settled (attempt '+(attempt+2)+')');
   }
   assert.ok(shown,'the show in this window');
   // The host was asked on each press, and had nowhere else to show the deck.
   assert.ok(await editor.evaluate(()=>fixture.show.opened.length>=1&&!fixture.show.port));
   assert.equal(await editor.evaluate(()=>document.querySelector('#deck').classList.contains('deck-show-elsewhere')),false);
   // A show page with no port says so in a notice and draws nothing.
   await show.goto(lab+'?show=1&no-port=1');await show.locator('#deck .deck-show-waiting .notice.danger',{hasText:'none was sent'}).waitFor();
   assert.equal(await current(show).count(),0);
   assert.deepEqual(errors,[]);console.log(engine+': a show elsewhere is opened, sent the deck, follows and leads the editing window, takes edits, and ends from either side; one display falls back passed');
  }catch(e){console.error(engine,(await editor.locator('#deck').innerText().catch(()=>'')).slice(-800),'| show:',(await show.locator('#deck').innerText().catch(()=>'')).slice(-400),errors);throw e;}finally{await browser.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
