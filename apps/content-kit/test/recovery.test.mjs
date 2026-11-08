import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
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
    const durableEntries=new Map(),durable={...storage,key:i=>Array.from(durableEntries.keys())[i],get length(){return durableEntries.size;},getItem:k=>durableEntries.get(k)??null,removeItem:k=>durableEntries.delete(k),setItem(k,v){if(this.fail)throw new Error('Quota');durableEntries.set(k,v);}};
    const context={window:{addEventListener(){}},document,crypto:{randomUUID},sessionStorage:storage,localStorage:durable,location:{pathname:'/lab'},setTimeout:()=>1,clearTimeout(){},console:{warn(){}}};
    vm.runInNewContext(readFileSync(new URL('../../../internal/web/static/snapshot.js',import.meta.url),'utf8'),context);
    return {api:context.window.yavcSnapshot,storage,entries,root,durable};
}

test('remembered workspaces retain closed-tab changes after a window snapshot is discarded',()=>{
    const {api,storage,root}=snapshots();let tabs=[{text:'one'},{text:'two'},{text:'closed'}];
    const handle=api.join(root,()=>({version:2,tabs}),{remember:true,validate:recovery.validate});
    assert.equal(handle.flush(),true);tabs=tabs.slice(0,2);assert.equal(handle.flush(),true);handle.leave();
    storage.removeItem('pc-snap:page:/lab:diagrams');
    const reopened=api.join(root,()=>null,{remember:true,validate:recovery.validate});
    assert.equal(reopened.kept.tabs.length,2);assert.equal(reopened.kept.tabs[1].text,'two');
});

test('remembered workspace quota failure refuses a close acknowledgement',()=>{
    const {api,root,durable}=snapshots();let text='kept';
    const handle=api.join(root,()=>({version:2,tabs:[{text}]}),{remember:true,validate:recovery.validate});
    assert.equal(handle.flush(),true);text='new draft';durable.fail=true;assert.equal(handle.flush(),false);
    assert.match(durable.getItem(durable.key(0)),/kept/);
});

test('an idle or delayed older writer cannot replace a newer remembered workspace',()=>{
    const {api,root,storage,durable}=snapshots();let old='old workspace',newer='new workspace';
    const first=api.join(root,()=>({version:2,tabs:[{text:old}]}),{remember:true,validate:recovery.validate});first.flush();
    storage.removeItem('pc-snap:page:/lab:diagrams');
    const second=api.join(root,()=>({version:2,tabs:[{text:newer}]}),{remember:true,validate:recovery.validate});second.flush();
    first.flush();first.leave();second.leave();storage.removeItem('pc-snap:page:/lab:diagrams');
    assert.equal(api.join(root,()=>null,{remember:true,validate:recovery.validate}).kept.tabs[0].text,newer);
    assert.equal(durable.length,2);
});

test('successive closed workspaces retire only the sealed copy they actually continued',()=>{
    const {api,root,storage,durable}=snapshots();
    for(let index=0;index<20;index++){
        storage.removeItem('pc-snap:page:/lab:diagrams');
        const handle=api.join(root,()=>({version:2,tabs:[{text:'draft '+index}]}),{remember:true,validate:recovery.validate});
        assert.equal(handle.flush(),true);handle.leave();assert.equal(durable.length,1);
    }
});

test('a browser tab reload keeps its own workspace instead of another tab workspace',()=>{
    const {api,root,storage,durable}=snapshots();
    storage.setItem('pc-snap:page:/lab:diagrams',JSON.stringify({t:1,v:{version:2,tabs:[{text:'this tab'}]}}));
    durable.setItem('pc-resume:diagrams:other',JSON.stringify({t:2,v:{version:2,tabs:[{text:'another tab'}]},sealed:false}));
    assert.equal(api.join(root,()=>null,{remember:true,validate:recovery.validate}).kept.tabs[0].text,'this tab');
});

test('remembered serialization failure retains the last acknowledged workspace',()=>{
    const {api,root,durable}=snapshots();let value={version:2,tabs:[{text:'retained'}]};
    const handle=api.join(root,()=>value,{remember:true});assert.equal(handle.flush(),true);
    const before=Array.from({length:durable.length},(_,i)=>[durable.key(i),durable.getItem(durable.key(i))]);
    value={};value.self=value;assert.equal(handle.flush(),false);
    for(const [key,text]of before)assert.equal(durable.getItem(key),text);handle.leave();
});
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
