// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Build overlays keep the receiving checkout and the producer artifact intact.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const [receiver,artifact,destination]=process.argv.slice(2).map(value=>path.resolve(value));
function replaceOnce(source,before,after){if(source.indexOf(before)<0||source.indexOf(before)!==source.lastIndexOf(before))throw new Error('Receiving source seam changed: '+before.slice(0,70));return source.replace(before,after);}
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8'));
    if(crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex')!==manifest.digest)throw new Error('Artifact manifest digest mismatch.');
    const seen=new Set();
    for(const file of manifest.files){if(typeof file.path!=='string'||path.isAbsolute(file.path)||/[\\:]/.test(file.path)||file.path.split('/').some(part=>!part||part==='.'||part==='..')||seen.has(file.path))throw new Error('Unsafe or repeated manifest path.');seen.add(file.path);const raw=await fs.readFile(path.join(artifact,file.path));if(crypto.createHash('sha256').update(raw).digest('hex')!==file.sha256)throw new Error('Artifact differs: '+file.path);}
    if(process.argv[5]==='--verify'){
        const prepared=JSON.parse(await fs.readFile(path.join(destination,'preparation.json'),'utf8'));
        if(path.resolve(prepared.receiver)!==receiver||path.resolve(prepared.artifact)!==artifact||prepared.digest!==manifest.digest||prepared.files!==manifest.files.length)throw new Error('Prepared proof identity differs.');
        const overlay=JSON.parse(await fs.readFile(path.join(destination,'overlay.json'),'utf8'));
        if(Object.keys(overlay.Replace).length!==2)throw new Error('Prepared overlay has unexpected replacements.');
        for(const name of ['main.go','shell_server.go']){
            const original=path.join(receiver,'cmd/dinah-desktop',name),target=path.join(destination,'overlay',name);
            if(overlay.Replace[original]!==target)throw new Error('Prepared overlay target differs.');
            if(crypto.createHash('sha256').update(await fs.readFile(original)).digest('hex')!==prepared.originals[name])throw new Error('Receiving source differs: '+name);
            if(!prepared.overlays||crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex')!==prepared.overlays[name])throw new Error('Prepared overlay differs: '+name);
        }
        console.log('Verified prepared native proof '+destination);return;
    }
    if(await fs.stat(destination).then(()=>true,()=>false))throw new Error('Proof directory already exists.');
    await fs.mkdir(destination);for(const name of ['host','workspace','profile','overlay'])await fs.mkdir(path.join(destination,name));
    const originals={},overlays={},overlay={Replace:{}};
    for(const name of ['main.go','shell_server.go']){
        const original=path.join(receiver,'cmd/dinah-desktop',name),raw=await fs.readFile(original,'utf8');originals[name]=crypto.createHash('sha256').update(raw).digest('hex');let source=raw;
        if(name==='main.go'){
            source=replaceOnce(source,'\t// A browser test drives the live page', '\tif root := os.Getenv("YAVC_PROOF_HOST"); root != "" {\n\t\tif os.Getenv("DINAH_SHELL_ENTRY_FILE") == "" || os.Getenv("YAVC_PROOF_ARTIFACT") == "" { log.Fatal("content proof requires hidden test mode and a pinned artifact") }\n\t\tfrontend = contentProofFS{os.DirFS(root), os.DirFS(os.Getenv("YAVC_PROOF_ARTIFACT"))}\n\t}\n\t// A browser test drives the live page');
            source+='\n// contentProofFS is used only by the isolated acceptance build.\ntype contentProofFS struct { host, artifact fs.FS }\nfunc (f contentProofFS) Open(name string) (fs.File,error) {\n if !fs.ValidPath(name) { return nil, fs.ErrInvalid }; file,err:=f.host.Open(name);if err==nil{return file,nil};if !os.IsNotExist(err){return nil,err};return f.artifact.Open(name)\n}\n';
        }else{
            source=replaceOnce(source,'\th.Set("Content-Security-Policy", shellPolicy)','\th.Set("Content-Security-Policy", shellPolicy)\n\tif os.Getenv("YAVC_PROOF_HOST") != "" && r.URL.Path == "/content/diagram-kit/worker.js" { h.Set("Content-Security-Policy", "default-src \'none\'; script-src \'self\' \'unsafe-eval\' \'wasm-unsafe-eval\'") }');
            source=replaceOnce(source,'\t"net/url"','\t"net/url"\n\t"os"');
        }
        const target=path.join(destination,'overlay',name);await fs.writeFile(target,source);overlay.Replace[original]=target;overlays[name]=crypto.createHash('sha256').update(source).digest('hex');
    }
    await fs.writeFile(path.join(destination,'overlay.json'),JSON.stringify(overlay,null,2));
    const fixtures={ 'Source.md':'# Native source\n\nRetained source.\n','Document.docs.md':'---\npage: 300pt x 400pt\nmargins: 20pt\n---\n\n# Native document\n\nEditable words with a note[^one].\n\n[^one]: A native note.\n','Drawing.canvas':JSON.stringify({nodes:[{id:'one',type:'text',x:0,y:0,width:180,height:80,text:'Native shape'}],edges:[]})};
    for(const [name,text] of Object.entries(fixtures))await fs.writeFile(path.join(destination,'workspace',name),text);
    for(const name of ['index.html','native-host.js','native-checks.js'])await fs.copyFile(path.join(__dirname,'fixtures/dinah-content',name),path.join(destination,'host',name));
    await fs.writeFile(path.join(destination,'host','native-config.js'),'window.nativeProofConfig='+JSON.stringify({workspace:path.join(destination,'workspace'),digest:manifest.digest})+';\n');
    await fs.writeFile(path.join(destination,'preparation.json'),JSON.stringify({receiver,artifact,digest:manifest.digest,files:manifest.files.length,originals,overlays,created:new Date().toISOString()},null,2));
    console.log('Prepared native proof '+destination+' from '+manifest.digest);
})().catch(error=>{console.error(error);process.exitCode=1;});
