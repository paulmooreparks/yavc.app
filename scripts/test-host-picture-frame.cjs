// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A host that frames a picture at its natural width (an inline-block as wide as the picture, capped at 100%) must not widen the
// page: in Visual, Document and Preview a picture given 80% stays 80% of the column and the paragraphs wrap at the pane
// (DESIGN.md, decision 15). The picture is generated here and every word is invented.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/independent/content-release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
function png(w,h){
 const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(t,d)=>{const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]),c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
 const row=Buffer.alloc(1+w*3);for(let x=0;x<w;x++){row[1+x*3]=(x>>4)&255;row[2+x*3]=120;row[3+x*3]=200;}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.concat(Array(h).fill(row)))),chunk('IEND',Buffer.alloc(0))]);
}
const picture=png(3000,200);
const addon=`(function(){
 var words='Invented sentence words that run on long enough to need several lines on any page width at all. ',long=words+words+words,pic='${prefix}wide-picture.png';
 var source='# Picture page\\n\\n'+long+'\\n\\n{{figure:'+pic+' alt="Invented wide picture" width=80%}}\\n\\n'+long+'\\n';
 fixture.records.get('memory:source.md').text=source;fixture.records.get('memory:document.docs.md').text=source;window.pictureSource=source;
 function frame(img){if(img.closest('.host-picture-frame'))return;function go(){var f=document.createElement('span');f.className='host-picture-frame';f.style.display='inline-block';f.style.maxWidth='100%';f.style.width=img.naturalWidth+'px';img.parentNode.insertBefore(f,img);f.appendChild(img);}if(img.complete&&img.naturalWidth)go();else img.addEventListener('load',go,{once:true});}
 new MutationObserver(function(){document.querySelectorAll('#document img').forEach(frame);}).observe(document.documentElement,{childList:true,subtree:true});
})();`;
(async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));
  if(name==='wide-picture.png'){res.setHeader('Content-Type','image/png');return res.end(picture);}
  if(!allowed.has(name))return res.writeHead(404).end();let body=await fs.readFile(path.join(artifact,name));if(name==='workspace-lab/host.js')body=Buffer.from(body+'\n'+addon);res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(body);}catch(e){res.writeHead(500).end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  const action=(name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
  try{await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`,{waitUntil:'domcontentloaded'});await p.locator('#document .ProseMirror').waitFor();
   for(const mode of ['visual','document','preview']){
    await action('view',{mode});await p.waitForFunction(()=>{const f=[...document.querySelectorAll('#document .host-picture-frame img')];return f.length===1&&f.every(i=>i.naturalWidth===3000);});
    const m=await p.evaluate(()=>{const scroll=document.querySelector('#document .ed-scroll'),page=scroll.querySelector('.doc-page'),cs=getComputedStyle(page),column=page.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
     return {scrollSW:scroll.scrollWidth,scrollCW:scroll.clientWidth,column,pictures:[...page.querySelectorAll('.host-picture-frame img')].map(i=>i.getBoundingClientRect().width/((page.getBoundingClientRect().width/page.offsetWidth)||1))};});
    console.log(engine+' '+mode+' '+JSON.stringify(m));
    assert.ok(m.scrollSW<=m.scrollCW+1,engine+' '+mode+': the page must not scroll sideways');
    for(const w of m.pictures)assert.ok(Math.abs(w-m.column*0.8)<=Math.max(4,m.column*0.02),engine+' '+mode+': a picture given 80% is 80% of the column, not '+w+' of '+m.column);
   }
   assert.equal((await action('document')).text,await p.evaluate(()=>window.pictureSource),'drawing the pictures leaves the document unchanged');
   assert.deepEqual(errors,[]);console.log(engine+': framed pictures keep their stated width in Visual, Document and Preview');
  }finally{await browser.close();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
