// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Docs keeps every code point a person types, in the Markdown view and in the rich view, whatever path the text took in: typed, pasted,
// formatted, or carried across a view switch. The corpus has each letter of Mandarin pinyin tone marks and Tamil romanization twice, once
// precomposed (NFC) and once as a base letter with combining marks (NFD), inside English text with Malay and Indonesian names. A change from
// one form to the other fails the test even where the text looks the same. Usage: node scripts/test-docs-unicode.cjs <package folder> [browsers]
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/different-host/assets/release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
// Precomposed letters by code point, so no editor or tool can normalise this file's own text.
const letters=[0x101,0xe1,0x1ce,0xe0,0x113,0xe9,0x11b,0xe8,0x12b,0xed,0x1d0,0xec,0x14d,0xf3,0x1d2,0xf2,0x16b,0xfa,0x1d4,0xf9,0xfc,0x1d6,0x1d8,0x1da,0x1dc,0x1e45,0xf1,0x1e6d,0x1e47,0x1e49,0x1e5f,0x1e37,0x1e3b].map(c=>String.fromCodePoint(c));
const nfc=s=>s.normalize('NFC'),nfd=s=>s.normalize('NFD');
const tokensNfc=letters.map(l=>'a'+nfc(l)+'z'),tokensNfd=letters.map(l=>'a'+nfd(l)+'z');
const english='Session with Siti Nurhaliza binti Ahmad and Wayan Suryadi about nǚ and Zhūngguó at Chennai (Tamil: ceṉṉai, tamiḻ).';
const english2=english.normalize('NFC')+' '+english.normalize('NFD');
const line='Notes '+tokensNfc.join(' ')+' '+tokensNfd.join(' ')+' '+english2;
const cps=s=>Array.from(s).map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'));
function firstDifference(want,got){const a=Array.from(want),b=Array.from(got);for(let i=0;i<Math.max(a.length,b.length);i++){if(a[i]!==b[i])return `at code point ${i}: wanted ${cps(a.slice(i,i+4).join('')).join(' ')} but found ${cps(b.slice(i,i+4).join('')).join(' ')} (near "${a.slice(Math.max(0,i-6),i+3).join('')}")`;}return null;}
(async()=>{
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();res.writeHead(200,{'content-type':types[path.extname(u.pathname)]||'application/octet-stream'}).end(await fs.readFile(path.join(artifact,decodeURIComponent(u.pathname.slice(prefix.length)))));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];let checked=0;
 try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
  const browser=await pw[engine].launch({headless:true});
  try{for(const view of ['text','visual'])for(const route of ['typing','paste','format','switch']){
   const label=`${engine} ${view==='text'?'Markdown view':'rich view'}, ${route}`,page=await browser.newPage({viewport:{width:1500,height:1600}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html`);await page.locator('#document .ProseMirror').waitFor();
    const root=()=>document.querySelector('#document');
    const choose=name=>page.evaluate(name=>pudlCommands.run(name,null,document.querySelector('#document')),name==='text'?'view-text':'view-visual');
    const surface=name=>name==='text'?page.locator('#document .cm-content'):page.locator('#document .ProseMirror');
    // The rich surface ignores typing while it is busy, so wait on what the page shows.
    const ready=async name=>{if(name==='visual')await page.waitForFunction(()=>{const p=document.querySelector('#document .ProseMirror');return p&&p.getAttribute('aria-busy')!=='true';});else await page.locator('#document .cm-content').waitFor();};
    await choose(view);await ready(view);
    // A person pastes what they copied: put the notes on the clipboard with the browser's own copy from a scratch field, then paste with the keyboard.
    if(route==='paste'){await page.evaluate(text=>{const field=document.createElement('textarea');field.id='scratch-copy';field.value=text;document.body.append(field);field.focus();field.select();},line);await page.keyboard.press('ControlOrMeta+c');await page.evaluate(()=>document.getElementById('scratch-copy').remove());}
    if(view==='text'){await surface('text').click();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.press('Enter');await page.keyboard.press('Enter');}
    else{// The page draws its diagram a moment after it opens, and a caret placed before that is lost, so wait for what the page shows.
    await page.waitForFunction(()=>document.querySelector('#document .ProseMirror').textContent.includes('Independent host diagram'));await page.locator('#document .ProseMirror p').filter({hasText:'Editable words.'}).click();await page.waitForFunction(()=>{const node=getSelection().anchorNode,paragraph=node&&(node.nodeType===1?node:node.parentElement).closest('#document .ProseMirror p');return !!paragraph&&paragraph.textContent.includes('Editable words.');});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.keyboard.press('ControlOrMeta+End');await page.waitForFunction(()=>{const node=getSelection().anchorNode;return !!node&&getSelection().anchorOffset===node.length;});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.keyboard.press('Enter');if(process.env.DEBUG_UNICODE)console.log(label,await page.evaluate(()=>Array.from(document.querySelector('#document .ProseMirror').children).map(c=>c.tagName+':'+JSON.stringify(c.textContent.slice(0,12))).join(' | ')));}
    if(route==='paste')await page.keyboard.press('ControlOrMeta+v');
    else await page.keyboard.type(line);
    const wanted={};
    if(route==='format'){
     // Bold one precomposed word and italicise one decomposed word, selecting each as a person would with the pointer: by range.
     const bold=tokensNfc[21],italic=tokensNfd[21];
     for(const [token,command] of [[bold,'bold'],[italic,'italic']]){
      await page.evaluate(({token,view})=>{
       // The word may sit across several text nodes once the editor has marked up the line, so map its place in the whole text back to nodes.
       const walker=document.createTreeWalker(document.querySelector(view==='text'?'#document .cm-content':'#document .ProseMirror'),NodeFilter.SHOW_TEXT),nodes=[];let all='',node;
       while((node=walker.nextNode())){nodes.push({node,start:all.length});all+=node.data;}
       const at=all.indexOf(' '+token+' ')+1;if(at<1)throw new Error('The word is not on the page: '+token+' (the surface holds '+all.length+' characters)');
       const place=offset=>{for(let i=nodes.length-1;i>=0;i--)if(nodes[i].start<=offset)return [nodes[i].node,offset-nodes[i].start];};
       const from=place(at),to=place(at+token.length),range=document.createRange();range.setStart(from[0],from[1]);range.setEnd(to[0],to[1]);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      },{token,view});
      // The editor takes a selection the page made on its next frames.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.evaluate(command=>pudlCommands.run(command,null,document.querySelector('#document')),command);
     }
     wanted.bold=bold;wanted.italic=italic;
    }
    if(route==='switch'){const other=view==='text'?'visual':'text';await choose(other);await ready(other);await choose(view);await ready(view);}
    // Save, and read what the host was given.
    await page.waitForFunction(()=>!document.querySelector('#document .ProseMirror[aria-busy="true"]'));
    await page.evaluate(()=>{fixture.writes.length=0;return pudlCommands.run('save',null,document.querySelector('#document'));});
    await page.waitForFunction(()=>fixture.writes.length>0);
    const saved=await page.evaluate(()=>fixture.records.get('memory:document.docs.md').text);
    const found=saved.split('\n').find(l=>l.startsWith('Notes '));
    if(found===undefined)throw new Error('The saved Markdown has no line of the notes; it is '+JSON.stringify(saved));
    let plain=found;
    if(route==='format'){
     const wrapped=found.includes('**'+wanted.bold+'**'),slanted=found.includes('*'+wanted.italic+'*')||found.includes('_'+wanted.italic+'_');
     if(!wrapped)failures.push(`${label}: the bold mark did not apply to the precomposed word ${wanted.bold}; saved line near it: ${JSON.stringify(found.slice(found.indexOf(wanted.bold)-6,found.indexOf(wanted.bold)+wanted.bold.length+6))}`);
     if(!slanted)failures.push(`${label}: the italic mark did not apply to the decomposed word ${wanted.italic}; saved line near it: ${JSON.stringify(found.slice(found.indexOf(wanted.italic)-6,found.indexOf(wanted.italic)+wanted.italic.length+6))}`);
     plain=found.replace('**'+wanted.bold+'**',wanted.bold).replace('*'+wanted.italic+'*',wanted.italic).replace('_'+wanted.italic+'_',wanted.italic);
    }
    checked++;
    const difference=firstDifference(line,plain);if(difference)failures.push(`${label}: the saved Markdown differs ${difference}`);
    // Reopen: the other view draws the saved text again, and the text each view shows must hold the same code points.
    const other=view==='text'?'visual':'text';await choose(other);await ready(other);
    const shown=await page.evaluate(()=>{const holder=document.querySelector('#document .ProseMirror')||document.querySelector('#document .cm-content');const rich=document.querySelector('#document .ProseMirror');return (rich||holder).innerText;});
    const flat=(route==='format'?shown.replace(/\*\*/g,'').replace(/\*/g,''):shown).replace(/\s+/g,' ');const visibleLine=flat.split('Notes ').pop();
    const target=route==='format'?line:line;const visibleDifference=firstDifference(target.slice('Notes '.length),visibleLine.slice(0,target.length-'Notes '.length));
    if(visibleDifference)failures.push(`${label}: after the view switch the page shows different text ${visibleDifference}`);
    if(errors.length)failures.push(`${label}: page errors ${errors.join(' | ')}`);
   }catch(error){failures.push(`${label}: ${String(error.message).split('\n')[0]}`);}
   finally{await page.close();}
  }}finally{await browser.close();}
 }}finally{server.close();}
 console.log(`${checked} cases saved a line of ${Array.from(line).length} code points.`);
 if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Docs kept every code point in both views through typing, pasting, formatting and view switches.');
})().catch(error=>{console.error(error);process.exitCode=1;});
