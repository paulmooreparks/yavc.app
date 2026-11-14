// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Laying a document out in pages never changes it (GK's checks for Paul's report of 14 November, docs-content-preservation in the gk
// repository). A synthetic document with a host info frame, a host note with a title, the built-in info box and a long table, each
// broken across pages in the Document view, and a host include block that flows. The test proves:
//  1. Layout, view and caret changes (settling, a resize, every view, Split's caret going both ways) leave the text and the dirty
//     state as they were and send no changed() to the host.
//  2. Typing on a continuation page, inside a broken box and inside a broken table, changes that place in the source and nothing else,
//     and Undo takes it back to the same text.
//  3. A repeated title or table header makes no extra review mark, and a copy of a selection across a gap has each paragraph once.
//  4. take(), Save and opening the file again give one of each shortcode, and neither the saved Markdown, the html put on the
//     clipboard nor the page prepared for printing has a piece, cap, cover or gap in it.
//   node scripts/test-pagination-preserves.cjs <package folder> [chromium firefox webkit]
// Docs has no html export of its own, so the html checked is what it puts on the clipboard and the page it prints. It needs the host-flow
// fixture of decision 169 (scripts/fixtures/host-flow.js).
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/independent/content-release/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const w=n=>Array.from({length:n},(_,i)=>'word'+(i%17)).join(' ');
const paras=(tag,n,mark)=>Array.from({length:n},(_,i)=>tag+' paragraph '+(i+1)+'. '+w(70)+(mark&&mark[i+1]?' '+mark[i+1]:'')).join('\n\n');
// Two review marks, one in the note and one in a table row, each once in the source.
const source='# Preservation\n\nIntro words.\n\n{{gkinfo}}\n'+paras('Info',24)+'\n{{/gkinfo}}\n\n{{gknote:Mind the gap}}\n'+paras('Note',24,{10:'{>>Tester: a comment<<}'})+'\n{{/gknote}}\n\n{{info}}\n'+paras('Box',24)+'\n{{/info}}\n\n'+
    '| ID | Requirement |\n| --- | --- |\n'+Array.from({length:60},(_,i)=>'| T-'+(i+1)+' | Row '+(i+1)+' '+w(40)+(i===39?' {++added++}':'')+' |').join('\n')+'\n\n{{gkinclude}}\n\nClosing words.\n';
// Known failures, each in docs/backlog.md. The check still runs and says what it found, but does not fail the test; the pull request
// that fixes one sets it to false here, and a known failure that starts to pass says so, so that it is turned on.
const KNOWN={
    changedWithoutEdit:'docs/backlog.md, "Docs tells the host of a change when only the view or the Split caret moved"',
    printHostShortcodes:'docs/backlog.md, "A document with a host shortcode does not print, and nothing says why"',
};
const PAGE_MARKUP=/data-sc-piece|doc-gap|doc-page-gap|gap-cap|gap-cover|doc-page-break/;
function settle({frames,limit}){
    return new Promise(done=>{const root=document.querySelector('#document'),start=performance.now();let last=null,same=0;
        (function tick(){const pm=root.querySelector('.ProseMirror'),top=pm.getBoundingClientRect().top;
            const key=JSON.stringify([...pm.querySelectorAll('.doc-page-gap')].map(g=>{const r=g.getBoundingClientRect();return [Math.round(r.top-top),Math.round(r.height)];}));
            same=key===last?same+1:0;last=key;if(same>=frames)return done(true);if(performance.now()-start>limit)return done(false);requestAnimationFrame(tick);})();});
}
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
    const addon=(await fs.readFile(path.join(__dirname,'fixtures','host-flow.js'),'utf8'))+'\n;fixture.records.get("memory:document.docs.md").text='+JSON.stringify(source)+';fixture.hostFlow.source='+JSON.stringify(source)+';';
    const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith(prefix))return res.writeHead(404).end();const name=decodeURIComponent(u.pathname.slice(prefix.length));
        if(!allowed.has(name))return res.writeHead(404).end();let body=await fs.readFile(path.join(artifact,name));if(name==='workspace-lab/host.js')body=Buffer.from(body+'\n'+addon);
        res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.end(body);}catch(e){if(!res.headersSent)res.writeHead(500).end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true}),p=await browser.newPage({viewport:{width:1500,height:1000}});p.setDefaultTimeout(60000);
        const errors=[];p.on('pageerror',e=>errors.push(e.message));let phase='start';const fail=m=>failures.push(engine+' '+phase+': '+m);
        const known=(key,failed,message)=>{if(KNOWN[key]){console.log(engine+' '+phase+': '+(failed?'known failure, not counted ('+KNOWN[key]+'): '+message:'a known failure passed; turn it on ('+KNOWN[key]+')'));}else if(failed)fail(message);};
        const doc=()=>p.evaluate(()=>pudlActions.run('yavc.docs/document@1',{},{grant:'all'}));
        const run=c=>p.evaluate(c=>pudlCommands.run(c,null,document.querySelector('#document')),c);
        const view=mode=>p.evaluate(mode=>pudlActions.run('yavc.docs/view@1',{mode},{grant:'all'}),mode);
        const settled=async()=>{if(!(await p.evaluate(settle,{frames:60,limit:60000})))fail('the layout did not settle');};
        const changes=()=>p.evaluate(()=>fixture.changes.document||0);
        // A click on a paragraph of the page found by its first words: scrolled to the middle of the view first, since the page is long.
        const clickOn=async words=>{const at=await p.evaluate(words=>{const el=[...document.querySelectorAll('#document .ProseMirror p')].find(x=>!x.closest('.doc-page-gap')&&x.textContent.trim().startsWith(words));el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.left+10,y:r.top+r.height/2};},words);await p.mouse.click(at.x,at.y);};
        // The text, waited for: an edit reaches the source within a few frames, so the condition is the text itself.
        const textBecomes=(want,ms=10000)=>p.evaluate(async({want,ms})=>{const limit=Date.now()+ms;let t;for(;;){t=(await pudlActions.run('yavc.docs/document@1',{},{grant:'all'})).text;if(t===want||Date.now()>limit)return t;await new Promise(r=>setTimeout(r,50));}},{want,ms});
        try{
            await p.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);await p.locator('#document .ProseMirror').waitFor();
            await view('document');await p.waitForFunction(()=>document.querySelector('#document [data-host-shortcode="gknote"][data-host-drawn]')&&document.querySelector('#document .doc-page-gap'));await settled();
            const base=await doc();assert.equal(base.text,source,engine+': the document opened as written');
            const changed0=await changes();

            phase='1. layout, views and caret';
            // Each step's changed() calls, counted, so that a failure says which step sent them.
            const sent={};const step=async(name,fn)=>{const before=await changes();await fn();sent[name]=await changes()-before;};
            await step('resize',async()=>{await p.setViewportSize({width:1200,height:1000});await settled();await p.setViewportSize({width:1500,height:1000});await settled();});
            for(const mode of ['split','visual','preview','text','document'])await step('view '+mode,()=>view(mode));
            await step('view split again',()=>view('split'));await p.locator('#document .cm-content').waitFor();
            await step('Split caret, text then page',async()=>{await p.locator('#document .cm-line').filter({hasText:'Intro words.'}).click();await p.locator('#document .ProseMirror p').filter({hasText:/^Intro words\./}).click();});
            await step('back to Document and settled',async()=>{await view('document');await settled();});
            const after1=await doc();
            if(after1.text!==source)fail('the text changed');if(after1.modified)fail('the document is marked changed');
            {const n=await changes()-changed0;known('changedWithoutEdit',n!==0,'changed() was sent to the host '+n+' times: '+Object.entries(sent).filter(([,c])=>c).map(([k,c])=>k+' '+c).join(', '));}

            phase='2. typing on a continuation page';
            let expected=source;
            const places=[['the host info frame','[data-host-shortcode="gkinfo"]',/^Info paragraph \d+\./],['the host note','[data-host-shortcode="gknote"]',/^Note paragraph \d+\./],['the built-in box','.sc-notice',/^Box paragraph \d+\./],['the table','table',/^Row \d+ /]];
            for(const [label,container,pattern] of places){
                // The first paragraph or cell that begins after a gap in that container, and its words as the source has them.
                const target=await p.evaluate(({container,pattern})=>{const re=new RegExp(pattern.source);const boxes=[...document.querySelectorAll('#document .ProseMirror '+container)].filter(b=>b.querySelector('.doc-page-gap'));
                    for(const box of boxes){const gap=box.querySelector('.doc-page-gap');const el=[...box.querySelectorAll('p, td')].find(x=>re.test(x.textContent)&&!x.closest('.doc-page-gap')&&!x.closest('.doc-gap-cap')&&(gap.compareDocumentPosition(x)&Node.DOCUMENT_POSITION_FOLLOWING)&&x.isContentEditable);
                        if(el)return el.textContent.trim().slice(0,24);}return null;},{container,pattern:{source:pattern.source}});
                if(!target){fail('no editable paragraph after a gap in '+label);continue;}
                const at=expected.indexOf(target);if(at<0){fail('the source has no "'+target+'" for '+label);continue;}
                const end=expected.slice(at).search(/ \||\n/)+at,mark=' ZQ'+places.findIndex(x=>x[0]===label);
                // The page redraws its own elements, so the target is found again by its words each time it is needed.
                const find='const el=[...document.querySelectorAll("#document .ProseMirror p, #document .ProseMirror td")].find(x=>!x.closest(".doc-page-gap")&&!x.closest(".doc-gap-cap")&&x.textContent.trim().startsWith(t));';
                const point=await p.evaluate(new Function('t',find+'el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return {x:r.left+20,y:r.top+8};'),target);
                await p.mouse.click(point.x,point.y);
                await p.evaluate(new Function('t',find+'const r=document.createRange();r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);'),target);
                // The page takes the browser's selection a frame or so late, so this waits until its own selection is at the end (or 3 s pass).
                const caret=await p.evaluate(async end=>{const limit=Date.now()+3000;let s;for(;;){s=await window.yavcMdEditor._page.sourceSelection();if(s&&s.from===end&&s.to===end||Date.now()>limit)return s&&s.from;await new Promise(r=>setTimeout(r,30));}},end);
                if(caret!==end){fail('the caret at the end of "'+target+'" in '+label+' maps to source offset '+caret+', not '+end);continue;}
                await p.keyboard.type(mark);expected=expected.slice(0,end)+mark+expected.slice(end);
                const got=await textBecomes(expected);if(got!==expected){const i=[...got].findIndex((c,k)=>c!==expected[k]);fail('typing in '+label+' changed the source wrongly at offset '+i+': '+JSON.stringify(got.slice(Math.max(0,i-30),i+40)));expected=got;}
            }
            for(let i=0;i<places.length&&(await doc()).text!==source;i++){await run('undo');await textBecomes(source,3000);}
            const undone=await doc();if(undone.text!==source)fail('Undo did not give back the text: '+JSON.stringify(undone.text.length)+' characters against '+source.length);

            phase='3. review marks and copying across a gap';
            await settled();
            const review=await p.evaluate(()=>pudlActions.run('yavc.docs/review@1',{},{grant:'all'}));
            if(review.marks.length!==2)fail('the review list has '+review.marks.length+' marks, not 2');
            const drawn=await p.evaluate(()=>({marks:document.querySelectorAll('#document .ProseMirror .pm-critic').length,inGaps:document.querySelectorAll('#document .ProseMirror .doc-page-gap .pm-critic, #document .ProseMirror .doc-gap-cap .pm-critic').length}));
            if(drawn.inGaps)fail(drawn.inGaps+' review marks are drawn again in a gap, a cap or a repeated header');
            if(drawn.marks!==2)fail(drawn.marks+' review marks are drawn on the page, not 2');
            // A selection from the paragraph before the note's first gap to the one after it, copied.
            const span=await p.evaluate(()=>{const note=document.querySelector('#document .ProseMirror [data-host-shortcode="gknote"]'),gap=note.querySelector('.doc-page-gap');
                const ps=[...note.querySelectorAll('p')].filter(x=>/^Note paragraph \d+\./.test(x.textContent)&&!x.closest('.doc-page-gap')&&!x.closest('.doc-gap-cap'));
                const before=ps.filter(x=>gap.compareDocumentPosition(x)&Node.DOCUMENT_POSITION_PRECEDING).pop(),after=ps.find(x=>gap.compareDocumentPosition(x)&Node.DOCUMENT_POSITION_FOLLOWING);
                const r=document.createRange();r.setStart(before.firstChild,0);r.setEnd(after.lastChild,after.lastChild.length);before.closest('.ProseMirror').focus();getSelection().removeAllRanges();getSelection().addRange(r);
                return [Number(before.textContent.match(/\d+/)[0]),Number(after.textContent.match(/\d+/)[0])];});
            await p.evaluate(async()=>{const limit=Date.now()+3000;for(;;){const s=await window.yavcMdEditor._page.sourceSelection();if(s&&s.to>s.from||Date.now()>limit)return;await new Promise(r=>setTimeout(r,30));}});
            const copied=await p.evaluate(()=>{const c=window.yavcMdEditor._page.clipboardSelection();return c&&{text:c.text,html:c.html};});
            if(!copied)fail('the page gave nothing to copy');
            else{
                for(let n=span[0];n<=span[1];n++){const count=copied.text.split('Note paragraph '+n+'. ').length-1;if(count!==1)fail('Note paragraph '+n+' is in the copy '+count+' times');}
                if(/Mind the gap/.test(copied.text))fail('the copy holds the repeated title');
                if(PAGE_MARKUP.test(copied.html))fail('the html put on the clipboard holds page markup: '+copied.html.match(PAGE_MARKUP)[0]);
            }
            // The html of the whole document on the clipboard.
            await clickOn('Intro words.');await p.keyboard.press('ControlOrMeta+a');
            const all=await p.evaluate(()=>{const c=window.yavcMdEditor._page.clipboardSelection();return c&&c.html;});
            if(all&&PAGE_MARKUP.test(all))fail('the html of the whole document on the clipboard holds page markup: '+all.match(PAGE_MARKUP)[0]);
            // The title as text a reader sees in that html, not in the attributes that keep the shortcode's source.
            if(all){const shown=await p.evaluate(html=>{const d=new DOMParser().parseFromString(html,'text/html');return d.body.textContent.split('Mind the gap').length-1;},all);if(shown>1)fail('the title is in the text of the whole document\'s html '+shown+' times');}
            // Back to a caret, so that the next typing does not replace the selection.
            await p.keyboard.press('ControlOrMeta+Home');

            phase='4. take(), Save, opening again, and printing';
            // The caret put at the end of the last paragraph, and the page's own selection waited for there, so that nothing selected before is typed over.
            await clickOn('Closing words.');
            const closing=source.indexOf('Closing words.')+'Closing words.'.length;
            await p.evaluate(()=>{const el=[...document.querySelectorAll('#document .ProseMirror p')].find(x=>x.textContent.trim().startsWith('Closing words.'));const r=document.createRange();r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});
            const at=await p.evaluate(async end=>{const limit=Date.now()+3000;let s;for(;;){s=await window.yavcMdEditor._page.sourceSelection();if(s&&s.from===end&&s.to===end||Date.now()>limit)return s;await new Promise(r=>setTimeout(r,30));}},closing);
            if(!at||at.from!==closing||at.to!==closing)fail('the caret at the end of "Closing words." maps to '+JSON.stringify(at)+', not '+closing);
            await p.keyboard.type(' Saved.');
            const saved=source.replace('Closing words.','Closing words. Saved.');
            {const got=await textBecomes(saved);if(got!==saved)fail('the last edit did not reach the source; the text is '+got.length+' characters: '+JSON.stringify(got.slice(0,80))+' … '+JSON.stringify(got.slice(-60)));}
            const draft=await p.evaluate(()=>{const s=fixture.takes.document(),t=s&&s.tabs&&s.tabs.find(x=>typeof x.draft==='string');return t?t.draft:null;});
            if(draft!==saved)fail('take() gave '+(draft==null?'no draft':'a different text'+(PAGE_MARKUP.test(draft)?' with page markup':'')));
            await p.evaluate(()=>pudlActions.run('yavc.docs/save@1',{},{grant:'all'}));
            const stored=await p.evaluate(()=>fixture.records.get('memory:document.docs.md').text);
            if(stored!==saved)fail('Save wrote a different text'+(PAGE_MARKUP.test(stored)?' with page markup':''));
            for(const [open,close] of [['{{gkinfo}}','{{/gkinfo}}'],['{{gknote:Mind the gap}}','{{/gknote}}'],['{{info}}','{{/info}}']]){
                if(stored.split(open).length!==2||stored.split(close).length!==2)fail('the saved text does not have one '+open+' … '+close);}
            // Opened again from the host: the tab closed and the file read back from the host's store (a reload would start the store afresh).
            await p.evaluate(()=>pudlActions.run('yavc.docs/close@1',{},{grant:'all'}));
            await p.evaluate(()=>pudlActions.run('yavc.docs/open-file@1',{path:'memory:document.docs.md'},{grant:'all'}));
            const reopened=await doc();if(reopened.text!==saved)fail('opening the saved file again gave a different text');
            await view('document');await settled();
            // The page prepared for printing: its frame's html, read before the browser's print, which is replaced.
            await p.evaluate(()=>{window.__printed=null;new MutationObserver(rs=>{for(const r of rs)for(const n of r.addedNodes)if(n.nodeType===1&&n.matches('iframe.ed-print-frame'))n.contentWindow.print=function(){window.__printed=n.contentDocument.body.innerHTML;};}).observe(document,{childList:true,subtree:true});});
            p.evaluate(()=>pudlCommands.run('print-document',null,document.querySelector('#document')).catch(e=>{window.__printError=e.message;})).catch(()=>{});
            const printed=await p.waitForFunction(()=>window.__printed||window.__printError,null,{timeout:30000}).then(()=>p.evaluate(()=>window.__printed)).catch(()=>null);
            known('printHostShortcodes',!printed,'printing did not get as far as the browser\'s print: '+(await p.evaluate(()=>window.__printError||'status line: '+[...document.querySelectorAll('#document [data-role=message], .toast-region, [role=status]')].map(n=>n.textContent.trim()).filter(Boolean).join(' | ').slice(0,300))));
            if(printed){if(PAGE_MARKUP.test(printed))fail('the printed page holds editing-page markup: '+printed.match(PAGE_MARKUP)[0]);
                for(const n of [1,12,24]){const count=printed.split('Note paragraph '+n+'. ').length-1;if(count!==1)fail('Note paragraph '+n+' is printed '+count+' times');}}
            if(errors.length)fail('page errors '+errors.join(' | '));
            console.log(engine+': checks done');
        }catch(error){failures.push(engine+' '+phase+': '+String(error.message).split('\n')[0]);}finally{await browser.close();}
    }}finally{server.close();}
    assert.deepEqual(failures,[],failures.join('\n'));
    console.log('Layout in pages left the document as written: no change from layout, views or the caret, edits on continuation pages in place, review marks and copies once each, and one shortcode with no page markup in what is saved, copied or printed.');
})().catch(error=>{console.error(error.message||error);process.exitCode=1;});
