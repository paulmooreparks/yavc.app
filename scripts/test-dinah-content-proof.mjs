// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const prepare=fileURLToPath(new URL('./prepare-dinah-content-proof.cjs',import.meta.url));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

test('Native proof preparation pins sources, overlays and artifact bytes',async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'yavc-proof-preparation-'));
    try{
        const receiver=path.join(root,'receiver'),artifact=path.join(root,'artifact'),proof=path.join(root,'proof');
        const source=path.join(receiver,'cmd','dinah-desktop');
        await fs.mkdir(source,{recursive:true});await fs.mkdir(artifact);
        await fs.writeFile(path.join(source,'main.go'),'package main\n\t// A browser test drives the live page\n');
        await fs.writeFile(path.join(source,'shell_server.go'),'package main\n\t"net/url"\n\th.Set("Content-Security-Policy", shellPolicy)\n');
        const asset=Buffer.from('Pinned artifact bytes.');await fs.writeFile(path.join(artifact,'asset.txt'),asset);
        const files=[{path:'asset.txt',sha256:hash(asset)}];
        async function manifest(items){await fs.writeFile(path.join(artifact,'manifest.json'),JSON.stringify({version:1,files:items,digest:hash(JSON.stringify(items))}));}
        await manifest(files);
        const run=(...extra)=>spawnSync(process.execPath,[prepare,receiver,artifact,proof,...extra],{encoding:'utf8',windowsHide:true});
        let result=run();assert.equal(result.status,0,result.stderr);
        result=run('--verify');assert.equal(result.status,0,result.stderr);
        const overlayPath=path.join(proof,'overlay','main.go'),overlay=await fs.readFile(overlayPath);
        await fs.appendFile(overlayPath,'changed');result=run('--verify');assert.notEqual(result.status,0);assert.match(result.stderr,/overlay differs/);await fs.writeFile(overlayPath,overlay);
        await fs.appendFile(path.join(source,'main.go'),'changed');result=run('--verify');assert.notEqual(result.status,0);assert.match(result.stderr,/Receiving source differs/);
        await fs.writeFile(path.join(artifact,'asset.txt'),'changed');result=run('--verify');assert.notEqual(result.status,0);assert.match(result.stderr,/Artifact differs/);
        await fs.writeFile(path.join(artifact,'asset.txt'),asset);
        for(const unsafe of ['../escape','C:/escape','folder\\escape','folder//escape','./asset.txt']){
            await manifest([{path:unsafe,sha256:hash(asset)}]);result=run('--verify');assert.notEqual(result.status,0);assert.match(result.stderr,/Unsafe or repeated manifest path/);
        }
        await manifest([...files,...files]);result=run('--verify');assert.notEqual(result.status,0);assert.match(result.stderr,/Unsafe or repeated manifest path/);
    }finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('yavc-proof-preparation-'));await fs.rm(root,{recursive:true,force:true});}
});
