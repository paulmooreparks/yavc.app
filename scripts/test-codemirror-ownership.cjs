// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A host's unrelated CodeMirror global must not affect the applets or the shared editing commands.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/owned/assets/',types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
    const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname.slice(prefix.length));if(!url.pathname.startsWith(prefix)||!allowed.has(name))return res.writeHead(404).end();res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(await fs.readFile(path.join(artifact,name)));}catch(error){res.writeHead(500).end(error.message);}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true});
        try{for(const app of ['editor','docs'])for(const timing of ['before','after']){
            const page=await browser.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
            try{
                if(timing==='before')await page.addInitScript(()=>{window.CM={EditorView:function ForeignEditorView(){},foreign:true};});
                await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=${app}`);
                const root=app==='editor'?'#source':'#document',run=(name,input={})=>page.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
                await page.locator(root+' .cm-content').waitFor({state:'attached'});await run('view',{mode:'text'});
                if(timing==='before')assert.equal(await page.evaluate(()=>window.CM.foreign),true,'loading the applet preserves the host library');
                await page.evaluate(async()=>{window.ownedLibrary=await yavcMdEditor.libs();window.CM={EditorView:function ForeignEditorView(){},foreign:true};});
                await page.locator(root+' .cm-content').focus();await page.keyboard.press('Control+End');await page.keyboard.type(' owned edit');
                assert.match((await run('document')).text,/ owned edit/);
                await page.evaluate(root=>pudlCommands.run('undo',null,document.querySelector(root)),root);assert.doesNotMatch((await run('document')).text,/ owned edit/);
                await page.evaluate(root=>pudlCommands.run('redo',null,document.querySelector(root)),root);assert.match((await run('document')).text,/ owned edit/);
                const result=await page.evaluate(async()=>{
                    const lib=await yavcMdEditor.libs(),notices=[],mount=document.createElement('div');document.body.append(mount);
                    const view=new lib.EditorView({state:lib.EditorState.create({doc:'seed',extensions:[lib.history()]}),parent:mount}),identity={};
                    const editing=yavcMdEditor.editing({source:()=>view,page:()=>null,rich:()=>false,preview:()=>null,identity:()=>identity,alive:()=>true,readOnly:()=>false,say:text=>notices.push(text),changed:()=>{}});
                    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedText=text;},readText:async()=>'replacement'}});
                    view.dispatch({selection:{anchor:0,head:4}});await editing.clipboard('cut');const cut=view.state.doc.toString(),copied=window.copiedText;
                    await editing.history('undo');const restored=view.state.doc.toString();await editing.clipboard('paste');const pasted=view.state.doc.toString(),canUndo=editing.canHistory('undo');
                    await editing.history('undo');const undone=view.state.doc.toString(),canRedo=editing.canHistory('redo');await editing.history('redo');const redone=view.state.doc.toString();
                    view.destroy();mount.remove();return {same:lib===window.ownedLibrary,foreign:window.CM.foreign,cut,copied,restored,pasted,canUndo,undone,canRedo,redone,notices};
                });
                assert.deepEqual(result,{same:true,foreign:true,cut:'',copied:'seed',restored:'seed',pasted:'replacement',canUndo:true,undone:'seed',canRedo:true,redone:'replacement',notices:[]});
                assert.deepEqual(errors,[]);console.log(`${engine} ${app}: foreign CM ${timing} startup leaves typing, clipboard and history working`);
            }finally{await page.close();}
        }}finally{await browser.close();}
    }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message||error);process.exitCode=1;});
