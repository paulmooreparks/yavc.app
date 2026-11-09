// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461';
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});try{
        const p=await browser.newPage({viewport:{width:1400,height:1100}});p.setDefaultTimeout(30000);const errors=[];p.on('pageerror',error=>errors.push(error.message));
        await p.goto('http://localhost:'+port+'/applet/diagrams');await p.locator('.cm-content').waitFor({state:'attached'});
        const action=(name,input={})=>p.evaluate(({name,input})=>pudlActions.run('yavc.diagrams/'+name+'@1',input,{grant:'all'}),{name,input});
        await action('new',{kind:'canvas',text:JSON.stringify({nodes:[{id:'a',type:'text',text:'A',x:0,y:0,width:160,height:80},{id:'b',type:'text',text:'B',x:300,y:0,width:160,height:80}],edges:[{id:'edge',fromNode:'a',toNode:'b'}]})});
        await action('canvas-edit',{op:'move',key:'b',dx:0,dy:0});await action('canvas-view',{op:'select',key:'edge',kind:'edge'});
        assert.equal(await p.getByLabel('Start Side',{exact:true}).inputValue(),'');assert.equal(await p.getByLabel('End Side',{exact:true}).inputValue(),'');
        await action('canvas-edit',{op:'move',key:'b',dx:-300,dy:-300});
        let doc=JSON.parse((await action('diagram')).text);assert.equal(doc.edges[0].fromSide,'top');assert.equal(doc.edges[0].yavc.fromAuto.side,'top');
        await action('canvas-view',{op:'select',key:'edge',kind:'edge'});await p.getByLabel('Start Side',{exact:true}).selectOption('top');
        doc=JSON.parse((await action('diagram')).text);assert.equal(doc.edges[0].yavc.fromAuto,undefined);assert.equal(doc.edges[0].fromSide,'top');
        await action('canvas-edit',{op:'move',key:'b',dx:0,dy:600});doc=JSON.parse((await action('diagram')).text);assert.equal(doc.edges[0].fromSide,'top');
        await action('canvas-view',{op:'select',key:'edge',kind:'edge'});await p.getByLabel('Start Side',{exact:true}).selectOption('');
        doc=JSON.parse((await action('diagram')).text);assert.equal(doc.edges[0].fromSide,'bottom');assert.equal(doc.edges[0].yavc.fromAuto.side,'bottom');
        const before=JSON.stringify(doc);await action('canvas-edit',{op:'paste',text:before});const pasted=JSON.parse((await action('diagram')).text).edges.at(-1);assert.notEqual(pasted.fromNode,'a');assert.equal(pasted.yavc.fromAuto.node,pasted.fromNode);
        assert.deepEqual(errors,[]);console.log(engine+': projected sides remain Automatic in the inspector, move dynamically, pin explicitly and rebase on paste');
    }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
