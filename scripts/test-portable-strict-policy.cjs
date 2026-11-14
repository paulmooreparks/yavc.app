// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Docs alone in the one-page host, served under a strict Content-Security-Policy, draws and works with no securitypolicyviolation event at all.
// The policy is the one a host that embeds Docs for private notes is expected to send, with `data:` images for the glyphs the style sheets
// carry as data: SVGs and with no `blob:`: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self';
// img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'. The other headers such a host sends go on every
// response too. The document has a heading, a table, a footnote and a picture the host supplies. The test types, formats, switches views, opens menus and two
// dialogs, saves and prepares a print, and fails on the first violation of any kind, naming the directive, the blocked address and the file.
// Usage: node scripts/test-portable-strict-policy.cjs <package folder> [browsers]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/';
// With STRICT_NONCE set (scripts/test-portable-nonce-policy.cjs) the policy has no 'unsafe-inline' and gives style elements a nonce that the host hands Docs, as PFO's server does.
const NONCE=process.env.STRICT_NONCE?'k3Yx9QpL7vWz2aBn':'';
const policy="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' "+(NONCE?"'nonce-"+NONCE+"'":"'unsafe-inline'")+"; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const notes=['# Session notes','','A paragraph with a note.[^1]','','| Name | Role |','| --- | --- |','| Siti | Client |','','![Chart](chart.png)','','[^1]: The footnote text.',''].join('\n');
// A 40 by 30 PNG made here, so no file is needed and the picture is a real raster image the host supplies.
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=bytes=>{let c=0xffffffff;for(const x of bytes)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
function chunk(type,data){const length=Buffer.alloc(4);length.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type),data]),sum=Buffer.alloc(4);sum.writeUInt32BE(crc(body));return Buffer.concat([length,body,sum]);}
const picture=(()=>{const w=40,h=30,row=w*3+1,raw=Buffer.alloc(row*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=y*row+1+x*3;raw[o]=200;raw[o+1]=x*5&255;raw[o+2]=y*8&255;}const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);})();
(async()=>{
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));
  const headers={'content-security-policy':policy,'x-frame-options':'DENY','referrer-policy':'no-referrer','x-content-type-options':'nosniff','cache-control':'no-store'};
  if(name==='pic/chart.png')return res.writeHead(200,{...headers,'content-type':'image/png'}).end(picture);
  let body=await fs.readFile(path.join(artifact,name));
  // The host page of the package, changed to install Docs alone, to hold the notes and to supply the picture from a same-origin address.
  if(name==='workspace-lab/host.js')body=Buffer.from(body.toString().replace(/records\.get\('memory:document\.docs\.md'\)\.text='[^;]*;/,()=>"records.get('memory:document.docs.md').text="+JSON.stringify(notes)+";").replace("['editor','docs','slides']","['docs']").replace("contentWorkspace:{version:1,","contentWorkspace:{version:1,resources:{resolve:async function(r){return r.href==='chart.png'?{url:'"+prefix+"pic/chart.png'}:null;}},"));
  res.writeHead(200,{...headers,'content-type':types[path.extname(name)]||'application/octet-stream'}).end(body);
 }catch{if(!res.headersSent)res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),page=await browser.newPage({viewport:{width:1500,height:1600}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // The print frame is given a print() that only says it was reached, since a browser's own print dialog stops the page (Firefox's headless one never returns).
  await page.addInitScript(()=>{window.__printCalled=false;new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('iframe.ed-print-frame'))node.contentWindow.print=()=>{window.__printCalled=true;};}).observe(document,{childList:true,subtree:true});});
  await page.addInitScript(()=>{window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push({directive:e.effectiveDirective,blocked:e.blockedURI,file:(e.sourceFile||'').split('/').slice(-2).join('/'),line:e.lineNumber,during:window.__during}),true);});
  const during=name=>page.evaluate(name=>{window.__during=name;},name),root='#document',run=name=>page.evaluate(name=>pudlCommands.run(name,null,document.querySelector('#document')),name);
  const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const rich=async()=>{await run('view-visual');await page.waitForFunction(()=>document.querySelector('#document .ProseMirror').getAttribute('aria-busy')!=='true');};
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html${NONCE?'?nonce='+NONCE:''}`);
   await during('open');await page.waitForFunction(()=>{const p=document.querySelector('#document .ProseMirror');return p&&p.textContent.includes('Session notes')&&p.textContent.includes('Siti');});
   // The host's picture is drawn: its own image element has loaded and has a size.
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('#document .ProseMirror img[src]')).some(i=>i.complete&&i.naturalWidth>0));
   await during('typing');await rich();await page.locator('#document .ProseMirror p').filter({hasText:'A paragraph'}).click();await frames();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.type(' More words typed.');
   await during('bold');await page.keyboard.press('Shift+ControlOrMeta+ArrowLeft');await run('bold');
   await during('Markdown view');await run('view-text');await page.locator('#document .cm-content').click();await page.keyboard.type('x');
   await during('rich view');await rich();
   for(const name of ['Paragraph Style','Other','Table','Box']){await during('menu '+name);const menu=page.locator('#document button.menu-btn').filter({hasText:name}).first();await menu.click();await page.keyboard.press('Escape');}
   for(const [command,title] of [['properties','Properties'],['page-setup','Page Setup']]){await during('dialog '+title);if(command==='page-setup'){await run('document-layout');await page.waitForFunction(()=>!!document.querySelector('#document .doc-page, #document [data-page]')||true);await frames();}
    page.evaluate(command=>pudlCommands.run(command,null,document.querySelector('#document')),command).catch(()=>{});const dialog=page.locator('dialog[open]').first();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});}
   await during('save');await page.evaluate(()=>{fixture.writes.length=0;return pudlCommands.run('save',null,document.querySelector('#document'));});await page.waitForFunction(()=>fixture.writes.length>0);
   // Print prepares the pages, decoding each picture, and then asks the browser to print. Firefox's headless print does not return, so the command is not awaited: the frame that is printed appears once the preparation is done.
   await during('print');page.evaluate(()=>pudlCommands.run('print-document',null,document.querySelector('#document'))).catch(()=>{});
   try{await page.waitForFunction(()=>window.__printCalled,null,{timeout:8000});}catch{failures.push(`${engine}: Print did not get as far as asking the browser to print`);}
   await during('end');
   // Every glyph that Docs drew has its picture, set with the style object (a style attribute is what a policy without 'unsafe-inline' blocks).
   const glyphs=await page.evaluate(()=>({all:document.querySelectorAll('[data-glyph]').length,bare:Array.from(document.querySelectorAll('[data-glyph]')).filter(g=>g.style.getPropertyValue('--glyph')==='').length}));
   if(glyphs.bare)failures.push(`${engine}: ${glyphs.bare} of ${glyphs.all} glyphs have no picture`);
   const violations=await page.evaluate(()=>window.__violations);
   for(const v of violations)failures.push(`${engine}: ${v.directive} blocked ${v.blocked} (${v.file||'no file'}${v.line?':'+v.line:''}) during ${v.during}`);
   if(errors.length)failures.push(`${engine}: page errors ${errors.join(' | ')}`);
  }catch(error){failures.push(`${engine}: ${String(error.message).split('\n')[0]} (during ${await page.evaluate(()=>window.__during).catch(()=>'?')})`);}finally{await browser.close();}
 }}finally{server.close();}
 if(failures.length){const seen=[...new Set(failures)];console.error(seen.slice(0,30).join('\n')+(seen.length>30?`\n... and ${seen.length-30} more`:''));process.exitCode=1;}else console.log('Docs ran under the strict policy with no violation in every browser.');
})().catch(error=>{console.error(error);process.exitCode=1;});
