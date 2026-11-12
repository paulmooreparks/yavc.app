// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461',baseline=process.env.YAVC_FOCUS_BASELINE==='1',servedOnly=process.env.YAVC_FOCUS_SERVED_ONLY==='1';
const action=(p,app,name,input)=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input||{},{grant:'all'}),{app,name,input});
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});
    try{for(const app of ['editor','docs','slides','diagrams']){
        const p=await browser.newPage({viewport:{width:1500,height:1000}});p.setDefaultTimeout(30000);const errors=[];p.on('pageerror',error=>errors.push(error.message));
        try{
            if(!baseline&&!servedOnly)await p.route('**/static/*.js*',async route=>{
                const name=new URL(route.request().url()).pathname.split('/').pop();
                if(!['yavc-util.js','dialogs.js','filebrowser.js','document-windows.js'].includes(name))return route.continue();
                await route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(__dirname,'../internal/web/static',name))});
            });
            await p.goto(`http://localhost:${port}/?open=${app}`);await p.locator(`[data-applet="${app}"][data-applet-state="running"]`).waitFor();
            async function toolbar(){
                await p.waitForFunction(()=>Array.from(document.querySelectorAll('.win [data-command="common-toolbar-customize"]')).every(button=>!button.disabled));
                await p.evaluate(async app=>{await pudlHost.config.set('command-toolbars',{[app]:{version:1,visible:true,inRibbon:true,items:['open','save']}});},app);
            }
            const canvas=JSON.stringify({nodes:[{id:'one',type:'text',x:0,y:0,width:160,height:80,text:'Focus Target'}],edges:[]});
            await action(p,app,app==='slides'?'load':'new',app==='diagrams'?{kind:'canvas',text:canvas}:{text:'# Original window\n\nRetained draft.\n'});
            const file='~/Focus Target'+(app==='diagrams'?'.canvas':app==='slides'?'.slides.md':app==='docs'?'.docs.md':app==='editor'?'.txt':'.md'); // A Markdown file chosen in the Editor opens in Docs (DESIGN.md, decision 131), so the Editor opens a text file.
            await p.evaluate(async({file,text})=>{const F=await yavcUtil.siteFs();await F.write(F.home(),file,text,false);},{file,text:app==='diagrams'?canvas:'# Focus Target\n\nOpened document.\n'});
            async function pick(){
                await toolbar();
                await p.locator(`.win[data-win="${app}"] .yavc-command-toolbar [data-command="open"]`).click();
                const picker=p.locator('.fb-picker[open]');await picker.getByLabel('Path',{exact:true}).fill(file);await picker.locator('[data-pick="ok"]').click();await picker.waitFor({state:'hidden'});
            }
            await pick();await p.locator(`.win[data-win="${app}-2"] [data-applet-state="running"]`).waitFor();
            // Let native dialog-close events and deferred question cleanup run.
            await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            assert.equal(await p.evaluate(()=>pudlWindows.state().top),app+'-2',app+' new document is behind its opener');
            assert.equal(await p.evaluate(()=>document.activeElement.closest('.win')?.getAttribute('data-win')),app+'-2');
            await p.evaluate(app=>pudlWindows.raise(app),app);await pick();
            await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            assert.equal(await p.evaluate(()=>pudlWindows.state().top),app+'-2');assert.equal(await p.locator(`[data-applet="${app}"]`).count(),2);
            await p.evaluate(app=>pudlWindows.raise(app),app);await toolbar();await p.locator(`.win[data-win="${app}"] .yavc-command-toolbar [data-command="open"]`).click();
            await p.locator('.fb-picker[open] [data-pick="cancel"]').click();assert.equal(await p.evaluate(()=>pudlWindows.state().top),app);
            await p.locator(`.win[data-win="${app}"] .yavc-command-toolbar [data-command="open"]`).click();
            const invalid=p.locator('.fb-picker[open]');await invalid.getByLabel('Path',{exact:true}).fill('~/Missing Focus Document.md');await invalid.locator('[data-pick="ok"]').click();await invalid.locator('[data-pick="error"]').filter({hasText:/./}).waitFor();assert.equal(await p.evaluate(()=>pudlWindows.state().top),app);await invalid.locator('[data-pick="cancel"]').click();
            await p.evaluate(()=>{window.focusQuestion=yavcDialog.askChoice('Focus Regression','Continue with the other document?',[['cancel','Cancel'],['ok','Continue',true]]);});
            const question=p.getByRole('dialog',{name:'Focus Regression',exact:true});await question.waitFor();await p.evaluate(app=>pudlWindows.raise(app+'-2'),app);await question.getByRole('button',{name:'Continue',exact:true}).click();assert.equal(await p.evaluate(()=>focusQuestion),'ok');await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await p.evaluate(()=>pudlWindows.state().top),app+'-2');
            assert.deepEqual(errors,[]);console.log(engine+': '+app+' toolbar Open foregrounds new and existing documents; cancellation retains the opener');
        }catch(error){console.error(app,await p.evaluate(()=>({windows:window.pudlWindows&&pudlWindows.state(),buttons:Array.from(document.querySelectorAll('.win [data-command]')).map(node=>({command:node.getAttribute('data-command'),label:node.textContent,win:node.closest('.win').getAttribute('data-win')}))})),errors);throw error;}finally{await p.close();}
    }}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
