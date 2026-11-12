// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Pictures, text faces, outlines and named styles in a canvas (docs/canvas-extension.md;
// DESIGN.md, decision 122), run against a built content package in an independent host:
//   node scripts/test-canvas-pictures.cjs <artifact> [chromium firefox webkit]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/independent/content-release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
// Neutral stand-ins: a house drawn in black, and one black pixel.
const house='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 11 12 3l9 8v10H3z" fill="#000000"/></svg>';
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==','base64');
const served={'home.svg':Buffer.from(house),'plain.svg':Buffer.from(house),'moved.svg':Buffer.from(house),'logo.png':pixel,'fake.png':Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'large.svg':Buffer.from(house+' '.repeat(1024*1024))};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path)),addon=await fs.readFile(path.join(__dirname,'fixtures/canvas-pictures.js'),'utf8');
 const requests=[];
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");
  if(name.startsWith('fixture-pictures/')){const picture=served[name.slice(17)];requests.push(name.slice(17));if(!picture)return res.writeHead(404).end();res.setHeader('Content-Type',types[path.extname(name)]);return res.end(picture);}
  if(!allowed.has(name))return res.writeHead(404).end();let body=await fs.readFile(path.join(artifact,name));if(name==='workspace-lab/host.js'||name==='lab/host.js')body=Buffer.from(body+'\n'+addon);
  if(name==='content/diagram-kit/worker.js')res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'");
  res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(body);}catch(e){res.writeHead(500).end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}${prefix}`;
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),context=await browser.newContext({viewport:{width:1500,height:1100},acceptDownloads:true}),errors=[],outside=[];requests.length=0;
  const p=await context.newPage();p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.stack||e.message));p.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))outside.push(r.url());});
  const run=(name,input)=>p.evaluate(({name,input})=>pudlActions.run('yavc.diagrams/'+name+'@1',input,{grant:'all'}),{name,input});
  const source=()=>p.evaluate(()=>pudlActions.run('yavc.diagrams/diagram@1',{index:1},{grant:'all'}).then(d=>JSON.parse(d.text)));
  await p.addInitScript(()=>{window.fixtureFocuses=0;window.addEventListener('focus',()=>{window.fixtureFocuses++;});});
  let phase='the drawing';
  try{
   await p.goto(base+'lab/index.html');await p.evaluate(()=>document.querySelector('#one').remove());
   const two=p.locator('#two'),drawing=two.locator('.dg-canvas svg');
   await drawing.locator('image').nth(2).waitFor({state:'attached'});
   // The host was asked for each picture by the path the file has, with the canvas as the document that owns it.
   const asked=await p.evaluate(()=>fixture.pictures.asked);
   assert.deepEqual(asked.map(a=>a.href).sort(),['icons/fake.png','icons/home.svg','icons/large.svg','icons/logo.png','icons/missing.svg','icons/outside.svg','icons/plain.svg']);
   assert.ok(asked.every(a=>a.resource==='memory:second.canvas'&&a.kind==='image'));
   // Three pictures are drawn, as image data and never as markup or an address.
   const images=await drawing.locator('image').evaluateAll(list=>list.map(i=>({node:i.parentNode.getAttribute('data-node'),href:i.getAttribute('href').split(',')[0],filter:i.getAttribute('filter'),ratio:i.getAttribute('preserveAspectRatio'),framed:!!i.parentNode.querySelector('rect')})));
   assert.deepEqual(images.map(i=>[i.node,i.href,i.ratio,i.framed]),[['home','data:image/svg+xml;base64','xMidYMid meet',false],['plain','data:image/svg+xml;base64','xMidYMid meet',false],['logo','data:image/png;base64','none',true]]);
   assert.equal(await drawing.locator('script, [onload], use').count(),0);
   assert.match(images[0].filter,/^url\(#yc\d+t0\)$/);assert.equal(images[1].filter,null);
   assert.equal(await drawing.locator('filter'+images[0].filter.slice(4,-1)+' feFlood[flood-color="#ffffff"]').count(),1);
   // A file of the wrong kind, a missing one, one too large and an address outside the application are each the named box, and the person is told.
   for(const id of ['fake','missing','large','outside']){assert.equal(await drawing.locator('[data-node="'+id+'"] image').count(),0,id);assert.equal(await drawing.locator('[data-node="'+id+'"] rect').count(),1,id);}
   await two.locator('.notice',{hasText:/is shown by its name, because .* 3 more could not be read\./}).waitFor();
   assert.deepEqual(outside,[]);
   phase='the text';
   // The text is drawn in the face the node and its style give it, and the hard break is one line break.
   const text=two.locator('.dg-canvas [data-text="key"] .dg-cv-text');await text.waitFor();
   const face=await text.evaluate(e=>{const s=getComputedStyle(e);return [s.fontSize,s.fontWeight,s.color,s.paddingTop,s.paddingLeft,s.textAlign,s.justifyContent,s.fontFamily.split(',')[0].replace(/"/g,'').trim(),e.querySelectorAll('br').length,e.querySelectorAll('p').length];});
   assert.deepEqual(face,['22px','500','rgb(255, 255, 255)','2px','2px','right','flex-end','Roboto',1,1]);
   assert.match(await two.locator('.dg-canvas [data-text="line"] .dg-cv-text').evaluate(e=>getComputedStyle(e).fontFamily),/^"?Georgia/);
   assert.deepEqual(await drawing.locator('[data-node="key"] > rect').evaluate(r=>[r.getAttribute('rx'),r.getAttribute('fill'),r.getAttribute('stroke')]),['6','#00a0e6','none']);
   assert.deepEqual(await drawing.locator('[data-node="line"] > path').evaluate(r=>[r.getAttribute('stroke'),r.getAttribute('fill')]),['#ff0000','none']);
   phase='the exported picture';
   // The exported SVG is whole by itself, and a browser draws its pictures: the tinted house is white on the key, and the plain one is black.
   const download=p.waitForEvent('download');await p.evaluate(()=>pudlCommands.run('export-svg',null,document.querySelector('#two')));
   const svg=await fs.readFile(await (await download).path(),'utf8');
   assert.ok(!/(?:href|src)="(?!data:image\/)/.test(svg)&&!svg.includes('foreignObject'));
   assert.match(svg,/<text[^>]* font-size="22" font-weight="500" font-family="&#39;Roboto&#39;, &#39;Arial&#39;, &#39;Georgia&#39;,/);
   const colours=await p.evaluate(async svg=>{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d');g.drawImage(img,0,0);
    const at=(x,y)=>Array.from(g.getImageData(x,y,1,1).data.slice(0,3));return {tinted:at(68,70),key:at(200,36),plain:at(348,54),beside:at(326,26)};},svg);
   assert.deepEqual(colours.tinted,[255,255,255]);assert.deepEqual(colours.key,[0,160,230]);assert.deepEqual(colours.plain,[0,0,0]);assert.notDeepEqual(colours.beside,[0,0,0]);
   phase='the inspector';
   await run('canvas-view',{op:'select',key:'key',kind:'node'});
   const inspector=two.locator('.dg-inspector');
   if(!await inspector.locator('[data-set="fontSize"]').count())await p.evaluate(()=>pudlCommands.run('toggle-inspector',null,document.querySelector('#two')));
   const size=inspector.locator('.number-field:has([data-set="fontSize"]) input:not([hidden])');await size.waitFor();
   assert.deepEqual(await inspector.evaluate(e=>['style','fontSize','fontWeight','fontFamily','padding','radius','outlineSides','textColor'].map(k=>{const f=e.querySelector('[data-set="'+k+'"]');return f?f.value:null;})),['key','22','','','2','','','']);
   assert.equal(await inspector.locator('[data-set="tint"], [data-set="fit"]').count(),0);
   // The font is chosen from a list that starts with the fonts the diagram uses, and any family can still be typed.
   const families=await inspector.locator('[data-set="fontFamily"]').evaluate(f=>f.list?Array.from(f.list.options).map(o=>o.value):null);
   assert.ok(families && families.includes('Georgia') && families.includes('Times New Roman') && new Set(families.map(f=>f.toLowerCase())).size===families.length,String(families));
   // The field for a shape's text is as tall as its text, to a limit, and then scrolls.
   const words=inspector.locator('textarea[data-set="text"]'),tall=lines=>words.evaluate((f,lines)=>{f.value=Array(lines).fill('A line of text').join('\n');f.dispatchEvent(new Event('input',{bubbles:true}));return [f.offsetHeight,f.scrollHeight<=f.clientHeight+1,getComputedStyle(f).overflowY];},lines);
   const kept=await words.inputValue(),few=await tall(2),more=await tall(8),most=await tall(60);
   assert.ok(few[1] && more[1] && more[0]>few[0],JSON.stringify([few,more]));assert.deepEqual(most,[240,false,'auto']);
   await words.evaluate((f,kept)=>{f.value=kept;f.dispatchEvent(new Event('input',{bubbles:true}));},kept);
   await size.fill('30');await size.press('Enter');
   await p.waitForFunction(()=>getComputedStyle(document.querySelector('#two .dg-canvas [data-text="key"] .dg-cv-text')).fontSize==='30px');
   const sides=inspector.locator('select[data-set="outlineSides"]');await sides.selectOption('top,bottom');
   await p.waitForFunction(()=>document.querySelector('#two .dg-canvas [data-node="key"] > path'));
   assert.deepEqual((await source()).nodes[0].yavc,{style:'key',fontSize:30,padding:2,outlineSides:['top','bottom']});
   // Padding for each side and a radius for each corner are groups of four fields under the single values, closed until opened.
   const group=name=>inspector.locator('[data-parts="'+name+'"]'),part=(name,i)=>group(name).locator('.number-field:has([data-index="'+i+'"]) input:not([hidden])');
   const groupState=async name=>group(name).evaluate(g=>({open:g.querySelector('.card-toggle').getAttribute('aria-expanded'),body:getComputedStyle(g.querySelector('.card-body')).display,summary:g.querySelector('.card-summary').textContent,sides:Array.from(g.querySelectorAll('input[data-part]')).map(i=>i.value),clear:g.querySelector('[data-parts-clear]').disabled}));
   assert.deepEqual(await groupState('paddingSides'),{open:'false',body:'none',summary:'Not set',sides:['','','',''],clear:true});
   assert.deepEqual(await groupState('radiusCorners'),{open:'false',body:'none',summary:'Not set',sides:['','','',''],clear:true});
   assert.deepEqual(await inspector.locator('[data-parts="paddingSides"] input[data-part]').evaluateAll(l=>l.map(i=>[i.min,i.max])),[['0','64'],['0','64'],['0','64'],['0','64']]);
   assert.deepEqual(await inspector.locator('[data-parts-clear]').evaluateAll(l=>l.map(b=>b.getAttribute('aria-label'))),['Clear Radius by Corner','Clear Padding by Side']);
   await group('paddingSides').locator('.card-toggle').click();await part('paddingSides',0).waitFor();
   // A side typed alone is set, and the others take the single Text Padding, which is 2.
   await part('paddingSides',0).fill('10');await part('paddingSides',0).press('Enter');
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent==='10, 2, 2, 2');
   assert.deepEqual((await source()).nodes[0].yavc.paddingSides,[10,2,2,2]);
   // The group stays open while the Inspector is drawn again, and each of the four fields is its own side.
   assert.equal((await groupState('paddingSides')).open,'true');
   await part('paddingSides',3).fill('30');await part('paddingSides',3).press('Enter');
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent==='10, 2, 2, 30');
   assert.deepEqual((await source()).nodes[0].yavc.paddingSides,[10,2,2,30]);
   assert.deepEqual(await two.locator('.dg-canvas [data-text="key"] .dg-cv-text').evaluate(e=>{const s=getComputedStyle(e);return [s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft];}),['10px','2px','2px','30px']);
   // A number outside the limit is refused at its field and nothing is written.
   await part('paddingSides',1).fill('64');await part('paddingSides',1).press('Enter');
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent==='10, 64, 2, 30');
   await group('paddingSides').locator('input[data-part][data-index="2"]').evaluate(i=>{i.value='65';i.dispatchEvent(new Event('change',{bubbles:true}));});
   await group('paddingSides').locator('.form-error').waitFor();assert.deepEqual((await source()).nodes[0].yavc.paddingSides,[10,64,2,30]);
   // One undo takes back one change.
   await p.evaluate(()=>{document.activeElement.blur();pudlCommands.run('undo',null,document.querySelector('#two'));});
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent==='10, 2, 2, 30');
   assert.deepEqual((await source()).nodes[0].yavc.paddingSides,[10,2,2,30]);
   // The corners work the same way, and a corner left empty is 0 where there is no Corner Radius.
   await group('radiusCorners').locator('.card-toggle').click();await part('radiusCorners',2).waitFor();
   await part('radiusCorners',0).fill('12');await part('radiusCorners',0).press('Enter');
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="radiusCorners"] .card-summary').textContent==='12, 0, 0, 0');
   assert.deepEqual((await source()).nodes[0].yavc.radiusCorners,[12,0,0,0]);
   // A selection that disagrees shows Mixed, and a field is not filled in on the items' behalf.
   await p.evaluate(()=>pudlCommands.run('cv-select-all',null,document.querySelector('#two')));
   const mixed=part('radiusCorners',0);await mixed.waitFor();
   assert.equal(await group('radiusCorners').locator('.card-summary').textContent(),'Mixed');
   assert.equal(await group('radiusCorners').locator('input[data-part][data-index="0"]').getAttribute('placeholder'),'Mixed');
   await part('radiusCorners',1).fill('7');await part('radiusCorners',1).press('Enter');
   await group('radiusCorners').locator('.form-error',{hasText:'differ'}).waitFor();
   assert.deepEqual((await source()).nodes[0].yavc.radiusCorners,[12,0,0,0]);
   // Setting all four on every selected item is one change, and Clear takes the property back from every item.
   for(let i=0;i<4;i++)await part('radiusCorners',i).fill(String(i+1));await part('radiusCorners',3).press('Enter');
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="radiusCorners"] .card-summary').textContent==='1, 2, 3, 4');
   assert.ok((await source()).nodes.every(n=>JSON.stringify(n.yavc&&n.yavc.radiusCorners)==='[1,2,3,4]'));
   await group('radiusCorners').locator('[data-parts-clear]').click();
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="radiusCorners"] .card-summary').textContent==='Not set');
   assert.ok((await source()).nodes.every(n=>!n.yavc||n.yavc.radiusCorners===undefined));
   // Clear on one node takes the sides back to the single value, which the node keeps.
   await run('canvas-view',{op:'select',key:'key',kind:'node'});
   await group('paddingSides').locator('[data-parts-clear]').click();
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent==='Not set');
   assert.deepEqual((await source()).nodes[0].yavc,{style:'key',fontSize:30,padding:2,outlineSides:['top','bottom']});
   // A person fills the four sides in a row, with Tab between them. Each Tab stores the side just typed, and the keyboard
   // arrives in the next field ready to type over it. The Inspector is drawn again after each change, and that must not
   // take the keyboard from the field the person has just tabbed into.
   const typedSides=[5,6,7,8],summaryOf=()=>p.evaluate(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent);
   await part('paddingSides',0).focus();
   for(let i=0;i<4;i++){
    await p.keyboard.type(String(typedSides[i]));await p.keyboard.press('Tab');
    const want=typedSides.map((v,j)=>j<=i?v:2).join(', ');
    await p.waitForFunction(w=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent===w,want,{timeout:5000}).catch(()=>{});
    assert.equal(await summaryOf(),want,'Tab out of side '+(i+1)+' did not store the number typed in it');
    const where=await p.evaluate(()=>{const a=document.activeElement,field=a&&a.closest('.number-field'),own=field&&field.querySelector('input[data-part]');
     return own?'side '+(Number(own.dataset.index)+1):a&&a.hasAttribute('data-parts-clear')?'Clear':a?a.tagName:'nothing';});
    assert.equal(where,i<3?'side '+(i+2):'Clear','After Tab out of side '+(i+1)+' the keyboard is in '+where);
   }
   assert.deepEqual((await source()).nodes[0].yavc.paddingSides,typedSides);
   await group('paddingSides').locator('[data-parts-clear]').click();
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent==='Not set');
   assert.deepEqual((await source()).nodes[0].yavc,{style:'key',fontSize:30,padding:2,outlineSides:['top','bottom']});
   // A side emptied again goes back to the single value, and the single fields are still there.
   await part('paddingSides',0).fill('5');await part('paddingSides',0).press('Enter');
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent==='5, 2, 2, 2');
   await part('paddingSides',0).fill('');await part('paddingSides',0).press('Enter');
   await p.waitForFunction(()=>document.querySelector('#two [data-parts="paddingSides"] .card-summary').textContent==='2, 2, 2, 2');
   assert.equal(await inspector.locator('[data-set="padding"], [data-set="radius"]').count(),2);
   await run('canvas-view',{op:'select',key:'home',kind:'node'});
   await inspector.locator('[data-set="fit"]').waitFor({state:'attached'});assert.equal(await inspector.locator('[data-set="fontSize"], [data-set="shape"]').count(),0);
   // A picture has corners but no text, so it has no sides to pad.
   assert.equal(await inspector.locator('[data-parts="radiusCorners"]').count(),1);assert.equal(await inspector.locator('[data-parts="paddingSides"]').count(),0);
   phase='agent actions and the command';
   // An agent adds a picture, tints it, and changes the canvas's styles and font, each as one edit.
   const made=await run('canvas-edit',{op:'create',type:'file',file:'icons/plain.svg',x:500,y:200,width:24,height:24});
   await run('canvas-edit',{op:'set',key:made.key,kind:'node',property:'tint',value:'3'});
   await run('canvas-edit',{op:'set',key:'line',kind:'node',property:'outlineSides',value:[]});
   await run('canvas-edit',{op:'document',property:'styles',value:{key:{fillColor:'#222222',textColor:'#ffff00'},quiet:{fontSize:11}}});
   await run('canvas-edit',{op:'document',property:'font',value:'Verdana'});
   await p.waitForFunction(()=>document.querySelector('#two .dg-canvas [data-node="key"] > rect').getAttribute('fill')==='#222222');
   let doc=await source();
   assert.deepEqual([doc.yavc.font,Object.keys(doc.yavc.styles),doc.nodes.at(-1).yavc.tint,doc.nodes.at(-1).width,doc.nodes.find(n=>n.id==='line').yavc.outlineSides],['Verdana',['key','quiet'],'3',24,[]]);
   await assert.rejects(run('canvas-edit',{op:'create',type:'file',file:'https://example.com/a.png'}),/picture/);
   await assert.rejects(run('canvas-edit',{op:'set',key:'key',kind:'node',property:'fontFamily',value:'x"><script>'}),/fontFamily/);
   await p.evaluate(()=>{pudlCommands.run('cv-add-picture',null,document.querySelector('#two'));});
   const dialog=p.locator('dialog[open]');await dialog.locator('input').fill('notes.txt');await dialog.getByRole('button',{name:'Add'}).click();
   await dialog.locator('[data-role="error"]',{hasText:'PNG, JPEG, GIF, WebP or SVG'}).waitFor();
   await dialog.locator('input').fill('icons/home.svg');await dialog.getByRole('button',{name:'Add'}).click();
   await p.waitForFunction(()=>document.querySelectorAll('#two .dg-canvas svg image').length===5);
   doc=await source();assert.deepEqual([doc.nodes.at(-1).type,doc.nodes.at(-1).file],['file','icons/home.svg']);
   // The pictures were read for the first drawing and again only after the window came back into use, and not for each of the edits above.
   const reads=requests.filter(r=>r==='home.svg').length,returns=await p.evaluate(()=>window.fixtureFocuses);
   assert.ok(reads>=1&&reads<=1+returns,reads+' reads after '+returns+' returns to the window');
   // Once every picture the canvas has can be read, the notice about the ones that could not be goes.
   assert.equal(await two.locator('.notice:visible',{hasText:'is shown by its name'}).count(),1);
   await run('canvas-edit',{op:'delete',items:['fake','missing','large','outside'].map(id=>({id,kind:'node'}))});
   await p.waitForFunction(()=>!Array.from(document.querySelectorAll('#two .notice')).some(n=>!n.hidden&&/is shown by its name/.test(n.textContent)));
   // An unset choice is called Default, and All is a choice of its own that a node can make over its style.
   await run('canvas-view',{op:'select',key:'line',kind:'node'});
   const choices=await inspector.locator('select[data-set="outlineSides"]').evaluate(s=>({value:s.value,count:s.options.length,first:[s.options[0].text,s.options[1].text,s.options[2].text]}));
   assert.deepEqual(choices,{value:'none',count:17,first:['Default','All','None']});
   await inspector.locator('select[data-set="outlineSides"]').selectOption('top,right,bottom,left');
   await p.waitForFunction(()=>!document.querySelector('#two .dg-canvas [data-node="line"] > path'));
   assert.deepEqual((await source()).nodes.find(n=>n.id==='line').yavc.outlineSides,['top','right','bottom','left']);
   phase='a canvas in a document';
   const d=await context.newPage();d.setDefaultTimeout(30000);d.on('pageerror',e=>errors.push(e.message));
   await d.goto(base+'workspace-lab/index.html');
   const saved=d.locator('#document [data-diagram-src="screens/plan.canvas"] img.sc-diagram-image').first();await saved.waitFor();
   assert.match(decodeURIComponent(await saved.getAttribute('src')),/<image[^>]* href="data:image\/svg\+xml;base64,/);
   assert.ok(await saved.evaluate(i=>i.decode().then(()=>i.naturalWidth>0)));
   // A saved canvas's picture is asked for from the canvas's folder, and a canvas written in the document from the document's.
   await d.waitForFunction(()=>fixture.pictures.asked.some(a=>a.href==='icons/home.svg'));
   const fromDocument=await d.evaluate(()=>fixture.pictures.asked);
   assert.ok(fromDocument.some(a=>a.href==='screens/icons/moved.svg'&&a.resource==='memory:document.docs.md'));
   assert.ok(fromDocument.some(a=>a.href==='icons/home.svg'&&a.resource==='memory:document.docs.md'));
   await d.locator('#document .notice',{hasText:'The picture icons/missing.svg is shown by its name, because it was not found.'}).first().waitFor();
   phase='attribute blocks and a picture at a site path';
   // A block after a heading or a link is kept with it and not drawn among its words.
   const anchored=d.locator('#document .ProseMirror h2[data-md-attributes="#anchored .wide"]');await anchored.waitFor();assert.equal(await anchored.innerText(),'Anchored');
   const linked=d.locator('#document .ProseMirror a[data-md-attributes]');assert.equal(await linked.innerText(),'link');assert.equal(await linked.getAttribute('data-md-attributes'),'target="_blank" rel="noopener"');
   assert.equal(await d.locator('#document .ProseMirror').evaluate(el=>/[{}]/.test(el.querySelector('h2').textContent+el.querySelector('a[data-md-attributes]').parentElement.textContent)),false);
   await anchored.click();await d.keyboard.press('End');await d.keyboard.type(' Heading');await linked.click();await d.keyboard.press('End');await d.keyboard.type(' Typed.');
   const written=(await d.evaluate(()=>pudlActions.run('yavc.docs/document@1',{}, {grant:'all'}))).text;
   assert.match(written,/^## Anchored Heading \{#anchored \.wide\}$/m);assert.match(written,/^A \[link\]\(https:\/\/example\.com\/\)\{target="_blank" rel="noopener"\} with attributes\. Typed\.$/m);
   // The host is asked for a picture at a site path. Unresolved, the path stays as written; once the host says files changed, it is asked again.
   const site=d.locator('#document img[data-site-picture="/site/logo.png"]').first();await site.waitFor({state:'attached'});
   await d.waitForFunction(()=>fixture.pictures.asked.some(a=>a.href==='/site/logo.png'&&a.kind==='image'&&a.resource==='memory:document.docs.md'));
   assert.equal(await site.getAttribute('src'),'/site/logo.png');
   await d.evaluate(()=>fixture.pictures.moved('logo.png'));
   await d.waitForFunction(()=>/fixture-pictures\/logo\.png$/.test(document.querySelector('#document img[data-site-picture="/site/logo.png"]').getAttribute('src')));
   await d.waitForFunction(()=>{const i=document.querySelector('#document img[data-site-picture="/site/logo.png"]');return i.complete&&i.naturalWidth>0;});
   assert.deepEqual(errors,[]);console.log(engine+': pictures, tint, text faces, outlines and named styles are drawn, exported, edited in the inspector and by an agent, and drawn in a document passed');
  }catch(e){console.error(engine,phase,(await p.locator('#two').innerText().catch(()=>'')).slice(-600),errors);throw e;}finally{await browser.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
