// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461',source='# Legacy\r\n\r\nOriginal.\n',draft=source+'Recovered.';
const call=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
const raw=p=>p.evaluate(async()=>Array.from(new Uint8Array((await pcSiteFs.contentBytes.read({resource:'~/legacy.md',maxBytes:65536})).bytes)));
async function ready(p){await p.locator('.cm-content').waitFor({state:'attached'});await p.evaluate(async()=>{await yavcUtil.loadScript(yavcUtil.versioned('/applets/md-engine/loader.js'));await yavcMdEngine();});}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit'])for(const app of ['editor','docs']){
    const b=await pw[engine].launch({headless:true});try{for(const missingBaseline of [false,true]){
        const p=await b.newPage(),errors=[];p.on('pageerror',err=>errors.push(err.message));await p.goto(`http://localhost:${port}/applet/${app}`);await ready(p);
        const actual=missingBaseline?source:'\ufeff'+source,recovered=missingBaseline?source:draft;
        await p.evaluate(async source=>{const F=await yavcUtil.siteFs();await F.write(F.home(),'legacy.md',source,false);},actual);await call(p,app,'open-file',{path:'~/legacy.md'});await call(p,app,'view',{mode:'text'});
        await p.evaluate(()=>yavcSnapshot.keepAll());
        await p.waitForFunction(app=>Object.keys(localStorage).filter(key=>key.startsWith('pc-resume:'+app+':')).some(key=>JSON.parse(localStorage.getItem(key))?.v?.tabs?.some(tab=>tab.name==='legacy.md')),app);
        await p.evaluate(()=>pudlApplets.destroy(document.querySelector('[data-applet]')));
        await p.evaluate(async({app,draft,missingBaseline})=>{
            const saved=await pcSiteFs.contentResources.read({resource:'~/legacy.md'});
            const kept={version:2,tabs:[{path:'~/legacy.md',name:'legacy.md',lang:'markdown',draft:'\ufeff'+draft.replace(/\r\n?/g,'\n'),newlines:yavcSourceHistory.endings(draft),baseline:missingBaseline?null:{version:1,resource:'~/legacy.md',revision:saved.revision},selection:{ranges:[{anchor:2,head:2}],main:0},view:'text'}],front:0,waiting:[]};
            if(missingBaseline)kept.tabs[0].selection={main:0};
            for(const key of Object.keys(localStorage).filter(key=>key.startsWith('pc-resume:'+app+':')))localStorage.removeItem(key);
            localStorage.setItem('pc-'+app+'-session',JSON.stringify(kept));
            for(const key of Object.keys(sessionStorage).filter(key=>key.startsWith('pc-snap:')))sessionStorage.removeItem(key);
        },{app,draft:recovered,missingBaseline});
        await p.reload();await ready(p);const restored=await call(p,app,'document');assert.equal(restored.text,recovered.replace(/\r\n?/g,'\n'));assert.equal(restored.modified,true);
        await assert.rejects(call(p,app,'save'),/matching revision|Save As|recovered draft/);assert.deepEqual(await raw(p),Array.from(Buffer.from(actual)));
        await p.evaluate(()=>{window.copyDone=pudlCommands.run('save-as',null,document.querySelector('[data-applet]'));});const picker=p.locator('.fb-picker[open]');await picker.getByLabel('File Name',{exact:true}).fill('legacy-copy.md');await picker.getByRole('button',{name:'Save',exact:true}).click();await p.evaluate(()=>copyDone);
        assert.deepEqual(await p.evaluate(async()=>Array.from(new Uint8Array((await pcSiteFs.contentBytes.read({resource:'~/legacy-copy.md',maxBytes:65536})).bytes))),Array.from(Buffer.from('\ufeff'+recovered)));
        assert.deepEqual(await raw(p),Array.from(Buffer.from(actual)));assert.deepEqual(errors,[]);await p.close();
    }console.log(engine+' '+app+': legacy signed drafts and same-body signature changes retain exact copies without an unsafe writable baseline.');}finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
