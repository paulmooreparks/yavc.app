// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461',source='---\npage: 300pt x 400pt\nmargins: 20pt\n---\n\n{{note}}\n'+Array.from({length:15},(_,i)=>'Paragraph '+i+'. '+'A boxed paragraph keeps its rich content and source. '.repeat(10)).join('\n\n')+'\n{{/note}}\n';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});try{
        const page=await browser.newPage({viewport:{width:1300,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
        const call=(name,input={})=>page.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
        await page.goto(`http://localhost:${port}/applet/docs`);await page.locator('.cm-content').waitFor({state:'attached'});await call('new',{path:'~/Boxed.docs.md',text:source});await call('view',{mode:'document'});
        await page.waitForFunction(()=>document.querySelector('.pm-box-body .doc-page-gap'));
        const geometry=()=>page.locator('.ProseMirror').evaluate(flow=>({pages:flow.closest('[data-page-count]').dataset.pageCount,gaps:[...flow.querySelectorAll('.doc-page-gap')].map(node=>node.style.height)}));await page.waitForTimeout(250);const before=await geometry();assert.ok(Number(before.pages)>3);await page.waitForTimeout(400);assert.deepEqual(await geometry(),before);assert.equal((await call('document')).text,source);
        await page.evaluate(()=>{const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='IFRAME')node.contentWindow.print=()=>{window.containerPrint=true;};};window.containerPrintTask=pudlCommands.run('print-document',null,document.querySelector('[data-applet]'));});await page.evaluate(()=>containerPrintTask);assert.equal(await page.evaluate(()=>!!window.containerPrint),true,await page.locator('body').innerText());
        const printed=await page.locator('.ed-print-frame').evaluate(frame=>[...frame.contentDocument.querySelectorAll('.doc-print-sheet')].map(sheet=>({height:sheet.querySelector('.doc-page-flow').getBoundingClientRect().height,available:parseFloat(frame.contentWindow.getComputedStyle(sheet).height)-parseFloat(frame.contentWindow.getComputedStyle(sheet).paddingTop)-parseFloat(frame.contentWindow.getComputedStyle(sheet).paddingBottom),text:sheet.querySelector('.doc-page-flow').textContent})));
        assert.ok(printed.every(sheet=>sheet.height<=sheet.available+2),JSON.stringify(printed.map(({height,available})=>({height,available}))));assert.equal((printed.map(sheet=>sheet.text).join('').match(/Paragraph \d+\./g)||[]).length,15);assert.equal((await call('document')).text,source);assert.deepEqual(errors,[]);
        console.log(engine+': long shortcode bodies paginate without changing source and printed fragments fit.');
    }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
