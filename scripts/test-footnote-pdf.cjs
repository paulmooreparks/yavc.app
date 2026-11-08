// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert=require('node:assert/strict'),pw=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const port=process.env.YAVC_CHROME_TEST_PORT||'8461',out=path.join(os.tmpdir(),'yavc-footnote-export-evidence');
const source='Visible[^proof] and repeated[^proof]. {{no-export}}SECRET_REF[^hidden]{{/no-export}}\n\n[^hidden]: SECRET_NOTE\n\n[^unused]: UNUSED_NOTE\n\n[^proof]: A **native** footnote.\n\n    Second paragraph.\n';
(async()=>{
    await fs.mkdir(out,{recursive:true});
    for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
        const b=await pw[engine].launch({headless:true});
        try{
            const p=await b.newPage();
            await p.goto(`http://localhost:${port}/applet/docs`);await p.locator('.cm-content').waitFor({state:'attached'});
            for(const [name,text] of [['footnotes',source],['long-notes','---\npage: 5in x 5in\nmargins: 0.5in\n---\n\nVisible LONGREF[^long].\n\n'+Array.from({length:25},(_,i)=>'Body '+i+' stays above notes.').join('\n\n')+'\n\n[^long]: '+Array.from({length:120},(_,i)=>'NOTE'+i+' continuation words.').join(' ')+'\n']]){
                const bytes=await p.evaluate(async text=>{const E=await yavcMdEditor.exports(),m=await yavcMdEngine(),result=await E.build('pdf',{text,engine:m.withMacros(text,'')});return Array.from(new Uint8Array(await result.blob.arrayBuffer()));},text);
                await fs.writeFile(path.join(out,engine+'-'+name+'.pdf'),Buffer.from(bytes));assert.ok(bytes.length>1000);
            }
            const formatting='---\npage: 5in x 5in\nmargins: 0.5in\n---\n\n{{style}}\np { text-align:justify; }\n{{/style}}\n\nVisible[^proof].\n\n```\nROOT\n    INDENTED\n```\n\nJUST0 '+Array.from({length:100},()=> 'justified words').join(' ')+'\n\n[^proof]: Note.\n';
            const formatted=await p.evaluate(async text=>{const E=await yavcMdEditor.exports(),m=await yavcMdEngine(),result=await E.build('pdf',{text,engine:m.withMacros(text,'')});return Array.from(new Uint8Array(await result.blob.arrayBuffer()));},formatting);
            await fs.writeFile(path.join(out,engine+'-formatting.pdf'),Buffer.from(formatted));
            const refused=await p.evaluate(async()=>{const E=await yavcMdEditor.exports(),m=await yavcMdEngine();return Promise.all(['opacity:0','float:left','column-count:2'].map(async css=>{const text='{{style}}\n.doc-footnote { '+css+'; }\n{{/style}}\n\nVisible[^n].\n\n[^n]: Note.\n';return E.prepare({text,engine:m.withMacros(text,'')}).then(()=>false,err=>/layout/.test(err.message));}));});
            assert.deepEqual(refused,[true,true,true]);
            for(const chain of [false,true,'earlier']){
                const bytes=await p.evaluate(async ({text,chain})=>{
                    const E=await yavcMdEditor.exports(),m=await yavcMdEngine(),model=await E.prepare({text,engine:m.withMacros(text,'')});
                    model.page.width=model.page.height=360;model.page.margins=[36,36,36,36];
                    function paragraph(text,keepNext){return {kind:'paragraph',style:{leading:1.5,keepNext:!!keepNext},runs:[{text,size:11}]};}
                    model.blocks=Array.from({length:15},(_,i)=>paragraph('FILL'+i));model.blocks.push(paragraph('KEEPHEAD',true));if(chain)model.blocks.push(paragraph('KEEPSUBHEAD',true));model.blocks.push({kind:'paragraph',style:{leading:1.5},runs:[{text:'KEEPBODY',size:11},{text:'1',footnote:'proof',size:11}]});
                    if(chain==='earlier'){
                        model.page.height=172;model.footnotes[0].blocks=[{kind:'paragraph',style:{leading:32/11},runs:[{text:'EARLIERNOTE',size:11}]}];
                        model.blocks=[{kind:'paragraph',style:{leading:30/11},runs:[{text:'EARLIER',size:11},{text:'1',footnote:'proof',size:11}]},{kind:'paragraph',style:{leading:10/11,keepNext:true},runs:[{text:'KEEPHEAD',size:11}]},{kind:'paragraph',style:{leading:5},runs:[{text:'KEEPBODY',size:11}]}];
                    }
                    const blob=await yavcFootnotePDF.write(model,yavcMdEditor);return Array.from(new Uint8Array(await blob.arrayBuffer()));
                },{text:source,chain});
                await fs.writeFile(path.join(out,engine+(chain==='earlier'?'-keep-earlier.pdf':chain?'-keep-chain.pdf':'-keep-notes.pdf')),Buffer.from(bytes));
            }
            console.log(engine+' selectable PDF page notes, repeated references, long-note continuation and exclusion pruning passed.');
        }finally{await b.close();}
    }
})().catch(e=>{console.error(e);process.exitCode=1;});
