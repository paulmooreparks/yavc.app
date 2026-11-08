// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461',original='First\r\nsame\nsame\rtail\r\n';
const call=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
async function ready(p){await p.locator('.cm-content').waitFor({state:'attached'});await p.evaluate(async()=>{await yavcUtil.loadScript(yavcUtil.versioned('/applets/md-engine/loader.js'));await yavcMdEngine();});}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit'])for(const app of ['editor','docs']){
    const browser=await pw[engine].launch({headless:true});
    try{
        const p=await browser.newPage(),errors=[];p.on('pageerror',err=>errors.push(err.message));
        await p.goto(`http://localhost:${port}/applet/${app}`);await ready(p);
        await p.evaluate(async text=>{const F=await yavcUtil.siteFs();await F.write(F.home(),'endings.md',text,false);},original);
        await call(p,app,'open-file',{path:'~/endings.md'});await call(p,app,'view',{mode:'text'});
        const source=p.locator('.cm-content');await source.focus();await p.keyboard.press('ControlOrMeta+Home');await p.keyboard.press('ArrowDown');await p.keyboard.press('Home');await p.keyboard.type('X');
        const edited='First\r\nXsame\nsame\rtail\r\n';await call(p,app,'save');
        assert.equal(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'endings.md'))),edited);
        await p.evaluate(()=>pudlCommands.run('undo',null,document.querySelector('[data-applet]')));await call(p,app,'save');
        assert.equal(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'endings.md'))),original);
        await p.evaluate(()=>pudlCommands.run('redo',null,document.querySelector('[data-applet]')));await call(p,app,'save');
        await p.waitForFunction(app=>Object.keys(localStorage).filter(key=>key.startsWith('pc-resume:'+app+':')).some(key=>JSON.parse(localStorage.getItem(key))?.v?.tabs?.some(tab=>tab.name==='endings.md'&&tab.newlines==='RLCR'&&tab.sourceHistory?.done.length)),app);
        await p.reload();await ready(p);await p.locator('[data-command="undo"]:not([disabled])').first().waitFor();
        await p.evaluate(()=>pudlCommands.run('undo',null,document.querySelector('[data-applet]')));await call(p,app,'save');
        assert.equal(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'endings.md'))),original);
        await source.focus();await p.keyboard.press('ControlOrMeta+Home');await p.keyboard.press('ArrowDown');await p.keyboard.press('End');await p.keyboard.press('Delete');await p.keyboard.press('Enter');
        assert.equal((await call(p,app,'document')).text,original.replace(/\r\n?/g,'\n'));assert.equal((await call(p,app,'document')).modified,true);
        await p.waitForFunction(app=>Object.keys(localStorage).filter(key=>key.startsWith('pc-resume:'+app+':')).some(key=>JSON.parse(localStorage.getItem(key))?.v?.tabs?.some(tab=>tab.name==='endings.md'&&tab.newlines==='RCCR'&&tab.draft!=null)),app);
        await p.reload();await ready(p);assert.equal((await call(p,app,'document')).modified,true);await call(p,app,'save');
        assert.equal(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'endings.md'))),'First\r\nsame\rsame\rtail\r\n');
        await p.evaluate(async text=>{yavcSnapshot.keepAll();await pcSiteFs.write(pcSiteFs.home(),'endings.md',text,false);},original);
        await p.reload();await ready(p);assert.equal((await call(p,app,'document')).modified,false);await call(p,app,'save');
        assert.equal(await p.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'endings.md'))),original);
        assert.deepEqual(errors,[]);console.log(engine+' '+app+': mixed source endings survive real edits, Save, Undo, Redo and recovered Undo.');
    }finally{await browser.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
