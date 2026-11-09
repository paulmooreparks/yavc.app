// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8491';
(async()=>{
    const source=await fs.readFile(path.join(__dirname,'../site/home/Howto/Feature Playground/Document Furniture.docs.md'),'utf8');
    for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
        const browser=await pw[engine].launch({headless:true});
        try{
            const page=await browser.newPage({viewport:{width:1700,height:1200}}),errors=[];
            page.on('pageerror',error=>errors.push(error.message));
            const action=(name,input={})=>page.evaluate(({name,input})=>pudlActions.run('yavc.docs/'+name+'@1',input,{grant:'all'}),{name,input});
            await page.goto('http://localhost:'+port+'/applet/docs');
            await page.locator('.ProseMirror').waitFor();
            await action('new',{path:'~/Typing Stability.docs.md',text:source});
            await action('view',{mode:'document'});
            await page.waitForFunction(()=>document.querySelector('.ProseMirror .doc-page-gap'));
            await page.waitForTimeout(400);
            await page.locator('.ProseMirror p').filter({hasText:'Choose View, Document Zoom'}).click();
            await page.keyboard.press('End');
            await page.evaluate(()=>{
                window.typingFrames=[];window.trackTyping=true;
                window.originalFurniture=document.querySelector('.doc-furniture');
                const measure=()=>{
                    if(!window.trackTyping)return;
                    const flow=document.querySelector('.ProseMirror');
                    window.typingFrames.push({
                        top:flow.querySelector('h2').getBoundingClientRect().top-flow.getBoundingClientRect().top,
                        gaps:flow.querySelectorAll('.doc-page-gap').length,
                        furniture:document.querySelector('.doc-furniture')===window.originalFurniture
                    });
                    requestAnimationFrame(measure);
                };
                requestAnimationFrame(measure);
            });
            await page.keyboard.type(' abcdefgh',{delay:90});
            await page.waitForTimeout(350);
            const frames=await page.evaluate(()=>{window.trackTyping=false;return window.typingFrames;});
            assert.ok(frames.length>=8,'Typing must be measured across multiple rendered frames.');
            assert.ok(frames.every(frame=>frame.gaps>0),'Pagination spacers must survive every typing frame.');
            const positions=frames.map(frame=>frame.top);
            assert.ok(Math.max(...positions)-Math.min(...positions)<=1,'Typing within the same line must not move the following page.');
            assert.ok(frames.every(frame=>frame.furniture),'Unchanged headers and footers must retain their DOM.');
            assert.ok((await action('document')).text.includes(' abcdefgh'));
            await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');
            await page.waitForTimeout(200);
            assert.equal((await action('document')).text,source,'One Undo must restore the source without pagination edits.');
            assert.deepEqual(errors,[]);
            console.log(engine+' typing retains page spacing and furniture without intermediate collapse; Undo restores exact source.');
        }finally{await browser.close();}
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
