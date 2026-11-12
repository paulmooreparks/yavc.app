// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/owned/release/';
function pngChunk(type,data){
    const body=Buffer.concat([Buffer.from(type),data]),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);
    let crc=0xffffffff;for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}checksum.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([length,body,checksum]);
}
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',require('node:zlib').deflateSync(Buffer.from([0,255,0,0,255]))),pngChunk('IEND',Buffer.alloc(0))]);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(item=>item.path));
    const addon=await fs.readFile(path.join(__dirname,'fixtures/host-overlays.js'),'utf8');
    const server=http.createServer(async(req,res)=>{try{
        const url=new URL(req.url,'http://localhost');
        if(url.pathname==='/draft-file'){
            if(!['memory:source.md','memory:document.docs.md','memory:deck.slides.md'].includes(url.searchParams.get('draft'))||url.searchParams.get('name')!=='shot.png')return res.writeHead(404).end();
            res.setHeader('Content-Type','image/png');return res.end(png);
        }
        if(!url.pathname.startsWith(prefix))return res.writeHead(404).end();
        const name=decodeURIComponent(url.pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();
        res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'");
        let bytes=await fs.readFile(path.join(artifact,name));if(name==='workspace-lab/host.js')bytes=Buffer.from(bytes.toString()+'\n'+addon);
        res.end(bytes);
    }catch(error){res.writeHead(500).end(error.message);}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true});
        try{
            const page=await browser.newPage({viewport:{width:1500,height:1700}}),errors=[],bad=[];
            page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/\/content\/(docs|editor|slides)\/shot\.png/.test(request.url()))bad.push(request.url());});
            if(engine==='chromium'&&process.env.YAVC_OVERLAY_DEBUG==='1'){
                const cdp=await page.context().newCDPSession(page);await cdp.send('Debugger.enable');
                const lines=(await fs.readFile(path.join(artifact,'content/md-editor/page-view.js'),'utf8')).split('\n');
                await cdp.send('Debugger.setBreakpointByUrl',{urlRegex:'content/md-editor/page-view\\.js',lineNumber:lines.findIndex(line=>line.trim()==='if(out!==text)return;')});
                cdp.on('Debugger.paused',async event=>{try{const result=await cdp.send('Debugger.evaluateOnCallFrame',{callFrameId:event.callFrames[0].callFrameId,expression:'({out,text,parts,entries:entries.map(e=>({gap:e.node.attrs.gap,src:e.node.attrs.src,canonical:e.node.attrs.canonical}))})',returnByValue:true});if(result.result.value?.out!==result.result.value?.text)console.error('Mapping debugger:',result.result.value);}finally{await cdp.send('Debugger.resume');}});
            }
            await page.goto('http://127.0.0.1:'+server.address().port+prefix+'workspace-lab/index.html');
            await page.locator('#document .ProseMirror').waitFor();await page.locator('#source .cm-content').waitFor();
            const action=(app,name,input={})=>page.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
            for(const [app,root,modes] of [['docs','document',['document','visual','split','preview']],['slides','deck',['visual','split']]]){
                for(const mode of modes){await action(app,'view',{mode});await page.waitForFunction(id=>Array.from(document.querySelectorAll('#'+id+' img[data-attachment="shot.png"]')).some(img=>img.naturalWidth===1&&img.src.includes('/draft-file?')),root).catch(async error=>{console.error(engine,app,mode,errors,await page.locator('#'+root+' img').evaluateAll(nodes=>nodes.map(img=>({src:img.src,width:img.naturalWidth,attachment:img.dataset.attachment,missing:img.className}))));throw error;});}
            }
            assert.deepEqual(bad,[],'No relative picture may be requested beneath an applet package.');
            assert.match((await action('docs','document')).text,/!\[\]\(shot\.png\)/);
            const safety=await page.evaluate(async()=>{
                var K=yavcMdEditor,result=[];
                for(var url of ['javascript:alert(1)','file:///tmp/image.png','data:image/png;base64,AAAA','https://other.invalid/picture.png'])result.push(await K.pictureFor('shot.png',{resource:'opaque',resources:{resolve:async function(){return {url:url};}},current:function(){return true;}}));
                var image=yavcHTML.fragment('<img src="raw.png" onerror="alert(1)">').querySelector('img');
                var E=await K.exports(),m=(await yavcMdEngine()).withMacros('',''),model=await E.prepare({text:'![](shot.png)\n',engine:m,pictures:{resource:'memory:document.docs.md',resources:pudlHost.contentWorkspace.resources,current:function(){return true;}},read:async function(){return '';},current:function(){return true;}});
                return {refused:result,authored:image.getAttribute('data-attachment'),src:image.getAttribute('src'),handler:image.getAttribute('onerror'),images:model.blocks.filter(function(block){return block.kind==='image';}).length,origins:fixture.overlays.assetCalls.map(function(call){return call.resource;})};
            });
            assert.deepEqual(safety.refused,['','','','']);assert.equal(safety.authored,'raw.png');assert.equal(safety.src,null);assert.equal(safety.handler,null);assert.equal(safety.images,1);
            assert.ok(['memory:document.docs.md','memory:deck.slides.md'].every(resource=>safety.origins.includes(resource)));
            await action('docs','view',{mode:'text'});
            const overlay=page.locator('#document .cm-editor [data-host-suggestion="proposal-1"]');await overlay.waitFor();
            assert.match(await overlay.innerText(),/Improved/);
            const original=(await action('docs','document')).text;
            await overlay.getByRole('button',{name:'Accept suggestion by Review agent',exact:true}).click();
            await page.waitForFunction(()=>fixture.overlays.calls.length===1);
            assert.equal((await action('docs','document')).text,original,'A host acknowledgement alone cannot mutate the source.');
            assert.equal(await page.evaluate(()=>fixture.overlays.calls[0].resource),'memory:document.docs.md');
            await page.evaluate(()=>{var resource='memory:document.docs.md',record=fixture.records.get(resource);record.text=record.text.replace('Original','Improved');record.revision++;fixture.overlays.publish(resource,{revision:String(record.revision),text:record.text,items:[]});fixture.overlays.remount('docs');});
            await page.locator('#document .cm-content').waitFor({state:'attached'});
            await page.waitForFunction(async()=>{try{return (await pudlActions.run('yavc.docs/document@1',{}, {grant:'all'})).text.includes('Improved');}catch{return false;}});
            assert.equal(await page.locator('#document [data-host-suggestion]').count(),0);
            assert.ok(await page.evaluate(()=>fixture.overlays.unsubscribed())>0);
            await page.evaluate(()=>{var resource='memory:document.docs.md',record=fixture.records.get(resource),start=record.text.indexOf('Improved');fixture.overlays.publish(resource,{revision:String(record.revision),text:record.text,items:[{id:'replacement',start,end:start+8,before:'Improved',after:'Clearer',author:'Agent',reason:'A reason',group:'same'}]});});
            await action('docs','view',{mode:'text'});
            await page.locator('#document [data-host-suggestion="replacement"]').waitFor();
            const edit=page.locator('#document [data-host-suggestion="replacement"] button[data-suggestion-action="edit"]');
            await edit.focus();await page.keyboard.press('Enter');
            const dialog=page.locator('dialog[open]').filter({hasText:'Edit Suggested Replacement'});await dialog.locator('textarea').fill('Clearer\nreplacement');await dialog.getByRole('button',{name:'Apply',exact:true}).click();
            await page.waitForFunction(()=>document.querySelector('#document [data-host-suggestion="replacement"] .host-suggestion-new')?.textContent==='Clearer\nreplacement');
            assert.ok(await page.evaluate(()=>document.activeElement!==document.body),'Editing must retain owned keyboard focus.');
            await page.evaluate(()=>{fixture.holdDecision=true;});
            await page.locator('#document [data-host-suggestion="replacement"] button[data-suggestion-action="accept"]').focus();await page.keyboard.press('Enter');
            await page.waitForFunction(()=>fixture.overlays.calls.length===2&&fixture.releaseDecision);
            assert.equal(await page.evaluate(()=>fixture.overlays.calls[1].after),'Clearer\nreplacement');
            assert.ok(await page.locator('#document [data-host-suggestion="replacement"] button[data-suggestion-action="accept"]').isDisabled());
            assert.ok(await page.evaluate(()=>document.activeElement!==document.body),'Pending decisions must retain owned keyboard focus.');
            await page.evaluate(()=>{fixture.releaseDecision();fixture.holdDecision=false;});
            await page.waitForFunction(()=>!document.querySelector('#document [data-host-suggestion="replacement"] button[data-suggestion-action="accept"]').disabled);
            await page.locator('#document .cm-content').click();await page.keyboard.press('ControlOrMeta+Home');await page.keyboard.type('Prefix ');
            await page.locator('#document [data-host-suggestion="replacement"] button[data-suggestion-action="accept"]').waitFor();
            assert.equal(await page.locator('#document [data-host-suggestion="replacement"] button[data-suggestion-action="accept"]').isDisabled(),false);
            await action('docs','view',{mode:'document'});await page.locator('#document .ProseMirror [data-host-suggestion="replacement"]').waitFor();
            // On a slow machine the keys arrive before the click has moved the caret, and the edit is lost, so each step waits for the effect of the one before it.
            await page.locator('#document .ProseMirror p').filter({hasText:'Improved words.'}).click();
            await page.waitForFunction(()=>{const node=getSelection().anchorNode,paragraph=node&&(node.nodeType===1?node:node.parentElement).closest('#document .ProseMirror p');return !!paragraph&&paragraph.textContent.includes('Improved words.');});
            await page.keyboard.press('Home');await page.waitForFunction(()=>getSelection().anchorOffset===0);
            await page.keyboard.press('Delete');await page.waitForFunction(()=>Array.from(document.querySelectorAll('#document .ProseMirror p')).some(p=>p.textContent==='mproved words.'));
            await page.waitForFunction(()=>document.querySelector('#document .ProseMirror [data-host-suggestion="replacement"] button[data-suggestion-action="accept"]')?.disabled);
            assert.match((await action('docs','document')).text,/shot\.png/);assert.doesNotMatch((await action('docs','document')).text,/Clearer|\{[+~\-]/);
            const rendered=(await action('docs','document')).text;
            await page.evaluate(text=>{var start=text.indexOf('words');fixture.overlays.publish('memory:document.docs.md',{revision:'visual-review',text:text,items:[{id:'visual',start:start,end:start+5,before:'words',after:'clear wording',author:'Agent',reason:'A visible proposal'}]});},rendered);
            await action('docs','view',{mode:'visual'});await page.locator('#document .ProseMirror [data-host-suggestion="visual"]').waitFor({timeout:5000}).catch(async error=>{console.error(errors,await page.locator('#document').evaluate(root=>({source:Array.from(root.querySelectorAll('.cm-editor [data-host-suggestion]')).map(node=>node.dataset.hostSuggestion),rich:root.querySelector('.ProseMirror')?.innerHTML.slice(0,3500)})));throw error;});
            await page.evaluate(()=>{var surface=document.querySelector('#document [data-ed-page]'),style=document.createElement('style');surface.setAttribute('data-md-style',surface.getAttribute('data-md-style')+' hostile-buttons');style.textContent=yavcDocumentStyle.compile('hostile-buttons','button {opacity:0!important;color:transparent!important;}').css;document.head.append(style);});
            for(const theme of ['light','dark'])for(const width of [1500,480]){
                await page.setViewportSize({width,height:1100});await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
                const card=page.locator('#document .ProseMirror [data-host-suggestion="visual"]');await card.scrollIntoViewIfNeeded();
                assert.ok(await card.getByRole('button',{name:'Accept suggestion by Agent',exact:true}).isEnabled());
                const colors=await card.evaluate(node=>{var button=node.querySelector('button'),style=getComputedStyle(button),root=getComputedStyle(document.querySelector('#document'));return {ink:style.color,hostInk:root.getPropertyValue('--text').trim(),opacity:style.opacity,width:node.getBoundingClientRect().width,available:node.parentElement.getBoundingClientRect().width};});
                assert.notEqual(colors.ink,'rgba(0, 0, 0, 0)');assert.equal(colors.opacity,'1','Authored CSS must stop before host controls.');assert.ok(colors.width<=colors.available+1);
                await card.screenshot({path:path.join(os.tmpdir(),'yavc-host-overlays-'+engine+'-'+theme+'-'+width+'.png')});
            }
            await page.setViewportSize({width:1500,height:1700});
            const furniture=await fs.readFile(path.join(__dirname,'../site/home/Howto/Feature Playground/Document Furniture.docs.md'),'utf8');
            await action('docs','set-text',{text:furniture});await page.evaluate(text=>{var start=text.indexOf('Choose View, Document Zoom');fixture.overlays.publish('memory:document.docs.md',{revision:'paged-review',text:text,items:[{id:'paged',start:start,end:start+6,before:'Choose',after:'Review',author:'Agent'}]});},furniture);
            await action('docs','view',{mode:'document'});await page.locator('#document .ProseMirror [data-host-suggestion="paged"]').waitFor();
            await page.waitForTimeout(400);
            await page.locator('#document .ProseMirror p').filter({hasText:'Choose View, Document Zoom'}).click();await page.keyboard.press('End');
            await page.evaluate(()=>{window.overlayFrames=[];window.overlayTracking=true;window.originalCard=document.querySelector('#document .ProseMirror [data-host-suggestion="paged"]');var measure=function(){if(!overlayTracking)return;var flow=document.querySelector('#document .ProseMirror');overlayFrames.push(flow.querySelector('h2').getBoundingClientRect().top-flow.getBoundingClientRect().top);requestAnimationFrame(measure);};requestAnimationFrame(measure);});
            await page.keyboard.type(' abc',{delay:90});await page.waitForTimeout(400);
            const positions=await page.evaluate(()=>{overlayTracking=false;return overlayFrames;});assert.ok(Math.max(...positions)-Math.min(...positions)<=1,'Suggestion cards must not reintroduce page collapse while typing.');
            assert.ok(await page.evaluate(()=>originalCard===document.querySelector('#document .ProseMirror [data-host-suggestion="paged"]')),'Typing adjacent to a proposal must retain its widget DOM.');
            assert.ok(await page.locator('#document [data-role="page-problems"]').isHidden());
            assert.deepEqual(errors,[]);
            await require('./fixtures/host-suggestion-narrowing.cjs')(page,action,assert);assert.deepEqual(errors,[]);
            const races=await page.evaluate(await fs.readFile(path.join(__dirname,'fixtures/host-suggestion-races.js'),'utf8'));
            assert.equal(races.decisions,2);assert.equal(races.unsubscribed,3);
            console.log(engine+' document-relative images resolve in all drawn modes; host-owned decisions, refresh, mapping, stale protection and disposal pass.');
        }finally{await browser.close();}
    }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
