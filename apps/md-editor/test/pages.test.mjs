// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../paper-sizes.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../page-footnotes.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('../pages.js', import.meta.url), 'utf8'), context);
const P = context.window.yavcDocumentPages;
vm.runInContext(readFileSync(new URL('../document-settings.js', import.meta.url), 'utf8'), context);
const S = context.window.yavcDocumentSettings;

test('document typography refuses CSS injection and validates physical limits', () => {
    assert.equal(S.typography({size:'12pt',spacing:'1.6','paragraph-spacing':'8pt'}).size,12);
    assert.match(S.typeCSS({font:'Times New Roman','heading-font':'Arial',size:'12pt'}),/--doc-font:"Times New Roman"/);
    for (const props of [{font:'x; color:red'},{font:'url(bad)'},{size:'999pt'},{spacing:'0.5'},{spacing:'NaN'},{'paragraph-spacing':'-1pt'}]) { assert.throws(()=>S.typography(props)); }
    assert.equal(S.properties({entries:[{key:'header',kind:'complex',mapping:{left:'{title}'}}]}).header.left,'{title}');
    assert.throws(()=>S.properties({entries:[{key:'header',kind:'complex'}]}));
});

test('physical page settings share unit conversion, margin expansion and bounded custom sizes', () => {
    const letter = P.settings({page:'letter',margins:'1in 2cm 12pt 8px',orientation:'landscape'});
    assert.equal(letter.width,792); assert.equal(letter.height,612);
    assert.deepEqual(Array.from(letter.margins),[6,72,72 / 2.54 * 2,12]);
    assert.ok(Math.abs(P.settings({page:'180mm x 240mm'}).width - 180*72/25.4) < 1e-9);
    assert.ok(P.settings({page:'300mm x 200mm',orientation:'landscape'}).width > P.settings({page:'300mm x 200mm',orientation:'landscape'}).height);
    assert.ok(P.settings({page:'300mm x 200mm',orientation:'portrait'}).width < P.settings({page:'300mm x 200mm',orientation:'portrait'}).height);
    for (const props of [{page:'unknown'},{page:'0.5in x 9in'},{page:'121in x 9in'},{margins:'99in'},{margins:'-1in'},{margins:'1 2 3 4 5'},{orientation:'diagonal'}]) { assert.throws(() => P.settings(props)); }
    assert.throws(() => P.properties({entries:[{key:'page',kind:'complex'}]}),/plain values/);
});
test('every registered fixed paper size and existing aliases resolve without fetching', () => {
    assert.equal(context.window.yavcPaperSizes.length,256);
    for (const item of context.window.yavcPaperSizes) {
        const page = P.settings({page:item.pwg,margins:'0'}), alias = P.settings({page:item.id,margins:'0'});
        assert.equal(page.width,alias.width); assert.equal(page.height,alias.height);
        assert.ok(Math.abs(page.width - P.length(item.width+item.unit)) < 1e-8);
    }
    assert.equal(P.lookup('ledger').id,'tabloid');
    assert.ok(Math.abs(P.settings({page:'a3',margins:'0'}).width - 297*72/25.4) < 1e-8);
});
test('page planning keeps blocks whole, preserves explicit breaks and reports oversized blocks', () => {
    const page = P.settings({page:'letter',margins:'1in'}), d = P.dimensions(page);
    const result = P.plan([{top:0,height:600,pos:0},{top:600,height:300,pos:4}],page);
    assert.equal(result.count,2); assert.equal(result.gaps[0].index,1); assert.equal(result.gaps[0].height,d.height+24-600);
    assert.equal(P.plan([{top:0,height:10},{top:10,height:10,breakBefore:true}],page).count,2);
    assert.equal(P.plan([{top:0,height:d.content+1}],page).oversized,true);
    assert.throws(() => P.plan(Array.from({length:1001},(_,i) => ({top:i,height:1,breakBefore:true})),page),/1,000 pages/);
});

test('continued table rows reserve repeated header height before subsequent placement',()=>{
    const page=P.settings({page:'300pt x 400pt',margins:'20pt'}),d=P.dimensions(page);
    const blocks=[{top:0,height:30,keepNext:true},{top:30,height:420,repeatHeader:30},{top:450,height:50,repeatHeader:30},{top:500,height:410,repeatHeader:30}];
    const layout=P.plan(blocks,page);
    assert.equal(layout.count,3);assert.equal(layout.gaps[0].index,2);assert.equal(layout.gaps[0].header,30);assert.equal(layout.gaps[1].index,3);
    assert.equal(layout.gaps[0].height,d.height+24-450);assert.equal(layout.oversized,false);
    assert.equal(P.plan([{top:0,height:450},{top:450,height:d.content,repeatHeader:30}],page).oversized,true);
});
test('keep chains move together only when they fit and never cross explicit breaks',()=>{
    const page=P.settings({page:'letter',margins:'1in'}),d=P.dimensions(page);
    const blocks=[{top:0,height:800,pos:0},{top:800,height:40,pos:10,keepNext:true},{top:840,height:100,pos:20}];
    assert.equal(P.plan(blocks,page).gaps[0].index,1);
    assert.equal(P.plan(blocks.map((b,i)=>({...b,keepNext:false})),page).gaps[0].index,2);
    assert.equal(P.plan(blocks.map((b,i)=>({...b,breakBefore:i===2})),page).gaps[0].index,2);
    assert.equal(P.plan(blocks.map((b,i)=>({...b,control:i===2})),page).gaps[0].index,2);
    const chain=[{top:0,height:760,pos:0},{top:760,height:50,pos:1,keepNext:true},{top:810,height:50,pos:2,keepNext:true},{top:860,height:100,pos:3}];
    assert.equal(P.plan(chain,page).gaps[0].index,1);
    assert.equal(P.plan([{top:0,height:20,keepNext:true},{top:20,height:d.content+1}],page).oversized,true);
    assert.equal(P.plan([{top:0,height:20,keepNext:true}],page).count,1);
});

test('line keep groups prevent single-line paragraph fragments and retain forced boundaries',()=>{
    const page=P.settings({page:'300pt x 300pt',margins:'20pt'});
    // Six lines fit. The first and last pairs carry the two-line defaults.
    const lines=Array.from({length:13},(_,i)=>({top:i*50,height:50,pos:i+1,keepNext:i===0||i===11}));
    const layout=P.plan(lines,page);
    const boundaries=[0,...layout.gaps.map(g=>g.index),lines.length];
    for(let i=1;i<boundaries.length;i++)assert.ok(boundaries[i]-boundaries[i-1]>=2);
    assert.equal(layout.oversized,false);
    assert.equal(P.plan(lines.map((line,i)=>({...line,breakBefore:i===1})),page).gaps[0].index,1);
});

test('page footnotes reserve space at the first reference and keep repetitions as cross-references',()=>{
    const page=P.settings({page:'300pt x 400pt',margins:'20pt'}),d=P.dimensions(page);
    const blocks=[{top:0,height:440},{top:440,height:20,references:['proof']},{top:460,height:20,references:['proof']}];
    blocks.footnotes=[{label:'proof',number:1,height:60,pos:100,to:110}]; // check-ignore(title-case-labels): This is a Markdown identifier, not a UI label.
    const layout=P.plan(blocks,page);
    assert.equal(layout.gaps[0].index,1);
    assert.equal(layout.footnotes.length,1);
    assert.equal(layout.footnotes[0].page,2);
    assert.equal(layout.footnotes[0].top+layout.footnotes[0].height,d.height+24+d.content);
    assert.equal(layout.oversized,false);
    assert.equal(layout.problem,'');
    const missing=P.plan([{top:0,height:20,references:['missing']}],page);
    assert.match(missing.problem,/no definition/);
    const excessive=[{top:0,height:20,references:['big']}];excessive.footnotes=[{label:'big',number:1,height:d.content}]; // check-ignore(title-case-labels): This is a Markdown identifier, not a UI label.
    assert.equal(P.plan(excessive,page).oversized,true);
    assert.match(P.plan(excessive,page).problem,/Shorten the note/);
});

test('measured footnote continuations reserve later pages and retain every source unit once',()=>{
    const page=P.settings({page:'300pt x 400pt',margins:'20pt'}),d=P.dimensions(page),blocks=[{top:0,height:20,references:['long']},{top:20,height:400},{top:420,height:200}];
    blocks.footnotes=[{label:'long',number:1,height:1210,prefix:10,units:Array.from({length:24},(_,i)=>({top:i*50,height:50,pos:i+100}))}]; // check-ignore(title-case-labels): These labels identify Markdown notes, not UI controls.
    const layout=P.plan(blocks,page);
    assert.equal(layout.oversized,false);assert.equal(layout.problem,'');assert.ok(layout.count>3);
    const pieces=layout.footnotes;assert.equal(pieces[0].page,1);assert.equal(pieces[0].from,0);assert.equal(pieces.at(-1).end,24);
    for(let index=1;index<pieces.length;index++)assert.equal(pieces[index].from,pieces[index-1].end);
    assert.ok(pieces.every(piece=>piece.height<=d.content/2&&piece.top+piece.height<=piece.page*(d.height+24)-24-d.top-d.bottom+.5));
});

test('several long notes on one reference line share the first fragment budget',()=>{
    const page=P.settings({page:'300pt x 400pt',margins:'20pt'}),d=P.dimensions(page),blocks=[{top:0,height:22,references:['one','two','three']}];
    blocks.footnotes=blocks[0].references.map((label,n)=>({label,number:n+1,height:610,prefix:10,units:Array.from({length:30},(_,i)=>({top:i*20,height:20,pos:100+i}))}));
    const layout=P.plan(blocks,page);assert.equal(layout.oversized,false);assert.equal(layout.problem,'');
    const first=layout.footnotes.filter(piece=>piece.page===1);assert.equal(first.length,3);assert.ok(first.reduce((height,piece)=>height+piece.height+8,0)<=d.content-22);
    for(const label of blocks[0].references){const parts=layout.footnotes.filter(piece=>piece.label===label);assert.equal(parts[0].from,0);assert.equal(parts.at(-1).end,30);for(let i=1;i<parts.length;i++)assert.equal(parts[i].from,parts[i-1].end);}
});

test('a short later note can use remaining sheet space beyond the preferred continuation allowance',()=>{
    const page=P.settings({page:'300pt x 400pt',margins:'20pt'}),blocks=[{top:0,height:20,references:['earlier']},{top:20,height:20,references:['later']}];
    blocks.footnotes=[{label:'earlier',number:1,height:220,units:[{top:0,height:220}]},{label:'later',number:2,height:30,units:[{top:0,height:30}]}]; // check-ignore(title-case-labels): These labels identify Markdown notes, not UI controls.
    const layout=P.plan(blocks,page);assert.equal(layout.count,1);assert.equal(layout.oversized,false);assert.equal(layout.problem,'');assert.equal(layout.footnotes.length,2);
});
