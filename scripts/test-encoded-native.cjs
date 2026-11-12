// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461';
function bytes(text){return Array.from(Buffer.from('\ufeff'+text,'utf16le').swap16());}
const call=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
const raw=(p,name)=>p.evaluate(async name=>Array.from(new Uint8Array((await pcSiteFs.contentBytes.read({resource:'~/'+name,maxBytes:65536})).bytes)),name);
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});try{
        for(const app of ['slides','diagrams']){
            const p=await browser.newPage(),name=app==='slides'?'encoded.slides.md':'encoded.d2',copy=app==='slides'?'copy.slides.md':'copy.d2',source=app==='slides'?'# Encoded\n\nNative deck.\n':'a: Encoded\nb: Diagram\na -> b\n';
            await p.goto(`http://localhost:${port}/applet/${app}`);await p.locator(app==='slides'?'.deck-canvas':'.dg-canvas').waitFor();
            await p.evaluate(async({name,bytes})=>{const F=await yavcUtil.siteFs();const result=await F.writeBytes(F.home(),name,new Uint8Array(bytes),'text/plain');if(result.error)throw new Error(result.error);},{name,bytes:bytes(source)});
            await call(p,app,app==='slides'?'open':'open-file',{path:'~/'+name});await call(p,app,'save');assert.deepEqual(await raw(p,name),bytes(source));
            await call(p,app,'save',{path:'~/'+copy});assert.deepEqual(await raw(p,copy),bytes(source));assert.deepEqual(await raw(p,name),bytes(source));
            await p.reload();await p.locator(app==='slides'?'.deck-canvas':'.dg-canvas').waitFor();await call(p,app,'save');assert.deepEqual(await raw(p,copy),bytes(source));await p.close();
        }
        const p=await browser.newPage();await p.goto(`http://localhost:${port}/?open=files`);await p.locator('table.fm-list').waitFor();
        const source='# From Files\r\n\r\nSigned UTF-16 source.\n';
        await p.evaluate(async bytes=>{const F=await yavcUtil.siteFs();await F.writeBytes(F.home(),'utf16.md',new Uint8Array(bytes),'text/plain');await pudlCommands.run('home',null,document.querySelector('[data-applet="files"]'));},bytes(source));
        await p.locator('tr[data-name="utf16.md"]').dblclick();await p.locator('.win[data-win^="docs"] .ProseMirror').waitFor();
        // The window shows its startup document until the file has loaded, so wait for the file's text before comparing it.
        await p.waitForFunction(async()=>(await pudlActions.run('yavc.docs/document@1',{},{grant:'all'})).text.includes('Signed UTF-16 source.'));
        assert.equal((await call(p,'docs','document')).text,source.replace(/\r\n/g,'\n'));assert.deepEqual(await raw(p,'utf16.md'),bytes(source));
        console.log(engine+': Slides and Diagrams retain encoded Save As/recovery; Files opens signed UTF-16 Markdown in Docs.');await p.close();
    }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
