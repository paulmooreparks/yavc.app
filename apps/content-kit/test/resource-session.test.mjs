// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../resource-session.js',import.meta.url),'utf8');
const scripts=Object.fromEntries(await Promise.all(['resources.js','recovery.js'].map(async name=>[name,await readFile(new URL('../'+name,import.meta.url),'utf8')])));
function context(){const c=vm.createContext({window:{}});vm.runInContext(source,c);return {open:host=>c.window.yavcResourceSession.open(host,name=>vm.runInContext(scripts[name],c))};}
test('resource selection requires the negotiated snapshot authority',async()=>{
 const c=context(),authority={version:1,read:async()=>{throw new Error('not read during selection');}};
 assert.equal(await c.open({}),null);
 assert.equal(await c.open({contentResourceAdapter:{...authority,available:async()=>true}}),null);
 await assert.rejects(c.open({contentResources:authority}),/version 2/);
 assert.ok(await c.open({snapshot:{version:2},contentResourceAdapter:{...authority,available:async()=>true}}));
});
test('legacy Editor drafts and waiting records receive the same recovery limits',async()=>{
 const session=await context().open({snapshot:{version:2},contentResources:{version:1,read:async()=>{}}});
 session.validate({tabs:[{path:'~/a',draft:'retained'}],waiting:[{path:'~/b',draft:'waiting'}]});
 assert.throws(()=>session.validate({tabs:[null]}),/invalid/);
 assert.throws(()=>session.validate({tabs:[],waiting:{}}),/invalid/);
 assert.throws(()=>session.validate({version:3,tabs:[]}),/unsupported/);
 assert.throws(()=>session.validate({tabs:[],waiting:[{path:'~/a',draft:'x'.repeat(10*1024*1024+1)}]}),/limit/);
 assert.throws(()=>session.validate({version:2,tabs:[{path:'~/a',baseline:{version:1,resource:'~/b',revision:'old'}}]}),/another resource/);
});
