// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The native page reports through its existing authenticated host bridge.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const proof=path.resolve(process.argv[2]),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
    const prepared=JSON.parse(await fs.readFile(path.join(proof,'preparation.json'),'utf8')),build=JSON.parse(await fs.readFile(path.join(proof,'build.json'),'utf8')),manifest=JSON.parse(await fs.readFile(path.join(prepared.artifact,'manifest.json'),'utf8'));
    assert.equal(prepared.digest,manifest.digest);assert.equal(path.resolve(build.proof),proof);
    assert.equal(path.resolve(build.artifact),path.resolve(prepared.artifact));
    cp.execFileSync(process.execPath,[path.join(__dirname,'prepare-dinah-content-proof.cjs'),prepared.receiver,prepared.artifact,proof,'--verify'],{stdio:'inherit',windowsHide:true});
    const executable=path.join(proof,'dinah-content-proof.exe');assert.equal(crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex').toUpperCase(),build.executableSha256);
    const runId=crypto.randomUUID(),run=path.join(proof,'run-'+runId);await fs.mkdir(run);await fs.mkdir(path.join(run,'workspace'));await fs.mkdir(path.join(run,'profile'));
    for(const name of ['Source.md','Document.docs.md','Drawing.canvas'])await fs.copyFile(path.join(proof,'workspace',name),path.join(run,'workspace',name));
    const fixtures={};
    for(const name of ['index.html','native-host.js','native-checks.js']){const bytes=await fs.readFile(path.join(__dirname,'fixtures/dinah-content',name));await fs.writeFile(path.join(proof,'host',name),bytes);fixtures[name]=crypto.createHash('sha256').update(bytes).digest('hex');}
    await fs.writeFile(path.join(proof,'host','native-config.js'),'window.nativeProofConfig='+JSON.stringify({workspace:path.join(run,'workspace'),digest:manifest.digest,runId})+';\n');
    const environment=Object.assign({},process.env,{DINAH_HOME:path.join(run,'profile'),DINAH_SHELL_ENTRY_FILE:path.join(run,'entry.txt'),YAVC_PROOF_HOST:path.join(proof,'host'),YAVC_PROOF_ARTIFACT:prepared.artifact});
    const child=cp.spawn(executable,[],{cwd:run,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});let exit=null,output='',spawnError=null;child.on('error',error=>{spawnError=error;});child.on('exit',(code,signal)=>{exit={code,signal};});child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
    let result=null;
    try{
        for(let attempt=0;attempt<360;attempt++){
            if(spawnError)throw spawnError;
            if(exit)throw new Error('Native proof exited before reporting: '+JSON.stringify(exit)+' '+output);
            try{const ui=JSON.parse(await fs.readFile(path.join(run,'profile','ui-state.json'),'utf8')),candidate=ui.values['yavc-proof-result'];if(candidate&&candidate.runId===runId){result=candidate;break;}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
            await delay(500);
        }
        assert.ok(result,'Native WebView did not report within three minutes.');
        result.receiver=build.receiver;result.extension=build.extension;result.executableSha256=build.executableSha256;result.producer=build.producer;result.fixtures=fixtures;
        await fs.writeFile(path.join(run,'acceptance.json'),JSON.stringify(result,null,2));await fs.writeFile(path.join(proof,'latest-run.txt'),run+'\n');
        assert.ok(result.ok,JSON.stringify(result));assert.equal(result.assets,manifest.files.length);assert.deepEqual(result.errors,[]);console.log('Actual hidden Dinah WebView2 acceptance passed: '+JSON.stringify({receiver:result.receiver,digest:result.digest,userAgent:result.userAgent,visibility:result.visibility,assets:result.assets,checks:result.checks,evidence:run}));
    }finally{
        // Stop only the process launched above and its proof WebView children.
        if(!exit&&child.pid)await new Promise(resolve=>{const killer=cp.spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('exit',resolve);killer.on('error',resolve);});
        await fs.writeFile(path.join(run,'native-process.log'),output);
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
