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
    assert.throws(()=>create({version:2,read(){}}),/version 1/);
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
