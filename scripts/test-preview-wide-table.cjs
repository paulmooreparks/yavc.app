// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Tables on a page that is not laid out in pages (Visual and Preview) are laid out as a wiki lays them out (DESIGN.md, decisions 15 and
// 212): columns as wide as their content needs, no word broken in the middle of a short column, a status label on one line, and a table
// too wide for the pane scrolling sideways in its own box while the page keeps the pane's width. Two shapes are checked: a table with one
// prose column, five short ones and a status label (which v0.2.119 crushed), and eight columns of unbreakable words (which widened the
// page). All text is invented.
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT;
const prose='Invented description of an action item that runs on for several sentences so that it needs a wide column. It names no real system and no real person, and it keeps going long enough to wrap across many lines at any width.';
const words='Invented sentence words that run on long enough to need several lines at this width. ';
const actions='# Invented action list\n\n'+words.repeat(3)+'\n\n| No | Reporter | Description | Responsible | Due Date | Status |\n| --- | --- | --- | --- | --- | --- |\n'+
 '| 1 | Alex Example | '+prose+' | Not recorded | Before implementation | {{status:red OPEN}} |\n| 2 | Sam Sample | Short note. | Robin Test | 2026-12-01 | {{status:green DONE}} |\n';
const long='InventedLongWord'.repeat(12);
const wide='Before.\n\n|'+Array.from({length:8},(_,i)=>' Column '+i+' |').join('')+'\n|'+' --- |'.repeat(8)+'\n|'+(' '+long+' |').repeat(8)+'\n\nAfter. '+words.repeat(3)+'\n';
/* What one view draws: whether the page scrolls sideways, the table's own box and scroll, each heading's width and line count, whether a
   word is broken across lines in a short column, and how many lines each status label takes. */
function measure(){
 const scroll=[...document.querySelectorAll('.ed-scroll')].find(s=>s.offsetParent&&s.querySelector('table')),table=[...scroll.querySelectorAll('table')].find(t=>t.offsetParent);
 const lines=node=>{const r=document.createRange();r.selectNodeContents(node);return new Set([...r.getClientRects()].filter(x=>x.width>0).map(x=>Math.round(x.top))).size;};
 const words=cell=>{const out=[];const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);let t;while((t=walker.nextNode())){const re=/\S+/g;let m;while((m=re.exec(t.data))){const r=document.createRange();r.setStart(t,m.index);r.setEnd(t,m.index+m[0].length);out.push(new Set([...r.getClientRects()].filter(x=>x.width>0).map(x=>Math.round(x.top))).size);}}return out;};
 const para=[...scroll.querySelectorAll('p')].find(x=>x.offsetParent&&x.textContent.length>100);
 return {scrollSW:scroll.scrollWidth,scrollCW:scroll.clientWidth,tableSW:table.scrollWidth,tableCW:table.clientWidth,
  heads:[...table.rows[0].cells].map(c=>({text:c.textContent.trim(),lines:lines(c),width:Math.round(c.getBoundingClientRect().width)})),
  brokenWords:[...table.rows].flatMap(r=>[...r.cells].filter((c,i)=>i!==2).flatMap(words)).filter(n=>n>1).length,
  badges:[...table.querySelectorAll('.badge')].map(lines),paraLines:para?lines(para):0};
}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1000,height:900}});p.setDefaultTimeout(20000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const action=(name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
  async function view(mode){await action('view',{mode});if(mode==='visual')await p.locator('.ProseMirror[aria-busy=false] table').waitFor();else await p.locator('.ed-scroll > .doc-page:not(.page-view) table').waitFor();return p.evaluate(measure);}
  await p.goto(`http://docs.localhost:${port}/`,{waitUntil:'domcontentloaded'});await p.locator('.yavc-command-toolbar').waitFor();
  for(const width of [1000,720]){
   await p.setViewportSize({width,height:900});
   // Document first: its sheet's column widths must not stay on the table when Visual takes over (they held Visual to the sheet's width).
   await action('new',{text:actions});await action('view',{mode:'document'});await p.locator('.doc-paginated table > colgroup[data-doc-columns]').first().waitFor({state:'attached'});
   for(const mode of ['visual','preview']){
    const m=await view(mode);console.log(engine+' '+width+' '+mode+' actions '+JSON.stringify(m));
    assert.ok(m.scrollSW<=m.scrollCW+1,mode+' '+width+': the page must not scroll sideways');
    for(const h of m.heads.filter(h=>h.text!=='Description'))assert.equal(h.lines,1,mode+' '+width+': the short heading "'+h.text+'" stays on one line');
    assert.equal(m.brokenWords,0,mode+' '+width+': no word in a short column is broken across lines');
    assert.deepEqual(m.badges,[1,1],mode+' '+width+': each status label stays on one line');
    if(width===1000){const widest=m.heads.reduce((a,h)=>h.width>a.width?h:a);assert.equal(widest.text,'Description',mode+' '+width+': the prose column is the widest, as the wiki draws it');}
   }
   assert.equal((await action('document')).text,actions,'drawing the table leaves the document unchanged');
   await action('new',{text:wide});
   for(const mode of ['visual','preview']){
    const m=await view(mode);console.log(engine+' '+width+' '+mode+' wide '+JSON.stringify({scrollSW:m.scrollSW,scrollCW:m.scrollCW,tableSW:m.tableSW,tableCW:m.tableCW,paraLines:m.paraLines}));
    assert.ok(m.scrollSW<=m.scrollCW+1,mode+' '+width+': a table of unbreakable words does not widen the page');
    assert.ok(m.tableSW>m.tableCW+1,mode+' '+width+': the table scrolls sideways in its own box');
    assert.ok(m.paraLines>1,mode+' '+width+': the paragraph after it wraps at the pane');
   }
   assert.equal((await action('document')).text,wide,'drawing the table leaves the document unchanged');
  }
  assert.deepEqual(errors,[]);
  console.log(engine+': tables follow their content, labels stay whole, and a too-wide table scrolls in its own box');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
