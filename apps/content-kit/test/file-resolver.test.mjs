// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url),{create}=require('../../../internal/web/static/file-resolver.js');
const catalog=JSON.parse(await readFile(new URL('../../../internal/web/static/content-handlers.json',import.meta.url),'utf8'));
const resolver=create(catalog),installed=['editor','docs','slides','diagrams'];
const resolve=(name,request={},options={})=>resolver.resolve({name,verifiedText:true,writable:true,...request},{installed,...options});
const rule=(id,match,type,applet,operation,view)=>({id,match,type,applet,operation,view});
test('native defaults and compound suffixes are independent of registration order and MIME',()=>{
 for(const [name,app,view] of [['note.MD','docs','visual'],['note.docs.md','docs','document'],['deck.SLIDES.MD','slides','visual'],['d.canvas','diagrams','visual'],['d.d2','diagrams','split'],['d.mmd','diagrams','split'],['source.cpp','editor','text'],['page.html','editor','text']]){
  const value=resolve(name,{mime:'text/plain; charset=utf-8'},{installed:installed.toReversed()});assert.equal(value.status,'resolved');assert.equal(value.plan.applet,app);assert.equal(value.plan.view,view);
 }
});
test('explicit applet choice retains source editing and refuses unsupported views and intents',()=>{
 assert.equal(resolve('deck.slides.md',{applet:'editor'}).plan.view,'text');
 assert.equal(resolve('deck.slides.md',{applet:'docs'}).status,'choice');
 assert.equal(resolve('d.mmd',{applet:'diagrams',view:'visual'}).status,'choice');
 assert.equal(resolve('note.md',{intent:'run'}).status,'unsupported');
 assert.equal(resolve('note.md',{applet:'editor',view:'document'}).status,'choice');
 assert.deepEqual(resolve('d.mmd',{applet:'diagrams',view:'visual'}).alternatives.find(a=>a.applet==='diagrams').supportedViews,['text','split']);
});
test('missing preferred applets produce choices without silently selecting a fallback',()=>{
 const result=resolve('note.md',{}, {installed:['editor']});assert.equal(result.status,'choice');assert.equal(result.preferred,'docs');assert.equal(result.plan,undefined);assert.equal(result.alternatives[0].applet,'editor');
});
test('verified unknown text needs no predicted extension while binary data never gains a source handler',()=>{
 assert.equal(resolve('strange.extension').plan.applet,'editor');assert.equal(resolve('Makefile').plan.applet,'editor');
 assert.equal(resolve('strange.extension',{verifiedText:false}).status,'unsupported');
 assert.equal(resolve('strange.extension',{verifiedText:undefined}).status,'unsupported');
 assert.equal(resolve('notes.docx',{mime:'text/plain',applet:'editor'}).status,'unsupported');
 assert.equal(resolve('notes.pptx',{mime:'text/plain'}).status,'unsupported');
 assert.equal(resolve('notes.md',{verifiedText:false}).status,'unsupported');
 const unverified=resolve('notes.md',{verifiedText:undefined});assert.equal(unverified.plan.requiredRead,'text');
});
test('user filename rules precede shipped filename rules, and filenames precede user MIME rules',()=>{
 const preferences={version:1,rules:[rule('user-md',{suffix:'.md'},'markdown','editor','open','text'),rule('user-exact',{name:'README.md'},'markdown','docs','document','text'),rule('user-mime',{mime:'text/plain'},'markdown','docs','document','visual')]};
 assert.equal(resolve('x.md',{}, {preferences}).plan.applet,'editor');
 assert.equal(resolve('README.md',{}, {preferences}).plan.view,'text');
 assert.equal(resolve('x.go',{mime:'text/plain'}, {preferences}).plan.applet,'editor');
 assert.equal(resolve('x.slides.md',{}, {preferences}).plan.applet,'editor');
 assert.equal(resolve('x.slides.md',{}, {preferences}).type,'slides');
});
test('a generic user override cannot reinterpret a native deck as an ordinary document',()=>{
 const preferences={version:1,rules:[rule('user-md',{suffix:'.md'},'markdown','docs','document','visual')]};
 assert.equal(resolve('x.slides.md',{}, {preferences}).status,'choice');
});
test('configuration rejects ambiguous matches, unknown versions and invented operations without mutation',()=>{
 const preferences={version:1,rules:[rule('first',{suffix:'.md'},'markdown','editor','open','text'),rule('second',{suffix:'.MD'},'markdown','docs','document','visual')]};
 assert.throws(()=>resolver.validatePreferences(preferences),/Duplicate user match/);
 assert.throws(()=>resolver.validatePreferences({version:2,rules:[]}),/retained/);
 assert.throws(()=>resolver.validatePreferences({version:1,rules:[rule('bad',{suffix:'.abc'},'text','editor','execute','text')]}),/invent/);
 assert.throws(()=>resolver.validatePreferences({version:1,rules:[],script:'alert(1)'}),/Unknown/);
 const before=structuredClone(catalog);create(catalog);assert.deepEqual(catalog,before);
});
test('access and write grants remain host-owned, and plans cannot execute or mutate',()=>{
 assert.equal(resolve('a.md',{readable:false}).status,'access-denied');
 assert.equal(resolve('a.md',{writable:false}).plan.readOnly,true);
 assert.equal(resolve('a.md',{writable:undefined}).plan.readOnly,true);
 assert.ok(Object.isFrozen(resolve('a.md').plan));
 assert.throws(()=>resolve('../a.md'),/display filename/);
 assert.throws(()=>resolve('a.md',{readable:'yes'}),/boolean/);
 assert.throws(()=>resolve('a.md',{mime:{type:'text/plain'}}),/MIME hint/);
});
