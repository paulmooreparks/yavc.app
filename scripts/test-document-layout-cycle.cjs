// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The Document view stops laying out when it is idle, and a layout that cannot settle ends in a fixed arrangement (decision 197).
// A long requirements document of the shape that GK Companion reported (104 scenarios with step tables, a page break after each, a review note, and one
// nested table taller than a page) is opened in the Document view of the one-page host, with and without the oversized block. After the first layout the
// page's gaps and the scroll position must stay the same, also after a scroll to a distant page and back; the page must make no layout pass in 5 idle
// seconds (the counters `data-layout-passes` and `data-layout-changes`, docs/editing-settings-contract.md); and an edit near the start must be laid out
// again and then settle again. A last case drives a real cycle: a style that changes the height of the first heading each time the page draws new gaps
// makes every layout the reverse of the one before, and the page must keep one arrangement, say so with `data-layout-stopped`, and lay out again
// after an edit. No customer text is used.
//   node scripts/test-document-layout-cycle.cjs <package folder> [chromium firefox webkit]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/cycle/assets/',fixture=path.resolve(__dirname,'fixtures','portable-workspace');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const SENTENCE='The operator selects a synthetic action and the application preserves its visible state until the next documented transition completes.';
const prose=n=>Array.from({length:n},()=>SENTENCE).join(' ');
function longDocument(oversized){
    let t='---\ntitle: Synthetic Long Concept\npage: a4\n---\n\n# Synthetic Long Concept\n\n';
    for(let s=1;s<=104;s++){
        t+='## Synthetic Scenario '+s+'\n\n### Expected Behavior\n\n'+prose(5)+'\n\n| Step | Actor | Action |\n| --- | --- | --- |\n';
        for(let i=1;i<=5;i++)t+='| '+i+' | '+(i%2?'Operator':'Application')+' | '+SENTENCE+' |\n';
        if(s%8===0)t+='\n{{info:Synthetic Review Note}}\n\n'+prose(3)+'\n\n{{/info}}\n';
        if(s===52&&oversized)t+='\n<table><tbody><tr><td>Oversized synthetic block</td><td><table><tbody>'+Array.from({length:90},(_,i)=>'<tr><td>Synthetic nested row '+(i+1)+'</td><td>'+SENTENCE+'</td></tr>').join('')+'</tbody></table></td></tr></tbody></table>\n';
        if(s<104)t+='\n{{page-break}}\n\n';
    }
    return t;
}
function shortDocument(){let t='# First Heading\n\n';for(let s=1;s<=40;s++)t+=prose(6)+'\n\n';return t;}
// What the page shows: each gap's top and height, the page count and the scroll position.
const arrangement=()=>{const root=document.querySelector('#document'),pm=root.querySelector('.ProseMirror'),top=pm.getBoundingClientRect().top,scroll=root.querySelector('.ed-scroll');
    return {gaps:[...pm.querySelectorAll('.doc-page-gap')].map(g=>{const r=g.getBoundingClientRect();return [Math.round(r.top-top),Math.round(r.height)];}),pages:root.querySelector('[data-page-count]')?.getAttribute('data-page-count'),scroll:scroll?Math.round(scroll.scrollTop):0};};
const counters=()=>{const el=document.querySelector('#document [data-page-count]');return {passes:Number(el?.getAttribute('data-layout-passes')),changes:Number(el?.getAttribute('data-layout-changes')),stopped:el?.hasAttribute('data-layout-stopped')};};
// Tables whose columns are not the ones the table has laid out alone (a gap before the first row must not decide them), and blocks that run into a page gap.
const columnsAndGaps=()=>{
    const pm=document.querySelector('#document .ProseMirror'),top=pm.getBoundingClientRect().top,out={tables:0,wrong:[],overlaps:[]};
    for(const t of pm.querySelectorAll('table')){
        if(t.closest('.doc-page-gap')||t.closest('.doc-gap-cap'))continue;const real=[...t.rows].find(r=>!r.classList.contains('doc-page-gap'));if(!real)continue;
        const holder=document.createElement('div'),copy=t.cloneNode(true);holder.className=pm.className;holder.style.cssText='position:absolute;visibility:hidden;left:-100000px;top:0;width:'+pm.clientWidth+'px';
        copy.querySelectorAll('.doc-page-gap,.doc-gap-cap,.doc-gap-cover,colgroup').forEach(n=>n.remove());copy.removeAttribute('style');copy.querySelectorAll('td,th').forEach(n=>n.removeAttribute('style'));
        holder.append(copy);pm.parentElement.append(holder);const alone=[...copy.rows[0].cells].map(c=>c.getBoundingClientRect().width);holder.remove();
        const now=[...real.cells].map(c=>c.getBoundingClientRect().width);out.tables++;
        if(now.length!==alone.length||Math.max(...now.map((w,i)=>Math.abs(w-alone[i])))>3)out.wrong.push({now:now.map(Math.round),alone:alone.map(Math.round),afterGap:t.rows[0].classList.contains('doc-page-gap')});
    }
    const gaps=[...pm.querySelectorAll('.doc-page-gap')].filter(g=>getComputedStyle(g).position!=='absolute'&&!g.closest('.doc-gap-cap')).map(g=>{const r=g.getBoundingClientRect();return {t:r.top-top,b:r.bottom-top,el:g};}).filter(g=>g.b-g.t>1);
    for(const e of pm.querySelectorAll('p,li,tr,h1,h2,h3,h4,h5,h6,pre,figure')){
        if(e.closest('.doc-page-gap')||e.querySelector('.doc-page-gap')||e.closest('.doc-gap-cap')||e.closest('.doc-footnote'))continue;const r=e.getBoundingClientRect();if(r.height<2)continue;
        for(const g of gaps){if(g.el.contains(e))continue;if(Math.min(r.bottom-top,g.b)-Math.max(r.top-top,g.t)>1.5){out.overlaps.push((e.tagName+' '+(e.textContent||'').slice(0,20)).trim());break;}}
    }
    return out;
};
// Waits until the arrangement has stayed the same for `frames` frames, and answers with it.
function settle({frames,limit}){
    return new Promise(done=>{const started=performance.now();let last=null,same=0;
        (function tick(){const now=window.arrangement(),key=JSON.stringify(now);same=key===last?same+1:0;last=key;
            if(same>=frames)return done({settled:true,ms:Math.round(performance.now()-started),now});
            if(performance.now()-started>limit)return done({settled:false,ms:Math.round(performance.now()-started),now});
            requestAnimationFrame(tick);})();});
}
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));let text='',withNote=false;const note=await fs.readFile(path.join(__dirname,'fixtures','docs-long-settle.md'),'utf8'),noteHost=await fs.readFile(path.join(__dirname,'fixtures','long-note-host.js'),'utf8');
    const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');const name=decodeURIComponent(u.pathname.slice(prefix.length));
        const own=name.startsWith('workspace-lab/'),file=own?path.join(fixture,name.slice('workspace-lab/'.length)):allowed.has(name)?path.join(artifact,name):null;
        if(!file||/\.\./.test(name))return res.writeHead(404).end();
        let body=await fs.readFile(file);
        if(name==='workspace-lab/host.js')body=Buffer.from(body+(withNote?'\n'+noteHost:'')+"\nfixture.records.get('memory:document.docs.md').text="+JSON.stringify(text)+";");
        res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);}catch{if(!res.headersSent)res.writeHead(404).end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];
    async function open(browser,source,width,notes){
        text=source;withNote=!!notes;const page=await browser.newPage({viewport:{width:width||2048,height:1152}});await page.addInitScript("window.arrangement="+arrangement.toString());await page.addInitScript("window.columnsAndGaps="+columnsAndGaps.toString());page.setDefaultTimeout(60000);page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
        await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);
        await page.locator('#document .doc-paginated .ProseMirror').waitFor();await page.evaluate(()=>document.fonts.ready);return page;
    }
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true});
        try{
            for(const shape of [{oversized:false},{oversized:true},{note:true,width:1620},{note:true,width:700}]){
                const oversized=!!shape.oversized,label=engine+(shape.note?' with the synthetic note at '+shape.width+' pixels':oversized?' with the oversized block':' without it'),page=await open(browser,shape.note?note:longDocument(oversized),shape.width,shape.note);
                try{
                    const first=await page.evaluate(settle,{frames:120,limit:60000});
                    if(!first.settled){failures.push(`${label}: the first layout did not settle in 60 s`);continue;}
                    const warned=await page.evaluate(()=>/indivisible block is taller than the page/.test(document.body.innerText));
                    if(!shape.note&&warned!==oversized)failures.push(`${label}: the warning is ${warned?'shown':'absent'}`);
                    const c0=await page.evaluate(counters);
                    if(!(c0.passes>=1)||!(c0.changes>=1))failures.push(`${label}: the layout counters are missing or zero (${JSON.stringify(c0)})`);
                    // A table row that follows a page gap is as wide as the table, and its columns must not take their widths from the gap's one cell.
                    const squeezed=await page.evaluate(()=>[...document.querySelectorAll('#document .ProseMirror table')].filter(t=>!t.closest('.doc-page-gap')).filter(t=>{const row=[...t.rows].find(r=>!r.classList.contains('doc-page-gap'));return row&&row.cells.length>1&&[...row.cells].some(c=>c.getBoundingClientRect().width<5);}).length);
                    if(squeezed)failures.push(`${label}: ${squeezed} tables have a column with no width`);
                    // Every table has the columns it has laid out alone, also those that follow a gap, and no block runs into a gap.
                    if(shape.note){
                        const found=await page.evaluate(()=>window.columnsAndGaps());
                        if(found.wrong.length)failures.push(`${label}: ${found.wrong.length} of ${found.tables} tables have columns that are not those of the table laid out alone, such as ${JSON.stringify(found.wrong[0])}`);
                        if(found.overlaps.length)failures.push(`${label}: ${found.overlaps.length} blocks run into a page gap, such as ${found.overlaps[0]}`);
                    }
                    // Idle: no layout pass in 5 seconds, and the same arrangement.
                    await page.evaluate(()=>{window.idleWrites=[];window.idleWatch=new MutationObserver(list=>{for(const m of list)window.idleWrites.push(m.type+' '+(m.target.nodeType===1?m.target.tagName+'.'+String(m.target.className).slice(0,40):'#text')+' '+(m.attributeName||''));});window.idleWatch.observe(document.querySelector('#document'),{subtree:true,childList:true,attributes:true,characterData:true});});
                    await page.waitForTimeout(5000);
                    const writes=await page.evaluate(()=>{window.idleWatch.disconnect();return window.idleWrites.slice(0,5);});
                    if(writes.length)failures.push(`${label}: the page was written to while idle: ${writes.join('; ')}`);
                    const c1=await page.evaluate(counters),a1=await page.evaluate(arrangement);
                    if(c1.passes!==c0.passes)failures.push(`${label}: ${c1.passes-c0.passes} layout passes in 5 idle seconds`);
                    if(c1.changes!==c0.changes)failures.push(`${label}: the layout changed ${c1.changes-c0.changes} times in 5 idle seconds`);
                    if(c1.stopped)failures.push(`${label}: the layout was stopped by the cycle guard on a document that settles`);
                    if(JSON.stringify(a1.gaps)!==JSON.stringify(first.now.gaps)||a1.pages!==first.now.pages)failures.push(`${label}: the page arrangement changed while idle`);
                    // A scroll to a distant page and back leaves the arrangement as it was.
                    await page.evaluate(()=>{const b=document.querySelector('#document .ed-scroll');b.scrollTop=b.scrollHeight*.75;});await page.waitForTimeout(1500);
                    await page.evaluate(()=>{document.querySelector('#document .ed-scroll').scrollTop=0;});await page.waitForTimeout(1500);
                    const a2=await page.evaluate(arrangement),c2=await page.evaluate(counters);
                    if(JSON.stringify(a2.gaps)!==JSON.stringify(first.now.gaps)||a2.pages!==first.now.pages)failures.push(`${label}: the gaps are not where they were after a scroll to a distant page and back`);
                    if(a2.scroll!==first.now.scroll)failures.push(`${label}: the scroll position is ${a2.scroll} and not ${first.now.scroll} after the trip`);
                    if(c2.changes!==c0.changes)failures.push(`${label}: scrolling changed the layout ${c2.changes-c0.changes} times`);
                    // An edit near the start is laid out again, and then the page settles again.
                    await page.locator('#document .ProseMirror > p').first().click();await page.keyboard.press('Control+Home');await page.keyboard.type('Synthetic edit. ');
                    await page.waitForFunction(p=>Number(document.querySelector('#document [data-page-count]').getAttribute('data-layout-passes'))>p,c2.passes,{timeout:8000}).catch(()=>failures.push(`${label}: the edit was not counted as a layout pass`));
                    const edited=await page.evaluate(settle,{frames:120,limit:60000});
                    if(!edited.settled)failures.push(`${label}: after an edit the page did not settle`);
                    const c3=await page.evaluate(counters);await page.waitForTimeout(3000);const c4=await page.evaluate(counters);
                    if(c4.passes!==c3.passes)failures.push(`${label}: ${c4.passes-c3.passes} layout passes in 3 idle seconds after an edit`);
                    if(shape.note){
                        // An edit and its undo give back the page count the note had on load.
                        for(let i=0;i<8;i++){await page.keyboard.press('Control+z');}
                        const undone=await page.evaluate(settle,{frames:120,limit:60000});
                        const text=await page.evaluate(()=>document.querySelector('#document .ProseMirror').textContent.includes('Synthetic edit.'));
                        if(text)failures.push(`${label}: the undo left the edit in the text`);
                        else if(undone.now.pages!==first.now.pages)failures.push(`${label}: ${first.now.pages} pages on load and ${undone.now.pages} after an edit and its undo`);
                        const again=await page.evaluate(()=>window.columnsAndGaps());
                        if(again.wrong.length||again.overlaps.length)failures.push(`${label}: after the edit and its undo ${again.wrong.length} tables have other columns (${JSON.stringify(again.wrong[0])}) and ${again.overlaps.length} blocks run into a gap`);
                    }
                    if(page.errors.length)failures.push(`${label}: page errors ${page.errors.join(' | ')}`);
                    console.log(`${label}: ${first.now.pages} pages, settled in ${first.ms} ms, ${c0.passes} passes and ${c0.changes} changes to get there, none while idle, after the trip or after the edit settled`);
                }catch(e){failures.push(`${label}: ${String(e.message).split(/\r?\n/)[0]}`);}finally{await page.close();}
            }
            // A layout that is the reverse of the one before it, every time: the page stops on one arrangement.
            {
                const label=engine+' with a layout that reverses itself',page=await open(browser,shortDocument());
                try{
                    await page.evaluate(settle,{frames:60,limit:30000});
                    await page.evaluate(()=>{
                        const pm=document.querySelector('#document .ProseMirror');window.toggled=0;
                        const style=document.createElement('style');style.textContent='#document .ProseMirror > h1 { margin-top: var(--cycle, 0px) !important; }';document.head.append(style);
                        new MutationObserver(list=>{if(list.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('.doc-page-gap')||n.querySelector?.('.doc-page-gap'))))){window.toggled++;pm.style.setProperty('--cycle',window.toggled%2?'1100px':'0px');}}).observe(pm,{childList:true,subtree:true});
                        pm.style.setProperty('--cycle','1100px');window.toggled=1;
                    });
                    await page.waitForTimeout(6000);
                    const stuck=await page.evaluate(()=>({toggled:window.toggled,...(()=>{const el=document.querySelector('#document [data-page-count]');return {passes:Number(el.getAttribute('data-layout-passes')),stopped:el.hasAttribute('data-layout-stopped')};})()}));
                    await page.waitForTimeout(3000);
                    const later=await page.evaluate(()=>({toggled:window.toggled,passes:Number(document.querySelector('#document [data-page-count]').getAttribute('data-layout-passes'))}));
                    if(stuck.toggled>12||later.toggled!==stuck.toggled)failures.push(`${label}: the layout kept changing (${stuck.toggled} arrangements after 6 s, ${later.toggled} after 9 s)`);
                    if(later.passes!==stuck.passes)failures.push(`${label}: ${later.passes-stuck.passes} more layout passes in 3 seconds after the cycle`);
                    if(!stuck.stopped)failures.push(`${label}: the page did not say that the guard stopped it`);
                    // An edit is real input: the page lays out again.
                    await page.evaluate(()=>{document.querySelector('#document [data-page-count]').setAttribute('data-test-mark','1');});
                    await page.locator('#document .ProseMirror > p').first().click();await page.keyboard.press('Control+Home');await page.keyboard.type('X');
                    await page.waitForFunction(p=>Number(document.querySelector('#document [data-page-count]').getAttribute('data-layout-passes'))>p,later.passes,{timeout:8000}).catch(()=>failures.push(`${label}: the edit was not laid out again`));
                    if(page.errors.length)failures.push(`${label}: page errors ${page.errors.join(' | ')}`);
                    console.log(`${label}: stopped after ${stuck.toggled} arrangements and laid out again after an edit`);
                }catch(e){failures.push(`${label}: ${String(e.message).split(/\r?\n/)[0]}`);}finally{await page.close();}
            }
        }finally{await browser.close();}
    }}finally{server.close();}
    assert.deepEqual(failures,[],failures.join('\n'));
    console.log('The Document view makes no layout pass while idle, keeps its arrangement through a trip and an edit, and a layout that reverses itself ends in one arrangement.');
})().catch(error=>{console.error(error.message||error);process.exitCode=1;});
