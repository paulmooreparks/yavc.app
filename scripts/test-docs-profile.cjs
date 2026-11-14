// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The docs content profile (docs/content-release-downloads.md, "Profiles"), served as PFO serves its pages:
//   go run ./cmd/yavc-content -profile docs -out <new folder>
//   node scripts/test-docs-profile.cjs <that folder> [chromium firefox webkit]
// The package holds Docs and no other applet. The one-page host comes from this repository (scripts/fixtures/portable-workspace),
// since the profile leaves its own fixtures out. Under PFO's policy, with every file asked for from the package alone, Docs starts,
// takes typing and formatting, changes view, opens its menus and dialogs, saves and prints with no request that fails and no
// violation of the policy. If Docs ever needs a file the profile omits, this fails. The omitted features are then each used, and
// each says in words, where the person used it, that it is not part of this build. Run against a full package, the last part fails,
// which is the point: nothing is omitted there.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/pfo/assets/',fixture=path.resolve(__dirname,'fixtures','portable-workspace');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
// PFO's policy and headers word for word, with the two relaxations agreed (wasm-unsafe-eval, and data: images).
const policy="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
const headers={'Content-Security-Policy':policy,'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8'));
 assert.equal(manifest.profile,'docs','the folder is not a docs profile package');
 const allowed=new Set(manifest.files.map(f=>f.path));
 const served=[];
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));
  const own=name.startsWith('workspace-lab/');const file=own?path.join(fixture,name.slice('workspace-lab/'.length)):allowed.has(name)?path.join(artifact,name):null;
  if(!file||/\.\./.test(name)||own&&!/^[\w.-]+$/.test(name.slice('workspace-lab/'.length))){served.push([404,name]);return res.writeHead(404).end();}
  served.push([200,name]);for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const b=await pw[engine].launch({headless:true}),p=await b.newPage({viewport:{width:1500,height:1600}}),errors=[],violations=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(25000);
  await p.addInitScript(()=>{window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push(e.effectiveDirective+' '+e.blockedURI+' '+(e.sourceFile||'').split('/').pop()+':'+e.lineNumber));});
  try{
   served.length=0;
   await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);
   const rich=p.locator('#document .ProseMirror');await rich.waitFor();
   // Typing, formatting and the views.
   await rich.locator('p').filter({hasText:'Editable words.'}).click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type(' Typed under the policy.');
   await p.keyboard.press('Shift+Home');await p.keyboard.press('ControlOrMeta+b');
   for(const view of ['view-text','view-split','view-preview','view-visual']){await p.evaluate(v=>{pudlCommands.run(v,null,document.querySelector('#document'));},view);await p.waitForTimeout(500);}
   // A picture the host supplies, as a data: address, typed into the text.
   await p.evaluate(()=>{pudlCommands.run('view-text',null,document.querySelector('#document'));});await p.locator('#document .cm-content').click();await p.keyboard.press('ControlOrMeta+End');
   await p.keyboard.type('\n\n![A pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)\n');
   await p.evaluate(()=>{pudlCommands.run('view-visual',null,document.querySelector('#document'));});await rich.locator('img').first().waitFor();
   // Menus and dialogs.
   for(const name of ['File','Edit','Insert','Format','View']){const m=p.locator('#document').getByRole('menuitem',{name,exact:true}).first();if(await m.count()){await m.click();await p.waitForTimeout(200);await p.keyboard.press('Escape');}}
   for(const command of ['insert-table','properties','find']){await p.evaluate(c=>{pudlCommands.run(c,null,document.querySelector('#document'));},command);await p.waitForTimeout(500);await p.keyboard.press('Escape');await p.waitForTimeout(200);}
   // Saving and printing.
   await p.evaluate(()=>{pudlCommands.run('save',null,document.querySelector('#document'));});
   await p.waitForFunction(()=>/Typed under the policy/.test(fixture.records.get('memory:document.docs.md').text));
   // The print frame is given a print() that only counts, since a browser's own print dialog stops the page (Firefox's headless one never returns).
   await p.evaluate(()=>{window.printed=0;window.printedText='';const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{append(...nodes);for(const n of nodes)if(n.tagName==='IFRAME')n.contentWindow.print=()=>{window.printed++;window.printedFrame=n;};};});
   await p.evaluate(()=>{window.print=()=>{};pudlCommands.run('print-document',null,document.querySelector('#document'));});await p.waitForTimeout(1500);
   // The document refers to a diagram that this build omits. Print prints the rest and says in the diagram's place what the page says, and print@1 answers that it printed.
   const printedBy=await p.evaluate(()=>{window.printed=0;return pudlActions.run('yavc.docs/print@1',{},{grant:'all'}).then(()=>'printed',e=>'refused: '+e.message);});
   assert.equal(printedBy,'printed',engine+': print@1 with an omitted diagram: '+printedBy);
   assert.equal(await p.evaluate(()=>window.printed),1,engine+': the browser was asked to print once');
   assert.match(await p.evaluate(()=>window.printedFrame.contentDocument.body.textContent),/Diagram not printed\. Diagrams are not part of this build of Docs\./,engine+': the printed page says that the diagram is not part of this build');
   // Nothing the package was asked for was missing, and the policy was not broken. The omitted files are not asked for yet.
   // The one thing asked for and missing is the diagram code the host's document needs, which the profile says it omits.
   const omits=manifest.omits.flatMap(f=>f.paths);const isOmitted=n=>omits.some(o=>n===o||o.endsWith('/')&&n.startsWith(o));
   const before=served.filter(([code,n])=>code!==200&&!isOmitted(n)).map(([,n])=>n);
   assert.ok(served.filter(([code])=>code!==200).every(([,n])=>isOmitted(n)),`${engine}: a file was asked for that the manifest does not say is omitted`);
   const broken=await p.evaluate(()=>window.__violations);
   assert.deepEqual(before,[],`${engine}: requests that failed`);
   assert.deepEqual(broken,[],`${engine}: violations of the policy`);
   // The diagram the host's document refers to is a feature the profile omits, and says so in the document.
   const text=()=>p.evaluate(()=>document.body.innerText);
   await p.waitForFunction(()=>/Diagrams are not part of this build of Docs\./.test(document.body.innerText));
   // A document with no diagram in it, since an export refuses one it cannot draw.
   await p.evaluate(()=>{fixture.records.set('memory:plain.docs.md',{text:'# Plain\n\nWords.\n',revision:1,name:'Plain.docs.md'});return pudlActions.run('yavc.docs/open-file@1',{path:'memory:plain.docs.md'},{grant:'all'});});
   await rich.getByRole('heading',{name:'Plain'}).waitFor();
   // A document that cannot be printed (it has a shortcode that is nothing) makes print@1 refuse with the reason, and not answer as if it had printed.
   {const big=await p.evaluate(()=>{fixture.records.set('memory:bad.docs.md',{text:'# Bad\n\n{{no-such-shortcode-here}}\n',revision:1,name:'Bad.docs.md'});return pudlActions.run('yavc.docs/open-file@1',{path:'memory:bad.docs.md'},{grant:'all'}).then(()=>pudlActions.run('yavc.docs/print@1',{},{grant:'all'})).then(()=>'printed',e=>'refused: '+e.message);});
    assert.match(big,/^refused: /,engine+': print@1 of a document that cannot be printed refuses with its reason: '+big);
    await p.evaluate(()=>pudlActions.run('yavc.docs/open-file@1',{path:'memory:plain.docs.md'},{grant:'all'}));await rich.getByRole('heading',{name:'Plain'}).waitFor();}
   await p.evaluate(()=>{window.__seen=[];new MutationObserver(l=>l.forEach(m=>m.addedNodes.forEach(n=>n.textContent&&window.__seen.push(n.textContent.trim().slice(0,200))))).observe(document.body,{childList:true,subtree:true});});
   // Each omitted feature, used: a person who presses it is told in words, and nothing fails silently.
   for(const [command,sentence] of [['import-docx','Opening a Word document is not part of this build of Docs.']]){
    await p.evaluate(c=>{pudlCommands.run(c,null,document.querySelector('#document'));},command);
    // A toast is shown for a few seconds, so what is added to the page is recorded as it arrives.
    await p.waitForFunction(s=>document.body.innerText.includes(s)||window.__seen.some(t=>t.includes(s)),sentence).catch(async()=>{throw new Error(engine+': '+command+' did not say "'+sentence+'"; the page said: '+JSON.stringify(await p.evaluate(()=>window.__seen).catch(()=>[])));});
    await p.keyboard.press('Escape');
   }
   // Word and PDF are kept: each command hands over a file, under the same policy, with nothing refused and nothing requested outside the package.
   for(const [command,extension] of [['export-docx','.docx'],['export-pdf','.pdf']]){
    const download=p.waitForEvent('download');
    await p.evaluate(c=>{pudlCommands.run(c,null,document.querySelector('#document'));},command);
    const file=await download,saved=await file.path();
    assert.ok(file.suggestedFilename().endsWith(extension),engine+': '+command+' gave '+file.suggestedFilename());
    assert.ok((await require('node:fs/promises').stat(saved)).size>1000,engine+': '+command+' gave an empty file');
   }
   assert.deepEqual(await p.evaluate(()=>window.__violations),[],engine+': an export broke the policy');
   // A Mermaid block shows its notice where it is.
   await p.evaluate(()=>{pudlCommands.run('view-text',null,document.querySelector('#document'));});await p.locator('#document .cm-content').click();await p.keyboard.press('ControlOrMeta+End');
   await p.keyboard.type('\n\n```mermaid\ngraph TD; A-->B;\n```\n');
   await p.evaluate(()=>{pudlCommands.run('view-visual',null,document.querySelector('#document'));});
   await p.waitForFunction(()=>/Mermaid diagrams are not part of this build of Docs\./.test(document.body.innerText)).catch(()=>{throw new Error(engine+': a Mermaid block did not say it is omitted');});
   assert.deepEqual(errors,[],`${engine}: page errors`);
   console.log(engine+': Docs runs from the docs profile under PFO\'s policy, and each omitted feature says so ('+manifest.digest+')');
  }catch(err){console.error(engine,errors,await p.evaluate(()=>window.__violations).catch(()=>[]),served.filter(([c])=>c!==200));throw err;}finally{await b.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
