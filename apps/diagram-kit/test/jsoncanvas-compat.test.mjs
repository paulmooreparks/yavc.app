// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const J=createRequire(import.meta.url)('../jcanvas.js');

test('JSON Canvas 1.0 node types, sides, ends, groups and unknown fields survive our writer',()=>{
    const doc={nodes:[{id:'group',type:'group',x:-50,y:-50,width:800,height:500,label:'Group',background:'media/paper.png',backgroundStyle:'ratio'},
        {id:'text',type:'text',x:0,y:0,width:200,height:100,text:'**Markdown**',color:'5',yavc:{shape:'oval'},foreign:{keep:true}},
        {id:'file',type:'file',x:250,y:0,width:200,height:100,file:'Notes/Example.md',subpath:'#Heading'},
        {id:'link',type:'link',x:500,y:0,width:200,height:100,url:'https://example.com'}],
        edges:[{id:'edge',fromNode:'text',toNode:'file',fromSide:'right',toSide:'left',fromEnd:'arrow',toEnd:'none',color:'#123456',label:'Reference',foreign:[1,2]}],foreign:{version:2}};
    const read=J.read(J.write(doc));assert.deepEqual(read.problems,[]);assert.deepEqual(read.doc,doc);
    const standard=structuredClone(doc);delete standard.foreign;for(const n of standard.nodes){delete n.yavc;delete n.foreign;}for(const e of standard.edges)delete e.foreign;
    assert.deepEqual(J.read(J.write(standard)).doc,standard);
});
