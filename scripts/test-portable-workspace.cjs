// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/',out=path.join(os.tmpdir(),'yavc-portable-workspace-evidence');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(['manifest.json']);assert.equal(crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex'),manifest.digest);
 for(const item of manifest.files){assert.ok(!path.isAbsolute(item.path)&&!item.path.split('/').includes('..'));allowed.add(item.path);assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(artifact,item.path))).digest('hex'),item.sha256);}
 await fs.mkdir(out,{recursive:true});const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");if(name==='content/diagram-kit/worker.js')res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'");res.end(await fs.readFile(path.join(artifact,name)));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const b=await pw[engine].launch({headless:true}),p=await b.newPage({viewport:{width:1500,height:1600}}),errors=[],bad=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith(prefix))bad.push(r.url());});p.setDefaultTimeout(25000);
  try{await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`);await p.locator('#source .cm-content').waitFor({state:'attached'});await p.locator('#document .ProseMirror').waitFor();await p.locator('#deck .deck-canvas').waitFor();
   assert.deepEqual(await p.evaluate(()=>[typeof pcSiteFs,typeof pcConfig,typeof pcSnapshot,localStorage.length,sessionStorage.length]),['undefined','undefined','undefined',0,0]);
   
   const source=p.locator('#source .cm-content');await source.click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('\nChanged source.');await p.evaluate(()=>pudlCommands.run('save',null,document.querySelector('#source')));assert.match(await p.evaluate(()=>fixture.records.get('memory:source.md').text),/Changed source/);
   const rich=p.locator('#document .ProseMirror');await rich.locator('p').filter({hasText:'Editable words.'}).click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type(' Changed document.');await p.evaluate(()=>pudlCommands.run('save',null,document.querySelector('#document')));assert.match(await p.evaluate(()=>fixture.records.get('memory:document.docs.md').text),/Changed document/);assert.doesNotMatch(await p.evaluate(()=>fixture.records.get('memory:source.md').text),/Changed document/);
   // The Editor is a text editor: it has no view to choose, a page view is refused with a pointer to Docs, and a Markdown document opens in Docs.
   assert.deepEqual(await p.evaluate(()=>['view-text','view-visual','view-split','view-preview','md-default','view-mode'].map(id=>{const c=pudlCommands.find(id,document.querySelector('#source'));return !c||!!pudlCommands.value(c,'hidden');})),[true,true,true,true,true,true]);
   assert.equal(await p.evaluate(()=>!!pudlCommands.value(pudlCommands.find('view-visual',document.querySelector('#document')),'hidden')),false);
   assert.match(await p.evaluate(()=>pudlActions.run('yavc.editor/view@1',{mode:'text'},{grant:'all'}).then(r=>r.mode)),/text/);
   assert.equal(await p.locator('#source .ProseMirror').count(),0);
   assert.match(await p.evaluate(()=>pudlActions.run('yavc.editor/open-file@1',{path:'memory:other.md'},{grant:'all'}).then(()=>'opened',e=>e.message)),/A Markdown document opens in Docs\. Use yavc\.docs\/open-file@1 for memory:other\.md/);
   // A Markdown file the person chooses in the Editor is handed to the host for Docs. Where the host cannot open it there, it opens in the Editor as text. A deck's text stays in the Editor.
   await p.evaluate(()=>{fixture.records.set('memory:other.md',{text:'# Other\n\nWords.\n',revision:1,name:'Other.md'});fixture.records.set('memory:talk.slides.md',{text:'# Talk\n',revision:1,name:'Talk.slides.md'});fixture.handed=[];fixture.docsTakes=true;fixture.chosen='memory:other.md';
     pudlHost.fs.open=async function(){return {path:fixture.chosen};};pudlHost.fileResolution={version:1,open:async function(request){fixture.handed.push(request);if(!fixture.docsTakes)throw new Error('Docs is not here.');}};});
   const editorTabs=()=>p.evaluate(()=>pudlActions.run('yavc.editor/documents@1',{},{grant:'all'}).then(r=>r.documents.map(d=>d.path)));
   const tabsBefore=await editorTabs();
   await p.evaluate(()=>pudlCommands.run('open',null,document.querySelector('#source')));
   assert.deepEqual(await p.evaluate(()=>fixture.handed),[{resource:'memory:other.md',applet:'docs'}]);assert.deepEqual(await editorTabs(),tabsBefore);
   await p.evaluate(()=>{fixture.chosen='memory:talk.slides.md';return pudlCommands.run('open',null,document.querySelector('#source'));});
   assert.equal(await p.evaluate(()=>fixture.handed.length),1);assert.ok((await editorTabs()).includes('memory:talk.slides.md'));
   await p.evaluate(()=>{fixture.docsTakes=false;fixture.chosen='memory:other.md';return pudlCommands.run('open',null,document.querySelector('#source'));});
   assert.equal(await p.evaluate(()=>fixture.handed.length),2);assert.ok((await editorTabs()).includes('memory:other.md'));assert.equal(await p.locator('#source .ProseMirror').count(),0);
   await p.evaluate(async()=>{delete pudlHost.fs.open;delete pudlHost.fileResolution;for(const path of ['memory:other.md','memory:talk.slides.md']){const list=(await pudlActions.run('yavc.editor/documents@1',{},{grant:'all'})).documents,at=list.findIndex(d=>d.path===path);if(at>=0)await pudlActions.run('yavc.editor/close@1',{index:at+1},{grant:'all'});}});
   assert.deepEqual(await editorTabs(),tabsBefore);
   // A command of the host's own in File: there for the documents the host says, unavailable with the host's reason, and run by the host.
   const hostCommand=mount=>p.evaluate(mount=>{const c=pudlCommands.find('host-publish',document.querySelector(mount));return c?{label:c.label,shortcut:pudlCommands.value(c,'shortcut'),hidden:!!pudlCommands.value(c,'hidden'),disabled:!!pudlCommands.value(c,'disabled'),reason:pudlCommands.value(c,'reason')||null}:null;},mount);
   assert.deepEqual(await hostCommand('#document'),{label:'Publish…',shortcut:'Mod+Shift+U',hidden:false,disabled:true,reason:'There are no changes to publish.'});
   assert.equal((await hostCommand('#source')).hidden,true);
   assert.equal(await p.evaluate(()=>['host-Not An Id','host-unlabelled'].some(id=>pudlCommands.find(id,document.querySelector('#document')))),false);
   assert.equal(await p.evaluate(()=>pudlCommands.run('host-publish',null,document.querySelector('#document')).then(()=>'ran',e=>e.message)),'There are no changes to publish.');assert.deepEqual(await p.evaluate(()=>fixture.published),[]);
   await p.evaluate(()=>fixture.publishChanged(true));
   assert.equal((await hostCommand('#document')).disabled,false);assert.equal((await hostCommand('#source')).hidden,false);
   await rich.locator('p').filter({hasText:'Editable words.'}).click();await p.keyboard.press('End');await p.keyboard.type(' Unsaved.');
   await p.evaluate(()=>pudlCommands.run('host-publish',null,document.querySelector('#document')));
   assert.deepEqual(await p.evaluate(()=>fixture.published),[{id:'publish',resource:'memory:document.docs.md',name:'Document.docs.md',modified:true,application:'docs',rooted:true}]);
   assert.match((await p.evaluate(()=>pudlActions.run('yavc.docs/document@1',{}, {grant:'all'}))).text,/Unsaved\./);
   await p.evaluate(()=>{fixture.publishFails=true;return pudlCommands.run('host-publish',null,document.querySelector('#document'));});
   await p.locator('.toast-region',{hasText:'The page could not be published.'}).waitFor();
   await p.evaluate(()=>{fixture.publishFails=false;return pudlCommands.run('save',null,document.querySelector('#document'));});
   // A host command that stands in place of Save (docs/document-commands-contract.md): the Save command is the host's for that document alone, and the applet writes nothing.
   const saveRow=mount=>p.evaluate(mount=>{const c=pudlCommands.find('save',document.querySelector(mount));return {label:pudlCommands.value(c,'label'),glyph:pudlCommands.value(c,'glyph'),disabled:!!pudlCommands.value(c,'disabled'),reason:pudlCommands.value(c,'reason')||null};},mount);
   assert.deepEqual([(await saveRow('#document')).label,(await saveRow('#document')).glyph],['Save','yavc-save']);
   await p.evaluate(()=>fixture.releaseChanged(true,'Nothing has changed since the last release.'));
   assert.deepEqual(await saveRow('#document'),{label:'Release…',glyph:'upload',disabled:true,reason:'Nothing has changed since the last release.'});
   assert.equal((await saveRow('#source')).label,'Save');
   // This lab draws no toolbar for Docs, so a button for the command stands where the host's toolbar would draw one.
   await p.evaluate(()=>{const b=document.createElement('button');b.type='button';b.id='save-probe';b.setAttribute('data-command','save');document.querySelector('#document').appendChild(b);pudlCommands.changed();});
   await p.waitForFunction(()=>{const b=document.querySelector('#save-probe');return b.textContent.trim()==='Release'&&b.disabled&&b.title==='Release…: Nothing has changed since the last release.'&&b.querySelector('.glyph').style.getPropertyValue('--glyph')==='var(--glyph-upload)';});
   await p.evaluate(()=>fixture.releaseChanged(true));assert.equal((await saveRow('#document')).disabled,false);
   await rich.locator('p').filter({hasText:'Editable words.'}).click();await p.keyboard.press('End');await p.keyboard.type(' Draft only.');
   const writesBefore=await p.evaluate(()=>fixture.writes.length);
   await p.evaluate(()=>pudlCommands.run('save',null,document.querySelector('#document')));
   await p.keyboard.press('ControlOrMeta+s');await p.waitForFunction(()=>fixture.released.length===2);
   await p.keyboard.press('ControlOrMeta+Shift+l');await p.waitForFunction(()=>fixture.released.length===3);
   assert.deepEqual(await p.evaluate(()=>fixture.released[0]),{resource:'memory:document.docs.md',modified:true});
   assert.equal(await p.evaluate(()=>fixture.writes.length),writesBefore);assert.doesNotMatch(await p.evaluate(()=>fixture.records.get('memory:document.docs.md').text),/Draft only/);
   await p.evaluate(()=>fixture.releaseChanged(false));assert.equal((await saveRow('#document')).label,'Save');await p.waitForFunction(()=>document.querySelector('#save-probe').textContent.trim()==='Save');await p.evaluate(()=>document.querySelector('#save-probe').remove());
   await p.evaluate(()=>pudlCommands.run('save',null,document.querySelector('#document')));assert.match(await p.evaluate(()=>fixture.records.get('memory:document.docs.md').text),/Draft only/);assert.equal(await p.evaluate(()=>fixture.released.length),3);
   // A host command in Review that needs the selection: unavailable without one, and given the selection as a range of the document's text.
   const request=mount=>p.evaluate(mount=>{const c=pudlCommands.find('host-request-change',document.querySelector(mount));return {hidden:!!pudlCommands.value(c,'hidden'),disabled:!!pudlCommands.value(c,'disabled'),reason:pudlCommands.value(c,'reason')||null};},mount);
   const ask=mount=>p.evaluate(mount=>pudlCommands.run('host-request-change',null,document.querySelector(mount)),mount);
   await p.evaluate(()=>{const view=CM.EditorView.findFromDOM(document.querySelector('#source .cm-editor'));view.dispatch({selection:{anchor:0}});});
   assert.deepEqual(await request('#source'),{hidden:false,disabled:true,reason:'Select the passage to change first.'});
   const sourceText=await p.evaluate(()=>{const view=CM.EditorView.findFromDOM(document.querySelector('#source .cm-editor')),text=view.state.doc.toString(),at=text.indexOf('Retained');view.dispatch({selection:{anchor:at,head:at+8}});return text;});
   assert.equal((await request('#source')).disabled,false);await ask('#source');
   assert.deepEqual(await p.evaluate(()=>fixture.requested.pop()),{resource:'memory:source.md',selected:true,selection:{text:'Retained',start:sourceText.indexOf('Retained'),end:sourceText.indexOf('Retained')+8}});
   // On the page, the selection is the range of the text it maps to.
   await rich.locator('p').filter({hasText:'Editable words.'}).click();await p.keyboard.press('Home');await p.keyboard.press('Shift+End');
   await p.waitForFunction(()=>!pudlCommands.value(pudlCommands.find('host-request-change',document.querySelector('#document')),'disabled'));await ask('#document');
   const documentText=(await p.evaluate(()=>pudlActions.run('yavc.docs/document@1',{}, {grant:'all'}))).text,mapped=await p.evaluate(()=>fixture.requested.pop());
   assert.match(mapped.selection.text,/^Editable words\..* Unsaved\. Draft only\.$/);assert.equal(documentText.slice(mapped.selection.start,mapped.selection.end),mapped.selection.text);
   // It is offered where a person right-clicks the selection, and it stands in Review.
   await rich.locator('p').filter({hasText:'Editable words.'}).click({button:'right'});
   await p.getByRole('menuitem',{name:'Request a Change…'}).waitFor();await p.keyboard.press('Escape');
   // Edit Diagram: a diagram drawn from a file opens in the application that edits it, by a right-click on it, from its form and from the Format menu's command.
   // No Diagrams is on this page, so until something handles PUDL's diagram verb the command is not offered at all.
   const drawnDiagram=p.locator('#document .ProseMirror [data-diagram-src]');await drawnDiagram.locator('img').waitFor();
   assert.equal(await p.evaluate(()=>!!pudlCommands.value(pudlCommands.find('edit-diagram',document.querySelector('#document')),'hidden')),true);
   await p.evaluate(()=>{fixture.diagramRequests=[];const can=pudlApplets.can,request=pudlApplets.request;pudlApplets.can=function(verb,kind){return verb==='diagram'||can(verb,kind);};pudlApplets.request=function(verb,req,from){if(verb!=='diagram')return request(verb,req,from);fixture.diagramRequests.push({path:req.path,from:from&&from.id});return true;};pudlCommands.changed();});
   await drawnDiagram.locator('img').click({button:'right'});await p.getByRole('menuitem',{name:'Edit Diagram'}).click();
   assert.deepEqual(await p.evaluate(()=>fixture.diagramRequests),[{path:'~/portable/plan.canvas',from:'document'}]);
   await drawnDiagram.locator('img').click();let diagramForm=p.getByRole('dialog',{name:'Change the Diagram from a File',exact:true});await diagramForm.getByRole('button',{name:'Edit Diagram',exact:true}).waitFor();if(process.env.YAVC_SHOTS)await diagramForm.screenshot({path:process.env.YAVC_SHOTS+'-diagram-form.png'});
   // Browse writes a chosen file from the document's folder where the two share a folder, so the reference goes with the document.
   assert.deepEqual(await p.evaluate(()=>[['~/portable/mockups/plan.canvas','~/portable'],['~/shared/codes.md','~/portable/notes'],['/workspaces/W/Files/shared/codes.md','/workspaces/W/Files/notes'],['~/Pictures/shot.png','~/portable'],['/other/x.png','~/portable'],['~/portable/plan.canvas',''],['~/portable/a.md','~/portable']].map(pair=>yavcDialog.referenceFrom(pair[0],pair[1]))),['mockups/plan.canvas','~/shared/codes.md','../shared/codes.md','~/Pictures/shot.png','/other/x.png','~/portable/plan.canvas','a.md']);
   await p.evaluate(()=>{pudlHost.fileFields={version:1,choose:async function(request){fixture.chooseRequest={kind:request.kind,accept:request.accept};return '~/portable/mockups/next.canvas';}};});await diagramForm.getByRole('button',{name:'Cancel',exact:true}).click();await diagramForm.waitFor({state:'detached'});
   await drawnDiagram.locator('img').click();diagramForm=p.getByRole('dialog',{name:'Change the Diagram from a File',exact:true});await diagramForm.getByRole('button',{name:'Browse…',exact:true}).click();
   await p.waitForFunction(()=>document.querySelector('dialog[open] [data-key="src"]').value==='mockups/next.canvas');await p.evaluate(()=>{delete pudlHost.fileFields;});await diagramForm.getByRole('button',{name:'Edit Diagram',exact:true}).click();await diagramForm.waitFor({state:'detached'});
   assert.equal(await p.evaluate(()=>fixture.diagramRequests.length),2);assert.match((await p.evaluate(()=>pudlActions.run('yavc.docs/document@1',{}, {grant:'all'}))).text,/\{\{diagram:plan\.canvas alt="Portable reference"\}\}/);
   await p.evaluate(()=>pudlCommands.run('view-text',null,document.querySelector('#document')));
   await p.evaluate(()=>{const view=CM.EditorView.findFromDOM(document.querySelector('#document .cm-editor')),at=view.state.doc.toString().indexOf('{{diagram:');view.dispatch({selection:{anchor:0}});fixture.offDiagram=!!pudlCommands.value(pudlCommands.find('edit-diagram',document.querySelector('#document')),'disabled');view.dispatch({selection:{anchor:at+4}});});
   assert.equal(await p.evaluate(()=>fixture.offDiagram),true);await p.evaluate(()=>pudlCommands.run('edit-diagram',null,document.querySelector('#document')));
   assert.deepEqual(await p.evaluate(()=>fixture.diagramRequests[2]),{path:'~/portable/plan.canvas',from:'document'});
   // The packaged engine gives a document with its own shortcodes replaced, for a destination that knows only the built-in ones.
   const expanded=await p.evaluate(async()=>(await yavcMdEngine()).expand({text:'{{define:greet}}\n{{param:who default="you"}}\nHello, {{arg:who}}.\n{{/define}}\n\n{{greet:who=Sam}} {{status:green Done}}\n\n{{raw}}\n<p>{{greet}}</p>\n{{/raw}}\n\n{{missing-arg}}\n',shared:'{{define:missing-arg}}\n{{param:x}}\n{{arg:y}}\n{{/define}}\n',hosts:[{name:'raw',kind:'container',literal:true}]}));
   assert.equal(expanded.text,'\nHello, Sam. {{status:green Done}}\n\n{{raw}}\n<p>{{greet}}</p>\n{{/raw}}\n\n{{missing-arg}}\n');assert.equal(expanded.problems.length,1);assert.equal(expanded.problems[0].name,'missing-arg');
   // A host that opens files itself is asked first, and PUDL is asked only when the host does not take the request.
   await p.evaluate(()=>{fixture.hostOpened=[];fixture.hostTakes=true;pudlHost.contentWorkspace.openDiagram=function(path,context){fixture.hostOpened.push({path:path,rooted:context.host instanceof Element,document:context.document});return fixture.hostTakes;};});
   await p.evaluate(()=>pudlCommands.run('edit-diagram',null,document.querySelector('#document')));
   assert.deepEqual(await p.evaluate(()=>[fixture.hostOpened,fixture.diagramRequests.length]),[[{path:'~/portable/plan.canvas',rooted:true,document:'memory:document.docs.md'}],3]);
   await p.evaluate(()=>{fixture.hostTakes=false;return pudlCommands.run('edit-diagram',null,document.querySelector('#document'));});
   assert.deepEqual(await p.evaluate(()=>[fixture.hostOpened.length,fixture.diagramRequests.length]),[2,4]);await p.evaluate(()=>{delete pudlHost.contentWorkspace.openDiagram;});
   await p.evaluate(()=>pudlCommands.run('view-visual',null,document.querySelector('#document')));await rich.waitFor();
   // A shared definitions file in a host whose folders are not under the home folder: the host says where the reference is, the file is read through the host, and a missing file leaves the page drawn with the use as written.
   const beforeShared=(await p.evaluate(()=>pudlActions.run('yavc.docs/document@1',{}, {grant:'all'}))).text;
   await p.evaluate(()=>{fixture.resolved=[];pudlHost.contentWorkspace.resolvePath=function(request){fixture.resolved.push(request);return request.kind==='shortcodes'?'/workspaces/Shared/Files/codes.md':null;};});
   await p.evaluate(()=>pudlActions.run('yavc.docs/set-text@1',{text:'---\nshortcodes: ../shared/codes.md\n---\n# Shared\n\nMade by {{brand}} today.\n'},{grant:'all'}));
   await p.locator('.toast-region',{hasText:'The shared shortcode file was not found: ../shared/codes.md'}).waitFor();await rich.locator('h1',{hasText:'Shared'}).waitFor();
   assert.deepEqual(await p.evaluate(()=>fixture.resolved.find(r=>r.kind==='shortcodes')),{resource:'memory:document.docs.md',reference:'../shared/codes.md',kind:'shortcodes'});
   await p.evaluate(()=>{fixture.records.set('/workspaces/Shared/Files/codes.md',{text:'{{define:brand}}\nACME Retail\n{{/define}}\n',revision:1,name:'codes.md'});});
   await p.evaluate(()=>pudlActions.run('yavc.docs/set-text@1',{text:'---\nshortcodes: ../shared/codes.md\n---\n# Shared\n\nMade by {{brand}} today, again.\n'},{grant:'all'}));
   await rich.getByText('ACME Retail').waitFor();
   await p.evaluate(text=>{delete pudlHost.contentWorkspace.resolvePath;return pudlActions.run('yavc.docs/set-text@1',{text:text},{grant:'all'});},beforeShared);await rich.locator('p').filter({hasText:'Editable words.'}).waitFor();
   assert.deepEqual(await p.evaluate(()=>pudlActions.problems()),[]);assert.match((await p.evaluate(()=>pudlActions.run('yavc.docs/document@1',{}, {grant:'all'}))).text,/Changed document/);
   // A deck asks the host where each file it refers to is, as a document does: a shared definitions file, a stylesheet and a diagram, each by its kind and as written. Where the host says null, or offers no such service, the deck's own folder rule applies.
   await p.evaluate(()=>{fixture.resolved=[];fixture.read=[];const read=pudlHost.fs.readText;fixture.restoreRead=()=>{pudlHost.fs.readText=read;};pudlHost.fs.readText=function(path){fixture.read.push(path);return read.apply(this,arguments);};
    fixture.records.set('/workspaces/Shared/Files/codes.md',{text:'{{define:brand}}\nACME Retail\n{{/define}}\n',revision:1,name:'codes.md'});fixture.records.set('/workspaces/Shared/Files/deck.css',{text:'.stand-in { color: red; }\n',revision:1,name:'deck.css'});
    fixture.records.set('/workspaces/Shared/Files/plan.canvas',{text:JSON.stringify({nodes:[{id:'a',type:'text',x:0,y:0,width:200,height:80,text:'Shared plan'}],edges:[]}),revision:1,name:'plan.canvas'});
    pudlHost.contentWorkspace.resolvePath=function(request){fixture.resolved.push(request);return {shortcodes:'/workspaces/Shared/Files/codes.md',stylesheet:'/workspaces/Shared/Files/deck.css',diagram:'/workspaces/Shared/Files/plan.canvas'}[request.kind]||null;};});
   await p.evaluate(()=>pudlActions.run('yavc.slides/set-deck@1',{stylesheet:'../shared/deck.css',properties:{shortcodes:'../shared/codes.md'}},{grant:'all'}));
   await p.evaluate(()=>pudlActions.run('yavc.slides/set-text@1',{index:1,text:'# Slide one\n\nMade by {{brand}}.\n\n{{diagram:../shared/plan.canvas}}\n'},{grant:'all'}));
   await p.locator('#deck .deck-canvas',{hasText:'ACME Retail'}).waitFor();
   await p.waitForFunction(()=>fixture.read.includes('/workspaces/Shared/Files/deck.css')&&fixture.read.includes('/workspaces/Shared/Files/plan.canvas')&&fixture.read.includes('/workspaces/Shared/Files/codes.md'));
   const asked=await p.evaluate(()=>fixture.resolved.filter(r=>r.resource==='memory:deck.slides.md').map(r=>r.kind+':'+r.reference));
   for(const want of ['shortcodes:../shared/codes.md','stylesheet:../shared/deck.css','diagram:../shared/plan.canvas'])assert.ok(asked.includes(want),want+' was not asked for: '+asked.join(', '));
   // The host says null, so the deck's own rule reads an absolute path as written.
   await p.evaluate(()=>pudlActions.run('yavc.slides/set-deck@1',{stylesheet:'',properties:{shortcodes:''}},{grant:'all'}));
   await p.evaluate(()=>{fixture.read=[];fixture.resolved=[];pudlHost.contentWorkspace.resolvePath=function(request){fixture.resolved.push(request);return null;};});
   await p.evaluate(()=>pudlActions.run('yavc.slides/set-text@1',{index:1,text:'# Slide one\n\nA drawing.\n\n{{diagram:~/portable/plan.canvas}}\n'},{grant:'all'}));
   await p.waitForFunction(()=>fixture.read.includes('~/portable/plan.canvas'));
   assert.ok(await p.evaluate(()=>fixture.resolved.some(r=>r.kind==='diagram'&&r.reference==='~/portable/plan.canvas'&&r.resource==='memory:deck.slides.md')));
   await p.evaluate(()=>{delete pudlHost.contentWorkspace.resolvePath;fixture.restoreRead();return pudlActions.run('yavc.slides/set-text@1',{index:1,text:'# Slide one\n\nFirst.\n'},{grant:'all'});});
   assert.deepEqual(await p.evaluate(()=>pudlActions.problems()),[]);
   await p.evaluate(()=>{fixture.reviewPromise=pudlCommands.run('review-changes',null,document.querySelector('#document'));});const review=p.getByRole('dialog',{name:'Review Changes',exact:true});await review.waitFor();assert.equal(await p.evaluate(()=>typeof pudlListbox.refresh),'function');await review.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>fixture.reviewPromise);
   const sourceFont=await source.evaluate(el=>getComputedStyle(el).fontFamily);await p.evaluate(()=>{pudlCommands.run('document-theme',null,document.querySelector('#document'));});let dialog=p.getByRole('dialog',{name:'Document Theme',exact:true});await dialog.getByLabel('Theme',{exact:true}).selectOption('manuscript');await p.waitForFunction(()=>!document.querySelector('.md-gallery-sample[aria-busy]'));await dialog.getByRole('button',{name:'Apply',exact:true}).click();await p.waitForFunction(()=>getComputedStyle(document.querySelector('#document .ProseMirror')).fontSize==='16px');assert.equal(await source.evaluate(el=>getComputedStyle(el).fontFamily),sourceFont);await p.evaluate(()=>pudlCommands.run('save',null,document.querySelector('#document')));assert.match(await p.evaluate(()=>fixture.records.get('memory:document.docs.md').text),/theme: manuscript/);
   await p.locator('#document [data-diagram-src] img').waitFor();assert.ok(decodeURIComponent(await p.locator('#document [data-diagram-src] img').getAttribute('src')).includes('Independent'));const retained=await p.evaluate(()=>fixture.records.get('memory:document.docs.md').text);await p.evaluate(()=>fixture.updateDiagram('Host update'));await p.waitForFunction(()=>decodeURIComponent(document.querySelector('#document [data-diagram-src] img')?.src||'').includes('Host update'));assert.equal(await p.evaluate(()=>fixture.records.get('memory:document.docs.md').text),retained);await p.evaluate(()=>{pudlCommands.run('new-template',null,document.querySelector('#document'));});dialog=p.getByRole('dialog',{name:'New from Template',exact:true});await dialog.getByLabel('Template',{exact:true}).selectOption('report');await p.waitForFunction(()=>!document.querySelector('.md-gallery-sample[aria-busy]'));await dialog.getByRole('button',{name:'Create',exact:true}).click();await p.locator('#document .ProseMirror h1').filter({hasText:'Report'}).waitFor();assert.equal(await p.evaluate(()=>fixture.records.get('memory:document.docs.md').text),retained);
   await source.evaluate(el=>{const view=CM.EditorView.findFromDOM(el.closest('.cm-editor'));view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'{{'},selection:{anchor:2}});view.focus();CM.startCompletion(view);});await p.locator('.cm-tooltip-autocomplete').waitFor();const completion=await source.evaluate(el=>CM.currentCompletions(CM.EditorView.findFromDOM(el.closest('.cm-editor')).state).map(c=>({label:c.label,detail:c.detail,apply:c.apply})));assert.ok(completion.some(c=>c.label==='figure'&&c.detail==='Figure'&&c.apply==='figure:'));assert.ok(completion.some(c=>c.label==='host-example'));assert.ok(!completion.some(c=>c.label.includes('<')||c.label==='too-long'||c.label==='empty-title'));await p.keyboard.press('Escape');
   const imported=await p.evaluate(async()=>{
    const K=yavcMdEditor;await K.loadScript(K.here+'vendor/mammoth-1.13.0/office.js');await K.loadScript(K.here+'import-word.js');
    const zip=new yavcOfficeLibraries.JSZip(),word='http://schemas.openxmlformats.org/wordprocessingml/2006/main',rels='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="'+rels+'/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml','<w:document xmlns:w="'+word+'"><w:body><w:p><w:r><w:t>Offline Word import.</w:t></w:r></w:p></w:body></w:document>');
    return yavcWordImport.docx(await zip.generateAsync({type:'arraybuffer'}),{kit:K});
   });assert.equal(imported.text,'Offline Word import.\n');
   assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);await p.screenshot({path:path.join(out,engine+'-portable.png')});console.log(engine+': extracted Editor, Docs and Slides load without site globals/storage; isolated writes, diagram updates, shortcode catalog and offline Word import passed ('+manifest.digest+')');
  }catch(err){console.error(engine,await p.locator('body').innerText(),errors,bad,await p.evaluate(()=>pudlApplets.problems()));throw err;}finally{await b.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
