// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Uses only browser UI, private X input and the real producer reader/model.
const fs=require('node:fs/promises'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),pw=require('playwright-core');
const {compare}=require('./compare.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),hash=raw=>crypto.createHash('sha256').update(raw).digest('hex');
async function wait(test,label){const end=Date.now()+30000;while(Date.now()<end){const value=await test();if(value)return value;await delay(100);}throw new Error('Timed out: '+label);}
(async()=>{
    const children=[],logs=[],checks=[];let browser,page,startupError,phase='Input identity',result;
    function start(file,args){const child=cp.spawn(file,args,{stdio:['ignore','pipe','pipe']});children.push(child);child.on('error',error=>{startupError=error;});child.stdout.on('data',raw=>logs.push(raw.toString()));child.stderr.on('data',raw=>logs.push(raw.toString()));return child;}
    function x(...args){return cp.execFileSync('xdotool',args,{encoding:'utf8'}).trim();}
    try{
        const manifest=JSON.parse(await fs.readFile('/input/manifest.json','utf8'));
        assert.equal(hash(JSON.stringify(manifest.files)),manifest.digest);
        const allowed=new Set(['extended.canvas','standard.canvas','Notes/Reference.md','Assets/paper.svg','apps/diagram-kit/jcanvas.js','apps/diagrams/canvas-model.js']);
        for(const file of manifest.files){assert.ok(allowed.delete(file.path),'Unexpected or repeated input');assert.equal(hash(await fs.readFile('/input/'+file.path)),file.sha256,file.path);}assert.equal(allowed.size,0);
        const J=require('/input/apps/diagram-kit/jcanvas.js'),M=require('/input/apps/diagrams/canvas-model.js');
        const vault='/home/node/Canvas Proof';await fs.mkdir(vault);
        phase='Application startup';start('Xvfb',[':99','-screen','0','1600x1100x24','-nolisten','tcp']);
        await wait(()=>fs.stat('/tmp/.X11-unix/X99').then(()=>true,()=>false),'Private X display');
        start('/opt/Obsidian/obsidian',['--no-sandbox','--disable-gpu','--remote-debugging-port=9222']);
        browser=await wait(async()=>{if(startupError)throw startupError;try{return await pw.chromium.connectOverCDP('http://127.0.0.1:9222');}catch{return null;}},'Electron debugging endpoint');
        const context=browser.contexts()[0];page=await wait(()=>context.pages()[0],'Welcome page');
        await page.waitForFunction(()=>document.body&&document.body.innerText.includes('Quick start'));
        const startup=await page.locator('body').innerText();assert.match(startup,/Version 1\.15\.0/);await fs.writeFile('/evidence/startup.txt',startup);
        phase='Native vault selection';
        // Electron's native chooser blocks completion of the browser click.
        let pickingError;const picking=page.getByRole('button',{name:'Open',exact:true}).click().catch(error=>{pickingError=error;});
        const chooser=await wait(()=>{const found=cp.spawnSync('xdotool',['search','--onlyvisible','--name','^Open folder as vault$'],{encoding:'utf8'});return found.status===0&&found.stdout.trim().split('\n').at(-1);},'Native folder chooser');
        x('windowfocus','--sync',chooser);x('key','ctrl+l');x('type','--clearmodifiers','--delay','0',vault);x('key','Return');
        // In a SELECT_FOLDER chooser, Return navigates and Open accepts it.
        await delay(500);if(cp.spawnSync('xdotool',['search','--onlyvisible','--name','^Open folder as vault$']).status===0)x('key','alt+o');
        await picking;if(pickingError)throw pickingError;
        page=await wait(async()=>{for(const candidate of context.pages())if(!candidate.isClosed()&&(await candidate.title()).includes('Canvas Proof'))return candidate;return null;},'Verified vault window');
        x('windowfocus','--sync',x('search','--onlyvisible','--name','Canvas Proof').split('\n').at(-1));
        page.on('pageerror',error=>logs.push('PAGE ERROR '+error.stack));page.on('console',message=>{if(message.type()==='error')logs.push('PAGE CONSOLE '+message.text());});
        // Populate after opening the empty folder so GTK cannot choose a child.
        for(const file of manifest.files.filter(file=>!file.path.startsWith('apps/'))){const target=vault+'/'+file.path;await fs.mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});await fs.copyFile('/input/'+file.path,target);}
        const runtime=await page.evaluate(()=>navigator.userAgent);
        async function edit(suffix){
            const label=page.getByText('Editable card',{exact:true});await page.locator('.canvas-node').filter({has:label}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();
            // This pinned application's normal card editor is a sandboxed frame.
            const editor=page.frameLocator('.canvas-node.is-editing iframe.embed-iframe').locator('.cm-content[contenteditable="true"]');await editor.waitFor();await editor.click();await page.keyboard.press('Control+End');await page.keyboard.type(suffix);await page.keyboard.press('Escape');await editor.waitFor({state:'hidden'});
        }
        for(const name of ['extended','standard']){
            phase=name+' native save';const file=vault+'/'+name+'.canvas';let expected=JSON.parse(await fs.readFile('/input/'+name+'.canvas','utf8'));
            await page.getByText(name,{exact:true}).first().dblclick();await page.getByText('Editable card',{exact:true}).waitFor();
            const paths=page.locator('.canvas-edges .canvas-display-path');assert.equal(await paths.count(),expected.edges.length,'Every connection must be drawn');
            assert.ok((await paths.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('d')))).every(value=>value&&!/NaN|undefined|Infinity/.test(value)),'A connection has invalid rendered geometry');
            const first='\n\nObsidian round-trip edit.';await edit(first);expected.nodes.find(node=>node.id==='editable').text+=first;
            let saved=await wait(async()=>{const doc=JSON.parse(await fs.readFile(file,'utf8'));return doc.nodes.find(node=>node.id==='editable').text.endsWith(first)&&doc;},'Actual Obsidian card save');await fs.writeFile('/evidence/'+name+'.first.canvas',JSON.stringify(saved,null,2));compare(saved,expected);assert.deepEqual(J.read(JSON.stringify(saved)).problems,[]);
            phase=name+' producer return';expected=M.edit(saved,{op:'move',key:'editable',dx:32,dy:16}).doc;
            expected=M.edit(expected,{op:'move',key:'color5',dx:-150,dy:-170}).doc;
            if(name==='extended'){const automatic=expected.edges.find(edge=>edge.id==='automatic');assert.equal(J.automatic(automatic,'from'),true);assert.equal(automatic.fromSide,'top');assert.equal(automatic.toSide,'bottom');}
            expected=M.edit(expected,{op:'set',key:'editable',property:'text',value:expected.nodes.find(node=>node.id==='editable').text+'\n\nReturned from yavc.'}).doc;
            const outgoing=J.write(expected);assert.deepEqual(J.read(outgoing).problems,[]);await fs.writeFile(file+'.producer-tmp',outgoing);await fs.rename(file+'.producer-tmp',file);
            await page.getByText('Returned from yavc.',{exact:true}).waitFor();
            const final='\n\nFinal Obsidian save.';await edit(final);expected.nodes.find(node=>node.id==='editable').text+=final;
            saved=await wait(async()=>{const doc=JSON.parse(await fs.readFile(file,'utf8'));return doc.nodes.find(node=>node.id==='editable').text.endsWith(final)&&doc;},'Second native save');await fs.writeFile('/evidence/'+name+'.saved.canvas',JSON.stringify(saved,null,2));compare(saved,expected);assert.deepEqual(J.read(JSON.stringify(saved)).problems,[]);await page.screenshot({path:'/evidence/'+name+'.png'});
            checks.push(name+': producer write, native card edit/save, producer read/move/write and second native edit/save preserve all fields and extensions');console.log(checks.at(-1));
        }
        result={ok:true,application:'Obsidian 1.15.0',runtime,inputDigest:manifest.digest,files:manifest.files,checks,normalizations:['Omitted fromEnd and toEnd retain the JSON Canvas 1.0 defaults.','Only disjoint-node array reordering is allowed; overlapping z-order must remain unchanged.'],limits:['Linux x86-64 with the pinned installer only. Other versions and platforms need their own run.','The fixture covers core Canvas with no community plugins. Network access is disabled.']};
    }catch(error){result={ok:false,phase,message:error.message,stack:error.stack,checks};if(page&&!page.isClosed()){await page.screenshot({path:'/evidence/failed.png'}).catch(()=>{});await fs.writeFile('/evidence/failed.html',await page.content().catch(()=>''));}throw error;
    }finally{
        for(const child of children.slice().reverse())child.kill('SIGTERM');if(browser)await browser.close();await fs.writeFile('/evidence/process.log',logs.join(''));await fs.writeFile('/evidence/acceptance.json',JSON.stringify(result,null,2));
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
