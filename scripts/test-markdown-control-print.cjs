// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8493',out=path.join(os.tmpdir(),'yavc-markdown-control-print');fs.mkdirSync(out,{recursive:true});
const sources=['Slides.md','Editor.md'].map(name=>{let text=fs.readFileSync(path.join(__dirname,'../site/home/Howto',name),'utf8');if(name==='Editor.md')text=text.replace('{{tip:Try this}}','```mermaid\ngraph LR; A-->B;\n```\n\n{{tip:Try this}}');return {name,text};});
const action=(p,app,name,input={})=>p.evaluate(({app,name,input})=>pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
function contrast(a,b){function luminance(rgb){const c=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{if(!rgb.startsWith('color(srgb '))v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});try{for(const app of ['editor','docs']){
 const p=await browser.newPage({viewport:{width:1500,height:1100}});p.setDefaultTimeout(20000);await p.goto(`http://${app}.localhost:${port}/`);await p.locator('.cm-content').waitFor({state:'attached'});
 for(const theme of ['dark','light'])for(const sample of sources){
  await p.evaluate(theme=>pudlSetTheme(theme),theme);await action(p,app,'new',{path:'~/'+theme+'-'+sample.name,text:sample.text});await action(p,app,'view',{mode:'visual'});await p.locator('.ProseMirror[aria-busy="false"]').waitFor();
  await p.locator('.pm-source pre').first().click();const field=p.locator('textarea.page-source');await field.waitFor();
  let colors=await field.evaluate(n=>{const s=getComputedStyle(n);return [s.color,s.backgroundColor];});assert.ok(contrast(...colors)>=4.5,app+' '+theme+' source colors '+colors.join(' / '));
  await p.screenshot({path:path.join(out,engine+'-'+app+'-'+theme+'-'+sample.name+'-source.png')});
  await field.press('Escape');
  if(sample.name==='Editor.md'){
   const summary=p.locator('summary.btn');const paint=await summary.evaluate(n=>{const s=getComputedStyle(n);return {ink:s.color,stops:s.backgroundImage.match(/color\(srgb[^)]+\)|rgba?\([^)]+\)/g)||[s.backgroundColor]};});assert.ok(paint.stops.every(bg=>contrast(paint.ink,bg)>=4.5),app+' '+theme+' disclosure colors '+JSON.stringify(paint));
   const before=(await action(p,app,'document')).text;
   assert.equal(await p.evaluate(async text=>{const E=await yavcMdEditor.exports(),m=await yavcMdEngine();return E.prepare({text,engine:m.withMacros(text,'')}).then(()=>false,err=>/cannot represent/.test(err.message));},sample.text),true,'Office retains its structural disclosure restriction');
   await p.evaluate(()=>{const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='IFRAME')node.contentWindow.print=()=>{window.samplePrinted=true;};};window.samplePrinted=false;});
   await p.evaluate(()=>pudlCommands.run('print-document',null,document.querySelector('[data-applet]')));assert.equal(await p.evaluate(()=>!!window.samplePrinted),true,(await p.locator('body').innerText()).slice(-600)+' '+await p.evaluate(async text=>{const m=await yavcMdEngine(),f=yavcHTML.fragment(m.withMacros(text,'').exportPreview(text).blocks.map(b=>b.html).join(''));return Array.from(f.querySelectorAll('.sc-problem,.sc-glyph,svg,details,code[data-code-src]')).map(n=>n.outerHTML.slice(0,220));},sample.text));
   const printed=await p.locator('.ed-print-frame').evaluate(f=>({text:f.contentDocument.body.textContent,interactive:f.contentDocument.querySelectorAll('details,summary,button,textarea').length,images:f.contentDocument.images.length,diagrams:f.contentDocument.querySelectorAll('.doc-print-diagram svg').length,unsafe:f.contentDocument.querySelectorAll('script,svg [onload],svg a[href^="javascript:"]').length}));
   assert.match(printed.text,/Front matter/);assert.match(printed.text,/The lines between the two rows/);assert.equal(printed.interactive,0);assert.ok(printed.images>0,JSON.stringify(printed));
   assert.equal(printed.diagrams,1);assert.equal(printed.unsafe,0);assert.match(printed.text,/A/);assert.match(printed.text,/B/);
   for(const media of ['screen','print']){
    await p.emulateMedia({media});
    const pictures=await p.locator('.ed-print-frame').evaluate(f=>Array.from(f.contentDocument.images).map(img=>{const r=img.getBoundingClientRect(),column=img.closest('.sc-column');return {width:r.width,height:r.height,natural:img.naturalWidth/img.naturalHeight,column:column&&column.getBoundingClientRect().width};}));
    for(const picture of pictures){assert.ok(Math.abs(picture.width/picture.height/picture.natural-1)<.01,app+' '+theme+' '+media+' distorted image '+JSON.stringify(picture));if(picture.column)assert.ok(picture.width<=picture.column+1);}
   }
   await p.emulateMedia({media:'screen'});
   assert.equal((await action(p,app,'document')).text,before);
   await p.screenshot({path:path.join(out,engine+'-'+app+'-'+theme+'.png')});
  }
 }
 assert.equal(await p.evaluate(async()=>{const E=await yavcMdEditor.exports(),m=await yavcMdEngine(),text='```mermaid\ngraph LR; A -->\n```';return E.prepare({text,engine:m.withMacros(text,''),renderPages:()=>true}).then(()=>false,err=>/Mermaid diagram could not be printed/.test(err.message));}),true,'Invalid Mermaid fails visibly instead of printing an omitted drawing');
 await p.close();console.log(engine+' '+app+': source/disclosure contrast and complete sample printing pass in both themes');
 }}finally{await browser.close();}
}})().catch(err=>{console.error(err);process.exitCode=1;});
