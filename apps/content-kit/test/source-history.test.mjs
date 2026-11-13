// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const API=createRequire(import.meta.url)('../source-history.js');
const context=vm.createContext({console,setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder});
vm.runInContext(fs.readFileSync(new URL('../../md-editor/vendor/codemirror-6.43/codemirror.js',import.meta.url),'utf8'),context);
const CM=context.CM;
function fixture(raw){const h=API.create(CM),view={state:CM.EditorState.create({doc:raw,extensions:h.extension(raw)}),dispatch(spec){this.state=this.state.update(spec).state;}};return {h,view};}
test('mixed separators survive local edits, deletion, Undo, Redo and serialized recovery',()=>{
    const raw='same\r\nsame\nsame\rtail\r\n', {h,view}=fixture(raw);
    view.dispatch({changes:{from:5,insert:'changed '}});
    assert.equal(h.raw(view.state),'same\r\nchanged same\nsame\rtail\r\n');
    view.dispatch({changes:{from:0,to:5,insert:''}});
    assert.equal(h.raw(view.state),'changed same\nsame\rtail\r\n');
    assert.equal(h.run('undo',view),true);assert.equal(h.raw(view.state),'same\r\nchanged same\nsame\rtail\r\n');
    assert.equal(h.run('undo',view),true);assert.equal(h.raw(view.state),raw);
    h.run('redo',view);
    const json=view.state.toJSON({sourceHistory:h.field});
    view.state=CM.EditorState.fromJSON(JSON.parse(JSON.stringify(json)),{extensions:h.extension('')},{sourceHistory:h.field});
    h.run('undo',view);assert.equal(h.raw(view.state),raw);h.run('redo',view);h.run('redo',view);assert.equal(h.raw(view.state),'changed same\nsame\rtail\r\n');
});
test('typing groups deliberately, commands stay atomic and insertion follows the local ending',()=>{
    const {h,view}=fixture('one\r\ntwo\nthree\r');
    view.dispatch({selection:{anchor:1}});
    view.dispatch({changes:{from:1,insert:'X'},selection:{anchor:2},userEvent:'input.type'});
    view.dispatch({changes:{from:2,insert:'Y'},selection:{anchor:3},userEvent:'input.type'});
    assert.equal(h.raw(view.state),'oXYne\r\ntwo\nthree\r');h.run('undo',view);assert.equal(h.raw(view.state),'one\r\ntwo\nthree\r');
    view.dispatch({changes:{from:1,insert:'\nnew'}});assert.equal(h.raw(view.state),'o\r\nnewne\r\ntwo\nthree\r');
    h.run('undo',view);assert.equal(h.raw(view.state),'one\r\ntwo\nthree\r');
    view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'external\ntext'},effects:h.adopt('external\rtext'),annotations:CM.Transaction.addToHistory.of(false)});
    assert.equal(h.raw(view.state),'external\rtext');assert.equal(h.can('undo',view.state),false);
});
test('recovery refuses forged endings, invalid inverse changes and excessive history',()=>{
    const {h,view}=fixture('first\r\nsecond');view.dispatch({changes:{from:1,insert:'edit'}});
    const json=JSON.parse(JSON.stringify(view.state.toJSON({sourceHistory:h.field})));
    json.sourceHistory.endings='';
    assert.throws(()=>CM.EditorState.fromJSON(json,{extensions:h.extension('')},{sourceHistory:h.field}),/line endings/);
    json.sourceHistory.endings='R';json.sourceHistory.done[0].beforeEndings='LR';
    assert.throws(()=>CM.EditorState.fromJSON(json,{extensions:h.extension('')},{sourceHistory:h.field}),/line endings/);
    json.sourceHistory.done=Array(201).fill(json.sourceHistory.done[0]);
    assert.throws(()=>CM.EditorState.fromJSON(json,{extensions:h.extension('')},{sourceHistory:h.field}),/history is invalid/);
});
test('raw mapping distinguishes adjacent CR and CRLF endings',()=>{
    const {h,view}=fixture('a\r\rb\r\n');view.dispatch({changes:{from:1,insert:'x\ny'}});assert.equal(h.raw(view.state),'ax\ry\r\rb\r\n');
    assert.equal(API.restore(API.normalize(h.raw(view.state)),h.endings(view.state)),h.raw(view.state));
});
test('disjoint changes preserve intervening original separators and UTF-16 positions',()=>{
    const raw='\ufeff😀a\r\nb\nc\rd',{h,view}=fixture(raw);
    view.dispatch({changes:[{from:3,to:4,insert:'A'},{from:7,to:8,insert:'C'}]});
    assert.equal(h.raw(view.state),'\ufeff😀A\r\nb\nC\rd');h.run('undo',view);assert.equal(h.raw(view.state),raw);
    view.dispatch({changes:{from:4,to:5,insert:''}});assert.equal(h.raw(view.state),'\ufeff😀ab\nc\rd');h.run('undo',view);assert.equal(h.raw(view.state),raw);
});
test('canonical-equal edits retain changed raw endings, while an identical replacement is a no-op',()=>{
    const raw='A\r\nB\nC\r\n',{h,view}=fixture(raw);
    view.dispatch({changes:{from:0,to:view.state.doc.length,insert:view.state.doc.toString()}});assert.equal(h.raw(view.state),raw);assert.equal(h.can('undo',view.state),false);
    view.dispatch({changes:{from:3,to:4,insert:''}});view.dispatch({changes:{from:3,insert:'\n'}});
    assert.equal(view.state.doc.toString(),API.normalize(raw));assert.equal(h.raw(view.state),'A\r\nB\r\nC\r\n');
    h.run('undo',view);h.run('undo',view);assert.equal(h.raw(view.state),raw);
});
test('live history trims its aggregate memory while retaining current provenance',()=>{
    const {h,view}=fixture('x\n'.repeat(131072));
    for(let i=0;i<80;i++)view.dispatch({changes:{from:0,insert:String(i%10)},annotations:CM.isolateHistory.of('full')});
    assert.ok(h.retainedBytes(view.state)<=h.budget);assert.ok(view.state.field(h.field).done.length<80);
    assert.equal(h.endings(view.state),'L'.repeat(131072));const raw=h.raw(view.state),json=view.state.toJSON({sourceHistory:h.field});
    view.state=CM.EditorState.fromJSON(JSON.parse(JSON.stringify(json)),{extensions:h.extension('')},{sourceHistory:h.field});assert.equal(h.raw(view.state),raw);
});
test('the page says that a placement goes on from the one before it, whatever the time between the placements',()=>{
    const real=Date.now;let clock=1000000;Date.now=()=>clock;
    try{
        for(const joined of [false,true]){
            const {h,view}=fixture('start');
            view.dispatch({changes:{from:5,insert:' 1234'},userEvent:'input.visual'});
            clock+=800;
            view.dispatch({changes:{from:10,insert:' 5678'},userEvent:'input.visual',effects:joined?[h.join.of(true)]:[]});
            h.run('undo',view);
            assert.equal(h.raw(view.state),joined?'start':'start 1234',joined?'a joined placement is one undo':'two placements 800 ms apart are two');
        }
        // A join does nothing to an edit of another kind, which stays its own step.
        const {h,view}=fixture('start');
        view.dispatch({changes:{from:5,insert:' typed'},userEvent:'input.type'});
        clock+=800;
        view.dispatch({changes:{from:11,insert:' page'},userEvent:'input.visual',effects:[h.join.of(true)]});
        h.run('undo',view);assert.equal(h.raw(view.state),'start typed');
    }finally{Date.now=real;}
});
