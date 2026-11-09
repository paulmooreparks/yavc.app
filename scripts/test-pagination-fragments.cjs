// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), pw = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8461';
const source = '---\npage: 300pt x 400pt\nmargins: 20pt\nsize: 12pt\n---\n\n' +
    ('The paragraph has **bold words** and *emphasis* to carry across each page. '.repeat(70)) + '\n\n' +
    Array.from({length:65},(_,i)=>(i+1)+'. Ordered item '+(i+1)+' remains in its own position.'+(i===0?' Continuation prose with **rich words**.'.repeat(90):'')).join('\n') + '\n\n' +
    '| First | Second |\n| --- | --- |\n' + Array.from({length:70},(_,i)=>'| Row '+(i+1)+' | Value '+(i+1)+' |').join('\n') + '\n';
(async function () {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium','firefox','webkit']) {
        const browser = await pw[engine].launch({headless:true});
        try {
            const page = await browser.newPage({viewport:{width:1400,height:1000}}), errors=[];
            page.on('pageerror',e=>errors.push(e.message));
            const action = (name,input={})=>page.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
            await page.goto(`http://localhost:${port}/applet/docs`); await page.locator('.cm-content').waitFor({state:'attached'});
            await action('new',{path:'~/Fragmented Document.docs.md',text:source}); await action('view',{mode:'document'});
            await page.waitForFunction(()=>document.querySelector('.ProseMirror tr.doc-page-gap'));
            const before=await page.locator('.ProseMirror').evaluate(flow=>{const copy=flow.cloneNode(true);copy.querySelectorAll('.doc-page-gap').forEach(node=>node.remove());return copy.textContent;});
            const geometry=()=>page.locator('.ProseMirror').evaluate(flow=>({count:flow.closest('[data-page-count]').dataset.pageCount,gaps:[...flow.querySelectorAll('.doc-page-gap')].map(n=>n.style.height)}));
            await page.waitForTimeout(300);const measured=await geometry();await page.waitForTimeout(500);assert.deepEqual(await geometry(),measured);
            await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'yavc-pagination-'+engine+'.png')});
            assert.ok(Number(measured.count)>8);assert.equal((await action('document')).text,source);
            assert.ok(await page.locator('.ProseMirror ol li p .doc-page-gap-inline').count(),'A long list item must split inside its paragraph.');
            assert.ok(await page.locator('.ProseMirror li.doc-page-gap').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display==='block'&&getComputedStyle(n).counterIncrement==='none')));
            await page.evaluate(()=>{const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='IFRAME')node.contentWindow.print=()=>{window.fragmentPrint=true;};};});
            await page.evaluate(()=>pudlCommands.run('print-document',null,document.querySelector('[data-applet]')));
            await page.waitForFunction(()=>window.fragmentPrint);
            const printed=await page.locator('.ed-print-frame').evaluate(frame=>[...frame.contentDocument.querySelectorAll('.doc-page-flow')].map(flow=>({text:(()=>{const copy=flow.cloneNode(true);copy.querySelectorAll('[data-repeated-header]').forEach(node=>node.remove());return copy.textContent;})(),headers:flow.querySelectorAll('th').length,list:[...flow.querySelectorAll('ol')].map(ol=>({start:Number(ol.getAttribute('start'))||1,items:[...ol.children].filter(n=>n.tagName==='LI').map(li=>({text:li.textContent,continued:li.classList.contains('doc-list-continuation'),marker:frame.contentWindow.getComputedStyle(li).listStyleType}))}))})));
            const overflow=await page.locator('.ed-print-frame').evaluate(frame=>[...frame.contentDocument.querySelectorAll('.doc-print-sheet')].map(sheet=>({used:sheet.querySelector('.doc-page-flow').getBoundingClientRect().height,available:parseFloat(frame.contentWindow.getComputedStyle(sheet).height)-parseFloat(frame.contentWindow.getComputedStyle(sheet).paddingTop)-parseFloat(frame.contentWindow.getComputedStyle(sheet).paddingBottom)})));
            assert.ok(overflow.every(p=>Math.ceil(p.used)<=Math.ceil(p.available)+2),'Every printed fragment must fit its physical content area within two layout pixels: '+JSON.stringify(overflow));
            assert.equal(printed.map(p=>p.text).join('').replace(/\s/g,''),before.replace(/\s/g,''),'Print must neither repeat nor omit content; renderer-only whitespace can differ.');
            let continuations=0;
            for(const sheet of printed)for(const list of sheet.list)for(const [i,item] of list.items.entries()){
                const match=/Ordered item (\d+)/.exec(item.text);
                if(item.continued){continuations++;assert.equal(item.marker,'none');}
                if(match)assert.equal(list.start+i,Number(match[1]));else assert.ok(item.continued);
            }
            assert.ok(printed.filter(sheet=>sheet.text.includes('Row ')).every(sheet=>sheet.headers===2),'Every continued table fragment repeats its headers.');
            assert.ok(continuations>0,'Printed item continuations must suppress repeated markers.');
            assert.equal((await action('document')).text,source);assert.deepEqual(errors,[]);
            await page.locator('.ed-print-frame').evaluate(frame=>frame.contentWindow.dispatchEvent(new Event('afterprint')));
            console.log(engine+' paragraph/list/table fragmentation, stable layout, source preservation and print continuity passed.');
        } finally {await browser.close();}
    }
})().catch(e=>{console.error(e);process.exitCode=1;});
