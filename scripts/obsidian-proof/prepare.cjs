// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const J=require('../../apps/diagram-kit/jcanvas.js'),M=require('../../apps/diagrams/canvas-model.js'),{fixtures}=require('./fixtures.cjs');
(async()=>{
    if(!process.argv[2])throw new Error('Supply a fresh input directory.');
    const destination=path.resolve(process.argv[2]);if(await fs.stat(destination).then(()=>true,()=>false))throw new Error('The input directory already exists.');
    const files=[];await fs.mkdir(destination,{recursive:true});
    async function put(name,data){await fs.mkdir(path.dirname(path.join(destination,name)),{recursive:true});await fs.writeFile(path.join(destination,name),data);files.push({path:name,sha256:crypto.createHash('sha256').update(data).digest('hex')});}
    for(const [name,data] of Object.entries(fixtures())){
        assert.deepEqual(J.read(J.write(data)).problems,[]);
        const original=JSON.stringify(data),changed=M.edit(data,{op:'move',key:'color6',dx:16,dy:0}).doc;assert.equal(JSON.stringify(data),original);
        let text=J.write(changed);
        if(name==='standard'){const standard=JSON.parse(text);delete standard.yavc;for(const item of [...standard.nodes,...standard.edges])delete item.yavc;text=JSON.stringify(standard,null,2)+'\n';}
        await put(name+'.canvas',text);
    }
    await put('Notes/Reference.md','# Heading\n\nA synthetic reference file.\n');
    await put('Assets/paper.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="#fafafa"/></svg>');
    for(const name of ['apps/diagram-kit/jcanvas.js','apps/diagrams/canvas-model.js'])await put(name,await fs.readFile(path.join(__dirname,'../..',name)));
    await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({version:1,files,digest:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex')},null,2));
    console.log('Prepared native-writer Canvas fixtures at '+destination);
})().catch(error=>{console.error(error);process.exitCode=1;});
