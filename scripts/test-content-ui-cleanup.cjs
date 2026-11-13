// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Use a disposable server and fresh browser contexts, never a user's files.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8427';
const evidence = path.join(os.tmpdir(), 'yavc-content-ui-evidence'); fs.mkdirSync(evidence, { recursive: true });
const action = (p, app, name, input = {}) => p.evaluate(({app,name,input}) => pudlActions.run('yavc.' + app + '/' + name + '@1', input, {grant:'all'}), {app,name,input});
const command = (p,id) => p.evaluate(id => { pudlCommands.run(id, null, document.querySelector('[data-applet]')); }, id);
async function menu(p,id) { await p.locator('.menubar-title[data-menu-id="'+id+'"]').click(); const text = await p.locator('#menubar-panel').innerText(); await p.keyboard.press('Escape'); return text; }
(async () => {
 for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium','firefox','webkit']) {
  const browser = await pw[engine].launch({headless:true}); const p = await browser.newPage({viewport:{width:1500,height:1000}}); p.setDefaultTimeout(15000);
  let phase = 'start'; const errors=[]; p.on('pageerror',e=>errors.push(e.message));
  try {
   for (const app of ['docs','slides','diagrams']) { // Page Setup belongs to Docs, not the Editor (DESIGN.md, decision 131).
    phase = app + ' menus'; await p.goto(`http://${app}.localhost:${port}/`, {waitUntil:'domcontentloaded'}); await p.waitForFunction(()=>{const b=document.querySelector('.yavc-command-toolbar [data-command="save"]');return b&&!b.disabled;});
    if (app === 'docs') {
     await action(p,app,'new',{path:'~/review.docs.md',text:'# Review\n\nBody.'});
     assert.match(await menu(p,'format'),/Page Setup/); assert.doesNotMatch(await menu(p,'file'),/Page Setup/);
     await command(p,'page-setup'); await p.locator('dialog[open]').waitFor(); await p.getByRole('button',{name:'Cancel',exact:true}).click(); continue;
    }
    if (app === 'slides') {
     await action(p,app,'load',{text:'# UI review\n\nEditable text.\n'});
     assert.match(await menu(p,'edit'),/Undo[\s\S]*Redo/); assert.match(await menu(p,'insert'),/Link/);
     assert.doesNotMatch(await menu(p,'format'),/Insert|Link/); assert.match(await menu(p,'deck'),/Deck Colors/); assert.match(await menu(p,'slide'),/Slide Colors/);
     await p.locator('.menubar-title[data-menu-id=file]').click();
     for (const name of ['Save As…','Print…']) { const glyph=p.getByRole('menuitem',{name,exact:true}).locator('.glyph'); assert.equal(await glyph.count(),1); assert.notEqual(await glyph.evaluate(n=>getComputedStyle(n).maskImage),'none'); }
     await p.keyboard.press('Escape');
     phase='Slides text history'; await action(p,app,'view',{mode:'text'}); const cm=p.locator('.cm-content'); await cm.click(); await p.keyboard.press('ControlOrMeta+End'); await p.keyboard.type('History marker');
     await command(p,'undo'); await p.waitForFunction(()=>!CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('History marker'));
     await command(p,'redo'); await p.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('History marker'));
     phase='Slides split source menu history'; await action(p,app,'view',{mode:'split'}); await cm.click(); await p.keyboard.press('ControlOrMeta+End'); await p.keyboard.type('Split source marker');
     await p.locator('.menubar-title[data-menu-id=edit]').click(); await p.getByRole('menuitem',{name:/^Undo/}).click(); await p.waitForFunction(()=>!CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('Split source marker'));
     await p.locator('.menubar-title[data-menu-id=edit]').click(); await p.getByRole('menuitem',{name:/^Redo/}).click(); await p.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('Split source marker'));
     phase='Slides rich history'; await action(p,app,'view',{mode:'visual'}); const rich=p.locator('.ProseMirror[aria-busy="false"]'); await rich.waitFor(); await rich.click(); await p.keyboard.press('ControlOrMeta+End'); await p.keyboard.type('Rich marker'); await p.waitForFunction(()=>document.querySelector('.ProseMirror').textContent.includes('Rich marker')); await command(p,'undo'); await p.waitForFunction(()=>!document.querySelector('.ProseMirror').textContent.includes('Rich marker')); await command(p,'redo'); await p.waitForFunction(()=>document.querySelector('.ProseMirror').textContent.includes('Rich marker'));
     phase='Slides isolated history'; await action(p,app,'load',{text:'# First slide\n\nFirst body.\n\n---\n\n# Second slide\n\nSecond body.\n'}); await action(p,app,'view',{mode:'text'});
     await cm.click(); await p.keyboard.press('ControlOrMeta+End'); await p.keyboard.type('First edit');
     // Slides has one editing history for the whole deck (DESIGN.md, decision 84), so going to the second slide keeps the first slide's edit undoable,
     // and Undo takes back the latest edit first, wherever it was made, whichever slide is showing.
     const deckText=()=>action(p,app,'text').then(r=>r.text);
     await action(p,app,'go',{index:2}); await p.waitForFunction(()=>!document.querySelector('.yavc-command-toolbar [data-command=undo]').disabled); assert.match(await deckText(),/# Second slide\n\nSecond body/);
     await cm.click(); await p.keyboard.press('ControlOrMeta+End'); await p.keyboard.type('Second edit'); assert.match(await deckText(),/Second edit/); await command(p,'undo');
     await p.evaluate(async ()=>{const condition=async()=>!(await pudlActions.run('yavc.slides/text@1',{},{grant:'all'})).text.includes('Second edit');const limit=Date.now()+20000;while(!(await condition())){if(Date.now()>limit)throw new Error('The condition never held');await new Promise(resolve=>setTimeout(resolve,50));}}); assert.match(await deckText(),/First edit/); await command(p,'undo');
     await p.evaluate(async ()=>{const condition=async()=>!(await pudlActions.run('yavc.slides/text@1',{},{grant:'all'})).text.includes('First edit');const limit=Date.now()+20000;while(!(await condition())){if(Date.now()>limit)throw new Error('The condition never held');await new Promise(resolve=>setTimeout(resolve,50));}}); await action(p,app,'view',{mode:'visual'});
     for (const id of ['deck-colours','slide-colours','deck-title']) {
      phase='Slides dialog '+id; await command(p,id); const d=p.locator('dialog[open]'); await d.waitFor();
      assert.deepEqual(await d.evaluate(d=>Array.from(d.querySelectorAll('input,select,textarea')).filter(n=>n.type!=='hidden'&&n.getClientRects().length&&!n.disabled&&!n.labels?.length&&!n.getAttribute('aria-label')&&!n.getAttribute('aria-labelledby')).map(n=>n.outerHTML)),[]);
      await d.screenshot({path:path.join(evidence,engine+'-'+id+'.png')}); await p.getByRole('button',{name:'Cancel',exact:true}).click();
     }
    } else {
     await action(p,app,'new',{kind:'canvas',style:'basic'}); assert.match(await menu(p,'shape'),/Drawing Tool/);
     assert.doesNotMatch(await menu(p,'edit'),/Drawing Tool/);
    }
    phase=app+' view toolbar'; const group=p.locator('.yavc-command-toolbar [data-command-choice]'); await group.waitFor();
    assert.deepEqual(await group.locator('[data-command]').evaluateAll(nodes=>nodes.map(n=>n.textContent.trim())), ['Visual','Text','Split']);
    for (const mode of ['text','split',app==='slides'?'visual':'preview']) { await command(p,'view-'+mode); await p.waitForFunction(id=>document.querySelector('.yavc-command-toolbar [data-command="'+id+'"]')?.getAttribute('aria-pressed')==='true','view-'+mode); }
    phase=app+' narrow status'; await p.evaluate(()=>pudlSetTheme('dark')); await p.setViewportSize({width:390,height:844});
    const status=p.locator('[data-role=status]'); await status.locator('[data-role=where]').evaluate(n=>{n.textContent='~/Documents/'+('long-location-'.repeat(20))+'.md'; n.title=n.textContent;});
    assert.ok(await status.evaluate(n=>n.getBoundingClientRect().height<35 && n.scrollWidth<=n.clientWidth+1));
    await p.screenshot({path:path.join(evidence,engine+'-'+app+'-narrow.png')});
    await p.setViewportSize({width:1500,height:1000}); await p.evaluate(()=>pudlSetTheme('light')); await p.getByRole('button',{name:'Show as ribbon',exact:true}).click(); await p.screenshot({path:path.join(evidence,engine+'-'+app+'-ribbon.png')}); await p.evaluate(()=>pudlMenubar.ribbon(false));
    if (app === 'diagrams') {
     for (const kind of ['d2','mermaid']) {
      phase=kind+' view choices'; const result=await action(p,app,'new',{kind,style:'flowchart'}); assert.equal(result.drawn,true,JSON.stringify(result));
      assert.deepEqual(await group.locator('[data-command]').evaluateAll(nodes=>nodes.map(n=>n.textContent.trim())), [kind==='d2'?'Visual':'Preview','Text','Split']);
      await command(p,'view-preview'); await p.locator('.dg-stagebox svg').waitFor();
     }
    }
   }
   assert.deepEqual(errors,[]); console.log(engine+': Page Setup menu, Slides menus/dialogs/history/glyphs, shared view selectors, narrow status and ribbons passed');
  } catch(e) { console.error(engine+' '+phase); await p.screenshot({path:path.join(evidence,engine+'-failure.png')}); throw e; }
  finally { await browser.close(); }
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
