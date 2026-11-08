// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Real IndexedDB transactions in isolated contexts, without a user's data.
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const pw = require('playwright');
const root = path.resolve(__dirname, '../internal/web/static');
const server = http.createServer((req, res) => {
    if (req.url.split('?')[0] === '/applets/content-kit/text-codec.js') { res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.resolve(__dirname,'../apps/content-kit/text-codec.js'))); }
    if (req.url.startsWith('/static/')) {
        const name = req.url.split('?')[0].slice(8);
        if (!['home-store.js', 'sitefs.js', 'yavc-util.js'].includes(name)) { res.writeHead(404); return res.end(); }
        res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(root, name)));
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/site/tree') return res.end(JSON.stringify({name:'site',kind:'dir',children:[]}));
    if (req.url === '/api/site/home') return res.end(JSON.stringify({files:{'/seed.md':{t:'f',c:'seed'}}}));
    if (req.url === '/config') return res.end('{"settings":{}}');
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Guest files test</title><script src="/static/yavc-util.js"></script><script src="/static/sitefs.js"></script>');
});
async function run(engine, base) {
    const browser = await pw[engine].launch({headless:true});
    const context = await browser.newContext(), a = await context.newPage(), b = await context.newPage();
    const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    a.on('pageerror', e => errors.push(e.message)); b.on('pageerror', e => errors.push(e.message));
    try {
        await a.goto(base);
        const legacy = JSON.stringify({seeds:{},files:{'/note.md':{t:'f',c:'original',m:1},'/picture.png':{t:'b',id:'original-picture',s:3,y:'image/png',m:1}}});
        await a.evaluate(async legacy => {
            localStorage.setItem('pc-terminal-home', legacy);
            await new Promise((resolve,reject) => {
                const r=indexedDB.open('yavc-home-blobs',1);
                r.onupgradeneeded=()=>r.result.createObjectStore('blobs');
                r.onerror=()=>reject(r.error);
                r.onsuccess=()=>{const db=r.result,tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(new Uint8Array([1,2,3]).buffer,'original-picture');tx.oncomplete=()=>{db.close();resolve();};};
            });
            await pcSiteFs.load();
        }, legacy);
        await b.goto(base); await b.evaluate(()=>pcSiteFs.load());
        assert.equal(await a.evaluate(()=>localStorage.getItem('pc-terminal-home')),legacy);
        assert.deepEqual(await a.evaluate(async()=>Array.from(new Uint8Array(await pcSiteFs.readBytes(pcSiteFs.resolve(pcSiteFs.home(),'picture.png'))))),[1,2,3]);
        const read = p=>p.evaluate(()=>pcSiteFs.contentResources.read({resource:'~/note.md'}));
        const first=await read(a), stale=await read(b);
        const before=await a.evaluate(()=>yavcHomeStore.read());
        const commits=await Promise.all([a,b].map((p,i)=>p.evaluate(async({before,i})=>{
            const data=JSON.parse(before.raw);data.files['/transaction-'+i]={t:'f',c:String(i),m:1};
            try{await yavcHomeStore.commit(before.generation,JSON.stringify(data));return 'saved';}catch(e){return e.message;}
        },{before,i})));
        assert.equal(commits.filter(r=>r==='saved').length,1);
        assert.equal(commits.filter(r=>/changed/.test(r)).length,1);
        const accepted=await a.evaluate(r=>pcSiteFs.contentResources.write({...r,expectedRevision:r.revision,text:'accepted'}),first);
        assert.notEqual(accepted.revision,first.revision);
        assert.match(await b.evaluate(async r=>{try{await pcSiteFs.contentResources.write({...r,expectedRevision:r.revision,text:'stale'});}catch(e){return e.message;}},stale),/changed/);
        assert.equal((await read(b)).text,'accepted');
        const created=await Promise.all([a,b].map((p,i)=>p.evaluate(async i=>{
            try{const r=await pcSiteFs.contentResources.create({resource:'~/new-resource.md',text:'creator '+i});return {created:true,revision:r.revision};}catch(e){return {error:e.message};}
        },i)));
        assert.equal(created.filter(r=>r.created).length,1);assert.match(created.find(r=>r.error).error,/exists/);
        assert.match((await a.evaluate(()=>pcSiteFs.contentResources.read({resource:'~/new-resource.md'}))).text,/creator [01]/);
        assert.match(await a.evaluate(async()=>{try{await pcSiteFs.contentResources.create({resource:'~/absent/new.md',text:'lost'});}catch(e){return e.message;}}),/folder/);
        const results=await Promise.all([a.evaluate(()=>pcSiteFs.write(pcSiteFs.home(),'a.md','A',false)),b.evaluate(()=>pcSiteFs.write(pcSiteFs.home(),'b.md','B',false))]);
        // Conflicts can be returned, but acknowledged writes must survive.
        const texts=await a.evaluate(async()=>{await pcSiteFs.sync();return ['a.md','b.md'].map(p=>{const n=pcSiteFs.resolve(pcSiteFs.home(),p);return n&&pcSiteFs.readHome(n);});});
        results.forEach((r,i)=>{if(!r.error)assert.equal(texts[i],i?'B':'A');});
        assert.ok(results.some(r=>!r.error));
        assert.equal((await read(a)).text,'accepted');
        const revision=(await read(a)).revision;
        await a.evaluate(()=>pcSiteFs.write(pcSiteFs.home(),'unrelated.md','Unrelated',false));
        assert.equal((await read(a)).revision,revision);
        assert.equal((await a.evaluate(r=>pcSiteFs.contentResources.write({resource:'~/note.md',expectedRevision:r,text:'accepted'}),revision)).revision,revision);
        assert.match(await a.evaluate(async()=>{try{await pcSiteFs.contentResources.read({resource:'~/.config/editor.json'});}catch(e){return e.message;}}),/Settings/);
        assert.match(await a.evaluate(async()=>{try{await pcSiteFs.contentResources.read({resource:'~/../escape'});}catch(e){return e.message;}}),/canonical/);
        const queued=await a.evaluate(async()=>{
            const F=pcSiteFs;
            return Promise.all([F.write(F.home(),'queue-one','1',false),F.write(F.home(),'queue-two','2',false)]).then(rs=>rs.map(r=>r.error||F.readHome(r.node)));
        }); assert.deepEqual(queued,['1','2']);
        assert.equal(await a.evaluate(()=>pcSiteFs.touch(pcSiteFs.home(),'queue-one')),null);
        const tree=await a.evaluate(async()=>{
            const F=pcSiteFs,errors=[];errors.push(await F.mkdir(F.home(),'folder/nested',true));
            const n=F.resolve(F.home(),'folder/nested');errors.push((await F.write(n,'one','one',false)).error||null);
            errors.push((await F.copy(n,F.resolve(n,'one'),'two')).error||null);
            errors.push(await F.move(n,F.resolve(n,'two'),'three'));
            const text=F.readHome(F.resolve(n,'three'));errors.push(await F.remove(F.resolve(F.home(),'folder'),true));
            return {errors,text};
        });assert.deepEqual(tree,{errors:[null,null,null,null,null],text:'one'});
        assert.equal(await a.evaluate(async()=>{
            const F=pcSiteFs,n=F.resolve(F.home(),'queue-one');n.content='captured tree';
            const saved=F.save();n.content='later tree';const error=await saved;
            if(error)throw new Error(error);return F.readHome(F.resolve(F.home(),'queue-one'));
        }),'captured tree');
        assert.match((await a.evaluate(()=>pcSiteFs.write(pcSiteFs.home(),'large.md','x'.repeat(262145),false))).error,/too large/);
        assert.equal(await a.evaluate(()=>pcSiteFs.remove(pcSiteFs.resolve(pcSiteFs.home(),'picture.png'),false)),null);
        assert.deepEqual(await a.evaluate(async()=>Array.from(new Uint8Array(await yavcHomeStore.blobGet('original-picture')))),[1,2,3]);
        await a.evaluate(async()=>{
            const F=pcSiteFs; await F.writeBytes(F.home(),'new-picture',new Uint8Array([4,5]).buffer,'image/png');
            window.deletedBlob=F.resolve(F.home(),'new-picture').blob;
            await F.remove(F.resolve(F.home(),'new-picture'),false);
        });
        await a.waitForFunction(async()=>!(await yavcHomeStore.blobGet(window.deletedBlob)));
        await b.evaluate(()=>localStorage.setItem('pc-terminal-home',JSON.stringify({files:{'/legacy.md':{t:'f',c:'older tab'}}})));
        await a.waitForFunction(()=>document.querySelector('[data-home-fork]'));
        assert.equal((await read(a)).text,'accepted');
        await a.reload(); await a.evaluate(()=>pcSiteFs.load());
        assert.equal((await read(a)).text,'accepted');
        assert.equal(await a.evaluate(()=>pcSiteFs.readHome(pcSiteFs.resolve(pcSiteFs.home(),'seed.md'))),'seed');
        assert.deepEqual(errors,[]);
        // A malformed source is retained, and cannot become an empty home.
        const bad=await browser.newContext(), p=await bad.newPage(); await p.goto(base);await p.waitForFunction(()=>!!window.pcSiteFs);
        await p.evaluate(()=>localStorage.setItem('pc-terminal-home','broken'));
        assert.match(await p.evaluate(async()=>{try{await pcSiteFs.load();}catch(e){return e.message;}}),/JSON|Unexpected/);
        assert.equal(await p.evaluate(()=>localStorage.getItem('pc-terminal-home')),'broken');
        const missing=JSON.stringify({files:{'/missing.png':{t:'b',id:'missing',s:3,y:'image/png'}}});
        await p.evaluate(raw=>localStorage.setItem('pc-terminal-home',raw),missing);
        assert.match(await p.evaluate(async()=>{try{await pcSiteFs.load();}catch(e){return e.message;}}),/picture database is unavailable/);
        assert.equal(await p.evaluate(()=>localStorage.getItem('pc-terminal-home')),missing);
        await bad.close();
        const full=await browser.newContext(), q=await full.newPage(); await q.goto(base);await q.waitForFunction(()=>!!window.pcSiteFs);
        await q.evaluate(()=>{
            const files={};for(let i=0;i<9;i++)files['/large-'+i+'.txt']={t:'f',c:'x'.repeat(230000),m:1};
            const data={files};files['/large-8.txt'].c+='x'.repeat(2*1024*1024-1-JSON.stringify(data).length);
            localStorage.setItem('pc-terminal-home',JSON.stringify(data));
        });
        await q.evaluate(()=>pcSiteFs.load());
        assert.equal(await q.evaluate(()=>localStorage.getItem('pc-terminal-home').length),2097151);
        const rejected=await q.evaluate(async()=>{
            const before=await yavcHomeStore.read();
            try{await yavcHomeStore.update(r=>{const d=JSON.parse(r.raw);d.files['/extra']={t:'f',c:'extra'};return JSON.stringify(d);});}catch(e){return {message:e.message,unchanged:(await yavcHomeStore.read()).raw===before.raw};}
        });assert.match(rejected.message,/full/);assert.equal(rejected.unchanged,true);
        await full.close();
        const cancelled=await a.evaluate(async()=>{
            const before=await yavcHomeStore.read();let current=true;
            const pending=yavcHomeStore.commit(before.generation,before.raw,()=>current);current=false;
            try{await pending;return {accepted:true};}catch(error){return {message:error.message,unchanged:(await yavcHomeStore.read()).raw===before.raw};}
        });assert.match(cancelled.message,/cancelled/);assert.equal(cancelled.unchanged,true);
        console.log(engine+': migration, quota, revisions, concurrent writers, cancellation at commit, touch, pictures, legacy fork and reload passed');
    } finally { await context.close(); await browser.close(); }
}
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try { for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']) await run(engine,'http://127.0.0.1:'+server.address().port); }
    finally { await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
