// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8447';
const action=(p,name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const b=await pw[engine].launch({headless:true}),p=await b.newPage();try{
  await p.goto(`http://docs.localhost:${port}/`);await p.locator('.cm-editor').waitFor({state:'attached'});await action(p,'new',{path:'~/first.md',text:'# First\n'});await p.locator('.ProseMirror h1').waitFor();await p.locator('.ProseMirror').focus();
  await action(p,'insert',{text:'Inserted'});assert.match((await action(p,'document')).text,/Inserted/);
  await p.evaluate(()=>{const original=window.yavcMdEngine;window.yavcMdEngine=async function(){const m=await original();return Object.assign({},m,{withMacros:function(...args){const scope=m.withMacros(...args);return Object.assign({},scope,{blocks:function(text){if(text==='HELD INSERT')return new Promise(resolve=>{window.releaseInsert=()=>resolve(scope.blocks(text));});return scope.blocks(text);}});}});};window.pendingInsert=pudlActions.run('yavc.docs/insert@1',{text:'HELD INSERT'},{grant:'all'}).then(()=>({ok:true}),err=>({ok:false,error:err.message}));});
  await p.waitForFunction(()=>typeof window.releaseInsert==='function');await action(p,'new',{path:'~/replacement.md',text:'# Replacement\n'});await p.locator('.ProseMirror h1').filter({hasText:'Replacement'}).waitFor();await p.evaluate(()=>releaseInsert());const refused=await p.evaluate(()=>pendingInsert);assert.equal(refused.ok,false);assert.match(refused.error,/changed/);assert.equal((await action(p,'document')).text,'# Replacement\n');
  console.log(engine+': rich insert acknowledges completed source and refuses delayed insertion into a replacement document');
 }finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
