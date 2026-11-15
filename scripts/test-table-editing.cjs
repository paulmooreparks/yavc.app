// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A table in the page view is edited as before it had a node view and a column element of its own (decision 198): rows and columns are added and deleted
// at the selection, text is pasted into a cell, and undo takes each back, in Visual and in Document view, with the Markdown that Docs gives back never
// holding the page's column elements. Against a built content package in the one-page host:
//   node scripts/test-table-editing.cjs <package folder> [chromium firefox webkit]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/tables/assets/',fixture=path.resolve(__dirname,'fixtures','portable-workspace');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const SOURCE='# Table\n\n| A | B |\n| --- | --- |\n| one | two |\n| three | four |\n\nAfter.\n';
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
    const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');const name=decodeURIComponent(u.pathname.slice(prefix.length));
        const own=name.startsWith('workspace-lab/'),file=own?path.join(fixture,name.slice('workspace-lab/'.length)):allowed.has(name)?path.join(artifact,name):null;
        if(!file||/\.\./.test(name))return res.writeHead(404).end();
        res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'}).end(await fs.readFile(file));}catch{if(!res.headersSent)res.writeHead(404).end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true});
        try{for(const view of ['visual','document']){
            const label=engine+' '+view,page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
            try{
                await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);await page.locator('#document .ProseMirror').waitFor();
                const run=(ref,input)=>page.evaluate(([r,i])=>pudlActions.run(r,i,{grant:'all'}),[ref,input]);
                await run('yavc.docs/set-text@1',{text:SOURCE});await run('yavc.docs/view@1',{mode:view});
                await page.locator('#document .ProseMirror td',{hasText:'one'}).first().waitFor();
                await page.waitForTimeout(view==='document'?1500:1000);
                const text=async()=>(await run('yavc.docs/document@1',{})).text;
                const rows=()=>page.evaluate(()=>[...document.querySelectorAll('#document .ProseMirror table')].filter(t=>!t.closest('.doc-page-gap')).map(t=>[...t.rows].filter(r=>!r.classList.contains('doc-page-gap')).map(r=>[...r.cells].map(c=>c.textContent.trim())))[0]);
                const same=(a,b,what)=>{if(JSON.stringify(a)!==JSON.stringify(b))failures.push(`${label}: ${what}: ${JSON.stringify(a)} and not ${JSON.stringify(b)}`);};
                if(/colgroup|data-doc-columns/.test(await text()))failures.push(`${label}: the page's column elements are in the Markdown`);
                const hasGroup=await page.evaluate(()=>!!document.querySelector('#document .ProseMirror table > colgroup[data-doc-columns]'));
                if(view==='document'&&!hasGroup)failures.push(`${label}: the table has no column elements of its own`);
                const target=()=>page.locator('#document .ProseMirror td',{hasText:'one'}).first(),cell=()=>({click:async()=>{await target().click();await page.waitForTimeout(400);},press:k=>page.keyboard.press(k)});
                await cell().click();
                await run('yavc.docs/table@1',{op:'row-below'});same(await rows(),[['A','B'],['one','two'],['',''],['three','four']],'a row added below');
                await page.waitForTimeout(300);await page.keyboard.press('Control+z');await page.waitForTimeout(300);same(await rows(),[['A','B'],['one','two'],['three','four']],'undo of the added row');
                await cell().click();await run('yavc.docs/table@1',{op:'column-after'});same((await rows())[0].length,3,'a column added after');
                await page.waitForTimeout(300);await page.keyboard.press('Control+z');await page.waitForTimeout(300);same((await rows())[0].length,2,'undo of the added column');
                await cell().click();await run('yavc.docs/table@1',{op:'delete-row'});same(await rows(),[['A','B'],['three','four']],'a row deleted');
                await page.waitForTimeout(300);await page.keyboard.press('Control+z');await page.waitForTimeout(300);same(await rows(),[['A','B'],['one','two'],['three','four']],'undo of the deleted row');
                await cell().click();await run('yavc.docs/table@1',{op:'delete-column'});same((await rows())[0],['B'],'a column deleted');
                await page.waitForTimeout(300);await page.keyboard.press('Control+z');await page.waitForTimeout(300);same((await rows())[0],['A','B'],'undo of the deleted column');
                // A paste of plain text into a cell, and its undo.
                await cell().click();await page.keyboard.press('End');
                for(let attempt=0;attempt<3&&!/pasted/.test((await rows())[1][0]);attempt++){await page.evaluate(()=>{const box=document.createElement('textarea');box.value=' pasted';document.body.append(box);box.select();document.execCommand('copy');box.remove();});await cell().click();await page.keyboard.press('End');await page.keyboard.press('Control+v');await page.waitForTimeout(500);}
                await page.waitForTimeout(300);
                const pasted=(await rows())[1][0];if(!/pasted/.test(pasted))failures.push(`${label}: the paste did not reach the cell (${pasted})`);
                await page.waitForTimeout(300);await page.keyboard.press('Control+z');await page.waitForTimeout(300);same((await rows())[1][0],'one','undo of the paste');
                // Typing in a cell after all of it, and the Markdown for the whole.
                await cell().click();await page.keyboard.press('End');await page.keyboard.type(' typed');
                const final=await text();if(!/\| one typed \| two \|/.test(final))failures.push(`${label}: the typed text is not in the Markdown: ${final.replace(/\n/g,'/')}`);
                if(/colgroup|data-doc-columns/.test(final))failures.push(`${label}: the page's column elements reached the Markdown`);
                if(errors.length)failures.push(`${label}: page errors ${errors.join(' | ')}`);
                console.log(`${label}: rows and columns added and deleted, a paste and typing, each undone, with no column element in the Markdown`);
            }catch(e){failures.push(`${label}: ${String(e.message).split(/\r?\n/)[0]}`);}finally{await page.close();}
        }}finally{await browser.close();}
    }}finally{server.close();}
    assert.deepEqual(failures,[],failures.join('\n'));
    console.log('A table with a node view and column elements is edited as before.');
})().catch(error=>{console.error(error.message||error);process.exitCode=1;});
