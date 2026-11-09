// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),images=require('../import-images.js');
test('Office importer bundle matches the pinned source and dependency manifest',()=>{
    const manifest=JSON.parse(readFileSync(new URL('../import/manifest.json',import.meta.url))),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
    for(const [name,expected] of Object.entries(manifest.inputs))assert.equal(hash(readFileSync(new URL('../import/'+name,import.meta.url))),expected,name);
    assert.equal(hash(readFileSync(new URL('../vendor/mammoth-1.13.0/office.js',import.meta.url))),manifest.bundle);
});
test('Office raster guards bound dimensions, headers, source size and offset views',()=>{
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64');
    assert.equal(images.accepts(png,'image/png'),true);assert.equal(images.dataURL(png,'image/png'),'data:image/png;base64,'+png.toString('base64'));
    const storage=new Uint8Array(png.length+4);storage.set(png,2);assert.equal(images.accepts(storage.subarray(2,-2),'image/png'),true);
    const large=Buffer.from(png);large.writeUInt32BE(100000,16);assert.equal(images.accepts(large,'image/png'),false);
    for(let size=0;size<24;size++)assert.equal(images.accepts(png.subarray(0,size),'image/png'),false);
    assert.equal(images.accepts(new Uint8Array(128*1024+1),'image/png'),false);assert.equal(images.accepts(png,'image/svg+xml'),false);
    for(let size=0;size<100;size++)assert.equal(images.accepts(Uint8Array.from({length:size},()=>255),'image/jpeg'),false);
});
