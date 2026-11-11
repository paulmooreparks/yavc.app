// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'web/pudl');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/pudl-0.107.1.json'),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);}
test('the complete bundled PUDL distribution matches the verified release archive',()=>{
 assert.deepEqual(files(dist).sort(),Object.keys(manifest.files).sort());
 for(const [name,hash]of Object.entries(manifest.files))assert.equal(digest(fs.readFileSync(path.join(dist,name))),hash,name);
 assert.ok(fs.readFileSync(path.join(dist,'pudl.css'),'utf8').slice(0,400).includes('Version '+manifest.version));
});
if(process.env.YAVC_PUDL_TEST_BASE)test('the host serves the complete verified PUDL distribution',async()=>{
 const pending=Object.entries(manifest.files),base=new URL(process.env.YAVC_PUDL_TEST_BASE);
 await Promise.all(Array.from({length:6},async()=>{while(pending.length){const [name,hash]=pending.shift(),url=new URL(name,base);url.searchParams.set('v',manifest.version);const response=await fetch(url);assert.equal(response.status,200,name);assert.equal(digest(Buffer.from(await response.arrayBuffer())),hash,name);}}));
});
