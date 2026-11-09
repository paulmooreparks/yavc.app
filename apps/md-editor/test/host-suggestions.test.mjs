// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {parse,mapItem}=createRequire(import.meta.url)('../host-suggestions.js');
const snapshot=(text,item={})=>({revision:'one',text,items:[{id:'a',start:0,end:1,before:text.slice(0,1),after:'New',...item}]});
test('Host suggestion ranges preserve UTF-16 and original line-ending boundaries',()=>{
    const text='A\r\n😀 end';
    assert.equal(parse(snapshot(text,{start:3,end:5,before:'😀'})).items[0].from,2);
    assert.throws(()=>parse(snapshot(text,{start:2,end:5,before:'\n😀'})),/range/);
    assert.throws(()=>parse(snapshot(text,{start:4,end:5,before:'\uDE00'})),/range/);
    assert.throws(()=>parse(snapshot(text,{start:-1})),/range/);
    assert.throws(()=>parse(snapshot(text,{before:'wrong'})),/match/);
    assert.equal(parse(snapshot(text,{before:'old',stale:true})).items[0].stale,true);
});
test('Host catalog validation enforces source identity and budgets without executing markup',()=>{
    assert.equal(parse({revision:'newer',items:[]},{revision:'older',text:'A'}),null);
    assert.equal(parse({revision:'same',items:[]},{revision:'same',text:'A'}).baseRaw,'A');
    const data=snapshot('A',{after:'<script>untrusted</script>',author:'<img src=x>'});assert.equal(parse(data).items[0].after,data.items[0].after);
    assert.throws(()=>parse({...data,items:[data.items[0],data.items[0]]}),/identity/);
    assert.throws(()=>parse(snapshot('A',{after:'x'.repeat(65537)})),/text/);
    assert.throws(()=>parse({revision:'x',text:'A',items:Array(257).fill(data.items[0])}),/snapshot/);
    assert.throws(()=>parse({revision:'',text:'A',items:[]}),/snapshot/);
});
test('Mapping outside a range retains it while overlapping edits make it stale',()=>{
    const item=parse(snapshot('Original',{end:8,before:'Original'})).items[0];
    const prefix={iterChangedRanges(fn){fn(0,0);},mapPos(pos){return pos+3;}};
    const moved=mapItem(item,prefix,{sliceString(){return 'Original';}});assert.equal(moved.from,3);assert.equal(moved.to,11);assert.equal(moved.stale,false);
    const within={iterChangedRanges(fn){fn(2,3);},mapPos(pos){return pos;}};
    assert.equal(mapItem(item,within,{sliceString(){return 'OrXginal';}}).stale,true);
    assert.equal(mapItem({...item,stale:true},prefix,null).stale,true);
});
