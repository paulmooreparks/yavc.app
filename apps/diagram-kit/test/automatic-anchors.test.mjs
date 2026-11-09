// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),J=require('../jcanvas.js'),M=require('../../diagrams/canvas-model.js');
const source=()=>({nodes:[{id:'a',type:'text',text:'A',x:0,y:0,width:100,height:60},{id:'b',type:'text',text:'B',x:300,y:0,width:100,height:60}],edges:[{id:'edge',fromNode:'a',toNode:'b',foreign:{retain:true}}]});

test('Automatic endpoints project standard sides without mutating source and reroute after movement',()=>{
    const original=source(),before=JSON.stringify(original),doc=J.read(J.write(original)).doc,edge=doc.edges[0];
    assert.equal(JSON.stringify(original),before);assert.equal(edge.fromSide,'right');assert.equal(edge.toSide,'left');
    assert.deepEqual(edge.yavc,{fromAuto:{node:'a',side:'right'},toAuto:{node:'b',side:'left'}});
    const moved=structuredClone(doc);moved.nodes[1].x=0;moved.nodes[1].y=-300;
    assert.equal(J.route(moved.edges[0],moved.nodes).from,'top');assert.equal(J.route(moved.edges[0],moved.nodes).to,'bottom');
    const written=J.read(J.write(moved)).doc;assert.equal(written.edges[0].fromSide,'top');assert.equal(written.edges[0].yavc.fromAuto.side,'top');
    assert.equal(J.write(written),J.write(moved));assert.deepEqual(written.edges[0].foreign,{retain:true});
});
test('External endpoint changes override cached intent and same-side explicit commands clear it',()=>{
    const doc=J.read(J.write(source())).doc,edge=doc.edges[0];edge.fromSide='left';
    assert.equal(J.automatic(edge,'from'),false);assert.equal(J.route(edge,doc.nodes).from,'left');
    assert.equal(J.read(J.write(doc)).doc.edges[0].yavc.fromAuto,undefined);
    const nodeChange=J.read(J.write(source())).doc;nodeChange.nodes.push({id:'c',type:'text',text:'C',x:400,y:200,width:100,height:60});nodeChange.edges[0].fromNode='c';assert.equal(J.automatic(nodeChange.edges[0],'from'),false);
    const same=J.read(J.write(source())).doc,side=same.edges[0].fromSide;
    const fixed=M.edit(same,{op:'set',kind:'edge',key:'edge',property:'fromSide',value:side}).doc;assert.equal(J.automatic(fixed.edges[0],'from'),false);assert.equal(fixed.edges[0].fromSide,side);
    const reconnected=M.edit(same,{op:'reconnect',key:'edge',end:'from',node:'a',side}).doc;assert.equal(J.automatic(reconnected.edges[0],'from'),false);
    const automatic=M.edit(fixed,{op:'set',kind:'edge',key:'edge',property:'fromSide',value:null}).doc;assert.equal(J.automatic(automatic.edges[0],'from'),true);
});
test('Paste rebases active automatic endpoints but never revives stale external overrides',()=>{
    const doc=J.read(J.write(source())).doc;
    const pasted=M.edit(doc,{op:'paste',text:J.write(doc)}).doc,edge=pasted.edges.at(-1);
    assert.notEqual(edge.fromNode,'a');assert.equal(edge.yavc.fromAuto.node,edge.fromNode);assert.equal(edge.yavc.toAuto.node,edge.toNode);assert.equal(J.automatic(edge,'from'),true);
    const stale=structuredClone(doc);stale.edges[0].fromSide='top';
    const pinned=M.edit(doc,{op:'paste',text:JSON.stringify(stale)}).doc.edges.at(-1);assert.equal(pinned.fromSide,'top');assert.equal(pinned.yavc.fromAuto,undefined);assert.equal(J.automatic(pinned,'from'),false);
});
test('Projection validates cache structure and retains unrelated nested metadata',()=>{
    for(const bad of [false,[],{node:'a',side:'middle'},{node:2,side:'top'}]){const doc=source();doc.edges[0].yavc={fromAuto:bad};assert.match(J.read(JSON.stringify(doc)).problems[0].message,/fromAuto/);}
    const doc=J.read(J.write(source())).doc;doc.edges[0].yavc.fromAuto.foreign={keep:[1,2]};const before=JSON.stringify(doc);
    assert.deepEqual(J.read(J.write(doc)).doc.edges[0].yavc.fromAuto.foreign,{keep:[1,2]});assert.equal(JSON.stringify(doc),before);
});

test('Projection retains prototype-named JSON data without turning it into object behavior',()=>{
    const doc=source();doc.edges[0].yavc=JSON.parse('{"__proto__":{"foreign":1},"fromAuto":{"node":"a","side":"right","__proto__":{"foreign":2}}}');doc.edges[0].fromSide='right';
    const foreign=JSON.parse('{"__proto__":{"foreign":3}}');Object.defineProperty(doc,'__proto__',{value:foreign.__proto__,enumerable:true});Object.defineProperty(doc.edges[0],'__proto__',{value:foreign.__proto__,enumerable:true});
    const before=JSON.stringify(doc),parsed=J.read(J.write(doc)).doc;
    assert.deepEqual(parsed.__proto__,{foreign:3});assert.deepEqual(parsed.edges[0].__proto__,{foreign:3});assert.deepEqual(parsed.edges[0].yavc.__proto__,{foreign:1});assert.deepEqual(parsed.edges[0].yavc.fromAuto.__proto__,{foreign:2});assert.equal(JSON.stringify(doc),before);assert.equal({}.foreign,undefined);
});

test('Projection overhead cannot replace a source that would exceed the existing file limit',()=>{
    const doc=source();doc.foreign='';doc.foreign='x'.repeat(J.LIMITS.text-JSON.stringify(doc).length-64);const before=JSON.stringify(doc);
    assert.deepEqual(J.read(before).problems,[]);assert.throws(()=>M.edit(doc,{op:'move',key:'a',dx:1,dy:0}),/over 2 MB/);assert.equal(JSON.stringify(doc),before);
});
