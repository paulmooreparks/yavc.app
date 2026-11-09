// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461';
async function ready(page,app){await page.locator(app==='slides'?'.deck-canvas':'.cm-content').waitFor({state:'attached'});if(app==='docs')await page.locator('.ProseMirror').waitFor({state:'visible'});}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});try{for(const app of ['editor','docs','diagrams','slides']){
  const page=await browser.newPage({viewport:{width:1800,height:1100}});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto('http://localhost:'+port+'/applet/'+app);await ready(page,app);
   const files=page.locator('.ed-explorer');assert.equal(await files.isVisible(),false,app+' fresh wide-screen Files pane');
   if(app==='editor'||app==='docs'){
    await page.evaluate(()=>pudlCommands.run('toggle-files',null,document.querySelector('[data-applet]')));await files.waitFor({state:'visible'});
    await page.waitForFunction(async app=>(await pudlHost.config.stored(app)).explorer===true,app);
    await page.reload();await ready(page,app);await files.waitFor({state:'visible'});
    await page.evaluate(app=>pudlHost.config.set(app,{explorer:null}),app);await files.waitFor({state:'hidden'});
    await page.evaluate(()=>pudlCommands.run('toggle-files',null,document.querySelector('[data-applet]')));await files.waitFor({state:'visible'});
    await page.evaluate(()=>pudlCommands.run('toggle-files',null,document.querySelector('[data-applet]')));await files.waitFor({state:'hidden'});
    await page.waitForFunction(async app=>(await pudlHost.config.stored(app)).explorer===false,app);
    await page.reload();await ready(page,app);assert.equal(await files.isVisible(),false,app+' explicit opt-out survives reload');
   }
   assert.deepEqual(errors,[]);console.log(engine+': '+app+' starts without Files; supported explicit choices survive reload');
  }finally{await page.close();}
 }}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
