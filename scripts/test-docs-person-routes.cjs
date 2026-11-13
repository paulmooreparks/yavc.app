// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Docs is driven here only through what docs/person-routes-contract.md promises, as a person or an outside tester would: roles and accessible names, the ARIA busy state,
// the keyboard, and the Save button. No class name, no data attribute, no command id and no applet internals. The one thing read from the host is what it was given to save,
// since a save is a host-side event. It runs at desktop width, where the toolbar shows its own buttons, and at phone width, where the File, Edit, Format and View menus replace them.
// Usage: node scripts/test-docs-person-routes.cjs <package folder> [browsers]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const RICH='The Document, as Its Page',MARKDOWN='Text of Document.docs.md';
(async()=>{
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();let body=await fs.readFile(path.join(artifact,decodeURIComponent(u.pathname.slice(prefix.length))));
  if(u.pathname.endsWith('/workspace-lab/host.js'))body=Buffer.from(body.toString().replace("['editor','docs','slides']","['docs']"));
  res.writeHead(200,{'content-type':types[path.extname(u.pathname)]||'application/octet-stream'}).end(body);}catch{if(!res.headersSent)res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});
  for(const [width,where] of [[1500,'desktop width'],[390,'phone width']]){
   const label=`${engine} at ${where}`,page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(15000);
   const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
   const surface=name=>page.getByRole('textbox',{name,exact:true});
   // A command is a toolbar button at desktop width and an item in a menu at phone width.
   async function command(name,menu){
    if(width>=1000){await page.getByRole('button',{name,exact:true}).click();return;}
    await page.getByRole('button',{name:menu,exact:true}).click();await menuItem(name).click();
   }
   // A menu item's name is its label, then its shortcut when it has one. Items have no single role (button, menuitemradio, menuitemcheckbox), so a label is matched in each.
   function menuItem(label){const name=new RegExp('^'+label+'(?:[ ]*(?:Ctrl|Alt|Shift|Cmd|…)|$)');return page.getByRole('button',{name}).or(page.getByRole('menuitemradio',{name})).or(page.getByRole('menuitemcheckbox',{name})).or(page.getByRole('menuitem',{name})).first();}
   // A surface accepts typing when it is not aria-busy="true", a documented ARIA state.
   const notBusy=()=>page.locator('[aria-busy="true"]').waitFor({state:'detached'});
   const written=()=>page.evaluate(()=>fixture.writes.map(w=>w.text));
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`);
    // 1. The rich surface is a multiline textbox with its promised name, and it accepts typing when it is not busy.
    const rich=surface(RICH);await rich.waitFor();assert.equal(await rich.getAttribute('aria-multiline'),'true',`${label}: the rich surface is not aria-multiline`);
    await notBusy();
    await rich.getByText('Editable words.').click();await frame();await page.keyboard.press('End');await page.keyboard.type(' Typed');
    // 2. Format: select the typed word with the keyboard and make it bold.
    await page.keyboard.press('Shift+ControlOrMeta+ArrowLeft');await command('Bold','Format');
    // 3. Switch views through the View group, and read the Markdown through its textbox.
    if(width>=1000){await page.getByRole('button',{name:'Text',exact:true}).click();await page.getByRole('button',{name:'Text',exact:true,pressed:true}).waitFor();}
    else{await page.getByRole('button',{name:'View',exact:true}).click();await menuItem('Text').click();}
    const markdown=surface(MARKDOWN);await markdown.waitFor();
    const shown=await markdown.innerText();if(!shown.includes('**Typed**'))failures.push(`${label}: the Markdown view shows ${JSON.stringify(shown.slice(-60))} and not the typed words in bold`);
    if(width>=1000){await page.getByRole('button',{name:'Visual',exact:true}).click();await page.getByRole('button',{name:'Visual',exact:true,pressed:true}).waitFor();}
    else{await page.getByRole('button',{name:'View',exact:true}).click();await menuItem('Visual').click();}
    await rich.waitFor();await notBusy();
    // 4. Save with the keyboard, and with the Save button or the File menu: each writes once.
    await rich.getByText('Typed').click();await frame();await page.keyboard.press('End');await page.keyboard.type(' More');
    await page.keyboard.press('ControlOrMeta+s');await page.waitForFunction(()=>fixture.writes.length>=1);await frame();
    let texts=await written();if(texts.length!==1)failures.push(`${label}: Ctrl+S made ${texts.length} writes`);
    if(!texts[0]||!texts[0].includes('**Typed') && texts[0].includes('More'))failures.push(`${label}: the saved text was ${JSON.stringify((texts[0]||'').slice(-50))}`);
    await page.keyboard.type(' Last');
    if(width>=1000)await page.getByRole('button',{name:'Save',exact:true}).click();else await command('Save','File');
    await page.waitForFunction(()=>fixture.writes.length>=2);await frame();texts=await written();if(texts.length!==2)failures.push(`${label}: Save made ${texts.length-1} writes`);
    if(!texts[1]||!texts[1].includes('Last'))failures.push(`${label}: the second save was ${JSON.stringify((texts[1]||'').slice(-50))}`);
    // 5. A dialog is found by its role and name, and closed by its button.
    await command('Link','Format');const dialog=page.getByRole('dialog',{name:'Link',exact:true});await dialog.waitFor();
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});
    // Two more dialogs, so the general promise has examples: Text Color is a dialog with Cancel and Apply, and Find and Replace is a search region with named buttons.
    await command('Text Color','Format');const colour=page.getByRole('dialog',{name:'Text Color',exact:true});await colour.waitFor();
    await colour.getByRole('button',{name:'Apply',exact:true}).waitFor();await colour.getByRole('button',{name:'Cancel',exact:true}).click();await colour.waitFor({state:'hidden'});
    await command('Find and Replace','Edit');const find=page.getByRole('search',{name:'Find and Replace',exact:true});await find.waitFor();
    for(const name of ['Next Match','Previous Match','Replace','Replace All','Close'])await find.getByRole('button',{name,exact:true}).waitFor();
    await find.getByRole('button',{name:'Close',exact:true}).click();await find.waitFor({state:'hidden'});
    // 6. The menus have their names where they are visible.
    if(width<1000)for(const name of ['File','Edit','Format','View'])if(!await page.getByRole('button',{name,exact:true}).isVisible())failures.push(`${label}: the ${name} menu is not there`);
   }catch(error){failures.push(`${label}: ${String(error.message).split('\n').slice(0,3).join(' ').slice(0,300)}`);}finally{await page.close();}
  }
  await browser.close();
 }}finally{server.close();}
 if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Docs was driven through the promised routes only, at desktop and phone width, in every browser.');
})().catch(error=>{console.error(error);process.exitCode=1;});
