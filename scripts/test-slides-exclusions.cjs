// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8419', evidence = path.join(os.tmpdir(), 'yavc-editor-export-evidence');
const source = '---\ntitle: Safe deck\ntheme: paper\n---\n\n{{slide:layout=title}}\n{{no-export}}\n# SECRET_TITLE\n{{/no-export}}\n\nVisible body.\n\n{{notes}}\nVisible note {{no-export}}SECRET_NOTE{{/no-export}} end.\n{{/notes}}\n\n---\n\n{{no-export}}\n{{slide:layout=image image="https://invalid.example/SECRET_BACKGROUND.png"}}\nSECRET_BODY\n{{/no-export}}\n\n## Public heading\n\nPublic words.\n';
function action(page, name, input={}) { return page.evaluate(({name,input})=>pudlActions.run('yavc.slides/'+name+'@1',input,{grant:'all'}),{name,input}); }
(async()=>{
 for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']) {
  const browser=await playwright[engine].launch({headless:true}); const page=await browser.newPage({viewport:{width:1400,height:950}}); page.setDefaultTimeout(30000);
  try {
   await page.goto(`http://slides.localhost:${port}/`); await page.locator('.yavc-command-toolbar').waitFor();
   await action(page,'load',{text:source}); await action(page,'view',{mode:'text'});
   for(const format of ['html','pptx','pdf']) {
    const pending=page.waitForEvent('download'); await page.evaluate(format=>pudlCommands.run('export-'+format,null,document.querySelector('[data-applet]')),format);
    const download=await pending; const file=path.join(evidence,engine+'-slides.'+format); await download.saveAs(file);
    if(format==='html') { const html=fs.readFileSync(file,'utf8'); assert.ok(!html.includes('SECRET_')); assert.ok(html.includes('Visible body.')); }
   }
   await page.evaluate(()=>pudlCommands.run('present',null,document.querySelector('[data-applet]'))); await page.locator('.deck-show').waitFor();
   assert.ok(!(await page.locator('.deck-show').textContent()).includes('SECRET_'));
   assert.ok(!(await page.locator('.deck-show').innerHTML()).includes('SECRET_'));
   await page.evaluate(()=>pudlCommands.run('leave',null,document.querySelector('[data-applet]')));
   // Simulate an unsynchronized rich edit by delaying the shared sync method.
   await action(page,'load',{text:'# Public\n\nSECRET_PENDING\n'}); await action(page,'view',{mode:'visual'});
   await page.locator('.ProseMirror').waitFor();
   const printed=await page.evaluate(async()=>{
    const api=yavcMdEditor._page, sync=api.sync; let flushed=false;
    api.sync=async()=>{await sync(); const cm=CM.EditorView.findFromDOM(document.querySelector('.cm-editor')); cm.dispatch({changes:{from:0,to:cm.state.doc.length,insert:'# Public\n\n{{no-export}}\nSECRET_PENDING\n{{/no-export}}\n'}}); flushed=true;};
    window.print=()=>{window.exclusionPrint={flushed,html:document.querySelector('.deck-print').innerHTML};};
    await pudlCommands.run('print',null,document.querySelector('[data-applet]'));
    return true;
   }); assert.ok(printed);
   await page.waitForFunction(()=>window.exclusionPrint);
   const print=await page.evaluate(()=>window.exclusionPrint); assert.ok(print.flushed); assert.ok(!print.html.includes('SECRET_'));
   console.log(engine+': Slides HTML/PPTX/PDF, audience output, filtered title/settings/notes and synchronized Print passed');
  } finally { await browser.close(); }
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
