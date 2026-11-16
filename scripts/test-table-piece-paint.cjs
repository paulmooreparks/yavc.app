// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Every continued table header must paint all its cells and stay inside its frame.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),fixture=path.join(__dirname,'fixtures/portable-workspace'),prefix='/pieces/assets/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const words=(name,count)=>Array.from({length:count},(_,i)=>`${name} ${i} describes an invented mapping between an operator and an independent physical reference.`).join(' ');
function source(framed){return '---\npage: 420pt x 500pt\nmargins: 30pt\n---\n\n{{style}}\nth {background-color:#bfd8eb;color:#14283c;} td,th {border-width:1px;border-style:solid;border-color:#24384c;}\n{{/style}}\n\n# Invented table pieces\n\n'+(framed?'{{info:Invented panel}}\n\n':'')+'| Step | Operator | Mapping | Outcome |\n| --- | --- | --- | --- |\n'+Array.from({length:3},(_,i)=>`| ${words('Step',2+i)} | ${words('Operator',7-i)} | ${words('Mapping',9-i)} | ${words('Outcome',3+i)} |`).join('\n')+'\n\n'+(framed?'{{/info}}\n\n':'')+'After the invented table.\n';}
async function settle(page){await page.evaluate(()=>new Promise((resolve,reject)=>{let last='',same=0,start=performance.now();function tick(){const p=document.querySelector('#document [data-page-count]'),key=p.dataset.layoutPasses+':'+p.dataset.pageCount;same=key===last?same+1:0;last=key;if(same>=60)return resolve();if(performance.now()-start>30000)return reject(new Error('layout did not settle'));requestAnimationFrame(tick);}tick();}));}
function describe(key){
    const pm=document.querySelector('#document .doc-paginated > .ProseMirror'),gaps=[...pm.querySelectorAll('[data-page-gap-key]')].filter(g=>g.dataset.pageGapKey===key),copy=[...document.querySelectorAll('.doc-row-repeated-header')].find(t=>t.dataset.pageGapKey===key),headers=copy?[...copy.rows[0].cells]:gaps.map(g=>g.querySelector('.doc-cell-repeated-header')).filter(Boolean);
    const table=gaps[0].closest('table'),original=[...table.rows].find(r=>!r.closest('.doc-page-gap')&&[...r.cells].every(c=>c.tagName==='TH'));
    const box=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom}),frame=table.closest('.sc-notice,[data-sc-frame]'),fr=frame?.getBoundingClientRect(),fc=frame&&getComputedStyle(frame);
    const content=fr?{left:fr.left+parseFloat(fc.borderLeftWidth)+parseFloat(fc.paddingLeft),right:fr.right-parseFloat(fc.borderRightWidth)-parseFloat(fc.paddingRight)}:null;
    const page=pm.closest('.doc-paginated'),pr=page.getBoundingClientRect(),period=parseFloat(page.style.getPropertyValue('--sheet-height'))+24,scale=Number(page.style.zoom)||1;
    const top=Math.min(...headers.map(h=>h.getBoundingClientRect().top)),sheet=Math.round(((top-pr.top)/scale-parseFloat(page.style.getPropertyValue('--sheet-top')))/period);
    const foot=pr.top+scale*((sheet-1)*period+parseFloat(page.style.getPropertyValue('--sheet-height'))-parseFloat(page.style.getPropertyValue('--sheet-bottom')));
    return {key,content,table:box(table.getBoundingClientRect()),foot,headers:headers.map(h=>{const c=h.closest('td,th'),index=c.cellIndex,source=original.cells[index],range=document.createRange(),walker=document.createTreeWalker(h,NodeFilter.SHOW_TEXT),text=[];let node;while((node=walker.nextNode())){if(!node.data.trim())continue;range.selectNodeContents(node);text.push(...[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(box));}return {index,box:box(h.getBoundingClientRect()),column:box(source.getBoundingClientRect()),text,title:source.textContent,background:getComputedStyle(source).backgroundColor};})};
}
async function pixels(page,description){
    const png=(await page.screenshot()).toString('base64');
    return page.evaluate(async({png,d})=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        const rgb=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=canvas.width||y>=canvas.height)return null;return [...ctx.getImageData(x,y,1,1).data].slice(0,3);},close=(a,b)=>a&&Math.max(...a.map((v,i)=>Math.abs(v-b[i])))<20;
        return d.headers.map(h=>{const r=h.box,bg=h.background.match(/[\d.]+/g).slice(0,3).map(Number),edge=[[r.left+2,(r.top+r.bottom)/2],[r.right-2,(r.top+r.bottom)/2],[(r.left+r.right)/2,r.top+2],[(r.left+r.right)/2,r.bottom-2]];
            let ink=0;for(const t of h.text)for(let y=Math.ceil(t.top+2);y<t.bottom-2;y++)for(let x=Math.ceil(t.left);x<t.right;x++){const p=rgb(x,y);if(p&&p.every((v,i)=>v<bg[i]-35))ink++;}
            let border=0,total=0;for(let x=Math.ceil(h.column.left+3);x<h.column.right-3;x+=3){total++;if([-1,0,1].some(dy=>close(rgb(x,d.foot+dy),[36,56,76])))border++;}
            return {index:h.index,edges:edge.map(([x,y])=>({x,y,rgb:rgb(x,y),filled:close(rgb(x,y),bg)})),ink,border,total};});
    },{png,d:description});
}
async function printCheck(page,engine,framed,report,failures){
    const reference=await page.evaluate(()=>{const table=document.querySelector('#document .doc-paginated > .ProseMirror table'),left=table.getBoundingClientRect().left;return [...table.rows[0].cells].map(c=>{const r=c.getBoundingClientRect();return {left:r.left-left,right:r.right-left,background:getComputedStyle(c).backgroundColor};});});
    await page.evaluate(()=>{const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='IFRAME')node.contentWindow.print=()=>{window.piecesPrinted=true;};};window.piecesPrintTask=pudlActions.run('yavc.docs/print@1',{}, {grant:'all'});});
    await page.evaluate(()=>window.piecesPrintTask);assert.equal(await page.evaluate(()=>window.piecesPrinted),true,'table must print');
    const frame=page.locator('.ed-print-frame');await frame.evaluate(f=>{f.style.cssText='display:block!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:100000!important;';});
    const sheets=page.frameLocator('.ed-print-frame').locator('.doc-print-sheet');
    for(let i=0;i<await sheets.count();i++){
        await sheets.nth(i).scrollIntoViewIfNeeded();
        const d=await sheets.nth(i).evaluate(sheet=>{const table=sheet.querySelector('table');if(!table)return null;const row=table.rows[0],box=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom}),panel=table.closest('.sc-notice,[data-sc-frame]'),pr=panel?.getBoundingClientRect(),pc=panel&&getComputedStyle(panel),sr=sheet.getBoundingClientRect();
            return {key:'print',content:pr?{left:pr.left+parseFloat(pc.borderLeftWidth)+parseFloat(pc.paddingLeft),right:pr.right-parseFloat(pc.borderRightWidth)-parseFloat(pc.paddingRight)}:null,table:box(table.getBoundingClientRect()),cut:table.hasAttribute('data-doc-cut-end'),foot:sr.top+parseFloat(sheet.style.getPropertyValue('--sheet-height'))-parseFloat(sheet.style.getPropertyValue('--sheet-bottom')),headers:[...row.cells].map((h,index)=>{const range=document.createRange(),walker=document.createTreeWalker(h,NodeFilter.SHOW_TEXT),text=[];let node;while((node=walker.nextNode())){if(!node.data.trim())continue;range.selectNodeContents(node);text.push(...[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(box));}return {index,box:box(h.getBoundingClientRect()),column:box(h.getBoundingClientRect()),text,background:getComputedStyle(h).backgroundColor,title:h.textContent};})};});
        if(!d)continue;for(const h of d.headers)h.background=reference[h.index].background;const paint=await pixels(page,d),faults=[];
        assert.deepEqual(d.headers.map(h=>h.title.trim()),['Step','Operator','Mapping','Outcome'],engine+': every printed piece repeats all titles');
        for(const h of d.headers){if(Math.abs(h.box.left-d.table.left-reference[h.index].left)>1||Math.abs(h.box.right-d.table.left-reference[h.index].right)>1)faults.push({fault:3,column:h.index,header:h.box,reference:reference[h.index]});if(d.content&&(h.box.left<d.content.left-1||h.box.right>d.content.right+1))faults.push({fault:5,column:h.index});}
        if(d.content&&(d.table.left<d.content.left-1||d.table.right>d.content.right+1))faults.push({fault:6,table:d.table,frame:d.content});
        for(const p of paint){if(d.cut&&p.border<p.total*.8)faults.push({fault:1,column:p.index,border:p.border,total:p.total});if(p.edges.some(e=>!e.filled))faults.push({fault:2,column:p.index,edges:p.edges});if(p.ink<3)faults.push({fault:4,column:p.index,ink:p.ink});}
        report.push({engine,framed,print:i,description:d,paint,faults});if(faults.length)failures.push({engine,framed,print:i,faults});
    }
    await frame.evaluate(f=>f.contentWindow.dispatchEvent(new Event('afterprint')));
}
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));let text='';
    const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(prefix.length)),own=name.startsWith('workspace-lab/'),file=own?path.join(fixture,name.slice(14)):allowed.has(name)?path.join(artifact,name):null;if(!file||name.includes('..'))return res.writeHead(404).end();let body=await fs.readFile(file);if(name==='workspace-lab/host.js')body=Buffer.from(body+'\nfixture.records.get("memory:document.docs.md").text='+JSON.stringify(text)+';');res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const failures=[],report=[];
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){const browser=await pw[engine].launch({headless:true});try{for(const framed of [false,true]){
        text=source(framed);const page=await browser.newPage({viewport:{width:1620,height:1100}});page.setDefaultTimeout(30000);
        try{await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);await page.locator('#document .doc-cell-repeated-header').first().waitFor({state:'attached'});await page.evaluate(()=>document.fonts.ready);await settle(page);
            const keys=await page.evaluate(()=>[...new Set([...document.querySelectorAll('#document [data-page-gap-key]')].filter(g=>g.querySelector('.doc-cell-repeated-header')).map(g=>g.dataset.pageGapKey))]);assert.ok(keys.length>=3,'fixture must cross at least three page breaks');
            for(const key of keys){const painted=page.locator('.doc-row-repeated-header[data-page-gap-key="'+key+'"]'),gap=await painted.count()?painted:page.locator('#document [data-page-gap-key="'+key+'"] .doc-cell-repeated-header').first();await gap.scrollIntoViewIfNeeded();const d=await page.evaluate(describe,key),paint=await pixels(page,d),faults=[];
                for(const h of d.headers){if(Math.abs(h.box.left-h.column.left)>1||Math.abs(h.box.right-h.column.right)>1)faults.push({fault:3,column:h.index,header:h.box,columnBox:h.column});if(d.content&&(h.box.left<d.content.left-1||h.box.right>d.content.right+1))faults.push({fault:5,column:h.index,header:h.box,frame:d.content});}
                if(d.content&&(d.table.left<d.content.left-1||d.table.right>d.content.right+1))faults.push({fault:6,table:d.table,frame:d.content});
                for(const p of paint){if(p.border<p.total*.8)faults.push({fault:1,column:p.index,border:p.border,total:p.total});if(p.edges.some(e=>!e.filled))faults.push({fault:2,column:p.index,edges:p.edges});if(p.ink<3)faults.push({fault:4,column:p.index,ink:p.ink});}
                report.push({engine,framed,key,description:d,paint,faults});if(faults.length)failures.push({engine,framed,key,faults});
            }
            await page.screenshot({path:path.join(process.env.TEMP,'yavc-table-piece-'+engine+'-'+(framed?'framed':'plain')+'.png'),fullPage:true});
            console.log(engine+' '+(framed?'framed':'plain')+' '+keys.length+' cuts: '+JSON.stringify([...new Set(report.filter(r=>r.engine===engine&&r.framed===framed).flatMap(r=>r.faults.map(f=>f.fault)))]));
            await printCheck(page,engine,framed,report,failures);
        }finally{await page.close();}
    }}finally{await browser.close();}}}finally{await new Promise(r=>server.close(r));await fs.writeFile(path.join(process.env.TEMP,'yavc-table-piece-report.json'),JSON.stringify(report,null,2));}
    assert.deepEqual(failures,[],JSON.stringify(failures.slice(0,3)));
})().catch(e=>{console.error(e.message||e);process.exitCode=1;});
