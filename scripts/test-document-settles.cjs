// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The Document view reaches a fixed point (Paul's report in GK Companion, 2026-11-14; GK's acceptance "Settled Document layout").
// A long requirements document is opened in the Document view of the one-page host, and once its pictures and fonts are in, the
// page must stop changing: the page gaps, the page count, the tables' widths and the scroll position stay the same over 120
// animation frames in a row. A resize and an edit then each cause a new layout that settles again.
//   node scripts/test-document-settles.cjs <package folder> [chromium firefox webkit]
// The documents are made here with Dinah's generator (gkc c28ca9d7, gk/tools/hidden/docs-settle-probe.mjs): six sections, each with a
// paragraph and an eight-row table of four columns. "rows" has ordinary rows; "tall" has rows taller than a page; "tall-box" adds a
// long {{info}} block after each table. No customer document is used. A layout that never settles fails with the number of distinct
// arrangements it went through and where the first two differ, which is where the planner disagrees with its own last result.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/settle/assets/',fixture=path.resolve(__dirname,'fixtures','portable-workspace');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const FRAMES=120,LIMIT=60000;
function probe(variant){
    const w=n=>Array.from({length:n},(_,i)=>'word'+(i%17)).join(' ');
    let text='# Requirements\n\nIntroductory paragraph. '+w(60)+'\n\n';
    const table=rows=>'| Requirement ID | Priority | Requirement | Notes |\n| --- | --- | --- | --- |\n'+
        Array.from({length:rows},(_,i)=>'| RRP-KBD-FR'+String(i).padStart(3,'0')+' | High | '+w(variant.includes('tall')?900:120)+' | '+w(variant.includes('tall')?500:60)+' |').join('\n')+'\n\n';
    for(let s=0;s<6;s++){text+='## Section '+s+'\n\n'+w(80)+'\n\n'+table(8);if(variant.includes('box'))text+='{{info}}\n'+Array.from({length:30},()=>w(70)).join('\n\n')+'\n{{/info}}\n\n';}
    return text;
}
// Waits, frame by frame, until the arrangement has stayed the same for FRAMES frames, or LIMIT has passed. It answers with what it saw.
function settle({frames,limit}){
    return new Promise(done=>{
        const root=document.querySelector('#document'),started=performance.now(),seen=new Map(),order=[];let last=null,same=0;
        const arrangement=()=>{const pm=root.querySelector('.ProseMirror'),top=pm.getBoundingClientRect().top,scroll=root.querySelector('.ed-scroll');
            return {gaps:[...pm.querySelectorAll('.doc-page-gap')].map(g=>{const r=g.getBoundingClientRect();return [Math.round(r.top-top),Math.round(r.height)];}),
                pages:root.querySelector('[data-page-count]')?.getAttribute('data-page-count'),tables:[...pm.querySelectorAll('table')].map(t=>Math.round(t.getBoundingClientRect().width)),scroll:scroll?Math.round(scroll.scrollTop):0};};
        (function tick(){const now=arrangement(),key=JSON.stringify(now);
            if(!seen.has(key)){seen.set(key,now);order.push(key);}
            same=key===last?same+1:0;last=key;
            if(same>=frames)return done({settled:true,ms:Math.round(performance.now()-started),arrangements:seen.size,pages:now.pages});
            if(performance.now()-started>limit){const a=seen.get(order[order.length-2])||now,b=now,diffs=[];
                for(let i=0;i<Math.max(a.gaps.length,b.gaps.length)&&diffs.length<3;i++){if(JSON.stringify(a.gaps[i])!==JSON.stringify(b.gaps[i]))diffs.push({gap:i,before:a.gaps[i],after:b.gaps[i]});}
                return done({settled:false,ms:Math.round(performance.now()-started),arrangements:seen.size,pages:[...new Set([...seen.values()].map(v=>v.pages))].slice(0,12),differences:diffs});}
            requestAnimationFrame(tick);})();
    });
}
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));let text='';
    const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');const name=decodeURIComponent(u.pathname.slice(prefix.length));
        const own=name.startsWith('workspace-lab/'),file=own?path.join(fixture,name.slice('workspace-lab/'.length)):allowed.has(name)?path.join(artifact,name):null;
        if(!file||/\.\./.test(name))return res.writeHead(404).end();
        let body=await fs.readFile(file);
        if(name==='workspace-lab/host.js')body=Buffer.from(body.toString().replace(/records\.get\('memory:document\.docs\.md'\)\.text='[^;]*;/,()=>"records.get('memory:document.docs.md').text="+JSON.stringify(text)+";"));
        res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);}catch{if(!res.headersSent)res.writeHead(404).end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true});
        try{for(const variant of ['rows','tall','tall-box']){
            text=probe(variant);const label=engine+' '+variant;
            const page=await browser.newPage({viewport:{width:1536,height:864}});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
            try{
                await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);
                await page.locator('#document .doc-paginated .ProseMirror').waitFor();
                await page.evaluate(()=>document.fonts.ready);
                const first=await page.evaluate(settle,{frames:FRAMES,limit:LIMIT});
                if(!first.settled){failures.push(`${label}: the Document view did not settle in ${LIMIT/1000} s; it went through ${first.arrangements} arrangements, page counts ${first.pages.join(', ')}, and the last two differ at ${JSON.stringify(first.differences)}`);continue;}
                // A resize and an edit each cause one new layout that settles again.
                await page.setViewportSize({width:1200,height:864});
                const resized=await page.evaluate(settle,{frames:FRAMES,limit:LIMIT});
                if(!resized.settled)failures.push(`${label}: after a resize the Document view did not settle (${resized.arrangements} arrangements)`);
                await page.locator('#document .ProseMirror p').first().click();await page.keyboard.press('End');await page.keyboard.type(' Edited.');
                const edited=await page.evaluate(settle,{frames:FRAMES,limit:LIMIT});
                if(!edited.settled)failures.push(`${label}: after an edit the Document view did not settle (${edited.arrangements} arrangements)`);
                if(errors.length)failures.push(`${label}: page errors ${errors.join(' | ')}`);
                console.log(`${label}: settled in ${first.ms} ms at ${first.pages} pages, and again after a resize and an edit`);
            }finally{await page.close();}
        }}finally{await browser.close();}
    }}finally{server.close();}
    assert.deepEqual(failures,[],failures.join('\n'));
    console.log('The Document view reached a fixed point for ordinary rows, rows taller than a page and long blocks, and again after a resize and an edit.');
})().catch(error=>{console.error(error.message||error);process.exitCode=1;});
