// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// In a host that keeps one editor across views, Document's sheet column widths must not stay on a table when Visual takes over, and Visual
// lays a table out by its content as a wiki does (DESIGN.md, decision 212): the prose column takes the free width, short headings and status
// labels stay on one line. All text is invented.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/independent/content-release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const prose='The practice team needs to review the invented delivery schedule and confirm that each ordinary sentence remains readable in a narrow window. This description has more text than the other cells.';
const source='# Invented review\n\nAn invented paragraph before the table.\n\n| No | Reporter | Description | Responsible | Due Date | Status |\n| --- | --- | --- | --- | --- | --- |\n'+
 '| 1 | Alex Example | '+prose+' | Morgan Sample | 30 Nov 2026 | {{status:green Ready}} |\n| 2 | Casey Example | Confirm the sample checklist. | Robin Sample | 02 Dec 2026 | {{status:yellow In Progress}} |\n';
const addon='(function(){var s='+JSON.stringify(source)+';fixture.records.get("memory:source.md").text=s;fixture.records.get("memory:document.docs.md").text=s;window.tableSource=s;})();';
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));
  if(!allowed.has(name))return res.writeHead(404).end();let body=await fs.readFile(path.join(artifact,name));if(name==='workspace-lab/host.js')body=Buffer.from(body+'\n'+addon);res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(body);}catch(e){res.writeHead(500).end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  const action=(name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
  try{await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`,{waitUntil:'domcontentloaded'});await p.locator('#document .ProseMirror').waitFor();
   await action('view',{mode:'document'});await p.locator('#document .doc-paginated table > colgroup[data-doc-columns]').waitFor({state:'attached'});
   await action('view',{mode:'visual'});await p.waitForFunction(()=>{const t=document.querySelector('#document .ProseMirror table');return t&&!t.closest('.doc-paginated');});await p.waitForTimeout(300);
   const m=await p.evaluate(()=>{const t=document.querySelector('#document .ProseMirror table'),lines=n=>{const r=document.createRange();r.selectNodeContents(n);return new Set([...r.getClientRects()].filter(x=>x.width>0).map(x=>Math.round(x.top))).size;};
    return {sheetColumns:t.querySelectorAll(':scope > colgroup[data-doc-columns]').length,heads:[...t.rows[0].cells].map(c=>({text:c.textContent.trim(),width:Math.round(c.getBoundingClientRect().width),lines:lines(c)})),badges:[...t.querySelectorAll('.badge')].map(lines)};});
   console.log(engine+' '+JSON.stringify(m));
   assert.equal(m.sheetColumns,0,engine+': Document\'s sheet columns are gone from the table in Visual');
   assert.equal(m.heads.reduce((a,h)=>h.width>a.width?h:a).text,'Description',engine+': the prose column takes the free width');
   for(const h of m.heads)assert.equal(h.lines,1,engine+': the heading "'+h.text+'" stays on one line');
   assert.deepEqual(m.badges,[1,1],engine+': each status label stays on one line');
   await action('view',{mode:'document'});await p.locator('#document .doc-paginated table > colgroup[data-doc-columns]').waitFor({state:'attached'});
   assert.equal((await action('document')).text,await p.evaluate(()=>window.tableSource),'switching views leaves the document unchanged');
   assert.deepEqual(errors,[]);console.log(engine+': Visual lays the table out by its content after Document');
  }finally{await browser.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
