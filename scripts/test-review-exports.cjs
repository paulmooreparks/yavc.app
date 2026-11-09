// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),JSZip=require('../apps/slides/vendor/jszip-3.10.1/jszip.min.js');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461',source='# Reviewed export\n\n{++INSERTION_KEEP++} {--DELETION_OLD--} {~~REPLACEMENT_OLD~>REPLACEMENT_NEW~~} {>>PRIVATE_COMMENT<<} {==HIGHLIGHT_KEEP==}\n\n{{no-export}}\nPRIVATE_BLOCK\n{{/no-export}}\n';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});try{
        const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
        const call=(name,input={})=>page.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
        await page.goto(`http://localhost:${port}/applet/docs`);await page.locator('.cm-content').waitFor({state:'attached'});await call('new',{path:'~/Reviewed-export.md',text:source});await call('view',{mode:'text'});
        await assert.rejects(call('export',{format:'docx'}),/reviewPolicy/);assert.equal(await page.getByRole('dialog').count(),0);
        for(const policy of ['accepted','original']){
            const pending=page.waitForEvent('download');await page.evaluate(()=>{window.exportTask=pudlCommands.run('export-docx',null,document.querySelector('[data-applet]'));});
            const dialog=page.getByRole('dialog',{name:'Export Reviewed Copy',exact:true});await dialog.getByLabel('Version',{exact:true}).selectOption(policy);await dialog.getByRole('button',{name:'Continue',exact:true}).click();
            const download=await pending,zip=await JSZip.loadAsync(await fs.readFile(await download.path())),xml=await zip.file('word/document.xml').async('string');
            assert.match(xml,/HIGHLIGHT_KEEP/);assert.doesNotMatch(xml,/PRIVATE_COMMENT|PRIVATE_BLOCK|\{\+\+|\{--|\{~~/);
            if(policy==='accepted'){assert.match(xml,/INSERTION_KEEP/);assert.match(xml,/REPLACEMENT_NEW/);assert.doesNotMatch(xml,/DELETION_OLD|REPLACEMENT_OLD/);}else{assert.match(xml,/DELETION_OLD/);assert.match(xml,/REPLACEMENT_OLD/);assert.doesNotMatch(xml,/INSERTION_KEEP|REPLACEMENT_NEW/);}
            assert.equal((await call('document')).text,source);
        }
        await page.evaluate(async text=>{const K=yavcMdEditor,E=await K.exports(),m=await yavcMdEngine();await yavcUtil.loadScript('/applets/md-editor/review-tools.js');const output=await yavcReviewTools.project({text,engine:m,policy:'accepted',interactive:false});const result=await E.build('pdf',{text:output,engine:m.withMacros(output,''),current:()=>true});window.reviewPdf=Array.from(new Uint8Array(await result.blob.arrayBuffer()));},source);
        const bytes=Buffer.from(await page.evaluate(()=>reviewPdf));assert.equal(bytes.subarray(0,4).toString(),'%PDF');await fs.writeFile(path.join(os.tmpdir(),'yavc-review-'+engine+'.pdf'),bytes);
        assert.equal((await call('document')).text,source);assert.deepEqual(errors,[]);console.log(engine+': actual accepted/original Word exports, PDF generation, source preservation and noninteractive policy refusal passed.');
    }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
