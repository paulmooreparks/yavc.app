// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const pw = require('playwright'), port = process.env.YAVC_CHROME_TEST_PORT || '8422';
const evidence = path.join(os.tmpdir(),'yavc-page-setup-evidence'); fs.mkdirSync(evidence,{recursive:true});
const source = '---\n# Keep this comment.\ntitle: Setup test\npage: letter\nmargins: 1in\ncustom: preserved\n---\n\n# Page setup\n\n' + Array.from({length:30},(_,i)=>'Paragraph '+i+'. '+'Editable document text. '.repeat(12)).join('\n\n');
const action = (page,name,input={}) => page.evaluate(({name,input})=>pudlActions.run('yavc.editor/'+name+'@1',input,{grant:'all'}),{name,input});
const command = (page,id) => page.evaluate(id=>{pudlCommands.run(id,null,document.querySelector('[data-applet]'));},id);
const measure = (page,key) => page.locator('[data-measure="'+key+'"]').locator('..').getByRole('spinbutton');
const choice = (page,key) => page.locator('[data-choice="'+key+'"]');
const read = page => action(page,'document').then(r=>r.text);
const close = page => page.getByRole('button',{name:'Cancel',exact:true}).click();
const apply = page => page.getByRole('button',{name:'Apply',exact:true}).click();
async function setup(page) { await command(page,'page-setup'); await page.locator('.md-page-setup[open]').waitFor(); }
(async()=>{
 for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']) {
  const browser=await pw[engine].launch({headless:true}),page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let phase='start';
  try {
   await page.goto(`http://editor.localhost:${port}/`,{waitUntil:'domcontentloaded'});await page.locator('.cm-editor').waitFor();
   await action(page,'new',{path:'~/setup.docs.md',text:source});await page.waitForFunction(()=>+document.querySelector('[data-page-count]')?.dataset.pageCount>1);
   phase='catalog and independent margins';await setup(page);
   assert.ok(await choice(page,'paper').locator('option').count()>200);
   await choice(page,'units').selectOption('mm');await choice(page,'paper').selectOption('a3');
   assert.equal(+await measure(page,'width').inputValue(),297);assert.equal(+await measure(page,'height').inputValue(),420);
   await choice(page,'orientation').selectOption('landscape');assert.equal(+await measure(page,'width').inputValue(),420);
   await page.locator('[data-link-margins]').uncheck();
   for(const [side,n] of Object.entries({top:10,right:40,bottom:20,left:30})) await measure(page,side).fill(String(n));
   await page.screenshot({path:path.join(evidence,engine+'-sides.png')});await apply(page);
   await page.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('margins: 10mm 40mm 20mm 30mm'));
   const changed=await read(page);assert.match(changed,/page: a3/);assert.match(changed,/orientation: landscape/);assert.match(changed,/# Keep this comment/);assert.match(changed,/custom: preserved/);
   await command(page,'undo');await page.waitForFunction(source=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()===source,source);
   phase='custom size, common margin and units';await setup(page);await choice(page,'paper').selectOption('custom');
   await measure(page,'width').fill('8');await measure(page,'height').fill('10');await measure(page,'all').fill('0.75');
   await choice(page,'units').selectOption('mm');assert.equal(+await measure(page,'width').inputValue(),203.2);assert.equal(+await measure(page,'all').inputValue(),19.05);
   await choice(page,'units').selectOption('in');assert.equal(+await measure(page,'width').inputValue(),8);assert.equal(+await measure(page,'all').inputValue(),.75);
   await apply(page);await page.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('8in x 10in'));
   assert.match(await read(page),/margins: 0.75in/);await setup(page);assert.equal(await choice(page,'units').inputValue(),'in');assert.equal(+await measure(page,'width').inputValue(),8);await close(page);await command(page,'undo');
   phase='presets, filtering and validation';await setup(page);await choice(page,'preset').selectOption('moderate');
   assert.equal(await page.locator('[data-link-margins]').isChecked(),false);assert.equal(+await measure(page,'top').inputValue(),1);assert.equal(+await measure(page,'left').inputValue(),.75);
   await choice(page,'preset').selectOption('none');assert.equal(await page.locator('[data-link-margins]').isChecked(),true);assert.equal(+await measure(page,'all').inputValue(),0);
   await page.locator('[data-paper-filter]').fill('JIS B5');assert.ok(await choice(page,'paper').locator('option').count()<5);
   await choice(page,'paper').selectOption('jis_b5_182x257mm');await choice(page,'units').selectOption('mm');assert.equal(+await measure(page,'width').inputValue(),182);
   await close(page);assert.equal(await read(page),source);
   await setup(page);await page.locator('[data-link-margins]').uncheck();await measure(page,'right').fill('not a number');await apply(page);
   assert.equal(await measure(page,'right').getAttribute('aria-invalid'),'true');assert.equal(await measure(page,'right').evaluate(n=>n===document.activeElement),true);
   assert.ok(await measure(page,'right').evaluate(n=>!!document.getElementById(n.getAttribute('aria-describedby'))));
   await apply(page);assert.equal(await page.locator('.md-page-setup[open]').count(),1);
   await choice(page,'paper').selectOption('a3');assert.equal(await choice(page,'paper').inputValue(),'letter');assert.equal(await measure(page,'right').inputValue(),'not a number');await close(page);
   phase='return to original values';await setup(page);
   await measure(page,'all').fill('2');await measure(page,'all').press('Tab');await measure(page,'all').fill('1');await measure(page,'all').press('Tab');
   await measure(page,'width').fill('9');await measure(page,'width').press('Tab');await measure(page,'width').fill('8.5');await measure(page,'width').press('Tab');
   await measure(page,'height').fill('12');await measure(page,'height').press('Tab');await measure(page,'height').fill('11');await measure(page,'height').press('Tab');
   await apply(page);await page.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('8.5in x 11in'));
   assert.match(await read(page),/margins: 1in/);await command(page,'undo');
   phase='narrow and dark layout';await setup(page);await page.evaluate(()=>pudlSetTheme('dark'));await page.screenshot({path:path.join(evidence,engine+'-dark.png')});
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(evidence,engine+'-narrow.png')});
   assert.equal(await page.locator('.md-page-setup').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
   await measure(page,'all').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,engine+'-narrow-margins.png')});await close(page);await page.setViewportSize({width:1400,height:1000});
   phase='layout retention';
   for(const mode of ['text','preview','visual','text','visual','split','preview','document']) {
    await action(page,'view',{mode});if(mode==='text')continue;
    await page.waitForFunction(()=>+document.querySelector('[data-page-count]')?.dataset.pageCount>1);
    assert.equal(await page.locator('.doc-paginated').evaluate(n=>n.getBoundingClientRect().width),816);
    assert.equal(await read(page),source);
   }
   await page.screenshot({path:path.join(evidence,engine+'-preview-pages.png')});
   await action(page,'new',{path:'~/flow.md',text:'# Ordinary Markdown\n\nWrap to the pane.'});await action(page,'view',{mode:'visual'});
   assert.equal(await page.locator('.doc-paginated').count(),0);await action(page,'view',{mode:'preview'});assert.equal(await page.locator('.doc-paginated').count(),0);
   phase='stale dialog';await setup(page);await action(page,'set-text',{text:'# Replaced while dialog was open.'});await apply(page);
   assert.equal(await page.locator('.md-page-setup[open]').count(),1);assert.equal(await read(page),'# Replaced while dialog was open.');await close(page);
   assert.deepEqual(errors,[]);console.log(engine+': catalog, custom dimensions, units, separate/linked margins, presets, Undo, validation, stale dialog, narrow/dark and view retention passed');
  } catch(err) { await page.screenshot({path:path.join(evidence,engine+'-failure.png')});console.error(engine+' failed at '+phase);throw err; }
  finally { await browser.close(); }
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
