// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),path=require('node:path'),os=require('node:os');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461',body='# Encoded\r\n\r\nBefore 😀.\n\nTail\r\n';
const formats=[{encoding:'utf-8',bom:false},{encoding:'utf-8',bom:true},{encoding:'utf-16le',bom:true},{encoding:'utf-16be',bom:true}];
function bytes(text,format){let buffer=Buffer.from((format.bom?'\ufeff':'')+text,format.encoding==='utf-8'?'utf8':'utf16le');if(format.encoding==='utf-16be')buffer=buffer.swap16();return Array.from(buffer);}
const call=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
async function ready(p){await p.locator('.cm-content').waitFor({state:'attached'});await p.evaluate(async()=>{await yavcUtil.loadScript(yavcUtil.versioned('/applets/md-engine/loader.js'));await yavcMdEngine();});}
const raw=(p,name)=>p.evaluate(async name=>Array.from(new Uint8Array((await pcSiteFs.contentBytes.read({resource:'~/'+name,maxBytes:1024*1024})).bytes)),name);
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit'])for(const app of ['editor','docs']){
    const b=await pw[engine].launch({headless:true});try{
        const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://localhost:${port}/applet/${app}`);await ready(p);
        for(const [index,format] of formats.entries()){
            const name='encoded-'+index+'.md',original=bytes(body,format);
            await p.evaluate(async({name,bytes})=>{const F=await yavcUtil.siteFs();const result=await F.writeBytes(F.home(),name,new Uint8Array(bytes),'text/plain');if(result.error)throw new Error(result.error);},{name,bytes:original});
            await call(p,app,'open-file',{path:'~/'+name});await call(p,app,'view',{mode:'text'});
            assert.equal((await call(p,app,'document')).text,body.replace(/\r\n?/g,'\n'));
            await call(p,app,'save');assert.deepEqual(await raw(p,name),original);
            const source=p.locator('.cm-content');await source.focus();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('X');await call(p,app,'save');assert.deepEqual(await raw(p,name),bytes(body+'X',format));
            await p.evaluate(()=>pudlCommands.run('undo',null,document.querySelector('[data-applet]')));await call(p,app,'save');assert.deepEqual(await raw(p,name),original);
            await p.evaluate(()=>pudlCommands.run('redo',null,document.querySelector('[data-applet]')));await call(p,app,'save');assert.deepEqual(await raw(p,name),bytes(body+'X',format));
            await source.focus();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.type('-recovered');
            await p.waitForFunction(({app,name,format})=>Object.keys(localStorage).filter(key=>key.startsWith('pc-resume:'+app+':')).some(key=>JSON.parse(localStorage.getItem(key))?.v?.tabs?.some(tab=>tab.name===name&&tab.format?.encoding===format.encoding&&tab.format?.bom===format.bom&&tab.draft?.endsWith('X-recovered')&&tab.baseline?.version===2)),{app,name,format});
            await p.reload();await ready(p);assert.equal((await call(p,app,'document')).modified,true);await call(p,app,'save');assert.deepEqual(await raw(p,name),bytes(body+'X-recovered',format));
            const snapshot=await p.evaluate(resource=>pcSiteFs.contentResources.read({resource}),'~/'+name);assert.equal(snapshot.encoding,format.encoding);assert.equal(snapshot.bom,format.bom);
            if(index===3){
                await p.setViewportSize({width:375,height:800});
                await p.evaluate(()=>{window.copyDone=pudlCommands.run('save-encoded-copy',null,document.querySelector('[data-applet]'));});
                const dialog=p.getByRole('dialog',{name:'Save Encoded Copy',exact:true});await dialog.getByRole('combobox',{name:'Encoding',exact:true}).selectOption('utf8');
                const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=375.5);await p.screenshot({path:path.join(os.tmpdir(),'yavc-encoding-'+engine+'-'+app+'.png')});await dialog.getByRole('button',{name:'Choose Destination…',exact:true}).click();
                const picker=p.locator('.fb-picker[open]');await picker.getByLabel('File Name',{exact:true}).fill('converted.md');await picker.getByRole('button',{name:'Save',exact:true}).click();await p.evaluate(()=>copyDone);
                assert.deepEqual(await raw(p,'converted.md'),bytes(body+'X-recovered',formats[0]));assert.deepEqual(await raw(p,name),bytes(body+'X-recovered',format));
            }
        }
        const atomic=await p.evaluate(async()=>{
            const S=yavcHomeStore,original=new Uint8Array([1,2,3]);await S.blobPut('atomic-existing',original.buffer);let failed=false;
            try{await S.update(record=>{const data=S.parse(record.raw);data.files['/atomic-failed']={t:'b',id:'atomic-existing',s:2,y:'text/plain',m:1};return JSON.stringify(data);},{id:'atomic-existing',bytes:new Uint8Array([8,9])});}catch(error){failed=true;}
            class BufferLike extends Uint8Array {slice(){return this.subarray(0);}}
            const backing=new Uint8Array([9,1,2,3,9]),aliased=new BufferLike(backing.buffer,1,3);
            const owned=S.update(record=>{const data=S.parse(record.raw);data.files['/atomic-owned']={t:'b',id:'atomic-owned',s:3,y:'application/octet-stream',m:1};return JSON.stringify(data);},{id:'atomic-owned',bytes:aliased});aliased[0]=99;await owned;
            const after=await S.read();return {failed,exists:!!S.parse(after.raw).files['/atomic-failed'],bytes:Array.from(new Uint8Array(await S.blobGet('atomic-existing'))),owned:Array.from(new Uint8Array(await S.blobGet('atomic-owned')))};
        });assert.deepEqual(atomic,{failed:true,exists:false,bytes:[1,2,3],owned:[1,2,3]});assert.deepEqual(errors,[]);
        await p.evaluate(()=>{window.openDone=pudlCommands.run('open',null,document.querySelector('[data-applet]'));});
        await p.locator('.fb-picker[open] input[data-pick="chooser"]').setInputFiles({name:'computer.md',mimeType:'text/plain',buffer:Buffer.from(bytes(body,formats[2]))});await p.evaluate(()=>openDone);
        assert.equal((await call(p,app,'document')).text,body.replace(/\r\n?/g,'\n'));
        await p.waitForFunction(app=>Object.keys(localStorage).filter(key=>key.startsWith('pc-resume:'+app+':')).some(key=>JSON.parse(localStorage.getItem(key))?.v?.tabs?.some(tab=>tab.name==='computer.md'&&tab.format?.encoding==='utf-16le'&&tab.format?.bom&&tab.draft!=null)),app);
        await p.reload();await ready(p);assert.equal((await call(p,app,'document')).name,'computer.md');
        await p.evaluate(()=>{window.copyDone=pudlCommands.run('save-as',null,document.querySelector('[data-applet]'));});const picker=p.locator('.fb-picker[open]');await picker.getByLabel('File Name',{exact:true}).fill('computer-copy.md');await picker.getByRole('button',{name:'Save',exact:true}).click();await p.evaluate(()=>copyDone);assert.deepEqual(await raw(p,'computer-copy.md'),bytes(body,formats[2]));
        await p.evaluate(()=>{pudlCommands.run('open',null,document.querySelector('[data-applet]'));});await p.locator('.fb-picker[open] input[data-pick="chooser"]').setInputFiles({name:'invalid.md',mimeType:'text/plain',buffer:Buffer.from([255,254,65])});await picker.getByText(/not valid utf-16le/).waitFor();await picker.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await call(p,app,'document')).name,'computer-copy.md');assert.deepEqual(await raw(p,'computer-copy.md'),bytes(body,formats[2]));assert.deepEqual(errors,[]);
        console.log(engine+' '+app+': exact UTF-8/BOM and UTF-16LE/BE saves, edited recovery, conversion copies and atomic byte/record rollback passed.');
    }finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
