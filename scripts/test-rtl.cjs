// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Right-to-left text in Docs (DESIGN.md, decision 155): each paragraph, heading, list item, quotation and table cell, and each line of
// the Text view, takes its direction from its own first strong character, in the page view, the preview, the Text view, print and a
// Word export. An English block beside a Hebrew one stays left to right. Needs a server on YAVC_CHROME_TEST_PORT.
const assert=require('node:assert/strict'),pw=require('playwright'),zlib=require('node:zlib');
const port=process.env.YAVC_CHROME_TEST_PORT||'8460';
const call=(p,name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
const source='# שלום עולם\n\nThis is English, with a full stop.\n\nפסקה בעברית עם פיסוק, כמו זה.\n\n- פריט ראשון\n- item two\n\n> ציטוט קצר\n\n| א | b |\n| - | - |\n| שלום | hello |\n\nمرحبا بالعالم.\n';
// The text of word/document.xml in a .docx, read from its zip directory with Node's own inflate.
function documentXML(buffer){
 let end=buffer.length-22;while(end>0&&buffer.readUInt32LE(end)!==0x06054b50)end--;
 let at=buffer.readUInt32LE(end+16);const count=buffer.readUInt16LE(end+10);
 for(let i=0;i<count;i++){const method=buffer.readUInt16LE(at+10),size=buffer.readUInt32LE(at+20),nameLength=buffer.readUInt16LE(at+28),extra=buffer.readUInt16LE(at+30),comment=buffer.readUInt16LE(at+32),local=buffer.readUInt32LE(at+42),name=buffer.toString('utf8',at+46,at+46+nameLength);
  if(name==='word/document.xml'){const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);const data=buffer.subarray(start,start+size);return (method===8?zlib.inflateRawSync(data):data).toString('utf8');}
  at+=46+nameLength+extra+comment;}
 throw new Error('no word/document.xml');
}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const b=await pw[engine].launch({headless:true}),ctx=await b.newContext({acceptDownloads:true,viewport:{width:1500,height:1200}}),p=await ctx.newPage(),errors=[];p.setDefaultTimeout(25000);p.on('pageerror',e=>errors.push(e.message));let phase='boot';
 const directions=(selector)=>p.evaluate(sel=>Array.from(document.querySelectorAll(sel)).map(e=>[e.textContent.trim().slice(0,5),getComputedStyle(e).direction]),selector);
 try{
  await p.goto(`http://localhost:${port}/applet/docs`);await p.locator('.cm-content').waitFor({state:'attached'});
  await call(p,'new',{path:'~/Directions.docs.md',text:source});
  phase='page view';await call(p,'view',{mode:'document'});
  const rich=p.locator('.ProseMirror');await rich.getByRole('heading').first().waitFor();
  const page=Object.fromEntries(await directions('.ProseMirror p,.ProseMirror h1,.ProseMirror li,.ProseMirror blockquote,.ProseMirror td,.ProseMirror th'));
  assert.equal(page['שלום '],'rtl',engine+': the Hebrew heading');assert.equal(page['This '],'ltr',engine+': the English paragraph stays left to right');
  assert.equal(page['פסקה '],'rtl',engine+': the Hebrew paragraph');assert.equal(page['פריט '],'rtl',engine+': the Hebrew list item');assert.equal(page['item '],'ltr',engine+': the English list item');
  assert.equal(page['ציטוט'],'rtl',engine+': the Hebrew quotation');assert.equal(page['שלום'],'rtl',engine+': the Hebrew table cell');assert.equal(page['hello'],'ltr',engine+': the English table cell');
  assert.equal(page['مرحبا'],'rtl',engine+': the Arabic paragraph');
  // The Hebrew paragraph's words are against the right edge of its block, and its full stop is at the left end of the line.
  const edge=await p.evaluate(()=>{const para=Array.from(document.querySelectorAll('.ProseMirror p')).find(e=>e.textContent.startsWith('פסקה'));const r=document.createRange();r.selectNodeContents(para);const words=r.getBoundingClientRect(),box=para.getBoundingClientRect();return {gapRight:box.right-words.right,gapLeft:words.left-box.left};});
  assert.ok(edge.gapRight<4&&edge.gapLeft>40,engine+': the Hebrew paragraph sits at the right '+JSON.stringify(edge));
  // Typing in the Hebrew paragraph changes nothing about the file but the typed words.
  phase='the file is unchanged';await call(p,'save');assert.equal((await call(p,'document')).text,source,engine+': drawing the page changed the text');
  phase='preview';await call(p,'view',{mode:'preview'});await p.locator('.doc-block p').first().waitFor();
  const preview=Object.fromEntries(await directions('.doc-block p,.doc-block h1,.doc-block li'));
  assert.equal(preview['פסקה '],'rtl',engine+': the preview\'s Hebrew paragraph');assert.equal(preview['This '],'ltr');
  phase='text view';await call(p,'view',{mode:'text'});await p.locator('.cm-content').waitFor();
  // The lines of the Text view: the Hebrew one is against the right edge of the text area and the English one against the left.
  const edges=await p.evaluate(()=>Object.fromEntries(Array.from(document.querySelectorAll('.cm-line')).filter(e=>/^(פסקה|This )/.test(e.textContent)).map(e=>{const r=document.createRange();r.selectNodeContents(e);const words=r.getBoundingClientRect(),box=e.getBoundingClientRect();return [e.textContent.slice(0,5),{right:box.right-words.right,left:words.left-box.left}];})));
  assert.ok(edges['פסקה '].right<12&&edges['פסקה '].left>40,engine+': the Hebrew line sits at the right '+JSON.stringify(edges));
  assert.ok(edges['This '].left<12&&edges['This '].right>40,engine+': the English line sits at the left '+JSON.stringify(edges));
  phase='print';
  await p.evaluate(()=>{const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='IFRAME')node.contentWindow.print=()=>{window.printed=true;};};});
  await p.evaluate(()=>{pudlCommands.run('print-document',null,document.querySelector('[data-applet]'));});await p.waitForFunction(()=>window.printed);
  const printed=await p.locator('.ed-print-frame').evaluate(frame=>Array.from(frame.contentDocument.querySelectorAll('.doc-page-flow p')).map(e=>[e.textContent.trim().slice(0,5),frame.contentWindow.getComputedStyle(e).direction]));
  assert.equal(Object.fromEntries(printed)['פסקה '],'rtl',engine+': the printed Hebrew paragraph');assert.equal(Object.fromEntries(printed)['This '],'ltr');
  await p.locator('.ed-print-frame').evaluate(frame=>frame.contentWindow.dispatchEvent(new Event('afterprint')));
  phase='word export';
  const download=p.waitForEvent('download');await p.evaluate(()=>{pudlCommands.run('export-docx',null,document.querySelector('[data-applet]'));});
  const xml=documentXML(await require('node:fs/promises').readFile(await (await download).path()));
  const paragraphs=xml.split('<w:p>').concat(xml.split('<w:p ')).filter(x=>x.includes('</w:p>'));
  const hebrew=paragraphs.find(x=>x.includes('פסקה')),english=paragraphs.find(x=>x.includes('This is English'));
  assert.ok(/<w:bidi\b/.test(hebrew)&&/<w:rtl\b/.test(hebrew),engine+': the Hebrew paragraph is bidirectional in the Word file');
  assert.ok(!/<w:bidi\b/.test(english)&&!/<w:rtl\b/.test(english),engine+': the English paragraph is not');
  assert.deepEqual(errors,[]);console.log(engine+': each block and line takes its own direction in the page, the preview, the text, print and the Word file');
 }catch(err){console.error(engine,phase,errors);throw err;}finally{await b.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
