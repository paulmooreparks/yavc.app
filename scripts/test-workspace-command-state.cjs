// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8492';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});
    try{
        const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.addInitScript(()=>{
            window.commandReports=0;
            Object.defineProperty(window,'yavcTextWorkspace',{configurable:true,set(value){
                Object.defineProperty(window,'yavcTextWorkspace',{value:{...value,init(root,options){
                    const report=options.commandsChanged;
                    const api=value.init(root,{...options,commandsChanged(){window.commandReports++;if(report)report();}});
                    window.workspaceUnderTest=api;return api;
                }},configurable:true});
            }});
        });
        const action=(name,input={})=>page.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
        await page.goto('http://localhost:'+port+'/applet/docs');
        try{await page.locator('.cm-content').waitFor({state:'attached'});}catch(error){console.error(errors);throw error;}
        await action('new',{path:'~/Commands.docs.md',text:'A plain paragraph.\n'});await action('view',{mode:'text'});
        const source=page.locator('.cm-content');await source.click();await page.keyboard.press('ControlOrMeta+End');
        await page.keyboard.type('a');await page.waitForTimeout(700);
        await page.evaluate(()=>{window.commandReports=0;});
        await page.keyboard.type('bcdef',{delay:90});await page.waitForTimeout(700);
        assert.equal(await page.evaluate(()=>window.commandReports),0,'Ordinary typing with unchanged command state must not notify the host.');
        await page.keyboard.press('Shift+ArrowLeft');await page.waitForTimeout(50);
        assert.ok(await page.evaluate(()=>window.commandReports)>0,'Selection enabling Cut/Copy must notify the host.');
        await page.evaluate(()=>{window.commandReports=0;});await page.keyboard.press('Shift+ArrowLeft');await page.waitForTimeout(50);
        assert.equal(await page.evaluate(()=>window.commandReports),0,'Changing selection length without changing command state must not notify.');
        assert.ok(await page.evaluate(()=>{const items=()=>workspaceUnderTest.commandTable().find(c=>c.id==='insert').items();return items()===items();}),'Insert returns the cached list.');
        await action('set-text',{text:'{{define:badge}}\n**Badge**\n{{/define}}\n\nA paragraph.\n'});
        await page.waitForFunction(()=>workspaceUnderTest.commandTable().find(c=>c.id==='insert').items().some(item=>item.id==='insert-custom-badge'));
        await action('set-text',{text:'{{define:label}}\n**Label**\n{{/define}}\n\nA paragraph.\n'});
        await page.waitForFunction(()=>{const items=workspaceUnderTest.commandTable().find(c=>c.id==='insert').items();return items.some(i=>i.id==='insert-custom-label')&&!items.some(i=>i.id==='insert-custom-badge');});
        await page.evaluate(()=>{window.commandReports=0;});await action('view',{mode:'document'});await page.waitForTimeout(400);
        assert.ok(await page.evaluate(()=>window.commandReports)>0,'Changing the view must refresh command state.');
        assert.deepEqual(errors,[]);
        console.log(engine+' suppresses unchanged typing/selection reports, retains Insert list identity and invalidates renamed definitions.');
        await page.close();
        for(const app of ['slides','diagrams']){
            const consumer=await browser.newPage();const failures=[];consumer.on('pageerror',error=>failures.push(error.message));
            await consumer.route('**/applets/'+app+'/'+app+'.js*',async route=>{
                const response=await route.fetch(),body=await response.text(),registration="window.pudlApplets.register('"+app+"', { init: init });";
                assert.ok(body.includes(registration));
                await route.fulfill({response,body:body.replace(registration,"window.commandReports=0;window.pudlApplets.register('"+app+"',{init:function(root,options){var report=options.commandsChanged;var api=init(root,Object.assign({},options,{commandsChanged:function(){window.commandReports++;if(report)report();}}));window.consumerUnderTest=api;return api;}});")});
            });
            await consumer.goto('http://localhost:'+port+'/applet/'+app);
            await consumer.waitForFunction(()=>window.consumerUnderTest);
            const run=(name,input={})=>consumer.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
            if(app==='slides')await run('set-text',{text:'# Slide\n\nA paragraph.\n'});
            else await run('new',{kind:'d2',text:'# A comment\n'});
            await run('view',{mode:'text'});await consumer.locator('.cm-content').click();await consumer.keyboard.press('ControlOrMeta+End');
            if(app==='diagrams')await consumer.keyboard.type('# ');
            await consumer.keyboard.type('a');await consumer.waitForTimeout(800);
            await consumer.evaluate(()=>{window.commandReports=0;});await consumer.keyboard.type('bcdef',{delay:90});await consumer.waitForTimeout(800);
            assert.equal(await consumer.evaluate(()=>window.commandReports),0,app+' must suppress unchanged typing reports.');
            await run('view',{mode:'split'});await consumer.waitForTimeout(100);
            assert.ok(await consumer.evaluate(()=>window.commandReports)>0,app+' must report a view-state change.');
            assert.deepEqual(failures,[]);await consumer.close();
            console.log(engine+' '+app+' suppresses unchanged typing reports and retains view notifications.');
        }
    }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
