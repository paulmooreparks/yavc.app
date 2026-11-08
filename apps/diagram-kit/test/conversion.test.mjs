// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('../conversion.js'),J=require('../jcanvas.js');
test('D2 geometry and labels convert to a validated independent Canvas with an explicit loss report',()=>{
 const drawing={shapes:[{id:'a',x:10,y:20,w:100,h:60},{id:'b',x:200,y:20,w:80,h:80}]};
 const outline={shapes:[{id:'a',label:'A',shape:'cylinder',style:{fill:'#abcdef',bold:'true'}},{id:'b',label:'B',shape:'sql_table'}],connections:[{id:'(a -> b)[0]',from:'a',to:'b',arrows:'->',label:'reads'}]}; // check-ignore(title-case-labels): The label is sample diagram content, not application chrome.
 const before=structuredClone(outline),result=C.toCanvas(drawing,outline),doc=J.read(result.text).doc;
 assert.deepEqual(outline,before);assert.equal(doc.nodes[0].yavc.shape,'cylinder');assert.equal(doc.nodes[0].yavc.fillColor,'#abcdef');assert.equal(doc.nodes[1].yavc.shape,'rectangle');assert.equal(doc.edges[0].fromNode,'a');assert.equal(doc.edges[0].toEnd,'arrow');assert.ok(result.warnings.some(x=>x.includes('sql_table')));assert.ok(result.warnings.some(x=>x.includes('unsupported style')));
});
test('Canvas conversion uses generated keys and caller-formatted labels while leaving its source intact',()=>{
 const source={nodes:[{id:'unsafe: {id}',type:'text',x:0,y:0,width:180,height:80,text:'Label',yavc:{shape:'rounded'}},{id:'b',type:'link',x:300,y:0,width:180,height:80,url:'https://example.com'}],edges:[{id:'edge',fromNode:'unsafe: {id}',toNode:'b',fromEnd:'arrow',toEnd:'arrow'}]};
 const before=structuredClone(source),values=C.labels(source),result=C.toD2(source,values.map(JSON.stringify));
 assert.deepEqual(source,before);assert.doesNotMatch(result.text,/unsafe:/);assert.match(result.text,/item1 <-> item2/);assert.match(result.text,/style.border-radius: 8/);assert.ok(result.warnings.some(x=>x.includes('link')));assert.throws(()=>C.toD2(source,[]),/formatter/);
});
