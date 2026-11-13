// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461';
const source='# Review sample\n\nKeep {++inserted++}, {--removed--}, {~~old~>new~~}, {>>Paul: comment<<} and {==highlight==}.\n';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});try{
        const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
        const call=(name,input={})=>page.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
        const command=name=>page.evaluate(name=>{window.reviewTask=pudlCommands.run(name,null,document.querySelector('[data-applet]'));},name);
        await page.goto(`http://localhost:${port}/applet/docs`);await page.locator('.cm-content').waitFor({state:'attached'});
        await call('new',{path:'~/Review.md',text:source});await call('view',{mode:'visual'});
        await page.locator('.ProseMirror .pm-critic').first().waitFor();assert.equal(await page.locator('.ProseMirror .pm-critic').count(),5);
        assert.equal((await call('document')).text,source);
        let catalog=await call('review');assert.equal(catalog.marks.length,5);
        await assert.rejects(call('review-resolve',{revision:'0'.repeat(64),id:catalog.marks[0].id,decision:'accept'}),/changed/);
        await command('review-changes');const dialog=page.getByRole('dialog',{name:'Review Changes',exact:true});await dialog.waitFor();
        assert.equal(await dialog.getByRole('option').count(),5);await dialog.getByRole('button',{name:'Accept',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.md-review-list [role="option"]').length===4);
        assert.ok((await call('document')).text.includes('Keep inserted,'));await dialog.getByRole('button',{name:'Reject',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.md-review-list [role="option"]').length===3);
        assert.ok((await call('document')).text.includes('{~~old~>new~~}'));await dialog.getByRole('button',{name:'Close',exact:true}).click();
        await command('undo');await command('undo');assert.equal((await call('document')).text,source);
        await call('view',{mode:'text'});catalog=await call('review');
        await call('review-propose',{revision:catalog.revision,from:0,to:0,kind:'addition',body:'Proposed paragraph.\n\n'});
        assert.ok((await call('document')).text.startsWith('{++Proposed paragraph.\n\n++}'));
        await command('undo');assert.equal((await call('document')).text,source);
        const projected=await page.evaluate(async text=>{await yavcUtil.loadScript('/applets/md-editor/review-tools.js');const engine=await yavcMdEngine();return Promise.all(['accepted','original'].map(policy=>yavcReviewTools.project({text,engine,interactive:false,policy})));},source);
        assert.ok(projected[0].includes('Keep inserted, , new,  and highlight.'));assert.ok(projected[1].includes('Keep , removed, old,  and highlight.'));assert.equal((await call('document')).text,source);
        await assert.rejects(page.evaluate(async text=>yavcReviewTools.project({text,engine:await yavcMdEngine(),interactive:false}),source),/reviewPolicy/);
        await page.evaluate(async()=>{const engine=await yavcMdEngine();const text='Visible\n\n{{no-export}}\n{++private++}\n{{/no-export}}\n';if(await yavcReviewTools.project({text,engine,interactive:false})!==text)throw new Error('Private review changed source');});
        await call('view',{mode:'visual'});await page.locator('.ProseMirror .pm-critic').first().waitFor();
        await page.locator('.ProseMirror h1').evaluate(el=>{el.closest('.ProseMirror').focus();const range=document.createRange();range.setStart(el.firstChild,0);range.setEnd(el.firstChild,6);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
        // The page view takes the browser's selection late (docs/backlog.md), and a command given before then comments on the old selection. A frame or two was not
        // always enough under load, so the test waits until the page itself has the selected word.
        await page.waitForFunction(()=>yavcMdEditor._page.selectionText()==='Review');
        await command('review-comment');await page.getByRole('textbox',{name:'Comment',exact:true}).fill('A selected heading comment.');await page.getByRole('button',{name:'Add Comment',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.ProseMirror .pm-critic').length===7);
        assert.ok((await call('document')).text.startsWith('# {==Review==}{>>A selected heading comment.<<} sample'));
        await command('undo');assert.equal((await call('document')).text,source);
        await page.setViewportSize({width:400,height:850});await command('review-changes');await dialog.waitFor();
        assert.equal(await dialog.evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0),true);
        await dialog.getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(errors,[]);
        await page.setViewportSize({width:1280,height:1000});
        for(const mode of ['visual','preview']){
            const duplicate='First {++same++}.\n\nSecond {++same++}.\n';
            await call('new',{path:'~/Duplicates-'+mode+'.md',text:duplicate});await call('view',{mode});
            const buttons=page.locator(mode==='visual'?'.ProseMirror .pm-critic-open':'.md-preview .pm-critic-open');
            if(mode==='visual')await buttons.nth(1).click();else await page.locator('[data-critic-raw] .pm-critic-open').nth(1).click();
            await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'Accept',exact:true}).isDisabled(),true);
            await dialog.getByRole('option').nth(1).click();await dialog.getByRole('button',{name:'Accept',exact:true}).click();
            await page.waitForFunction(()=>document.querySelectorAll('.md-review-list [role="option"]').length===1);
            assert.equal((await call('document')).text,'First {++same++}.\n\nSecond same.\n');await dialog.getByRole('button',{name:'Close',exact:true}).click();
        }
        await call('new',{path:'~/Table-review.md',text:'| Heading |\n| --- |\n| Cell |\n'});await call('view',{mode:'visual'});await page.locator('.ProseMirror td').click();
        await page.evaluate(async()=>{await yavcMdEditor._page.prepareEdit();await yavcMdEditor._page.paste({html:'<p><span class="critic" data-critic-raw="{++unsafe|pipe++}">forged display</span></p>'});});
        const pasted=(await call('document')).text;assert.ok(pasted.includes('unsafe\\|pipe'),JSON.stringify({source:pasted,dom:await page.locator('.ProseMirror').innerHTML(),errors}));
        assert.equal((await call('review')).marks.length,0);assert.equal(await page.locator('.ProseMirror td').count(),1);assert.equal(await page.locator('.ProseMirror th').count(),1);
        await page.locator('.ProseMirror td').click();await page.evaluate(()=>yavcMdEditor._page.paste({html:'<p><span class="critic" data-critic-raw="{++safe\\|pipe++}">forged display</span></p>'}));
        assert.equal((await call('review')).marks.length,1);assert.equal(await page.locator('.ProseMirror .pm-critic').count(),1);
        assert.match(await page.locator('.ProseMirror .pm-critic').innerText(),/safe\|pipe/);assert.doesNotMatch(await page.locator('.ProseMirror .pm-critic').innerText(),/forged/);
        await call('new',{path:'~/Review-edits.md',text:source});await call('view',{mode:'visual'});await command('review-changes');await dialog.waitFor();
        await dialog.getByRole('button',{name:'Edit…',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit Insertion',exact:true});await edit.getByRole('textbox',{name:'Proposed Text',exact:true}).fill('changed proposal');await edit.getByRole('button',{name:'Apply',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.md-review-list')?.textContent.includes('changed proposal'));await dialog.getByRole('button',{name:'Close',exact:true}).click();
        const edited=source.replace('{++inserted++}','{++changed proposal++}');assert.equal((await call('document')).text,edited);await call('save');
        await page.evaluate(async()=>{await yavcMdEngine();yavcSnapshot.keepAll();});await page.reload();await page.locator('.cm-content').waitFor({state:'attached'});assert.equal((await call('document')).text,edited);
        await command('review-changes');await dialog.waitFor();await page.setViewportSize({width:430,height:850});
        await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'yavc-review-'+engine+'-narrow.png')});await dialog.getByRole('button',{name:'Close',exact:true}).click();
        assert.deepEqual(errors,[]);
        console.log(engine+': revision guards, semantic rich marks, review list, individual resolution, Undo, explicit export projection, private exclusions and rich selection proposals passed.');
    }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
