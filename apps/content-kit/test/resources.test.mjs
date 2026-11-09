import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { create, maxText } = createRequire(import.meta.url)('../resources.js');
function host() {
    let revision = 1, content = 'original';
    return { version: 1,
        async read({resource}) { return {resource,revision:String(revision),text:content,writable:true}; },
        async write({resource,expectedRevision,text}) {
            if (expectedRevision !== String(revision)) throw new Error('Conflict');
            content=text; return {resource,revision:String(++revision),writable:true};
        }
    };
}
test('captured baselines reject stale writers and retain exact submitted text', async () => {
    const authority=host(), one=create(authority), two=create(authority);
    const first=await one.read('workspace:one'), stale=await two.read('workspace:one');
    const accepted=await one.write(first,'submitted');
    assert.equal(accepted.text,'submitted'); assert.equal(accepted.revision,'2');
    await assert.rejects(two.write(stale,'stale overwrite'),/Conflict/);
    assert.equal((await two.read('workspace:one')).text,'submitted');
    assert.equal(first.text,'original'); assert.ok(Object.isFrozen(first));
});
test('snapshots cannot cross client authority or be forged', async () => {
    const one=create(host()),two=create(host()),a=await one.read('workspace:one');
    await assert.rejects(two.write(a,'wrong host'),/cannot be saved/);
    await assert.rejects(one.write({...a},'forged'),/cannot be saved/);
});
test('missing or read-only capabilities refuse writes', async () => {
    assert.throws(()=>create({version:3,read(){}}),/version 1/);
    const client=create({version:1,read:async ({resource})=>({resource,revision:'r1',text:'read only',writable:false})});
    const snapshot=await client.read('one'); assert.equal(client.canWrite(snapshot),false);
    await assert.rejects(client.write(snapshot,'changed'),/cannot be saved/);
});
test('invalid identities, content and write acknowledgements fail closed', async () => {
    const client=create(host()); await assert.rejects(client.read(''),/identity/);
    const value=await client.read('one'); await assert.rejects(client.write(value,'x'.repeat(maxText+1)),/limit/);
    const wrong=create({version:1,read:async()=>({resource:'another',revision:'1',text:'bad'})});
    await assert.rejects(wrong.read('one'),/different resource/);
    const noAdvance=create({...host(),write:async ({resource,expectedRevision})=>({resource,revision:expectedRevision,writable:true})});
    await assert.rejects(noAdvance.write(await noAdvance.read('one'),'changed'),/advance/);
});
test('an unchanged save may retain a content-based revision', async () => {
    const client=create({...host(),write:async ({resource,expectedRevision})=>({resource,revision:expectedRevision,writable:true})});
    const loaded=await client.read('one'), accepted=await client.write(loaded,loaded.text);
    assert.equal(accepted.revision,loaded.revision); assert.equal(accepted.text,loaded.text);
});
test('creation captures submitted text, refuses duplicates and validates destination identity',async()=>{
    const files=new Map(),authority={version:1,read:async({resource})=>({resource,...files.get(resource),writable:true}),
        async create({resource,text}){if(files.has(resource))throw new Error('Already exists');files.set(resource,{text,revision:'1'});return {resource,revision:'1',name:'New.canvas',writable:true};}};
    const client=create(authority),first=await client.create('new','submitted');assert.equal(first.text,'submitted');assert.equal(first.name,'New.canvas');
    await assert.rejects(client.create('new','overwrite'),/exists/);assert.equal(files.get('new').text,'submitted');
    const wrong=create({...authority,create:async()=>({resource:'different',revision:'1'})});await assert.rejects(wrong.create('requested','draft'),/different/);
});
test('Save As cancellation leaves its source baseline intact and successful copies use the host destination',async()=>{
    let release,request;const authority=host();
    authority.saveAs=async captured=>{request=captured;await new Promise(r=>{release=r;});return {resource:'opaque:chosen',revision:'copy-1',name:'Chosen.canvas',writable:true};};
    const client=create(authority),source=await client.read('source'),options={name:'Suggested.canvas',sourceResource:'source'};
    const pending=client.saveAs(options,'captured');options.name='later';release();const copy=await pending;
    assert.equal(request.name,'Suggested.canvas');assert.equal(copy.resource,'opaque:chosen');assert.equal(copy.name,'Chosen.canvas');assert.equal(copy.text,'captured');assert.equal(source.revision,'1');
    authority.saveAs=async()=>null;assert.equal(await client.saveAs(options,'cancelled'),null);assert.equal(source.text,'original');
    authority.saveAs=async()=>({resource:'invalid-ack',revision:'1',writable:true});await assert.rejects(client.saveAs(options,'draft'),/display name/);
});
test('a display name survives ordinary saves when the host omits unchanged metadata',async()=>{
    const client=create({...host(),read:async({resource})=>({resource,revision:'1',text:'original',writable:true,name:'Drawing.d2'})});
    const saved=await client.write(await client.read('opaque:id'),'changed');assert.equal(saved.name,'Drawing.d2');
});
test('version 2 snapshots negotiate encoding and retain it across writes and copies',async()=>{
    const requests=[],authority={version:2,read:async({resource})=>({resource,revision:'1',text:'body',writable:true,encoding:'utf-16be',bom:true}),write:async request=>{requests.push(request);return {resource:request.resource,revision:'2',writable:true,encoding:request.encoding,bom:request.bom};},create:async request=>{requests.push(request);return {resource:request.resource,revision:'copy',writable:true,encoding:request.encoding,bom:request.bom};}};
    const client=create(authority),opened=await client.read('source');assert.equal(opened.encoding,'utf-16be');assert.equal(opened.bom,true);
    const saved=await client.write(opened,'edited');assert.equal(saved.encoding,'utf-16be');assert.equal(requests[0].encoding,'utf-16be');assert.equal(requests[0].bom,true);
    assert.deepEqual(client.baseline(saved),{resource:'source',revision:'2',encoding:'utf-16be',bom:true});
    const copied=await client.create('copy','copy',{encoding:'utf-16le',bom:true});assert.equal(copied.encoding,'utf-16le');
    assert.equal(create(host()).canFormat({encoding:'utf-16le',bom:true}),false);
    await assert.rejects(create({...host(),create:async()=>{throw new Error('must not run');}}).create('lossy','body',{encoding:'utf-16be',bom:true}),/cannot preserve/);
});
test('encoding acknowledgements fail closed and unsigned UTF-16 is never inferred',async()=>{
    const base={version:2,read:async({resource})=>({resource,revision:'1',text:'body',writable:true,encoding:'utf-16le',bom:true})};
    const missing=create({...base,read:async({resource})=>({resource,revision:'1',text:'body',writable:true})});await assert.rejects(missing.read('one'),/acknowledge/);
    const wrong=create({...base,write:async({resource})=>({resource,revision:'2',writable:true,encoding:'utf-8',bom:false})});await assert.rejects(wrong.write(await wrong.read('one'),'body'),/changed.*encoding/);
    const client=create({...base,create:async()=>{throw new Error('must not run');}});await assert.rejects(client.create('one','body',{encoding:'utf-16le',bom:false}),/signature/);
});
