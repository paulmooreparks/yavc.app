// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The host's setting that turns the browser's spell check off where a person types
// document text (docs/editing-settings-contract.md, DESIGN.md decision 148):
//   node scripts/test-portable-spellcheck.cjs <artifact> [chromium firefox webkit]
// With pudlHost.editing = {version: 1, spellcheck: false} every place a person types is
// not spell-checked: the Editor's text, Docs' Text view, and in Docs' page view the
// paragraphs, a table cell, a footnote's text and a link's words, in the first tab and in a
// tab opened later. Without the setting, or with one the contract does not accept, the page
// is left as the browser has it.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const notes='# Notes\n\nA sentence with a note.[^1] A [link](https://example.com/) here.\n\n| Heading A | Heading B |\n| --- | --- |\n| cell one | cell two |\n\n[^1]: The note text.\n';
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");if(name==='content/diagram-kit/worker.js')res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'");res.end(await fs.readFile(path.join(artifact,name)));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const b=await pw[engine].launch({headless:true});
  try{
   // The settings a host may give: none, the accepted one, and two the contract does not accept, which leave the page as the browser has it.
   for(const mode of ['absent','off','wrong-version','not-a-boolean']){
    const p=await b.newPage({viewport:{width:1500,height:1600}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(25000);
    const query=mode==='absent'?'':'?editing='+(mode==='off'?'no-spellcheck':mode);
    await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html${query}`);
    await p.locator('#source .cm-content').waitFor({state:'attached'});await p.locator('#document .ProseMirror').waitFor();
    const want=mode==='off'?false:true;
    // What the browser will do for the place the caret is in: the IDL property is the effective state, inherited from an ancestor as the HTML standard says.
    const caretPlace=()=>p.evaluate(()=>{const n=getSelection().anchorNode;const e=n&&(n.nodeType===1?n:n.parentElement);return e?{spellcheck:e.spellcheck,tag:e.tagName,inEditable:!!e.closest('[contenteditable="true"], .cm-content')}:null;});
    // The Editor's text.
    await p.locator('#source .cm-content').click();await p.keyboard.type('Wrods');
    const editor=await caretPlace();assert.equal(editor.inEditable,true);if(mode==='off')assert.equal(editor.spellcheck,false);
    assert.equal(await p.locator('#source .cm-content').getAttribute('spellcheck'),'false'); // CodeMirror's own default is already false, so the setting changes nothing there
    // Docs' page view: a paragraph.
    const rich=p.locator('#document .ProseMirror');
    await rich.locator('p').filter({hasText:'Editable words.'}).click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type(' Wrods');
    let at=await caretPlace();assert.equal(at.spellcheck,want,mode+': a paragraph');
    assert.equal(await rich.evaluate(e=>e.spellcheck),want);
    // A tab opened later, which holds a table, a footnote and a link.
    await p.evaluate(text=>{fixture.records.set('memory:notes.docs.md',{text,revision:1,name:'Notes.docs.md'});return pudlActions.run('yavc.docs/open-file@1',{path:'memory:notes.docs.md'},{grant:'all'});},notes);
    await rich.getByRole('table').waitFor();
    // The places are found once and by position, since typing changes the words a name would be matched on.
    const places=[['a table cell',rich.locator('td').first()],['a header cell',rich.locator('th').first()],['a footnote',rich.locator('.doc-footnote-body').first()],['a link',rich.locator('a[href="https://example.com/"]').first()]];
    for(const [place,locator] of places){
     await locator.click();await p.keyboard.type('x');
     at=await caretPlace();assert.equal(at.inEditable,true,place+' is where a person types');assert.equal(at.spellcheck,want,mode+': '+place);
     assert.match(await locator.innerText(),/x/,'the typing went into '+place);
    }
    // Docs' Text view, in the same tab.
    await p.evaluate(()=>pudlCommands.run('view-text',null,document.querySelector('#document')));
    const text=p.locator('#document .cm-content');await text.waitFor();await text.click();await p.keyboard.type('Wrods');
    assert.equal(await text.getAttribute('spellcheck'),'false');at=await caretPlace();assert.equal(at.inEditable,true);if(mode==='off')assert.equal(at.spellcheck,false);
    assert.deepEqual(errors,[]);
    await p.close();
   }
   console.log(engine+': the host\'s spell check setting reaches every place a person types ('+manifest.digest+')');
  }catch(err){console.error(engine);throw err;}finally{await b.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
