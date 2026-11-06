// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../paper-sizes.js', import.meta.url), 'utf8'), context);
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
