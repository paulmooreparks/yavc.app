// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Invented tall pipe-table cells exercise page cuts, including inline gaps and exhausted columns.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),fixture=path.join(__dirname,'fixtures/portable-workspace'),prefix='/row/assets/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const prose=(name,n)=>Array.from({length:n},(_,i)=>`${name}${i} describes an invented physical mapping and preserves the next line in its own column.`).join(' ');
const source='---\npage: 420pt x 500pt\nmargins: 30pt\n---\n\n{{style}}\ntd { background-color: #e6f2ff; }\n{{/style}}\n\n# Invented mapping\n\n| Step | Operator | Mapping | Outcome |\n| --- | --- | --- | --- |\n'+Array.from({length:4},(_,i)=>`| ${i+1} | ${prose('Operator',6+i)} | ${prose('Mapping',8-i)} | ${prose('Outcome',2+i)} |`).join('\n')+'\n\nAfter the table.\n';
const rowHeaderSource=source.slice(0,source.indexOf('| Step |'))+'<table><thead><tr><th>Step</th><th>Operator</th><th>Mapping</th><th>Outcome</th></tr></thead><tbody>'+Array.from({length:4},(_,i)=>`<tr><th scope="row">${i+1}</th><td>${prose('Operator',6+i)}</td><td>${prose('Mapping',8-i)}</td><td>${prose('Outcome',2+i)}</td></tr>`).join('')+'</tbody></table>\n\nAfter the table.\n';
function inspect(){
    const pm=document.querySelector('#document .ProseMirror'),page=pm.parentElement,box=r=>({top:r.top,bottom:r.bottom,left:r.left,right:r.right});
    const gaps=[...pm.querySelectorAll('.doc-page-gap')].filter(g=>getComputedStyle(g).position!=='absolute'&&!g.closest('.doc-gap-cap')).map(el=>({el,r:el.getBoundingClientRect()})).filter(g=>g.r.height>1);
    const rows=[...pm.querySelectorAll('tr')].filter(r=>!r.closest('.doc-page-gap,.doc-gap-cap'));
    const overlap=[];
    for(const row of rows){
        const rect=row.getBoundingClientRect(),text=[];const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode())){if(!node.textContent.trim()||node.parentElement.closest('.doc-page-gap,.doc-gap-cap'))continue;const range=document.createRange();range.selectNodeContents(node);text.push(...[...range.getClientRects()].filter(r=>r.width>0&&r.height>0));}
        for(const gap of gaps){if(gap.el.contains(row))continue;const pixels=Math.min(rect.bottom,gap.r.bottom)-Math.max(rect.top,gap.r.top);if(pixels<=1.5)continue;
            const hits=text.filter(r=>Math.min(r.bottom,gap.r.bottom)-Math.max(r.top,gap.r.top)>1.5&&Math.min(r.right,gap.r.right)>Math.max(r.left,gap.r.left));
            // A row containing its own spacer spans pages. Its text, and every unrelated row, must stay clear of the spacer.
            if(!row.contains(gap.el)||hits.length)overlap.push({row:box(rect),gap:box(gap.r),own:row.contains(gap.el),hits:hits.map(box),classes:gap.el.className,position:getComputedStyle(gap.el).position,owner:gap.el.closest('tr')?box(gap.el.closest('tr').getBoundingClientRect()):null,frame:gap.el.closest('.sc-notice,[data-sc-frame]')?.className,parents:(()=>{const list=[];for(let p=gap.el;p&&p!==pm;p=p.parentElement){const css=getComputedStyle(p);list.push({tag:p.tagName,cls:p.className,rect:box(p.getBoundingClientRect()),display:css.display,line:css.lineHeight,height:css.height});if(p.tagName==='TD')break;}return list;})()});
        }
    }
    const headers=[...pm.querySelectorAll('.doc-cell-repeated-header')],period=parseFloat(page.style.getPropertyValue('--sheet-height'))+24,contentTop=page.getBoundingClientRect().top+parseFloat(page.style.getPropertyValue('--sheet-top'));
    const headerErrors=headers.map(h=>{const at=h.getBoundingClientRect().top-contentTop;return Math.abs(at-Math.round(at/period)*period);}).filter(n=>n>1);
    const continuationErrors=[];
    for(const header of headers){if(getComputedStyle(header.parentElement).position==='absolute')continue;const cell=header.closest('td,th'),bottom=header.getBoundingClientRect().bottom,walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);let node,next=Infinity;
        while((node=walker.nextNode())){if(!node.data.trim()||node.parentElement.closest('.doc-page-gap'))continue;const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects())if(r.width>0&&r.top>=bottom-1)next=Math.min(next,r.top);}
        const css=getComputedStyle(cell),line=parseFloat(css.lineHeight)||parseFloat(css.fontSize)*1.5;if(next-bottom>line+2)continuationErrors.push(next-bottom);
    }
    const metadata=yavcDocumentPages.blocks(pm).filter(b=>b.node.matches('colgroup,col')).map(b=>b.node.tagName);
    const sourceHeaders=[...pm.querySelectorAll('table')].flatMap(table=>{const headers=[];for(const row of table.rows){if(row.classList.contains('doc-page-gap'))continue;if(!row.cells.length||![...row.cells].every(c=>c.tagName==='TH'&&!/^(row|rowgroup)$/.test(c.getAttribute('scope')||'')))break;headers.push(row);}return headers;});
    return {pages:page.dataset.pageCount,passes:page.dataset.layoutPasses,stopped:page.dataset.layoutStopped,inline:gaps.filter(g=>g.el.matches('span')).length,overlap,headerErrors,continuationErrors,metadata,headerFurniture:sourceHeaders.reduce((n,row)=>n+row.querySelectorAll('.doc-page-gap').length,0)+pm.querySelectorAll('.doc-cell-repeated-header .doc-page-gap').length,covers:page.querySelectorAll('.doc-table-gap-cover').length,offsetHeight:pm.querySelector('.row-offset')?.getBoundingClientRect().height,
        warning:/indivisible block is taller than the page/i.test(document.body.innerText),
        headers:[...pm.querySelectorAll('.doc-cell-repeated-header')].map(h=>({rect:box(h.getBoundingClientRect()),gap:box(h.parentElement.getBoundingClientRect()),text:h.textContent})),
        pageTop:page.getBoundingClientRect().top,sheetHeight:parseFloat(page.style.getPropertyValue('--sheet-height')),sheetTop:parseFloat(page.style.getPropertyValue('--sheet-top')),
        cells:[...pm.querySelectorAll('td')].filter(c=>!c.closest('.doc-page-gap')).slice(0,4).map(c=>({rect:box(c.getBoundingClientRect()),border:getComputedStyle(c).borderLeft,background:getComputedStyle(c).backgroundColor}))};
}
async function checkPaint(page,engine){
    const headers=page.locator('#document :is(td,th):first-child .doc-cell-repeated-header'),count=await headers.count();assert.ok(count>=2,engine+': the table must have two continued pieces');
    for(let i=0;i<Math.min(count,3);i++){
        await headers.nth(i).scrollIntoViewIfNeeded();
        const samples=await headers.nth(i).evaluate(header=>{const row=header.closest('tr'),table=row.closest('table'),p=table.closest('.doc-paginated'),pr=p.getBoundingClientRect(),period=parseFloat(p.style.getPropertyValue('--sheet-height'))+24;
            const sheet=Math.round((header.getBoundingClientRect().top-pr.top-parseFloat(p.style.getPropertyValue('--sheet-top')))/period);
            const end=pr.top+(sheet-1)*period+parseFloat(p.style.getPropertyValue('--sheet-height'))-parseFloat(p.style.getPropertyValue('--sheet-bottom'));
            const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let node,last=-Infinity;
            while((node=walker.nextNode())){if(!node.data.trim()||node.parentElement.closest('.doc-page-gap'))continue;const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects())if(r.width>0&&r.bottom<=end+1)last=Math.max(last,r.bottom);}
            let y=last+4;for(const rule of p.querySelectorAll('.doc-table-cut-border')){const r=rule.getBoundingClientRect();if(y>=r.top-2&&y<=r.bottom+2)y=r.bottom+4;}
            return [...table.rows[0].cells].flatMap(c=>{const cr=c.getBoundingClientRect();return [{x:Math.round(cr.left),y:Math.round(y)},{x:Math.round((cr.left+cr.right)/2),y:Math.round(y)}];});});
        const png=(await page.screenshot()).toString('base64');
        const bad=await page.evaluate(async({png,samples})=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return samples.filter(p=>{const rgb=context.getImageData(p.x,p.y,1,1).data;return Math.min(rgb[0],rgb[1],rgb[2])<250;});},{png,samples});
        assert.deepEqual(bad,[],engine+': cell borders or backgrounds remain below the last line');
    }
}
async function settled(page){
    await page.evaluate(()=>new Promise((resolve,reject)=>{let last='',same=0;const start=performance.now();function tick(){const p=document.querySelector('#document [data-page-count]'),key=p.dataset.layoutPasses+':'+p.dataset.pageCount;same=key===last?same+1:0;last=key;if(same>=60)return resolve();if(performance.now()-start>30000)return reject(new Error('The page did not settle'));requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
}
async function checkCoverClearance(page,engine){
    const result=await page.evaluate(()=>{
        const pm=document.querySelector('#document .ProseMirror'),covers=[...pm.parentElement.querySelectorAll('.doc-table-gap-cover')].map(n=>n.getBoundingClientRect()),hits=[];let uneven=false;
        const rects=cell=>{const out=[],walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(!node.data.trim()||node.parentElement.closest('.doc-page-gap'))continue;const range=document.createRange();range.selectNodeContents(node);out.push(...[...range.getClientRects()].filter(r=>r.width>0&&r.height>0));}return out;};
        for(const row of pm.querySelectorAll('tr')){if(row.closest('.doc-page-gap,.doc-gap-cap'))continue;const cells=[...row.cells].map(rects);
            for(const cover of covers){const header=[...row.querySelectorAll('.doc-cell-repeated-header')].find(h=>Math.abs(h.getBoundingClientRect().top-cover.bottom)<1);if(!header)continue;
                const ends=cells.map(list=>Math.max(-Infinity,...list.filter(r=>r.bottom<=cover.top+.5).map(r=>r.bottom))).filter(Number.isFinite),last=Math.max(...ends);
                if(Math.max(...ends)-Math.min(...ends)>20)uneven=true;
                if(cover.top<last-.5||cover.top>last+2)hits.push({reason:'cover does not begin at the lowest line',cover:cover.top,last});
            }
            for(const r of cells.flat())for(const cover of covers)if(Math.min(r.bottom,cover.bottom)-Math.max(r.top,cover.top)>.5&&Math.min(r.right,cover.right)-Math.max(r.left,cover.left)>.5)hits.push({reason:'source text is covered',top:r.top});
        }return {hits,uneven};
    });
    assert.ok(result.uneven,engine+': the fixture needs a cell that ends above its neighbours');assert.deepEqual(result.hits,[],engine+': a cover must start at the whole row piece\'s last line without covering any source text');
}
async function checkPrint(page,engine){
    await page.evaluate(()=>{const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='IFRAME')node.contentWindow.print=()=>{window.rowGapPrinted=true;};};window.rowGapPrintTask=pudlActions.run('yavc.docs/print@1',{}, {grant:'all'});});
    await page.evaluate(()=>window.rowGapPrintTask);assert.equal(await page.evaluate(()=>window.rowGapPrinted),true,engine+': the tall table must print');
    const frame=page.locator('.ed-print-frame');assert.equal(await frame.evaluate(f=>f.contentDocument.querySelectorAll('.doc-table-gap-cover,.doc-page-gap').length),0,engine+': live page furniture must not reach print');
    await frame.evaluate(f=>{f.style.cssText='display:block!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:100000!important;';});
    const sheets=page.frameLocator('.ed-print-frame').locator('.doc-print-sheet');assert.ok(await sheets.count()>=3);
    for(let i=0;i<Math.min(await sheets.count(),3);i++){
        await sheets.nth(i).scrollIntoViewIfNeeded();
        const result=await sheets.nth(i).evaluate(sheet=>{const table=sheet.querySelector('table');if(!table)return null;const tr=table.getBoundingClientRect(),walker=document.createTreeWalker(table,NodeFilter.SHOW_TEXT);let node,last=-Infinity;
            while((node=walker.nextNode())){if(!node.data.trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects())if(r.width>0)last=Math.max(last,r.bottom);}
            return {tail:tr.bottom-last,samples:[...table.rows[0].cells].flatMap(c=>{const r=c.getBoundingClientRect();return [{x:Math.round(r.left),y:Math.round(tr.bottom+4)},{x:Math.round((r.left+r.right)/2),y:Math.round(tr.bottom+4)}];})};});
        if(!result)continue;assert.ok(result.tail<32,engine+': printed cell paint extends too far past its last line');
        const png=(await page.screenshot()).toString('base64');
        const bad=await page.evaluate(async({png,samples})=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return samples.filter(p=>{const rgb=context.getImageData(p.x,p.y,1,1).data;return Math.min(rgb[0],rgb[1],rgb[2])<250;});},{png,samples:result.samples});
        assert.deepEqual(bad,[],engine+': the printed blank band contains cell borders or backgrounds');
    }
    await frame.evaluate(f=>f.contentWindow.dispatchEvent(new Event('afterprint')));assert.equal(await frame.count(),0);
}
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
    const noteMode=process.env.ROW_GAP_NOTE==='1',plain=noteMode?await fs.readFile(path.join(__dirname,'fixtures/docs-long-settle.md'),'utf8'):source,host=await fs.readFile(path.join(__dirname,'fixtures/long-note-host.js'),'utf8');let text=plain;
    const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(prefix.length)),own=name.startsWith('workspace-lab/');
        if(name==='workspace-lab/slow-inter.woff2'){await new Promise(r=>setTimeout(r,2500));return res.writeHead(200,{'Content-Type':'font/woff2'}).end(await fs.readFile(path.join(artifact,'pudl/fonts/Inter-latin.woff2')));}
        const file=own?path.join(fixture,name.slice(14)):allowed.has(name)?path.join(artifact,name):null;if(!file||name.includes('..'))return res.writeHead(404).end();let body=await fs.readFile(file);
        if(name==='workspace-lab/host.js')body=Buffer.from(body+'\n'+host+'\nfixture.records.get("memory:document.docs.md").text='+JSON.stringify(text)+';');
        res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(body);
    }catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const failures=[];
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const offsets=process.env.ROW_GAP_SWEEP==='1'?Array.from({length:58},(_,i)=>i*20):[Number(process.env.ROW_GAP_OFFSET)||0],frames=noteMode?['plain']:process.env.ROW_GAP_FRAME==='1'?['framed']:['plain','framed','code-header','row-header'];
        const browser=await pw[engine].launch({headless:true});try{for(const {offset,variant} of offsets.flatMap(offset=>frames.map(variant=>({offset,variant})))){
            const base=variant==='row-header'?rowHeaderSource:variant==='framed'?plain.replace('| Step |','{{info:Invented frame}}\n\n| Step |').replace('\n\nAfter the table.','\n\n{{/info}}\n\nAfter the table.'):variant==='code-header'?plain.replace('# Invented mapping','# Invented mapping\n\n'+prose('Introduction',12)).replace('Operator | Mapping |','`Operator reference with wrapped code labels and names for this column` | Mapping |'):plain;
            text=offset?base.replace(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)?/,m=>m+'\n{{style}}\n.row-offset {height:'+offset+'px;}\n{{/style}}\n\n<div class="row-offset">Invented offset.</div>\n\n'):base;
            const page=await browser.newPage({viewport:{width:1620,height:1100}});page.setDefaultTimeout(60000);const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
            if(process.env.ROW_GAP_SLOW==='1')await page.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent="@font-face{font-family:RowSlowInter;src:url(slow-inter.woff2) format('woff2');} #document .ProseMirror td,#document .ProseMirror th{font-family:RowSlowInter,serif!important;}";document.head.append(style);});});
            await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);await page.locator('#document .doc-paginated .ProseMirror').waitFor().catch(async e=>{throw new Error(e.message+'; page errors: '+pageErrors.join(' | ')+'; body: '+(await page.locator('body').innerText()).slice(0,1500));});await page.evaluate(()=>document.fonts.ready);
            if(process.env.ROW_GAP_SLOW==='1')await page.waitForFunction(()=>[...document.fonts].some(f=>f.family==='RowSlowInter'&&f.status==='loaded'));
            await page.waitForFunction(()=>document.querySelector('#document .doc-page-gap-inline'));
            await settled(page);
            if(variant==='row-header')assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#document .ProseMirror tr')].filter(r=>!r.closest('.doc-page-gap')&&r.cells[0]?.tagName==='TH'&&[...r.cells].some(c=>c.tagName==='TD')).length),4,engine+': the fixture must retain its four HTML body rows with row-header cells');
            const result=await page.evaluate(inspect);console.log(engine+' offset '+offset+' '+variant+' '+JSON.stringify({...result,headers:undefined,cells:undefined}));
            if(!noteMode){await page.waitForTimeout(2000);const idle=await page.evaluate(()=>{const p=document.querySelector('#document [data-page-count]');return {passes:p.dataset.layoutPasses,stopped:p.dataset.layoutStopped};});assert.equal(idle.passes,result.passes,engine+': a settled tall table made an idle layout pass');assert.equal(idle.stopped,undefined,engine+': the cycle guard stopped the tall table');}
            await fs.writeFile(path.join(process.env.TEMP||'/tmp','yavc-row-gap-'+engine+'.json'),JSON.stringify(result,null,2));
            if(process.env.ROW_GAP_SWEEP!=='1'){
            await page.locator('.doc-cell-repeated-header').first().scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(process.env.TEMP||'/tmp','yavc-row-gap-'+engine+'.png'),fullPage:true});
            if(!noteMode){await checkPaint(page,engine);await checkCoverClearance(page,engine);if(engine==='chromium'){await page.emulateMedia({forcedColors:'active'});await settled(page);await checkPaint(page,engine+' forced colours');await page.emulateMedia({forcedColors:'none'});await settled(page);}}
            }
            if(result.overlap.length)failures.push(engine+': '+result.overlap.length+' row/text overlaps with page gaps');
            if(result.stopped!=null)failures.push(engine+': the cycle guard stopped this table layout');
            if(!noteMode&&result.warning)failures.push(engine+': a splittable pipe table is reported as indivisible');
            if(result.metadata.length)failures.push(engine+': column metadata is emitted as content blocks');
            if(result.headerFurniture)failures.push(engine+': a source or repeated header contains page-gap furniture');
            if(offset&&(!Number.isFinite(result.offsetHeight)||Math.abs(result.offsetHeight-offset)>1))failures.push(engine+': the requested offset was not rendered');
            if(result.headerErrors.length)failures.push(engine+': repeated headers miss the page content top by '+JSON.stringify(result.headerErrors));
            if(result.continuationErrors.length)failures.push(engine+': blank space separates repeated headers from the continued text');
            if(Number(result.pages)<3||result.inline<2)failures.push(engine+': the fixture did not cross two page breaks');
            if(!noteMode){
                const run=(ref,input)=>page.evaluate(([r,i])=>pudlActions.run('yavc.docs/'+r+'@1',i,{grant:'all'}),[ref,input]);
                assert.equal((await run('document',{})).text,text,engine+': page furniture changed the source');
                await checkPrint(page,engine);
                const kinds=await page.evaluate(()=>{const host=document.createElement('div');host.className='doc-page';host.innerHTML='<table><caption>Invented caption</caption><colgroup><col><col></colgroup><tbody><tr><td>One</td><td>Two</td></tr></tbody></table>';document.body.append(host);try{return yavcDocumentPages.blocks(host).map(b=>b.node.tagName);}finally{host.remove();}});
                assert.deepEqual(kinds,['CAPTION','TR'],engine+': table blocks must be its caption and rows');
                await run('view',{mode:'visual'});await page.waitForFunction(()=>!document.querySelector('#document .doc-table-gap-cover'));
                await run('view',{mode:'document'});await settled(page);assert.equal((await run('document',{})).text,text,engine+': changing view changed the source');
                const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                await run('set-text',{text:'{{style}}\nimg {height:1200px!important;width:40px!important;}\n{{/style}}\n\n![Invented tall picture](data:image/png;base64,'+pixel+')\n'});
                await page.waitForFunction(()=>/indivisible block is taller than the page/i.test(document.body.innerText));
                assert.ok(await page.locator('#document .ProseMirror img').evaluate(img=>img.getBoundingClientRect().height>1000),engine+': the indivisible picture must exceed a page');
                await run('set-text',{text:'---\npage: 420pt x 500pt\nmargins: 30pt\n---\n\n| '+prose('OversizedHeader',100)+' | Second heading |\n| --- | --- |\n| Body | Other body |\n'});
                await page.waitForFunction(()=>/indivisible block is taller than the page/i.test(document.body.innerText)&&document.querySelector('#document th')?.textContent.includes('OversizedHeader'));
                assert.ok(await page.locator('#document th').first().evaluate(th=>th.getBoundingClientRect().height>600),engine+': the header fixture must exceed a page');
                assert.match(await run('print',{}).then(()=>'printed',e=>'refused: '+e.message),/^refused: .*taller than the page/,engine+': an oversized header must refuse print');
                assert.equal(await page.locator('.ed-print-frame').count(),0);
            }
            await page.close();if(result.overlap.length)break;
        }}finally{await browser.close();}
    }}finally{await new Promise(r=>server.close(r));}
    assert.deepEqual(failures,[],failures.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
