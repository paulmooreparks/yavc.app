// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// HTML tables edited as tables (DESIGN.md, decision 112), the reader's place
// kept across views (113) and the contents list in a container (114), run
// against a built content package in an independent host:
//   node scripts/test-html-tables.cjs <artifact> [chromium firefox webkit]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/independent/content-release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path)),addon=await fs.readFile(path.join(__dirname,'fixtures/html-tables.js'),'utf8');
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();let body=await fs.readFile(path.join(artifact,name));if(name==='workspace-lab/host.js')body=Buffer.from(body+'\n'+addon);res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");res.end(body);}catch(e){res.writeHead(500).end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1550,height:900}}),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  const action=(app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
  const text=async app=>(await action(app,'document')).text;
  // The page is still after an edit was written to the text and any reading of it again has finished.
  const settled=async root=>{await p.waitForTimeout(300);await p.locator(root+' .ProseMirror:not([aria-busy="true"])').first().waitFor();};
  const command=(root,id,arg)=>p.evaluate(({root,id,arg})=>pudlCommands.run(id,arg==null?null:arg,document.querySelector(root)),{root,id,arg});
  // A table command is offered once the page's selection is in a table and the page is the text.
  const ready=(root,id)=>p.waitForFunction(({root,id})=>{const c=pudlCommands.find(id,document.querySelector(root));if(!c)return false;const off=typeof c.disabled==='function'?c.disabled():!!c.disabled,hidden=typeof c.hidden==='function'?c.hidden():!!c.hidden;return !off&&!hidden;},{root,id});
  try{await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`);await p.locator('#document .ProseMirror').waitFor();
   const source=await p.evaluate(()=>fixture.htmlTables.source);
   await action('docs','view',{mode:'visual'});
   const doc=p.locator('#document');
   // The wiki's table and the bare one are tables on the page, with no box
   // around the literal container's; the literal body that is not a table
   // keeps its box; a cell's colour shows, and the wiki's element is one piece.
   await doc.locator('table.pm-raw-table').nth(1).waitFor();
   assert.equal(await doc.locator('table.pm-raw-table').count(),2);
   assert.equal(await doc.locator('.pm-box[data-name="raw"]').count(),1);
   assert.match(await doc.locator('.pm-box[data-name="raw"] .pm-source').innerText(),/Two paragraphs/);
   assert.equal(await doc.locator('table.pm-raw-table td[style*="background-color"]').count(),2);
   assert.equal(await doc.locator('table.pm-raw-table th[colspan="2"]').count(),1);
   assert.equal(await doc.locator('table.pm-raw-table .pm-raw-inline[data-xml^="<ac:link>"]').count(),1);
   assert.equal(await doc.locator('table.pm-raw-table td[rowspan="2"]').count(),1);
   assert.equal(await doc.locator('.pm-raw-table script, .pm-raw-table [onclick]').count(),0);
   assert.equal(await text('docs'),source);
   // The contents list inside the note lists the document's headings.
   const toc=await doc.locator('.sc-toc a').allInnerTexts();
   assert.ok(toc.includes('Wiki table')&&toc.includes('Last heading'),JSON.stringify(toc));
   // Typing in a cell writes the table back as HTML with everything else as it was.
   await doc.locator('table.pm-raw-table td',{hasText:/^1$/}).first().click();await p.keyboard.press('End');await p.keyboard.type('x');
   await settled('#document');
   let now=await text('docs');
   assert.ok(now.includes('<tr><td>1x</td><td>Press <code>"Pay"</code> and see <ac:link><ri:page ri:content-title="Exports" /></ac:link> here.<br />Second line.</td></tr>'),now);
   assert.ok(now.includes('{{raw}}\n<table><tbody>\n<tr><th colspan="2">Scenario</th></tr>\n<tr><td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Number</strong></td>'),now);
   assert.ok(now.includes('</tbody></table>\n{{/raw}}\n\n## Bare table\n\n<table>\n<tr><td>bare</td><td rowspan="2">tall</td></tr>\n<tr><td>row</td></tr>\n</table>\n'),now);
   assert.ok(!now.includes('| 1x'),now);
   await command('#document','undo');await settled('#document');assert.equal(await text('docs'),source);
   // A pipe table given a heading cell becomes an HTML table, and Undo takes it back.
   await doc.locator('table:not(.pm-raw-table) td',{hasText:/^one$/}).first().click();
   await ready('#document','table-heading-cell');await command('#document','table-heading-cell');
   now=await text('docs');
   assert.ok(now.includes('## Pipe table\n\n<table><tbody>\n<tr><th>A</th><th>B</th></tr>\n<tr><th>one</th><td>two</td></tr>\n<tr><td>three</td><td>four</td></tr>\n</tbody></table>\n\n## Citations'),now);
   assert.ok(!now.includes('| A | B |'),now);
   await command('#document','undo');await settled('#document');assert.equal(await text('docs'),source);
   // On a pipe table the host's own cell colour shortcode is written first in the cell, through the host's form, and the table stays a pipe table.
   const inCell=word=>p.waitForFunction(word=>{const s=window.getSelection(),n=s&&s.anchorNode,td=n&&(n.nodeType===1?n:n.parentElement).closest('#document td');return !!td&&td.textContent.trim().endsWith(word);},word);
   await doc.locator('table:not(.pm-raw-table) td',{hasText:/^two$/}).first().click();await inCell('two');await settled('#document');
   await ready('#document','table-cell-colour');await command('#document','table-cell-colour');
   const insertColour=p.getByRole('dialog',{name:'Insert Cell Color',exact:true});await insertColour.waitFor();
   await insertColour.getByLabel('Color',{exact:true}).fill('purple');await insertColour.getByRole('button',{name:'Insert',exact:true}).click();await insertColour.getByText('Use blue, grey or a hex color.',{exact:true}).waitFor();
   await insertColour.getByLabel('Color',{exact:true}).fill('blue');await insertColour.getByRole('button',{name:'Insert',exact:true}).click();await insertColour.waitFor({state:'hidden'});
   await p.waitForFunction(()=>pudlActions.run('yavc.docs/document@1',{},{grant:'all'}).then(r=>r.text.includes('{{cell-colour:blue}} two |')));
   now=await text('docs');assert.ok(now.includes('| A | B |')&&!now.includes('<td>one</td>'),now);
   await doc.locator('table:not(.pm-raw-table) .pm-sc').first().waitFor();
   // A change that needs an HTML table is refused while a cell has the host's colour.
   await settled('#document');await ready('#document','table-heading-cell');await command('#document','table-heading-cell').catch(()=>{});await settled('#document');
   now=await text('docs');assert.ok(now.includes('| A | B |')&&now.includes('{{cell-colour:blue}} two |'),now);
   // The same command changes the colour, starting from the one there, and Remove takes it away.
   await ready('#document','table-cell-colour');await command('#document','table-cell-colour');
   const changeColour=p.getByRole('dialog',{name:'Change Cell Color',exact:true});await changeColour.waitFor();
   assert.equal(await changeColour.getByLabel('Color',{exact:true}).inputValue(),'blue');
   await changeColour.getByLabel('Color',{exact:true}).fill('grey');await changeColour.getByRole('button',{name:'Change',exact:true}).click();await changeColour.waitFor({state:'hidden'});
   await p.waitForFunction(()=>pudlActions.run('yavc.docs/document@1',{},{grant:'all'}).then(r=>r.text.includes('{{cell-colour:grey}} two |')));
   await settled('#document');await ready('#document','table-cell-colour');await command('#document','table-cell-colour');await changeColour.waitFor();
   await changeColour.getByRole('button',{name:'Remove',exact:true}).click();await changeColour.waitFor({state:'hidden'});
   await p.waitForFunction(source=>pudlActions.run('yavc.docs/document@1',{},{grant:'all'}).then(r=>r.text===source),source);
   const colour=p.getByRole('dialog',{name:'Cell Color',exact:true});
   // In the host's literal table the colour also writes the host's own attribute, and clearing it removes both.
   await doc.locator('table.pm-raw-table td',{hasText:/^1$/}).first().click();await inCell('1');await settled('#document');
   await ready('#document','table-cell-colour');await command('#document','table-cell-colour');await colour.waitFor();
   await colour.getByLabel('Background Color',{exact:true}).fill('#ffeeaa');await colour.getByRole('button',{name:'Apply',exact:true}).click();await colour.waitFor({state:'hidden'});
   now=await text('docs');
   assert.ok(now.includes('<tr><td data-highlight-colour="#ffeeaa" style="background-color: #ffeeaa;">1</td>'),now);
   assert.ok(now.includes('<td data-highlight-colour="#DEEBFF" style="background-color: rgb(222,235,255);"><strong>Number</strong></td>'),now);
   await settled('#document');await ready('#document','table-cell-colour');await command('#document','table-cell-colour');await colour.waitFor();
   assert.equal(await colour.getByLabel('Background Color',{exact:true}).inputValue(),'#ffeeaa');
   await colour.getByLabel('Background Color',{exact:true}).fill('');await colour.getByRole('button',{name:'Apply',exact:true}).click();await colour.waitFor({state:'hidden'});
   now=await text('docs');assert.ok(now.includes('<tr><td>1</td><td>Press'),now);
   for(let i=0;i<3&&(await text('docs'))!==source;i++){await command('#document','undo');await settled('#document');}assert.equal(await text('docs'),source);
   // The host's colour classes go when a cell's colour is changed or cleared; other classes and untouched cells stay.
   await doc.locator('table.pm-raw-table td',{hasText:/^grey$/}).first().click();await inCell('grey');await settled('#document');
   await ready('#document','table-cell-colour');await command('#document','table-cell-colour');await colour.waitFor();
   await colour.getByLabel('Background Color',{exact:true}).fill('#FFEBE6');await colour.getByRole('button',{name:'Apply',exact:true}).click();await colour.waitFor({state:'hidden'});
   now=await text('docs');
   assert.ok(now.includes('<tr><td class="kept" data-highlight-colour="#FFEBE6" style="background-color: #FFEBE6;">grey</td><td class="highlight-blue">blue</td></tr>'),now);
   await doc.locator('table.pm-raw-table td',{hasText:/^blue$/}).first().click();await inCell('blue');
   await settled('#document');await ready('#document','table-cell-colour');await command('#document','table-cell-colour');await colour.waitFor();
   await colour.getByLabel('Background Color',{exact:true}).fill('');await colour.getByRole('button',{name:'Apply',exact:true}).click();await colour.waitFor({state:'hidden'});
   now=await text('docs');
   assert.ok(now.includes('style="background-color: #FFEBE6;">grey</td><td>blue</td></tr>'),now);
   for(let i=0;i<4&&(await text('docs'))!==source;i++){await command('#document','undo');await settled('#document');}assert.equal(await text('docs'),source);
   // A deck's speaker notes have no presence on the slide at all, not a box nor a bar; the notes pane shows them.
   await action('slides','view',{mode:'visual'});await p.locator('#deck .deck-slide .ProseMirror').waitFor();
   await p.locator('#deck [data-role="notes-view"]:not([hidden])').waitFor();assert.match(await p.locator('#deck [data-role="notes-view"]').innerText(),/Say this quietly/);
   assert.equal(await p.locator('#deck .deck-slide .sc-notes:visible').count(),0);
   assert.equal(await p.locator('#deck .deck-slide .pm-box[data-name="notes"]').count(),1);
   assert.equal(await p.locator('#deck .deck-slide .pm-box[data-name="notes"]:visible, #deck .deck-slide .pm-box[data-name="notes"] :visible').count(),0);
   assert.ok(!/Speaker Notes|Say this quietly|Remove the Box|Edit as Markdown/i.test(await p.locator('#deck .deck-slide:has(.ProseMirror)').innerText()));
   // Typing on the slide goes into the slide, and the hidden notes are written back as they were.
   await p.locator('#deck .deck-slide .ProseMirror p',{hasText:'First.'}).click();await p.keyboard.press('End');await p.keyboard.type(' More');
   await p.waitForFunction(()=>pudlActions.run('yavc.slides/text@1',{},{grant:'all'}).then(r=>r.text.includes('First. More')));
   assert.ok((await action('slides','text')).text.includes('{{notes}}\nSay this quietly.\n{{/notes}}'));
   // Leaving the page for Text keeps the place: the caret lands on the
   // block it was in, and coming back lands on the same block.
   await doc.locator('.ProseMirror p',{hasText:'Last words here.'}).click();
   await action('editor','view',{mode:'visual'});await p.locator('#source .ProseMirror').waitFor();
   await p.locator('#source .ProseMirror p',{hasText:'Last words here.'}).click();await p.keyboard.press('End');
   await action('editor','view',{mode:'text'});await p.locator('#source .cm-editor').waitFor();
   await p.waitForFunction(()=>yavcMdEditor.libs().then(CM=>{const v=CM.EditorView.findFromDOM(document.querySelector('#source .cm-editor'));return v&&v.state.doc.lineAt(v.state.selection.main.head).text==='Last words here.'&&v.scrollDOM.scrollTop>0;}));

   await p.evaluate(()=>yavcMdEditor.libs().then(CM=>{const v=CM.EditorView.findFromDOM(document.querySelector('#source .cm-editor')),at=v.state.doc.toString().indexOf('Filler paragraph 30');v.dispatch({selection:{anchor:at+3},effects:CM.EditorView.scrollIntoView(at,{y:'center'})});}));
   await action('editor','view',{mode:'visual'});await p.locator('#source .ProseMirror').waitFor();
   await p.waitForFunction(()=>{const s=window.getSelection(),node=s&&s.anchorNode,p=node&&(node.nodeType===1?node:node.parentElement).closest('#source .ProseMirror p');return !!p&&/Filler paragraph 30/.test(p.textContent);});
   // The page scrolled so the caret's paragraph is in view (the scroller was at the top before).
   await p.waitForFunction(()=>{const sc=document.querySelector('#source .ed-scroll'),s=window.getSelection(),node=s&&s.anchorNode,par=node&&(node.nodeType===1?node:node.parentElement).closest('#source .ProseMirror p');if(!sc||!par)return false;const r=par.getBoundingClientRect(),b=sc.getBoundingClientRect();return sc.scrollTop>0&&r.top>=b.top&&r.bottom<=b.bottom;});

   await action('editor','view',{mode:'preview'});await p.locator('#source [data-line]').first().waitFor();
   // A paragraph with text in brackets is edited on the page, and its brackets are written as they were.
   await action('docs','view',{mode:'visual'});await doc.locator('.ProseMirror').waitFor();
   const cited=doc.locator('.ProseMirror > p',{hasText:'Cited words here. [S2]'});await cited.waitFor();
   assert.equal(await doc.locator('.pm-source',{hasText:'Cited words here'}).count(),0);
   await cited.click();await p.keyboard.press('End');await p.keyboard.type(' and [S3] more');
   await p.waitForFunction(()=>pudlActions.run('yavc.docs/document@1',{},{grant:'all'}).then(r=>r.text.includes('Cited words here. [S2] and [S3] more\n')));
   // A host whose document has no saved location yet: Save asks where to save, in Docs and in Slides, and writes nothing.
   await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?unplaced=1`);await p.locator('#document .ProseMirror').waitFor();
   const writesBefore=await p.evaluate(()=>fixture.writes.length);
   await action('docs','view',{mode:'visual'});await p.locator('#document .ProseMirror > p',{hasText:'Cited words here.'}).click();await p.keyboard.type('x');await settled('#document');
   await command('#document','save');await p.waitForFunction(()=>fixture.htmlTables.saveAsCalls.length===1);
   await action('slides','view',{mode:'visual'});await p.locator('#deck .deck-slide .ProseMirror p',{hasText:'First.'}).click();await p.keyboard.type('y');
   await p.waitForFunction(()=>pudlActions.run('yavc.slides/text@1',{},{grant:'all'}).then(r=>r.text.includes('y')));
   await command('#deck','save');await p.waitForFunction(()=>fixture.htmlTables.saveAsCalls.length===2);
   assert.equal(await p.evaluate(()=>fixture.writes.length),writesBefore);
   assert.deepEqual(errors,[]);console.log(engine+': HTML tables, literal bodies, contents list, table reshaping, cell colour and its host attribute, speaker notes kept off the slide, bracketed text, Save without a location and place keeping passed');
  }catch(e){console.error(engine,(await p.locator('body').innerText()).slice(-3000),errors);throw e;}finally{await browser.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
