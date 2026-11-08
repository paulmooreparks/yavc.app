// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const pw = require('playwright'), port = process.env.YAVC_CHROME_TEST_PORT || '8446';
const out = path.join(os.tmpdir(), 'yavc-document-theme-evidence'); fs.mkdirSync(out, {recursive:true});
const fixture = fs.readFileSync(path.join(__dirname, '../site/home/Howto/Feature Playground/Editor Export.docs.md'), 'utf8') +
    '\n\n```text\nCode sample\n```\n\n{{expand:Details}}\nExpanded words.\n{{/expand}}\n\n{{tip:Tip}}\nUseful words.\n{{/tip}}\n\n{{kbd:Ctrl+S}} {{status:green Saved}} {{color:accent}}Semantic color{{/color}}\n\n```mermaid\ngraph LR\nA[Start] --> B[Finish]\n```\n';
const action = (p, app, name, input={}) => p.evaluate(({app,name,input}) => pudlActions.run('yavc.'+app+'/'+name+'@1',input,{grant:'all'}),{app,name,input});
async function colors(p) {
    return p.locator('[data-ed-page]').evaluate(page => {
        const selectors = {paper:null, heading:'h1', header:'th', cell:'td', quote:'blockquote', code:'pre', contents:'.sc-toc', expand:'.sc-expand', tip:'.sc-notice', key:'kbd', status:'.badge', highlight:'mark', accent:'.accent'};
        return Object.fromEntries(Object.entries(selectors).map(([key,selector]) => {
            const node=selector?page.querySelector(selector):page; if(!node)throw new Error('Missing '+key);
            const css=getComputedStyle(node);
            return [key,{color:css.color,background:css.backgroundColor,border:css.borderColor,font:css.fontSize}];
        }));
    });
}
(async()=>{for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});
    try {
        let expected;
        for(const app of ['docs','editor']) {
            const p=await browser.newPage({viewport:{width:1500,height:1050}}), errors=[]; p.on('pageerror',e=>errors.push(e.message));
            try {
                await p.goto(`http://${app}.localhost:${port}/`); await p.locator('.cm-editor').waitFor({state:'attached'});
                await p.evaluate(()=>pudlSetTheme('dark'));
                await action(p,app,'new',{path:'~/theme.docs.md',text:fixture});
                if(app==='docs') {
                    await p.locator('.ProseMirror').focus();await p.keyboard.type('Z');
                    await p.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('# ZExport playground'));
                    const typed=(await action(p,app,'document')).text;
                    assert.ok(typed.includes('{{style}}\n.accent { color: #2355a0; }\n{{/style}}'),'Typing on initial open preserves the hidden stylesheet');
                    assert.ok(typed.includes('# ZExport playground'),'The initial caret belongs to the visible heading: '+typed.slice(0,350));
                    await action(p,app,'set-text',{text:fixture});
                }
                for(const mode of app==='docs'?['document','visual','split','preview']:['split','preview']) {
                    await action(p,app,'view',{mode}); await p.locator('[data-ed-page] th').first().waitFor();
                    await p.locator('[data-ed-page] .ed-diagram svg').waitFor({state:'attached'});
                    assert.equal(await p.locator('[data-ed-page] .ed-diagram svg rect').first().evaluate(n=>getComputedStyle(n).fill),'rgb(236, 236, 255)');
                    let light;
                    for(const theme of ['light','dark']) {
                        await p.evaluate(theme=>pudlSetTheme(theme),theme);
                        const sample=await colors(p);
                        assert.equal(sample.paper.background,'rgb(255, 255, 255)');
                        assert.equal(sample.header.background,'rgb(228, 231, 235)');
                        assert.equal(sample.cell.border,'rgb(207, 212, 218)');
                        if(theme==='light')light=sample;else assert.deepEqual(sample,light,app+' '+mode+' theme parity');
                        if(expected)assert.deepEqual(sample,expected,app+' '+mode+' shared page palette');else expected=sample;
                        if(mode==='document') {
                            assert.equal(await p.locator('.pm-source:has(.sc-style)').evaluate(n=>n.hidden),true);
                            assert.equal(await p.locator('.pm-source:has(.sc-style)').evaluate(n=>n.getClientRects().length),0);
                        }
                        if(mode==='document'||mode==='preview')await p.screenshot({path:path.join(out,engine+'-'+app+'-'+mode+'-'+theme+'.png')});
                    }
                    assert.equal((await action(p,app,'document')).text,fixture);
                }
                const custom=fixture.replace('.accent { color: #2355a0; }','--doc-page:#fff8ee; --doc-code:#cadddd; --doc-rule:#123456;\n.accent { color: #2355a0; }');
                await action(p,app,'set-text',{text:custom});
                await p.waitForFunction(()=>getComputedStyle(document.querySelector('[data-ed-page]')).backgroundColor==='rgb(255, 248, 238)');
                const dark=await colors(p);await p.evaluate(()=>pudlSetTheme('light'));assert.deepEqual(await colors(p),dark);
                assert.equal(dark.header.background,'rgb(202, 221, 221)');assert.equal(dark.cell.border,'rgb(18, 52, 86)');
                assert.equal((await action(p,app,'document')).text,custom);assert.deepEqual(errors,[]);
                if(app==='docs') {
                    const metadata='{{style}}\n.accent { color: #2355a0; }\n{{/style}}\n';
                    await action(p,app,'new',{path:'~/metadata.docs.md',text:metadata});
                    assert.equal((await action(p,app,'document')).text,metadata);
                    await p.locator('.ProseMirror').focus();await p.keyboard.type('Visible typing');
                    await p.waitForFunction(()=>CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('Visible typing'));
                    assert.ok((await action(p,app,'document')).text.includes(metadata.trim()));
                }
            } finally { await p.close(); }
        }
        console.log(engine+': Docs Document/Visual/Split/Preview and Editor previews share theme-independent paper; authored colors and hidden stylesheet source survive');
    } finally { await browser.close(); }
}})().catch(error=>{console.error(error);process.exitCode=1;});
