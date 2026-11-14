// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Docs keeps what a reader sees, and leaves what it was not asked to change. Two promises are checked in the rich view, in the one-page host
// from a built package.
//   1. The visible words never change. A note is typed and formatted (headings, paragraphs full of punctuation that Markdown reads as markup,
//      marks, nested lists, a table, a link, quotes), saved, and opened again in a fresh page. The visible text of every block is compared with
//      what was meant, straight after typing and after reopening. What the file holds may differ (characters are escaped, for example); what a reader sees may not.
//   2. A file written in other Markdown styles keeps them. One word is changed in the rich view and every other line of the saved file must be
//      exactly as it was, byte for byte.
// Not covered, and in docs/backlog.md: a hard line break (Shift+Enter does nothing in the page view, and a backslash at the end of a line is drawn as a backslash),
// and, in Firefox, a table at the end of a document (Control+End stays in the last cell, so the test cannot type after it); the table and the link are left out in Firefox until that is fixed.
// Usage: node scripts/test-docs-structure.cjs <package folder> [browsers]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
let documentText='# Document\n\nEditable words.\n';
const oddPunctuation='Call Dr. Lim’s office (re: “intake”) — see §2; cost: $5 & 10% off… [x] <y> a_b c*d e|f g\\h #tag 1. not a list `tick` ~tilde~';
const tricky=[
 'snake_case_word and __init__ and 2*3*4=24 and a\\*b and \\_x\\_ and a\\b',
 '<b>not bold</b> and &amp; and &copy; and &#65; and <https://example.org> and [not a link](x) and ![not an image](y)',
 'https://example.org/a_b_c and user@example.org and ==not highlight== and ^not sup^ and (c) and 1/2 and -- and --- and ...',
 'He said "straight quotes" and it\'s fine, and 100% of $5 or $10 and a ~tilde~ and a `tick` and a | pipe',
 'A * star and a _ underscore and a # hash and a > angle and a + plus and a - dash and 1) paren',
 'Word joined by a non-breaking space and a tab\there and two  spaces',
];
const cells=['Name','Role','Note','Siti','Client','a|b pipe','Wayan','Doctor','*star* and _under_'];
// A file in other Markdown styles. Only the line "Edit this word here." is changed, by the test.
const styled=['Setext heading','==============','','Second setext','-------------','','* star bullet one','* star bullet two','','+ plus bullet','','1) paren number','2) paren two','',
 'Text with __strong underscores__ and _emphasis underscores_ and *star emphasis* and **star strong**.','','***','','    indented code block','','```js','const x = 1;','```','',
 'Trailing two spaces  ','next line','','Edit this word here.','','| a | b |','|---|---|','| 1 | 2 |','','> quote with lazy','continuation','','Ends with tab\t','',
 '[ref link][1] and <https://example.org> and footnote[^n]','','[1]: https://example.org/ref','','[^n]: The note.',''];
(async()=>{
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();let body=await fs.readFile(path.join(artifact,decodeURIComponent(u.pathname.slice(prefix.length))));
  if(u.pathname.endsWith('/workspace-lab/host.js'))body=Buffer.from(body.toString().replace(/records\.get\('memory:document\.docs\.md'\)\.text='[^;]*;/,()=>"records.get('memory:document.docs.md').text="+JSON.stringify(documentText)+";").replace("['editor','docs','slides']","['docs']"));
  res.writeHead(200,{'content-type':types[path.extname(u.pathname)]||'application/octet-stream'}).end(body);
 }catch{if(!res.headersSent)res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?editing=menus-host`,failures=[];
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});
  const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function open(text,needle){documentText=text;const page=await browser.newPage({viewport:{width:1500,height:2400}});page.setDefaultTimeout(20000);await page.goto(address);
   await page.waitForFunction(()=>{const p=document.querySelector('#document .ProseMirror');return p&&p.getAttribute('aria-busy')!=='true'&&p.textContent.length>3;});
   await page.evaluate(()=>pudlCommands.run('view-visual',null,document.querySelector('#document')));
   await page.waitForFunction(needle=>{const p=document.querySelector('#document .ProseMirror');return p.getAttribute('aria-busy')!=='true'&&p.textContent.includes(needle);},needle);await frames(page);return page;}
  // Commands and keys act on the editor's state, which follows the page's by a frame, so each waits for that.
  const run=async(page,command)=>{await frames(page);await page.evaluate(command=>pudlCommands.run(command,null,document.querySelector('#document')),command);await frames(page);};
  const enter=async page=>{await frames(page);await page.keyboard.press('Enter');await frames(page);};
  const toEnd=async page=>{await frames(page);await page.keyboard.press('ControlOrMeta+End');await frames(page);};
  const select=async(page,start,word)=>{await page.evaluate(({start,word})=>{const p=Array.from(document.querySelectorAll('#document .ProseMirror p')).find(p=>p.textContent.startsWith(start));const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),nodes=[];let node,all='';while((node=walker.nextNode())){nodes.push({node,start:all.length});all+=node.data;}const at=all.indexOf(word);if(at<0)throw new Error('The word is not on the page: '+word);const place=o=>{for(let i=nodes.length-1;i>=0;i--)if(nodes[i].start<=o)return [nodes[i].node,o-nodes[i].start];};const a=place(at),b=place(at+word.length),range=document.createRange();range.setStart(a[0],a[1]);range.setEnd(b[0],b[1]);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);},{start,word});await frames(page);};
  const blocks=page=>page.evaluate(()=>{const out=[];for(const el of document.querySelector('#document .ProseMirror').children){const tag=el.tagName.toLowerCase();
   if(tag==='ul'||tag==='ol'||tag==='blockquote')out.push({kind:tag,text:el.innerText.replace(/\s+/g,' ').trim()});
   else if(tag==='table')out.push({kind:'table',rows:Array.from(el.querySelectorAll('tr')).map(tr=>Array.from(tr.children).map(c=>c.innerText.replace(/\s+/g,' ').trim()))});
   else out.push({kind:tag,text:el.textContent});}return out.filter(b=>!(b.kind==='p'&&b.text===''));});
  const save=async page=>{await page.evaluate(()=>{fixture.writes.length=0;return pudlCommands.run('save',null,document.querySelector('#document'));});await page.waitForFunction(()=>fixture.writes.length>0);return page.evaluate(()=>fixture.records.get('memory:document.docs.md').text);};
  const compare=(label,wanted,found)=>{for(let i=0;i<Math.max(wanted.length,found.length);i++)if(JSON.stringify(wanted[i])!==JSON.stringify(found[i]))failures.push(`${engine} ${label}, block ${i+1}: wanted ${JSON.stringify(wanted[i])} but the page shows ${JSON.stringify(found[i])}`);};
  const empty=async page=>{await page.locator('#document .ProseMirror p').filter({hasText:'Editable words.'}).click();await frames(page);await page.keyboard.press('ControlOrMeta+a');await page.keyboard.press('Delete');await frames(page);};
  const typedWord=(text)=>text;
  try{
   // 1a. Headings, punctuation, marks, lists, a quote.
   {const page=await open('# Document\n\nEditable words.\n','Editable words.');await empty(page);const wanted=[];
    await page.keyboard.type('Session notes');await run(page,'h1');wanted.push({kind:'h1',text:'Session notes'});await enter(page);
    await run(page,'paragraph');await page.keyboard.type(oddPunctuation);wanted.push({kind:'p',text:oddPunctuation});await enter(page);
    const marked='Plain then bold then italic then struck then code end.';await page.keyboard.type(marked);wanted.push({kind:'p',text:marked});
    for(const [word,command] of [['bold','bold'],['italic','italic'],['struck','strike'],['code','code']]){await select(page,'Plain then',word);await run(page,command);}
    await toEnd(page);await enter(page);
    await run(page,'paragraph');await page.keyboard.type('Second level');await run(page,'h2');wanted.push({kind:'h2',text:'Second level'});await enter(page);
    await run(page,'paragraph');await page.keyboard.type('Fourth level');await run(page,'h4');wanted.push({kind:'h4',text:'Fourth level'});await enter(page);
    await run(page,'paragraph');await page.keyboard.type('First bullet');await run(page,'bullets');await enter(page);await page.keyboard.type('Second bullet');await enter(page);await page.keyboard.type('Third bullet');await enter(page);await enter(page);wanted.push({kind:'ul',text:'First bullet Second bullet Third bullet'});
    await run(page,'paragraph');await page.keyboard.type('Step one');await run(page,'numbers');await enter(page);await page.keyboard.type('Step two');await enter(page);await page.keyboard.type('Step three');await enter(page);await enter(page);wanted.push({kind:'ol',text:'Step one Step two Step three'});
    await run(page,'paragraph');await page.keyboard.type('Quote paragraph one.');await run(page,'quote');await toEnd(page);await enter(page);await page.keyboard.type('Quote paragraph two.');await toEnd(page);await enter(page);await enter(page);wanted.push({kind:'blockquote',text:'Quote paragraph one. Quote paragraph two.'});
    await run(page,'paragraph');await page.keyboard.type('Alpha beta gamma delta epsilon.');wanted.push({kind:'p',text:'Alpha beta gamma delta epsilon.'});await select(page,'Alpha','beta gamma');await run(page,'bold');await select(page,'Alpha','gamma delta');await run(page,'italic');
    await toEnd(page);await enter(page);
    compare('typed, straight after typing',wanted,await blocks(page));const saved=await save(page);await page.close();
    const again=await open(saved,'Second level');compare('typed, after saving and opening again',wanted,await blocks(again));
    const marks=await again.evaluate(()=>({strong:Array.from(document.querySelectorAll('#document .ProseMirror strong')).map(e=>e.textContent),code:Array.from(document.querySelectorAll('#document .ProseMirror code')).map(e=>e.textContent)}));
    if(!marks.strong.includes('bold')||!marks.strong.includes('beta gamma')||!marks.code.includes('code'))failures.push(`${engine} marks: after opening again, bold and code were ${JSON.stringify(marks)}`);
    await again.close();}
   // 1b. Text that looks like markup, a nested list, a table and a link.
   {const page=await open('# Document\n\nEditable words.\n','Editable words.');await empty(page);const wanted=[];
    for(const text of tricky){await page.keyboard.type(text);wanted.push({kind:'p',text});await enter(page);}
    await page.keyboard.type('Outer one');await run(page,'bullets');await enter(page);await page.keyboard.press('Tab');await page.keyboard.type('Inner one');await enter(page);await page.keyboard.type('Inner two');await enter(page);await page.keyboard.press('Shift+Tab');await page.keyboard.type('Outer two');await enter(page);await enter(page);wanted.push({kind:'ul',text:'Outer one Inner one Inner two Outer two'});
    // A table ends the document, and Firefox cannot be taken past it (docs/backlog.md), so the table and the link are not run there.
    if(engine!=='firefox'){
     await run(page,'paragraph');await run(page,'insert-table');
     await page.evaluate(()=>{const cell=document.querySelector('#document .ProseMirror table td, #document .ProseMirror table th'),range=document.createRange();range.selectNodeContents(cell);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});await frames(page);
     for(let k=0;k<cells.length;k++){await page.keyboard.type(cells[k]);if(k<cells.length-1)await page.keyboard.press('Tab');}
     await frames(page);wanted.push({kind:'table',rows:[cells.slice(0,3),cells.slice(3,6),cells.slice(6,9)]});
     await toEnd(page);await page.keyboard.type('See the site for details.');await frames(page);wanted.push({kind:'p',text:'See the site for details.'});
     await select(page,'See the site','site');
     page.evaluate(()=>pudlCommands.run('link',null,document.querySelector('#document'))).catch(()=>{});const dialog=page.locator('dialog[open]').first();await dialog.waitFor();await dialog.locator('input').first().fill('https://example.org/a_b?x=1&y=2');await dialog.getByRole('button',{name:/^(OK|Apply|Link|Insert|Save)$/}).first().click();await dialog.waitFor({state:'hidden'});await frames(page);}
    compare('typed markup, straight after typing',wanted,(await blocks(page)).filter(b=>b.kind!=='div'));const saved=await save(page);await page.close();
    const again=await open(saved,'snake_case');compare('typed markup, after saving and opening again',wanted,(await blocks(again)).filter(b=>b.kind!=='div'));
    if(engine!=='firefox'){const link=await again.evaluate(()=>Array.from(document.querySelectorAll('#document .ProseMirror a')).map(a=>[a.textContent,a.getAttribute('href')]));if(!link.some(l=>l[0]==='site'&&l[1]==='https://example.org/a_b?x=1&y=2'))failures.push(`${engine} link: after opening again the links were ${JSON.stringify(link)}`);}
    await again.close();}
   // 2. A file in other Markdown styles keeps every line but the one that was changed.
   {const source=styled.join('\n'),page=await open(source,'Edit this word');await page.locator('#document .ProseMirror p').filter({hasText:'Edit this word here.'}).click();await frames(page);await page.keyboard.press('End');await frames(page);await page.keyboard.type(' Added.');await frames(page);
    const saved=await save(page);await page.close();const wantedLines=styled.map(l=>l==='Edit this word here.'?'Edit this word here. Added.':l),foundLines=saved.split('\n');
    for(let i=0;i<Math.max(wantedLines.length,foundLines.length);i++)if(wantedLines[i]!==foundLines[i])failures.push(`${engine} other Markdown styles, line ${i+1}: wanted ${JSON.stringify(wantedLines[i])} but the saved file has ${JSON.stringify(foundLines[i])}`);}
   // 3. Opening a file, clicking into it, switching to the Markdown view and back, and saving without an edit leaves the file's bytes as they were.
   for(const [name,eol] of [['LF',String.fromCharCode(10)],['CRLF',String.fromCharCode(13,10)]]){
    const source=styled.join(eol),page=await open(source,'Edit this word');await page.locator('#document .ProseMirror p').filter({hasText:'Edit this word here.'}).click();await frames(page);
    await page.evaluate(()=>pudlCommands.run('view-text',null,document.querySelector('#document')));await page.locator('#document .cm-content').waitFor();await frames(page);
    await page.evaluate(()=>pudlCommands.run('view-visual',null,document.querySelector('#document')));await page.waitForFunction(()=>document.querySelector('#document .ProseMirror').getAttribute('aria-busy')!=='true');await frames(page);
    await page.evaluate(()=>{fixture.writes.length=0;return pudlCommands.run('save',null,document.querySelector('#document')).catch(()=>{});});await frames(page);
    const held=await page.evaluate(()=>fixture.records.get('memory:document.docs.md').text),wrote=await page.evaluate(()=>fixture.writes.map(w=>w.text));
    if(held!==source)failures.push(`${engine} unedited save, ${name} line endings: the saved bytes differ from the original near ${JSON.stringify(Array.from(held).findIndex((c,i)=>c!==source[i]))}`);
    for(const text of wrote)if(text!==source)failures.push(`${engine} unedited save, ${name} line endings: the host was given text that differs from the original`);
    await page.close();}
   // 4. With empty host settings a .docs.md file opens in Document view and a .md file in the rich view (docs/editing-settings-contract.md, "The view a document opens in").
   {documentText='# Document\n\nEditable words.\n';const page=await browser.newPage({viewport:{width:1500,height:1600}});page.setDefaultTimeout(20000);await page.goto(address);
    const pressed=name=>page.locator('#document').getByRole('button',{name,exact:true,pressed:true});
    await page.waitForFunction(()=>{const p=document.querySelector('#document .ProseMirror');return p&&p.textContent.includes('Editable words.');});
    await pressed('Document').waitFor();if(await pressed('Visual').count())failures.push(`${engine} view: a .docs.md file opened in both Document and the rich view`);
    await page.evaluate(()=>pudlActions.run('yavc.docs/open-file@1',{path:'memory:source.md'},{grant:'all'}));
    try{await pressed('Visual').waitFor();if(await pressed('Document').count())failures.push(`${engine} view: a .md file opened in Document view and not in the rich view`);}catch{failures.push(`${engine} view: a .md file did not open in the rich view`);}
    await page.close();}
  }catch(error){failures.push(`${engine}: ${String(error.message).split('\n')[0]}`);}finally{await browser.close();}
 }}finally{server.close();}
 if(failures.length){console.error(failures.slice(0,30).join('\n')+(failures.length>30?`\n... and ${failures.length-30} more`:''));process.exitCode=1;}else console.log('Docs kept every visible word, and every line it was not asked to change, in every browser.');
})().catch(error=>{console.error(error);process.exitCode=1;});
