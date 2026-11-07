// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A dependency-complete experimental artifact, not a published SDK release.
import { mkdir, readdir, readFile, writeFile, copyFile, lstat } from 'node:fs/promises';
import { resolve, join, dirname, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=process.argv[2] && resolve(process.argv[2]);
const location=out && relative(root,out);
if (!out || !(location==='..' || location.startsWith('..'+sep) || isAbsolute(location))) throw new Error('Supply a new output directory outside the checkout.');
await mkdir(out); // Refuse to overwrite a previous artifact.
for (const name of ['LICENSE','go.mod','go.sum']) await copyFile(join(root,name),join(out,name));
async function copyTree(source,target) {
    await mkdir(target,{recursive:true});
    for (const entry of (await readdir(source,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
        if (['test','node_modules'].includes(entry.name) || /\.(wasm)$/.test(entry.name) || entry.name==='wasm_exec.js') continue;
        const input=join(source,entry.name), output=join(target,entry.name);
        if (entry.isSymbolicLink()) throw new Error('Package sources cannot contain symlinks.');
        if (entry.isDirectory()) await copyTree(input,output); else if (entry.isFile()) await copyFile(input,output);
    }
}
for (const name of ['content-kit','diagrams','diagram-kit','md-editor','md-engine']) await copyTree(join(root,'apps',name),join(out,'content',name));
await copyTree(join(root,'web','pudl'),join(out,'pudl'));
await mkdir(join(out,'support'));
for (const name of ['yavc-util.js','dialogs.js','doc-tabs.js','pudl-host-kit.js']) await copyFile(join(root,'internal','web','static',name),join(out,'support',name));
const css=await readFile(join(root,'internal','web','static','site.css'),'utf8');
const glyphs=css.match(/--glyph-yavc-[a-z0-9-]+:\s*url\("[^"\n]*"\);/g);
if (!glyphs?.length) throw new Error('Project glyph declarations were not found.');
await writeFile(join(out,'support','glyphs.css'),':root {\n'+glyphs.join('\n')+'\n}\n');
await copyTree(join(root,'scripts','fixtures','portable-diagrams'),join(out,'lab'));
const goroot=execFileSync('go',['env','GOROOT'],{cwd:root,encoding:'utf8'}).trim();
await copyFile(join(goroot,'LICENSE'),join(out,'support','GO-LICENSE'));
for (const [command,folder,name] of [['yavc-md','md-engine','yavc-md.wasm'],['yavc-d2','diagram-kit','yavc-d2.wasm']]) {
    execFileSync('go',['build','-trimpath','-ldflags=-s -w','-o',join(out,'content',folder,name),'./cmd/'+command],{cwd:root,env:{...process.env,GOOS:'js',GOARCH:'wasm'},stdio:'inherit'});
    await copyFile(join(goroot,'lib','wasm','wasm_exec.js'),join(out,'content',folder,'wasm_exec.js'));
}
const files=[];
async function inventory(dir) {
    for (const item of (await readdir(dir)).sort()) {
        const file=join(dir,item), stat=await lstat(file);
        if(stat.isDirectory()) await inventory(file);
        else { const bytes=await readFile(file); files.push({path:relative(out,file).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}); }
    }
}
await inventory(out); files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const manifest={version:1,kind:'experimental-diagrams-extraction',entry:'content/diagrams/applet.json',requirements:{scriptKind:'classic',resourceContract:1,workerPolicies:[{path:'content/diagram-kit/worker.js',csp:"default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'"}]},gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),go:execFileSync('go',['version'],{encoding:'utf8'}).trim(),files};
manifest.digest=createHash('sha256').update(JSON.stringify(files)).digest('hex');
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
process.stdout.write(JSON.stringify({out,digest:manifest.digest,files:files.length})+'\n');
