// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),codec=require('../text-codec.js'),{create}=require('../byte-resources.js');

test('strict Unicode source retains BOM, all newline forms and non-BMP text byte for byte',()=>{
    for(const encoding of ['utf-8','utf-16le','utf-16be'])for(const body of ['', 'A\r\nB\nC\rD\t\f café 😀 中文']){
        const text=(encoding==='utf-8'?'':'\ufeff')+body,bytes=codec.encode(text,encoding),result=codec.decode(bytes);
        assert.equal(result.encoding,encoding);assert.equal(result.text,text);assert.deepEqual(codec.encode(result.text,result.encoding),bytes);
    }
    const bom=codec.decode(new Uint8Array([239,187,191,65]));assert.equal(bom.bom,true);assert.equal(bom.text,'\ufeffA');
    const backing=new Uint8Array([255,65,66,255]);assert.equal(codec.decode(backing.subarray(1,3)).text,'AB');
});

test('malformed or unsupported source never gains replacement-decoded text',()=>{
    for(const bytes of [[0xC0,0xAF],[0xED,0xA0,0x80],[0xF4,0x90,0x80,0x80],[0xEF],[0xFF,0xFE,0x41],[0xFF,0xFE,0,0xD8],[0xFE,0xFF,0xDC,0],[0xFF,0xFE,0,0],[0,0,0xFE,0xFF],[0x41,0],[0x1B,65],[0x7F]])assert.throws(()=>codec.decode(new Uint8Array(bytes)));
    for(const text of ['\ud800','\udc00','A\ud800B'])assert.throws(()=>codec.encode(text,'utf-8'));
    assert.deepEqual(codec.encode('\0\x1b','utf-8'),new Uint8Array([0,27]));
    assert.throws(()=>codec.encode('x','windows-1252'),/unsupported/);
});

test('text and byte policy bounds are independent and apply to expanded Unicode output',()=>{
    assert.throws(()=>codec.decode(new Uint8Array([65,66]),{maxBytes:1}),/byte limit/);
    assert.throws(()=>codec.decode(new Uint8Array([65,66]),{maxText:1}),/text limit/);
    assert.throws(()=>codec.encode('😀','utf-8',{maxBytes:3}),/byte limit/);
    assert.throws(()=>codec.encode('😀','utf-16be',{maxBytes:3}),/byte limit/);
    for(const maxBytes of [0,-1,1.5,codec.maxBytes+1,NaN])assert.throws(()=>codec.decode(new Uint8Array(),{maxBytes}),/limit/);
    assert.throws(()=>codec.decode('not bytes'),/bytes/);
    if(typeof SharedArrayBuffer!=='undefined')assert.throws(()=>codec.decode(new Uint8Array(new SharedArrayBuffer(1))),/bytes/);
});

test('a byte client binds host methods and copies complete authority snapshots without write access',async()=>{
    const bytes=new Uint8Array([65,66]),host={version:1,async read(request){assert.equal(this,host);return {...request,revision:'r1',name:'file.any',bytes};}};
    const client=create(host),result=await client.read('opaque:file',2);result.bytes[0]=0;assert.equal(bytes[0],65);assert.equal(result.revision,'r1');assert.equal(client.write,undefined);
    assert.throws(()=>create({version:2,read(){}}),/does not support/);
    const buffer=Buffer.from([65,66]),copy=await create({version:1,read:async()=>({resource:'file',revision:'r1',bytes:buffer})}).read('file',2);copy.bytes[0]=0;assert.equal(buffer[0],65);
    class Aliased extends Uint8Array {slice(){throw new Error('Do not invoke host copy methods.');}}
    const aliased=new Aliased([65]),owned=await create({version:1,read:async()=>({resource:'file',revision:'r1',bytes:aliased})}).read('file',1);owned.bytes[0]=0;assert.equal(aliased[0],65);
});

test('byte responses refuse identity, token, size and metadata violations',async()=>{
    const base={resource:'file',revision:'r1',bytes:new Uint8Array([65])};
    for(const change of [{resource:'other'},{revision:''},{bytes:new Uint8Array(3)},{bytes:'A'},{name:'bad\nname'},{mediaType:'text/\0plain'}]){
        await assert.rejects(create({version:1,read:async()=>({...base,...change})}).read('file',2));
    }
    let reads=0;const client=create({version:1,read(){reads++;}});await assert.rejects(client.read('file',0));assert.equal(reads,0);
    class FalseSize extends Uint8Array {get byteLength(){return 1;}}
    await assert.rejects(create({version:1,read:async()=>({...base,bytes:new FalseSize([65,66,67])})}).read('file',2),/limit/);
});

test('cancelled or obsolete byte reads cannot return an adoptable source',async()=>{
    let release;const controller=new AbortController(),client=create({version:1,read:()=>new Promise(resolve=>release=resolve)});
    const pending=client.read('file',2,{signal:controller.signal});controller.abort();release({resource:'file',revision:'r1',bytes:new Uint8Array([65])});await assert.rejects(pending,/cancelled/);
    await assert.rejects(client.read('file',2,{current:()=>false}),/cancelled/);
});
