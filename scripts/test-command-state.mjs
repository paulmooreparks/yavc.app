// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const window={};
runInNewContext(readFileSync(new URL('../internal/web/static/yavc-util.js',import.meta.url),'utf8'),{window,document:{currentScript:null}});
const snapshot=window.yavcUtil.commandState;
test('Command state ignores replacement callbacks and retains nested presentation changes',()=>{
    let disabled=false,label='Initial',checked=false;
    const table=()=>[{id:'parent',label,items(){assert.equal(this.id,'parent');return [{id:'child',disabled:()=>disabled,checked:()=>checked,run(){throw new Error('Do not run commands while inspecting them.');}},'-','save'];}}];
    const first=snapshot(table());assert.equal(snapshot(table()),first);
    disabled=true;const second=snapshot(table());assert.notEqual(second,first);
    checked=true;const third=snapshot(table());assert.notEqual(third,second);
    label='Renamed';assert.notEqual(snapshot(table()),third);
    assert.notEqual(snapshot([{id:'save',run(){}}]),snapshot([{id:'save'}]));
    assert.notEqual(snapshot([{id:'x',items:['save','-','open']}]),snapshot([{id:'x',items:['open','-','save']}]));
});
test('Command state tracks all public presentation fields and toolbar choices',()=>{
    for(const field of ['label','glyph','shortcut','disabled','reason','checked','choice','value','danger','badge','hidden','current','action','bind','glyphOnly','choiceLabel','toolbarChoice','toolbarPriority'])
        assert.notEqual(snapshot([{id:'x',[field]:'one'}]),snapshot([{id:'x',[field]:'two'}]),field);
});
test('Command notifications coalesce within a task and stop after disposal',async()=>{
    let value=false,reports=0,alive=true,reads=0;
    const changed=window.yavcUtil.commandChanges(()=>{reads++;return [{id:'wrap',checked:()=>value}];},()=>{reports++;},()=>alive);
    changed();changed();await Promise.resolve();assert.equal(reports,1);assert.equal(reads,1);
    changed();await Promise.resolve();assert.equal(reports,1);
    value=true;changed();await Promise.resolve();assert.equal(reports,2);
    value=false;changed();alive=false;await Promise.resolve();assert.equal(reports,2);
    changed();await Promise.resolve();assert.equal(reads,3);
});
test('Shortcode metadata is cached per immutable document context',()=>{
    const w={yavcMdEditor:{},yavcUtil:{esc:String}};let reads=0;
    runInNewContext(readFileSync(new URL('../apps/md-editor/macros.js',import.meta.url),'utf8'),{window:w});
    const context=name=>({macros(){reads++;return {entries:[{name,definition:{name,parameters:[]}}]};}});
    const a=context('first'),b=context('second'),one=w.yavcMacroTools.metadata(a);
    assert.equal(w.yavcMacroTools.metadata(a),one);assert.equal(reads,1);
    assert.equal(w.yavcMacroTools.metadata(b)[0].name,'second');assert.equal(reads,2);
    assert.equal(w.yavcMacroTools.metadata(a),one);assert.equal(reads,2);
});
