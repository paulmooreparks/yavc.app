// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Portable forms use their own spacing without the demonstration site's CSS.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/spacing/',phase=process.env.YAVC_SPACING_PHASE||'after',out=process.env.YAVC_SPACING_OUT||path.join(os.tmpdir(),'yavc-form-spacing-'+phase);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path)),records=[];await fs.mkdir(out,{recursive:true});
 const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(prefix.length));if(!allowed.has(name))return res.writeHead(404).end();res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'}).end(await fs.readFile(path.join(artifact,name)));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{for(const app of ['docs','slides']){
   const p=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(20000);const root=app==='docs'?'document':'deck';
   try{await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=${app}`);await p.locator('#'+root+(app==='docs'?' .ProseMirror':' .deck-canvas')).waitFor();
    await p.evaluate(app=>pudlActions.run('yavc.'+app+'/view@1',{mode:'visual'},{grant:'all'}),app);await p.locator('#'+root+' .ProseMirror').waitFor();
    await p.evaluate(()=>{pudlHost.fileFields={version:1,choose:async()=> '~/portable/plan.canvas'};});
    const commands=['insert-sc-figure','insert-sc-diagram','insert-sc-code','insert-sc-glyph','custom-shortcodes'].concat(app==='slides'?['deck-stylesheet','deck-style-block','background-image']:['stylesheet']);
    for(const command of commands){
     await p.evaluate(({command,root})=>{window.spacingCommand=pudlCommands.run(command,null,document.getElementById(root));},{command,root});const d=p.locator('dialog[open]').last();await d.waitFor();
     if(command==='insert-sc-glyph')await d.locator('[data-glyph-loading]').waitFor({state:'hidden'});
     for(const width of [1440,390])for(const theme of ['light','dark']){
      await p.setViewportSize({width,height:1000});await p.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
      const measurements=await d.evaluate(dialog=>{
       const box=n=>n.getBoundingClientRect(),result={overflow:dialog.scrollWidth>dialog.clientWidth+1,paths:[]};
       const probe=document.createElement('div');probe.style.height='var(--space-2)';dialog.append(probe);result.space2=box(probe).height;probe.style.height='var(--space-3)';result.space3=box(probe).height;probe.remove();
       for(const group of dialog.querySelectorAll('.yavc-path-field')){const input=group.querySelector('input'),button=group.querySelector('button');if(input&&button)result.paths.push({gap:box(button).top-box(input).bottom,left:box(button).left-box(input).left,width:box(input).width,parent:box(group).width});}
       const search=dialog.querySelector('[data-glyph-search]'),list=dialog.querySelector('.md-glyph-options');if(search&&list)result.glyph=box(list).top-box(search).bottom;
       const intro=dialog.querySelector('.md-macro-intro')||dialog.querySelector('.dialog-body > .form-help'),definition=dialog.querySelector('[data-macro-select]')?.closest('.form-group');if(intro&&definition)result.macro=box(definition).top-box(intro).bottom;
       return result;
      });
      const label=engine+'-'+app+'-'+command+'-'+width+'-'+theme;records.push({label,...measurements});
      if(phase!=='before'){
       assert.equal(measurements.overflow,false,label+' overflow');for(const field of measurements.paths){assert.ok(field.gap>=measurements.space2-1,label+' Browse gap');assert.ok(Math.abs(field.left)<=1,label+' Browse alignment');assert.ok(Math.abs(field.width-field.parent)<=1,label+' field width');}
       if(measurements.glyph!=null)assert.ok(measurements.glyph>=measurements.space2-1,label+' glyph gap');
       if(measurements.macro!=null)assert.ok(measurements.macro>=measurements.space3-1,label+' macro introduction gap');
      }
      await d.screenshot({animations:'disabled',path:path.join(out,label+'.png')});
     }
     await d.getByRole('button',{name:'Cancel',exact:true}).click();await d.waitFor({state:'hidden'});
    }
    console.log(engine+' '+app+': portable form spacing at 1440/390 in light/dark');
   }finally{await p.close();}
  }}finally{await browser.close();}
 }}finally{server.close();await fs.writeFile(path.join(out,'measurements.json'),JSON.stringify(records,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
