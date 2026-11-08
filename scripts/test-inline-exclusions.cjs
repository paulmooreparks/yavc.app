// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8447';
const source='before{{no-export}} secret {{/no-export}}after\n\n{{no-export}}\n## Working section\n\nPrivate block.\n{{/no-export}}\n';
const action=(p,name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
async function exported(p){return p.evaluate(async()=>{const text=CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString(),E=await yavcMdEditor.exports(),m=await yavcMdEngine();const result=await E.prepare({text,engine:m.withMacros(text,'')});return result.blocks.flatMap(b=>(b.runs||[]).map(r=>r.text)).join('');});}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await p.goto(`http://docs.localhost:${port}/`);await p.locator('.cm-editor').waitFor({state:'attached'});await action(p,'new',{path:'~/inline.docs.md',text:source});
 const note=p.locator('.ProseMirror span.sc-no-export');await note.waitFor();assert.equal(await note.locator('xpath=ancestor::*[@contenteditable="false"]').count(),0);assert.equal(await p.locator('.ProseMirror .pm-source').count(),0);assert.equal(await exported(p),'beforeafter');
 await note.evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);n.closest('[contenteditable]').focus();});await p.keyboard.type(' changed private ');
 await p.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('changed private'));
 assert.ok((await action(p,'document')).text.includes('{{no-export}} changed private {{/no-export}}'));assert.equal(await exported(p),'beforeafter');
 const paragraph=p.locator('.ProseMirror > p').first();await paragraph.evaluate(n=>{const t=n.firstChild,r=document.createRange();r.setStart(t,0);r.setEnd(t,6);const s=getSelection();s.removeAllRanges();s.addRange(r);n.closest('[contenteditable]').focus();});await p.keyboard.type('BEFORE');
 await p.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().startsWith('BEFORE'));assert.equal(await exported(p),'BEFOREafter');
 const heading=p.locator('.pm-box[data-name="no-export"] h2');await heading.click();await p.keyboard.press('End');await p.keyboard.type(' edited');await p.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('Working section edited'));assert.equal(await exported(p),'BEFOREafter');
 console.log(engine+': inline note, surrounding paragraph and excluded block edit directly; source retains exclusions and exports add no spaces');
 }catch(e){console.error(errors,await p.locator('body').innerText());throw e;}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
