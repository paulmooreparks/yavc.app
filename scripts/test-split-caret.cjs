// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Split keeps one place in the document (Paul's report in GK Companion, 2026-11-14; GK's acceptance "Split caret in either pane").
// In Docs' Split view, moving the caret in one pane, by a click or by keys, puts the other pane's caret at the same place in the
// source, and the pane in use keeps the keyboard. Nothing is edited by it. Both directions are checked.
//   node scripts/test-split-caret.cjs <package folder> [chromium firefox webkit]
// The page's place is read with the page view's sourceSelection(), which maps its selection to the source and changes nothing, and
// the text's with CodeMirror's selection. Each check waits for the two to agree, and fails with both places if they do not.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const artifact=path.resolve(process.argv[2]),prefix='/split/assets/',fixture=path.resolve(__dirname,'fixtures','portable-workspace');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const lines=['# Split sample',''];for(let i=1;i<=12;i++)lines.push('Paragraph '+i+' has *some* words and a [link](https://example.com/'+i+') in it.','');
const source=lines.join('\n');
(async()=>{
    const manifest=JSON.parse(await fs.readFile(path.join(artifact,'manifest.json'),'utf8')),allowed=new Set(manifest.files.map(f=>f.path));
    const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');const name=decodeURIComponent(u.pathname.slice(prefix.length));
        const own=name.startsWith('workspace-lab/'),file=own?path.join(fixture,name.slice('workspace-lab/'.length)):allowed.has(name)?path.join(artifact,name):null;
        if(!file||/\.\./.test(name))return res.writeHead(404).end();
        res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'}).end(await fs.readFile(file));}catch{if(!res.headersSent)res.writeHead(404).end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const failures=[];
    try{for(const engine of process.argv.slice(3).length?process.argv.slice(3):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true}),page=await browser.newPage({viewport:{width:1536,height:864}});page.setDefaultTimeout(20000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        try{
            await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=docs`);await page.locator('#document .ProseMirror').waitFor();
            await page.evaluate(text=>{fixture.records.set('memory:split.md',{text,revision:1,name:'Split.md'});return pudlActions.run('yavc.docs/open-file@1',{path:'memory:split.md'},{grant:'all'});},source);
            await page.evaluate(()=>pudlActions.run('yavc.docs/view@1',{mode:'split'},{grant:'all'}));
            await page.locator('#document .cm-content').waitFor();await page.locator('#document .ProseMirror p').filter({hasText:'Paragraph 12 '}).waitFor();
            // Both places, as source offsets and as the paragraph they are in, and which pane has the keyboard.
            const places=()=>page.evaluate(async()=>{
                const cm=CM.EditorView.findFromDOM(document.querySelector('#document .cm-editor')),doc=cm.state.doc,head=cm.state.selection.main.head;
                const paged=await window.yavcMdEditor._page.sourceSelection().catch(()=>null);
                const para=offset=>{if(offset==null)return null;const m=doc.lineAt(offset).text.match(/^Paragraph (\d+)|^# (.*)/);return m?(m[1]?'paragraph '+m[1]:'heading'):'line '+doc.lineAt(offset).number;};
                const a=document.activeElement;
                return {text:{offset:head,in:para(head)},page:{offset:paged?paged.from:null,in:para(paged?paged.from:null)},focus:a&&a.closest('.cm-editor')?'text':a&&a.closest('.ProseMirror')?'page':String(a&&a.tagName),source:doc.toString()};
            });
            // Waits until the two places are in the expected paragraph, as a condition with a limit; answers with the last places seen.
            const agree=async want=>{const limit=Date.now()+3000;let last;for(;;){last=await places();if(last.text.in===want&&last.page.in===want)return {ok:true,last};if(Date.now()>limit)return {ok:false,last};await page.waitForTimeout(50);}};
            const check=async(label,want,focus)=>{const r=await agree(want),l=r.last;
                if(!r.ok)failures.push(`${engine} ${label}: expected both panes in ${want}; the text's caret is in ${l.text.in} (offset ${l.text.offset}) and the page's in ${l.page.in} (offset ${l.page.offset})`);
                if(l.focus!==focus)failures.push(`${engine} ${label}: the keyboard should stay in the ${focus}, and is in the ${l.focus}`);
                if(l.source!==source)failures.push(`${engine} ${label}: the source changed`);};
            // Page to text: a click, then keys.
            await page.locator('#document .ProseMirror p').filter({hasText:'Paragraph 5 '}).click();await page.keyboard.press('End');
            await check('a click and End in the page',"paragraph 5",'page');
            // On the page a paragraph is one line here and there is no blank line between them, so one ArrowDown is the next paragraph.
            await page.keyboard.press('ArrowDown');
            await check('ArrowDown in the page','paragraph 6','page');
            // Text to page: a click, then keys.
            await page.locator('#document .cm-line').filter({hasText:'Paragraph 9 '}).click();
            await check('a click in the text','paragraph 9','text');
            // In the text a blank line separates paragraphs, so two ArrowDowns are the next paragraph.
            await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
            await check('ArrowDown in the text','paragraph 10','text');
            // And back to the page, which must not have kept a stale place of its own.
            await page.locator('#document .ProseMirror p').filter({hasText:'Paragraph 2 '}).click();
            await check('a click in the page again','paragraph 2','page');
            // A change of one selection that no key and no click made, by an action: Go To, and Find Next, which a host and a person's menu use. The keyboard is wherever it was.
            await page.locator('#document .ProseMirror p').filter({hasText:'Paragraph 3 '}).click();await check('a click in the page before Go To','paragraph 3','page');
            const line=await page.evaluate(()=>{const doc=CM.EditorView.findFromDOM(document.querySelector('#document .cm-editor')).state.doc;for(let n=1;n<=doc.lines;n++)if(/^Paragraph 8 /.test(doc.line(n).text))return n;return 0;});
            await page.evaluate(line=>pudlActions.run('yavc.docs/go-to@1',{line,column:5},{grant:'all'}),line);
            await check('Go To an action, line '+line+' column 5','paragraph 8','text');
            await page.locator('#document .cm-line').filter({hasText:'Paragraph 4 '}).click();await check('a click in the text before Find Next','paragraph 4','text');
            await page.evaluate(()=>pudlCommands.run('find',null,document.querySelector('#document')));const box=page.locator('#document .cm-editor input[aria-label="Find"]');await box.waitFor();await box.fill('Paragraph 11');await box.press('Enter');
            await check('Find Next from the search panel','paragraph 11','text');await page.keyboard.press('Escape');
            // The other way: the page's selection set by a program while the keyboard is in the text.
            await page.locator('#document .cm-line').filter({hasText:'Paragraph 6 '}).click();await check('a click in the text before the page is set','paragraph 6','text');
            // A move of the page just after the mirror set it is the mirror's own, and is not told back; so a program that moves it waits out the half second.
            await page.waitForTimeout(700);
            await page.evaluate(()=>window.yavcMdEditor._page.goToHeading(0));
            await check('the page set by a program (the outline goes to a heading)','heading','page');
            if(errors.length)failures.push(`${engine}: page errors ${errors.join(' | ')}`);
            console.log(engine+': Split checks done');
        }finally{await browser.close();}
    }}finally{server.close();}
    assert.deepEqual(failures,[],failures.join('\n'));
    console.log('Split kept one place in both panes, in both directions, by click and by keys, with the keyboard left where it was.');
})().catch(error=>{console.error(error.message||error);process.exitCode=1;});
