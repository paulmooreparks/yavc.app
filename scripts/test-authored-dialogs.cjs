// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// This exercises authored dialog layouts without accepting destructive actions.
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dialogLayout=require('./dialog-layout.cjs');
const port=process.env.YAVC_CHROME_TEST_PORT||'8442',out=path.join(os.tmpdir(),'yavc-authored-dialog-evidence'+(process.env.YAVC_DIALOG_LARGE_TEXT==='1'?'-large':''));fs.mkdirSync(out,{recursive:true});
const applications=['settings','terminal','barcodes','barcode-scanner','sight-reader','asteroids','invaders','sudoku','conway','dice','diff','theme-studio'];
const selectedApplications=process.env.YAVC_DIALOG_APPS?process.env.YAVC_DIALOG_APPS.split(','):applications;
if(selectedApplications.some(app=>!applications.includes(app)))throw new Error('Unknown authored-dialog application filter.');
const score='<?xml version="1.0"?><!DOCTYPE score-partwise><score-partwise version="3.1"><work><work-title>Dialog Review</work-title></work><part-list><score-part id="P1"><part-name>Upper</part-name></score-part><score-part id="P2"><part-name>Lower</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part><part id="P2"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
async function layoutMenu(p,name){await p.locator('.menubar-title').filter({hasText:/^Layout$/}).click();await p.getByRole('menuitem',{name,exact:true}).click();}
async function populate(p,app,dialog,index){
 const role=await dialog.getAttribute('data-role');
 if(['asteroids','invaders'].includes(app)&&role==='scores-dialog'){await p.locator('[data-applet] button[data-action="scores"]').click();await dialog.locator('.dialog-body p').waitFor();}
 if(app==='conway'&&role==='share-dialog'){await p.evaluate(()=>pudlCommands.run('share',null,document.querySelector('[data-applet]')));assert.ok(await dialog.locator('[data-role="share-url"]').inputValue());}
 if(app==='barcodes'&&role==='json-dialog'){await layoutMenu(p,'New layout from JSON…');const original=await dialog.getByRole('textbox',{name:'Layout JSON',exact:true}).inputValue();await dialog.getByRole('textbox',{name:'Layout JSON',exact:true}).fill('{broken');await dialog.getByRole('button',{name:'Save layout',exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:'Layout JSON',exact:true}).getAttribute('aria-invalid'),'true');assert.equal(await dialog.locator('[data-role="json-errors"]').isVisible(),true);await dialog.getByRole('textbox',{name:'Layout JSON',exact:true}).fill(original);}
 if(app==='barcodes'&&role==='remove-dialog'){await layoutMenu(p,'New layout from JSON…');const json=p.locator('[data-role="json-dialog"]');await json.getByRole('button',{name:'Save layout',exact:true}).click();await json.waitFor({state:'hidden'});await layoutMenu(p,'Remove this layout…');assert.match(await dialog.innerText(),/My layout/);}
 if(app==='sight-reader'&&role==='chooser'){await p.evaluate(()=>pudlCommands.run('choose',null,document.querySelector('[data-applet]')));await p.waitForFunction(()=>!document.querySelector('[data-role="chooser-body"]').textContent.includes('Looking for'));}
 if(app==='sight-reader'&&role==='read'){await p.locator('input.sr-file').setInputFiles({name:'review.musicxml',mimeType:'application/xml',buffer:Buffer.from(score)});await p.waitForFunction(()=>{const command=pudlCommands.find('read',document.querySelector('[data-applet]'));return command && !(typeof command.disabled==='function'?command.disabled():command.disabled);});await p.evaluate(()=>pudlCommands.run('read',null,document.querySelector('[data-applet]')));await dialog.locator('input[type="checkbox"]').first().waitFor();}
 if(app==='barcode-scanner'&&role==='details-dialog'){const input=p.locator('[data-role="input-dialog"]');await input.evaluate(el=>el.showModal());await input.locator('[data-role="text"]').fill('4006381333931');await input.getByRole('button',{name:'Decode value',exact:true}).click();await p.locator('[data-role="details"] table').waitFor({state:'attached'});}
 if(app==='barcode-scanner'&&role==='copy-fallback'){await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new DOMException('Synthetic denied permission','NotAllowedError'))}}));await p.getByRole('button',{name:'Actions',exact:true}).click();await p.locator('[data-applet] button[data-action="copy"]').click();await dialog.waitFor();assert.ok(await dialog.locator('textarea').inputValue());}
}
(async()=>{const results=[];for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{for(const app of selectedApplications){
  const p=await browser.newPage({viewport:{width:1200,height:900}});await dialogLayout.prepare(p);p.setDefaultTimeout(15000);
  try{
   await p.goto(`http://${app}.localhost:${port}/`);
   await p.locator('[data-applet][data-applet-state="running"]').waitFor();
   await p.locator('[data-applet] dialog').first().waitFor({state:'attached'});
   const dialogs=p.locator('[data-applet] dialog'),count=await dialogs.count();assert.ok(count>0,app+' has no mounted dialogs');
   for(let i=0;i<count;i++){
    const dialog=dialogs.nth(i),title=await dialog.evaluate(el=>el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' '));
    assert.ok(title.trim(),app+' dialog missing accessible title');
    await populate(p,app,dialog,i);
    await dialog.evaluate(el=>{if(!el.open)el.showModal();});
    const entry={engine,app,index:i,title,layouts:[],content:await dialog.locator('.dialog-body').innerText()};
    assert.equal(await dialog.locator('.dialog-body').count(),1,app+' '+title+' needs one dialog body');
    for(const width of [1200,360]){
     await p.setViewportSize({width,height:900});
     await p.evaluate(theme=>pudlSetTheme(theme),width===360?'dark':'light');
     const measurement=await dialog.evaluate(el=>({width:el.getBoundingClientRect().width,overflow:el.scrollWidth>el.clientWidth+2,viewport:innerWidth}));
     entry.layouts.push(measurement);
     await dialog.screenshot({animations:'disabled',path:path.join(out,engine+'-'+app+'-'+i+'-'+width+'.png')});
     assert.ok(measurement.width<=width+1,app+' '+title+' exceeds viewport');assert.equal(measurement.overflow,false,app+' '+title+' has horizontal overflow');
    }
    for(let step=0;step<8;step++){await p.keyboard.press('Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)||el===document.activeElement),true,app+' '+title+' loses keyboard focus');}
    await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    await p.setViewportSize({width:1200,height:900});
    entry.result='layout and keyboard checked';results.push(entry);
   }
   console.log(engine+' '+app+': '+count+' authored dialogs checked');
   if(app==='sight-reader'){
    await p.evaluate(()=>pudlCommands.run('choose',null,document.querySelector('[data-applet]')));const chooser=p.locator('[data-role="chooser"]');await chooser.locator('[data-score-query]').waitFor();assert.equal(await chooser.locator('input[type="radio"]').count(),0);assert.equal(await chooser.locator('[data-score-list]').evaluate(el=>el.tagName==='SELECT'&&el.size>1&&!el.hidden),true);await chooser.locator('[data-score-query]').fill('no such score 938475');assert.equal(await chooser.locator('[data-score-list] option:not([disabled])').count(),0);await chooser.locator('[data-score-query]').fill('');const list=chooser.getByRole('listbox');await list.focus();await p.keyboard.press('Home');await p.keyboard.press('ArrowDown');const expected=await chooser.locator('[data-score-list]').inputValue();assert.ok(expected);await p.keyboard.press('Enter');await chooser.waitFor({state:'hidden'});await p.waitForFunction(expected=>new URLSearchParams(location.search).get('score')===expected,expected);
   }
  }catch(error){await p.screenshot({animations:'disabled',path:path.join(out,engine+'-'+app+'-failed.png')}).catch(()=>{});console.error(await p.locator('[role="status"],.sr-status,.sr-message').allTextContents());throw error;}finally{await p.close();}
 }}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
}})().catch(err=>{console.error(err);process.exitCode=1;});
