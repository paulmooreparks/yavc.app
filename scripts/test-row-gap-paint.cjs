// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Invented tall pipe-table cells exercise page cuts, including inline gaps and exhausted columns.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),fixture=path.join(__dirname,'fixtures/portable-workspace'),prefix='/row/assets/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const prose=(name,n)=>Array.from({length:n},(_,i)=>`${name}${i} describes an invented physical mapping and preserves the next line in its own column.`).join(' ');
const source='---\npage: 420pt x 500pt\nmargins: 30pt\n---\n\n{{style}}\ntd { background: #e6f2ff; }\n{{/style}}\n\n# Invented mapping\n\n| Step | Operator | Mapping | Outcome |\n| --- | --- | --- | --- |\n'+Array.from({length:4},(_,i)=>`| ${i+1} | ${prose('Operator',6+i)} | ${prose('Mapping',8-i)} | ${prose('Outcome',2+i)} |`).join('\n')+'\n\nAfter the table.\n';
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
            if(!row.contains(gap.el)||hits.length)overlap.push({row:box(rect),gap:box(gap.r),own:row.contains(gap.el),hits:hits.map(box),classes:gap.el.className});
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
    return {pages:page.dataset.pageCount,passes:page.dataset.layoutPasses,stopped:page.dataset.layoutStopped,inline:gaps.filter(g=>g.el.matches('span')).length,overlap,headerErrors,continuationErrors,metadata,covers:page.querySelectorAll('.doc-table-gap-cover').length,offsetHeight:pm.querySelector('.row-offset')?.getBoundingClientRect().height,
        warning:/indivisible block is taller than the page/i.test(document.body.innerText),
        headers:[...pm.querySelectorAll('.doc-cell-repeated-header')].map(h=>({rect:box(h.getBoundingClientRect()),gap:box(h.parentElement.getBoundingClientRect()),text:h.textContent})),
        pageTop:page.getBoundingClientRect().top,sheetHeight:parseFloat(page.style.getPropertyValue('--sheet-height')),sheetTop:parseFloat(page.style.getPropertyValue('--sheet-top')),
        cells:[...pm.querySelectorAll('td')].filter(c=>!c.closest('.doc-page-gap')).slice(0,4).map(c=>({rect:box(c.getBoundingClientRect()),border:getComputedStyle(c).borderLeft,background:getComputedStyle(c).backgroundColor}))};
}
async function checkPaint(page,engine){
    const headers=page.locator('#document td:first-child .doc-cell-repeated-header'),count=await headers.count();assert.ok(count>=2,engine+': the table must have two continued pieces');
    for(let i=0;i<Math.min(count,3);i++){
        await headers.nth(i).scrollIntoViewIfNeeded();
        const samples=await headers.nth(i).evaluate(header=>{const row=header.closest('tr'),table=row.closest('table'),p=table.closest('.doc-paginated'),pr=p.getBoundingClientRect(),period=parseFloat(p.style.getPropertyValue('--sheet-height'))+24;
            const sheet=Math.round((header.getBoundingClientRect().top-pr.top-parseFloat(p.style.getPropertyValue('--sheet-top')))/period);
            const end=pr.top+(sheet-1)*period+parseFloat(p.style.getPropertyValue('--sheet-height'))-parseFloat(p.style.getPropertyValue('--sheet-bottom'));
            const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let node,last=-Infinity;
            while((node=walker.nextNode())){if(!node.data.trim()||node.parentElement.closest('.doc-page-gap'))continue;const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects())if(r.width>0&&r.bottom<=end+1)last=Math.max(last,r.bottom);}
            const y=last+4;return [...table.rows[0].cells].flatMap(c=>{const cr=c.getBoundingClientRect();return [{x:Math.round(cr.left),y:Math.round(y)},{x:Math.round((cr.left+cr.right)/2),y:Math.round(y)}];});});
        const png=(await page.screenshot()).toString('base64');
        const bad=await page.evaluate(async({png,samples})=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);return samples.filter(p=>{const rgb=context.getImageData(p.x,p.y,1,1).data;return Math.min(rgb[0],rgb[1],rgb[2])<250;});},{png,samples});
        assert.deepEqual(bad,[],engine+': cell borders or backgrounds remain below the last line');
    }
}
async function settled(page){
    await page.evaluate(()=>new Promise((resolve,reject)=>{let last='',same=0;const start=performance.now();function tick(){const p=document.querySelector('#document [data-page-count]'),key=p.dataset.layoutPasses+':'+p.dataset.pageCount;same=key===last?same+1:0;last=key;if(same>=60)return resolve();if(performance.now()-start>30000)return reject(new Error('The page did not settle'));requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
}
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
    const noteMode=process.env.ROW_GAP_NOTE==='1',base=noteMode?await fs.readFile(path.join(__dirname,'fixtures/docs-long-settle.md'),'utf8'):source,host=await fs.readFile(path.join(__dirname,'fixtures/long-note-host.js'),'utf8');let text=base;
    const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(prefix.length)),own=name.startsWith('workspace-lab/');
        if(name==='workspace-lab/slow-inter.woff2'){await new Promise(r=>setTimeout(r,2500));return res.writeHead(200,{'Content-Type':'font/woff2'}).end(await fs.readFile(path.join(artifact,'pudl/fonts/Inter-latin.woff2')));}
        const file=own?path.join(fixture,name.slice(14)):allowed.has(name)?path.join(artifact,name):null;if(!file||name.includes('..'))return res.writeHead(404).end();let body=await fs.readFile(file);
        if(name==='workspace-lab/host.js')body=Buffer.from(body+'\n'+host+'\nfixture.records.get("memory:document.docs.md").text='+JSON.stringify(text)+';');
        res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(body);
    }catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const failures=[];
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true});try{for(const offset of process.env.ROW_GAP_SWEEP==='1'?Array.from({length:58},(_,i)=>i*20):[Number(process.env.ROW_GAP_OFFSET)||0]){
            text=base.replace(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)?/,m=>m+'\n{{style}}\n.row-offset {height:'+offset+'px;}\n{{/style}}\n\n<div class="row-offset">Invented offset.</div>\n\n');
            const page=await browser.newPage({viewport:{width:1620,height:1100}});page.setDefaultTimeout(60000);
            if(process.env.ROW_GAP_SLOW==='1')await page.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent="@font-face{font-family:RowSlowInter;src:url(slow-inter.woff2) format('woff2');} #document .ProseMirror td,#document .ProseMirror th{font-family:RowSlowInter,serif!important;}";document.head.append(style);});});
            await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);await page.locator('#document .doc-paginated .ProseMirror').waitFor();await page.evaluate(()=>document.fonts.ready);
            if(process.env.ROW_GAP_SLOW==='1')await page.waitForFunction(()=>[...document.fonts].some(f=>f.family==='RowSlowInter'&&f.status==='loaded'));
            await page.waitForFunction(()=>document.querySelector('#document .doc-page-gap-inline'));
            await settled(page);
            const result=await page.evaluate(inspect);console.log(engine+' offset '+offset+' '+JSON.stringify({...result,headers:undefined,cells:undefined}));
            await fs.writeFile(path.join(process.env.TEMP||'/tmp','yavc-row-gap-'+engine+'.json'),JSON.stringify(result,null,2));
            if(process.env.ROW_GAP_SWEEP!=='1'){
            await page.locator('.doc-cell-repeated-header').first().scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(process.env.TEMP||'/tmp','yavc-row-gap-'+engine+'.png'),fullPage:true});
            if(!noteMode){await checkPaint(page,engine);if(engine==='chromium'){await page.emulateMedia({forcedColors:'active'});await settled(page);await checkPaint(page,engine+' forced colours');await page.emulateMedia({forcedColors:'none'});await settled(page);}}
            }
            if(result.overlap.length)failures.push(engine+': '+result.overlap.length+' row/text overlaps with page gaps');
            if(result.stopped!=null)failures.push(engine+': the cycle guard stopped this table layout');
            if(!noteMode&&result.warning)failures.push(engine+': a splittable pipe table is reported as indivisible');
            if(result.metadata.length)failures.push(engine+': column metadata is emitted as content blocks');
            if(Math.abs(result.offsetHeight-offset)>1)failures.push(engine+': the requested offset was not rendered');
            if(result.headerErrors.length)failures.push(engine+': repeated headers miss the page content top by '+JSON.stringify(result.headerErrors));
            if(result.continuationErrors.length)failures.push(engine+': blank space separates repeated headers from the continued text');
            if(Number(result.pages)<3||result.inline<2)failures.push(engine+': the fixture did not cross two page breaks');
            if(!noteMode){
                const run=(ref,input)=>page.evaluate(([r,i])=>pudlActions.run('yavc.docs/'+r+'@1',i,{grant:'all'}),[ref,input]);
                assert.equal((await run('document',{})).text,text,engine+': page furniture changed the source');
                const kinds=await page.evaluate(()=>{const host=document.createElement('div');host.className='doc-page';host.innerHTML='<table><caption>Invented caption</caption><colgroup><col><col></colgroup><tbody><tr><td>One</td><td>Two</td></tr></tbody></table>';document.body.append(host);try{return yavcDocumentPages.blocks(host).map(b=>b.node.tagName);}finally{host.remove();}});
                assert.deepEqual(kinds,['CAPTION','TR'],engine+': table blocks must be its caption and rows');
                await run('view',{mode:'visual'});await page.waitForFunction(()=>!document.querySelector('#document .doc-table-gap-cover'));
                await run('view',{mode:'document'});await settled(page);assert.equal((await run('document',{})).text,text,engine+': changing view changed the source');
                const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                await run('set-text',{text:'{{style}}\nimg {height:1200px!important;width:40px!important;}\n{{/style}}\n\n![Invented tall picture](data:image/png;base64,'+pixel+')\n'});
                await page.waitForFunction(()=>/indivisible block is taller than the page/i.test(document.body.innerText));
                assert.ok(await page.locator('#document .ProseMirror img').evaluate(img=>img.getBoundingClientRect().height>1000),engine+': the indivisible picture must exceed a page');
            }
            await page.close();if(result.overlap.length)break;
        }}finally{await browser.close();}
    }}finally{await new Promise(r=>server.close(r));}
    assert.deepEqual(failures,[],failures.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
