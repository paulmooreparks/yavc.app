// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A line break inside a paragraph in Docs' page view (DESIGN.md, decision 154): Shift+Enter inserts a hard break that is written
// as a backslash before the newline, a backslash break in a file is drawn as a break and not as a backslash, a file's two-space break
// keeps its own form, and an edit elsewhere leaves every other line as it was. Needs a server on YAVC_CHROME_TEST_PORT.
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8460';
const call=(p,name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
const mid='Say *em\\\nphasis* and [li  \nnk](https://example.org/) end.';
const source='# Title\n\nAlpha\\\nBeta  \nGamma\n\n'+mid+'\n\nLast line.\n';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const b=await pw[engine].launch({headless:true}),p=await b.newPage({viewport:{width:1500,height:1000}}),errors=[];p.setDefaultTimeout(25000);p.on('pageerror',e=>errors.push(e.message));let phase='boot';
 const text=async()=>{await p.waitForTimeout(600);return (await call(p,'document')).text;};
 try{
  await p.goto(`http://localhost:${port}/applet/docs`);await p.locator('.cm-content').waitFor({state:'attached'});
  await call(p,'new',{path:'~/Breaks.docs.md',text:source});await call(p,'view',{mode:'document'});
  const rich=p.locator('.ProseMirror');await rich.getByRole('heading',{name:'Title'}).waitFor();
  phase='drawn as breaks';
  const first=rich.locator('p').filter({hasText:'Alpha'});
  assert.equal(await first.locator('br').count(),2,engine+': the paragraph has two breaks');
  assert.ok(!(await first.innerText()).includes('\\'),engine+': no backslash is drawn');
  assert.equal(await rich.locator('em br').count(),1,engine+': the break inside emphasis is drawn');assert.equal(await rich.locator('a br').count(),1,engine+': the break inside a link is drawn');
  assert.equal(await text(),source,engine+': opening changes nothing');
  await call(p,'save');assert.equal((await call(p,'document')).modified,false,engine+': nothing was changed by drawing the page');
  phase='an edit elsewhere keeps every other line';
  const last=rich.locator('p').filter({hasText:'Last line.'});await last.click();await p.keyboard.press('End');await p.keyboard.type(' Edited');
  assert.equal(await text(),source.replace('Last line.','Last line. Edited'),engine+': only the edited line changed');
  phase='an edit beside a two-space break keeps its form';
  const gamma=rich.locator('p').filter({hasText:'Gamma'});await gamma.click();await gamma.evaluate(para=>{const r=document.createRange();r.selectNodeContents(para);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);});await p.keyboard.type(' Q');
  assert.equal(await text(),'# Title\n\nAlpha\\\nBeta  \nGamma Q\n\n'+mid+'\n\nLast line. Edited\n',engine+': both forms are kept');
  phase='Shift+Enter';
  await last.click();await p.keyboard.press('End');await p.keyboard.type(' One');await p.keyboard.press('Shift+Enter');await p.keyboard.type('Two');
  assert.equal(await text(),'# Title\n\nAlpha\\\nBeta  \nGamma Q\n\n'+mid+'\n\nLast line. Edited One\\\nTwo\n',engine+': a typed break is a backslash');
  assert.equal(await last.locator('br').count(),1);
  // Typed in one go, the words and the break are one step of the undo history.
  await p.keyboard.press('ControlOrMeta+z');assert.equal(await text(),'# Title\n\nAlpha\\\nBeta  \nGamma Q\n\n'+mid+'\n\nLast line. Edited\n',engine+': undo took back the words and the break together');
  phase='where a break cannot be written';
  await rich.getByRole('heading',{name:'Title'}).click();await p.keyboard.press('End');const before=await text();await p.keyboard.press('Shift+Enter');
  assert.equal(await text(),before,engine+': a heading is left as it was');
  await p.getByText('A line break can be typed inside a paragraph only.').waitFor();
  assert.deepEqual(errors,[]);console.log(engine+': hard breaks are read, drawn, typed and written as a backslash, and a two-space break keeps its form');
 }catch(err){console.error(engine,phase,errors);throw err;}finally{await b.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
