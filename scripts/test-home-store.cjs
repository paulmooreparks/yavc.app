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
        const isolated=await a.evaluate(async()=>{
            const F=pcSiteFs,created=await F.contentResources.create({resource:'~/metadata-proof',text:'a'}),methods={},writes=[],contentReads=[];
            for(const method of ['put','add','delete','get','getAll']){methods[method]=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(){if(['put','add','delete'].includes(method))writes.push([this.transaction.db.name,this.name,method,arguments[1]===undefined?arguments[0]:arguments[1]]);if(this.name==='contents'&&['get','getAll'].includes(method))contentReads.push([method,arguments[0]]);return methods[method].apply(this,arguments);};}
            try{await F.contentResources.write({resource:'~/metadata-proof',expectedRevision:created.revision,text:'b'});}finally{for(const method of Object.keys(methods))IDBObjectStore.prototype[method]=methods[method];}
            return {entries:writes.filter(row=>row[1]==='entries').map(row=>row[3]),contents:writes.filter(row=>row[1]==='contents'&&row[2]==='add').length,oldAccess:writes.some(row=>row[0]!=='yavc-vfs'),contentReads};
        });assert.deepEqual(isolated.entries,['/metadata-proof']);assert.equal(isolated.contents,1);assert.equal(isolated.oldAccess,false);assert.equal(isolated.contentReads.length,1);assert.equal(isolated.contentReads[0][0],'get');
        const before=await a.evaluate(()=>yavcHomeStore.read());
        const commits=await Promise.all([a,b].map((p,i)=>p.evaluate(async({before,i})=>{
            const data=structuredClone(before.data);data.files['/transaction-'+i]={t:'f',c:String(i),m:1};
            try{await yavcHomeStore.commit(before.generation,data);return 'saved';}catch(e){return e.message;}
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
        const texts=await a.evaluate(async()=>{await pcSiteFs.sync();return Promise.all(['a.md','b.md'].map(p=>{const n=pcSiteFs.resolve(pcSiteFs.home(),p);return n&&pcSiteFs.read(n);}));});
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
            return Promise.all([F.write(F.home(),'queue-one','1',false),F.write(F.home(),'queue-two','2',false)]).then(rs=>Promise.all(rs.map(r=>r.error||F.readHome(r.node))));
        }); assert.deepEqual(queued,['1','2']);
        assert.equal(await a.evaluate(()=>pcSiteFs.touch(pcSiteFs.home(),'queue-one')),null);
        const tree=await a.evaluate(async()=>{
            const F=pcSiteFs,errors=[];errors.push(await F.mkdir(F.home(),'folder/nested',true));
            const n=F.resolve(F.home(),'folder/nested');errors.push((await F.write(n,'one','one',false)).error||null);
            errors.push((await F.copy(n,F.resolve(n,'one'),'two')).error||null);
            errors.push(await F.move(n,F.resolve(n,'two'),'three'));
            const text=await F.read(F.resolve(n,'three'));errors.push(await F.remove(F.resolve(F.home(),'folder'),true));
            return {errors,text};
        });assert.deepEqual(tree,{errors:[null,null,null,null,null],text:'one'});
        assert.equal(await a.evaluate(async()=>{
            const F=pcSiteFs,n=F.resolve(F.home(),'queue-one');n.content='captured tree';
            const saved=F.save();n.content='later tree';const error=await saved;
            if(error)throw new Error(error);return F.read(F.resolve(F.home(),'queue-one'));
        }),'captured tree');
        assert.equal((await a.evaluate(()=>pcSiteFs.write(pcSiteFs.home(),'large.md','x'.repeat(262145),false))).error,undefined);
        assert.equal(await a.evaluate(()=>pcSiteFs.remove(pcSiteFs.resolve(pcSiteFs.home(),'picture.png'),false)),null);
        assert.equal(await a.evaluate(()=>yavcHomeStore.blobGet('original-picture')),undefined);
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
        assert.equal(await a.evaluate(()=>pcSiteFs.read(pcSiteFs.resolve(pcSiteFs.home(),'seed.md'))),'seed');
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
        await q.evaluate(()=>yavcHomeStore.update(r=>{const d=structuredClone(r.data);d.files['/extra']={t:'f',c:'extra'};return d;}));
        assert.equal(await q.evaluate(()=>pcSiteFs.contentResources.read({resource:'~/extra'}).then(r=>r.text)),'extra');
        const layout=await q.evaluate(async()=>{
            const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('yavc-vfs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
            return new Promise((resolve,reject)=>{const tx=db.transaction(['state','entries','contents'],'readonly'),s=tx.objectStore('state').get('home'),e=tx.objectStore('entries').get('/extra'),c=tx.objectStore('contents').getAll();tx.oncomplete=()=>{db.close();resolve({raw:s.result.raw,migrationSource:s.result.migrationSource,rootFiles:s.result.files,entry:e.result,allBlobs:c.result.every(b=>b instanceof ArrayBuffer)});};tx.onabort=()=>reject(tx.error);});
        });assert.equal(layout.raw,undefined);assert.equal(layout.migrationSource,undefined);assert.equal(layout.rootFiles,undefined);assert.equal(layout.entry.c,undefined);assert.equal(layout.entry.s,5);assert.equal(layout.allBlobs,true);
        await full.close();
        const quota=await browser.newContext();await quota.addInitScript(()=>{window.pudlHost={guestStorage:{file:32,home:60,text:16}};});
        const small=await quota.newPage();await small.goto(base);await small.evaluate(()=>pcSiteFs.load());
        const bounded=await small.evaluate(async()=>{
            const F=pcSiteFs;await F.write(F.home(),'one','a'.repeat(20),false);await F.writeBytes(F.home(),'two',new Uint8Array(20).buffer,'application/octet-stream');
            const before=await yavcHomeStore.read(),full=await F.write(F.home(),'three','b'.repeat(20),false),file=await F.write(F.home(),'unicode','€'.repeat(11),false);
            let edit;try{await F.contentResources.create({resource:'~/edit',text:'€'.repeat(6)});}catch(error){edit=error.message;}
            const after=await yavcHomeStore.read();return {full:full.error,file:file.error,edit,used:after.used,unchanged:after.generation===before.generation};
        });assert.match(bounded.full,/full/);assert.match(bounded.file,/limit/);assert.match(bounded.edit,/editing limit/);assert.equal(bounded.used,44);assert.equal(bounded.unchanged,true);await quota.close();
        const failure=await a.evaluate(async()=>{
            const F=pcSiteFs,baseline=await F.contentResources.read({resource:'~/note.md'}),before=await yavcHomeStore.read(),put=IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put=function(){if(this.name==='state')throw new DOMException('Synthetic disk quota','QuotaExceededError');return put.apply(this,arguments);};
            let message;try{await F.contentResources.write({resource:'~/note.md',expectedRevision:baseline.revision,text:'must not commit'});}catch(error){message=error.message;}finally{IDBObjectStore.prototype.put=put;}
            const after=await yavcHomeStore.read(),saved=await F.contentResources.read({resource:'~/note.md'});return {message,text:saved.text,revision:saved.revision,original:baseline.revision,unchanged:JSON.stringify(before.data)===JSON.stringify(after.data)};
        });assert.match(failure.message,/quota/);assert.equal(failure.text,'accepted');assert.equal(failure.revision,failure.original);assert.equal(failure.unchanged,true);
        const old=await browser.newContext(),oldPage=await old.newPage();await oldPage.goto(base);
        const oldRecord=await oldPage.evaluate(async()=>{
            const raw=JSON.stringify({files:{'/from-v1':{t:'f',c:'\ufeffSaved 😀\r\n',m:1},'/v1.bin':{t:'b',id:'v1-bytes',s:2,m:1}}}),record={version:1,generation:9,raw,migrationSource:null};
            await new Promise((resolve,reject)=>{const r=indexedDB.open('yavc-home',1);r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('blobs');};r.onsuccess=()=>{const db=r.result,tx=db.transaction(['state','blobs'],'readwrite');tx.objectStore('state').put(record,'home');tx.objectStore('blobs').put(new Uint8Array([7,8]).buffer,'v1-bytes');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});return record;
        });await oldPage.evaluate(()=>pcSiteFs.load());
        assert.equal(await oldPage.evaluate(()=>pcSiteFs.read(pcSiteFs.resolve(pcSiteFs.home(),'from-v1'))),'\ufeffSaved 😀\r\n');
        assert.deepEqual(await oldPage.evaluate(async()=>Array.from(new Uint8Array(await pcSiteFs.readBytes(pcSiteFs.resolve(pcSiteFs.home(),'v1.bin'))))),[7,8]);
        assert.deepEqual(await oldPage.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('yavc-home',1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const tx=db.transaction('state','readonly'),r=tx.objectStore('state').get('home');tx.oncomplete=()=>{db.close();resolve(r.result);};});}),oldRecord);
        await oldPage.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('yavc-home',1);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction('state','readwrite'),r=tx.objectStore('state').get('home');r.onsuccess=()=>{const record=r.result;record.generation++;tx.objectStore('state').put(record,'home');};tx.oncomplete=()=>{db.close();resolve();};});});
        await oldPage.reload();await oldPage.evaluate(()=>pcSiteFs.load());await oldPage.locator('.notice.warn').filter({hasText:'older tab'}).waitFor();
        assert.equal(await oldPage.evaluate(()=>pcSiteFs.read(pcSiteFs.resolve(pcSiteFs.home(),'from-v1'))),'\ufeffSaved 😀\r\n');
        await old.close();
        const cancelled=await a.evaluate(async()=>{
            const before=await yavcHomeStore.read();let current=true;
            const pending=yavcHomeStore.commit(before.generation,before.data,()=>current);current=false;
            try{await pending;return {accepted:true};}catch(error){return {message:error.message,unchanged:JSON.stringify((await yavcHomeStore.read()).data)===JSON.stringify(before.data)};}
        });assert.match(cancelled.message,/cancelled/);assert.equal(cancelled.unchanged,true);
        console.log(engine+': migration, quota, revisions, concurrent writers, cancellation at commit, touch, pictures, legacy fork and reload passed');
    } finally { await context.close(); await browser.close(); }
}
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try { for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']) await run(engine,'http://127.0.0.1:'+server.address().port); }
    finally { await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
