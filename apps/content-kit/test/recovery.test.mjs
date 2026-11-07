import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),resources=require('../resources.js'),recovery=require('../recovery.js');
function authority() {
    let revision=1,content='original',reads=0;
    return {version:1,get reads(){return reads;},edit(){revision++;content='external';},
        async read({resource}){reads++;return {resource,revision:String(revision),text:content,writable:true};},
        async write({resource,expectedRevision,text}){if(expectedRevision!==String(revision))throw new Error('Conflict');content=text;return {resource,revision:String(++revision),writable:true};}
    };
}
test('a matching recovered baseline can save while a stale draft retains its original revision',async()=>{
    const host=authority(),client=resources.create(host),opened=await client.read('one'),baseline=recovery.capture(client,opened);
    const same=await recovery.restore(client,'one',baseline,'draft');assert.equal(same.snapshot.revision,'1');
    host.edit();
    const stale=await recovery.restore(client,'one',baseline,'draft');
    assert.equal(stale.text,'draft');assert.equal(stale.snapshot,null);assert.equal(stale.conflict,'changed');assert.equal(stale.baseline.revision,'1');
    assert.equal(client.canWrite(stale.snapshot),false);assert.deepEqual(recovery.capture(client,null,stale.baseline),baseline);
    await assert.rejects(client.write(same.snapshot,same.text),/Conflict/);
    assert.equal((await client.read('one')).text,'external');
});
test('legacy dirty recovery cannot borrow a current file revision',async()=>{
    const host=authority(),client=resources.create(host);
    const result=await recovery.restore(client,'one',null,'legacy draft');
    assert.equal(host.reads,0);assert.equal(result.snapshot,null);assert.equal(result.text,'legacy draft');assert.equal(result.conflict,'unknown');
    const clean=await recovery.restore(client,'one',null,null);assert.equal(clean.snapshot.revision,'1');assert.equal(clean.modified,false);
});
test('unavailable resources keep dirty text and baseline for another recovery attempt',async()=>{
    const client=resources.create({version:1,read:async()=>{throw new Error('Offline');}}),baseline={version:1,resource:'one',revision:'old'};
    const result=await recovery.restore(client,'one',baseline,'draft');assert.equal(result.conflict,'unavailable');assert.deepEqual(result.baseline,baseline);assert.equal(result.text,'draft');
    await assert.rejects(recovery.restore(client,'one',null,null),/Offline/);
});
test('recovery rejects another identity, unsupported versions, forged snapshots and oversized payloads',async()=>{
    const client=resources.create(authority()),opened=await client.read('one');
    assert.throws(()=>client.baseline({...opened}),/not issued/);
    assert.throws(()=>recovery.validate({version:3,tabs:[]}),/unsupported/);
    assert.throws(()=>recovery.validate({version:2,tabs:[{path:'one',text:'draft',baseline:{version:1,resource:'two',revision:'1'}}]}),/another/);
    assert.throws(()=>recovery.validate({version:2,tabs:[{path:'one',text:'x'.repeat(resources.maxText+1)}]}),/limit/);
});
function snapshots() {
    const entries=new Map(),storage={fail:false,getItem:k=>entries.get(k)??null,removeItem:k=>entries.delete(k),key:i=>Array.from(entries.keys())[i],get length(){return entries.size;},setItem(k,v){if(this.fail)throw new Error('Quota');entries.set(k,v);}};
    const root={getAttribute:()=> 'diagrams',closest:()=>null},document={readyState:'loading',activeElement:null,addEventListener(){},querySelectorAll:()=>[]};
    const context={window:{addEventListener(){}},document,sessionStorage:storage,location:{pathname:'/lab'},setTimeout:()=>1,clearTimeout(){},console:{warn(){}}};
    vm.runInNewContext(readFileSync(new URL('../../../internal/web/static/snapshot.js',import.meta.url),'utf8'),context);
    return {api:context.window.yavcSnapshot,storage,entries,root};
}
test('snapshot validation runs before registration or consumption of previous copies',()=>{
    const {api,storage,entries,root}=snapshots(),a='pc-snap:page:/lab:diagrams',b='pc-snap:win:diagrams:diagrams';
    storage.setItem(a,JSON.stringify({t:1,v:{tabs:[{text:'older draft'}]}}));storage.setItem(b,JSON.stringify({t:2,v:{version:3,tabs:[{text:'future draft'}]}}));
    const original=Array.from(entries);
    assert.throws(()=>api.join(root,()=>{throw new Error('Must not register');},{validate:recovery.validate}),/unsupported/);
    api.keepAll();for(const [key,value]of original)assert.equal(entries.get(key),value);
});
test('snapshot flush reports quota failure without deleting the last retained draft',()=>{
    const {api,storage,root}=snapshots();let text='retained';
    const handle=api.join(root,()=>({version:2,tabs:[{text}]}),{validate:recovery.validate});assert.equal(handle.flush(),true);
    const before=storage.getItem('pc-snap:page:/lab:diagrams');text='new draft';storage.fail=true;handle.changed();assert.equal(handle.flush(),false);assert.equal(storage.getItem('pc-snap:page:/lab:diagrams'),before);
    storage.fail=false;assert.equal(handle.flush(),true);assert.match(storage.getItem('pc-snap:page:/lab:diagrams'),/new draft/);handle.leave();
});
test('moving a snapshot retains its original key until a destination write succeeds',()=>{
    const {api,storage,root}=snapshots(),source='pc-snap:win:diagrams:diagrams',destination='pc-snap:page:/lab:diagrams',draft={version:2,tabs:[{text:'only durable copy'}]};
    storage.setItem(source,JSON.stringify({t:2,v:draft}));
    const pending=api.join(root,()=>draft,{validate:recovery.validate});
    assert.ok(storage.getItem(source));assert.equal(storage.getItem(destination),null);
    storage.fail=true;assert.equal(pending.flush(),false);pending.leave();assert.ok(storage.getItem(source));
    storage.fail=false;
    const next=api.join(root,()=>draft,{validate:recovery.validate});assert.equal(next.flush(),true);
    assert.match(storage.getItem(destination),/only durable copy/);assert.equal(storage.getItem(source),null);next.leave();assert.equal(next.flush(),false);
});
