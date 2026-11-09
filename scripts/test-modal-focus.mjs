// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(managed=true){
    let top='editor',restored=0;const raised=[];
    const opener={isConnected:true,focus(){restored++;document.activeElement=opener;top='editor';}};
    const document={activeElement:opener,body:{},querySelector:()=>null};
    const windows={state:()=>({top,open:['editor','editor-2','docs']}),raise(key){raised.push(key);top=key;document.activeElement={};}};
    const window=managed?{pudlWindows:windows}:{};
    runInNewContext(readFileSync(new URL('../internal/web/static/yavc-util.js',import.meta.url),'utf8'),{window,document});
    const dialog={open:true,contains:()=>false,close(){this.open=false;opener.focus();}};
    return {focus:window.yavcUtil.modalFocus(dialog),dialog,document,raised,setTop(value){top=value;},top:()=>top,restored:()=>restored};
}

test('Modal dismissal retains the newly accepted document above its opener',()=>{
    const f=fixture();f.setTop('editor-2');f.focus.close();assert.equal(f.top(),'editor-2');assert.deepEqual(f.raised,['editor-2']);f.focus.restore();assert.equal(f.top(),'editor-2');
});
test('Cancel retains normal opener focus without raising another window',()=>{
    const f=fixture();f.focus.close();f.focus.restore();assert.equal(f.top(),'editor');assert.deepEqual(f.raised,[]);
});
test('Delayed cleanup cannot undo a later consumer window or field focus',()=>{
    const f=fixture();f.focus.close();f.setTop('docs');f.document.activeElement={};const before=f.restored();f.focus.restore();assert.equal(f.top(),'docs');assert.equal(f.restored(),before);
});
test('Minimal hosts retain cancellation focus and explicit consumer focus',()=>{
    const f=fixture(false);f.focus.close();f.document.activeElement=f.document.body;f.focus.restore();const before=f.restored();f.document.activeElement={};f.focus.restore();assert.equal(f.restored(),before);
});
