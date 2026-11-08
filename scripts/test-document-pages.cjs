// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const playwright = require('playwright');
const evidence = path.join(os.tmpdir(), 'yavc-document-pages-evidence'); fs.mkdirSync(evidence, { recursive: true });
const port = process.env.YAVC_CHROME_TEST_PORT || '8421';
const source = '---\ntitle: Document pages\npage: letter\nmargins: 1in\n---\n\n# Document pages\n\n' + Array.from({length: 45}, (_, i) => `Paragraph ${i + 1}. ` + 'This text stays editable across page boundaries. '.repeat(7)).join('\n\n') + '\n';
const action = (page, name, input = {}) => page.evaluate(({name,input}) => pudlActions.run('yavc.docs/' + name + '@1', input, {grant:'all'}), {name,input});
const command = (page, id) => page.evaluate(id => { pudlCommands.run(id, null, document.querySelector('[data-applet]')); }, id);
const text = page => action(page, 'document').then(r => r.text);
const margin = page => page.locator('[data-measure="all"]').locator('..').getByRole('spinbutton');
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium','firefox','webkit']) {
        const browser = await playwright[engine].launch({headless:true});
        const page = await browser.newPage({viewport:{width:1500,height:1000}}); page.setDefaultTimeout(15000);
        const errors = []; page.on('pageerror', err => errors.push(err.message));
        try {
            await page.goto(`http://docs.localhost:${port}/`,{waitUntil:'domcontentloaded'}); await page.locator('.cm-editor').waitFor({state:'attached'});
            await action(page, 'new', {path:'~/pages.docs.md',text:source});
            await page.waitForFunction(() => +document.querySelector('[data-page-count]')?.dataset.pageCount > 1);
            assert.equal(await text(page), source);
            const state = await page.evaluate(() => {
                const paper = document.querySelector('.doc-paginated'), flow = paper.querySelector('.ProseMirror');
                return {count:+paper.dataset.pageCount,width:paper.getBoundingClientRect().width,ink:getComputedStyle(paper).color,paper:getComputedStyle(paper).backgroundColor,gaps:flow.querySelectorAll('.doc-page-gap').length};
            });
            assert.equal(state.width,816); assert.equal(state.gaps,state.count-1); assert.equal(state.paper,'rgb(255, 255, 255)'); assert.equal(state.ink,'rgb(32, 33, 36)');
            await page.waitForTimeout(500);
            assert.equal(await page.locator('[data-page-count]').getAttribute('data-page-count'), String(state.count));
            await page.screenshot({path:path.join(evidence,engine+'-document.png')});
            await command(page,'page-setup'); await margin(page).fill('99');
            await page.getByRole('button',{name:'Apply',exact:true}).click();
            await page.waitForFunction(() => /All Sides/.test(document.activeElement?.getAttribute('aria-label') || ''));
            assert.equal(await margin(page).getAttribute('aria-invalid'),'true');
            assert.ok(await margin(page).evaluate(node => !!document.getElementById(node.getAttribute('aria-describedby'))));
            await margin(page).fill('');
            await page.getByRole('button',{name:'Apply',exact:true}).click();
            assert.equal(await margin(page).evaluate(node => node === document.activeElement),true);
            await page.getByRole('button',{name:'Cancel',exact:true}).click(); assert.equal(await text(page),source);
            await page.locator('.ProseMirror p').first().click(); await page.keyboard.press('Home'); await page.keyboard.type('Edited ');
            await page.waitForFunction(() => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString().includes('Edited '));
            await command(page,'undo'); await page.waitForFunction(source => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString() === source,source);
            await command(page,'page-setup'); await page.locator('[data-choice="paper"]').selectOption('a4');
            await page.locator('[data-choice="orientation"]').selectOption('landscape');
            await page.getByRole('button',{name:'Apply',exact:true}).click();
            await page.waitForFunction(() => document.querySelector('.doc-paginated')?.getBoundingClientRect().width > 1100);
            assert.match(await text(page),/orientation: landscape/);
            await command(page,'undo'); await page.waitForFunction(source => CM.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString() === source,source);
            await page.waitForFunction(() => document.querySelector('.doc-paginated')?.getBoundingClientRect().width === 816);
            for (const mode of ['text','preview','visual','split']) {
                await action(page,'view',{mode});
                assert.equal(await page.locator('.doc-paginated').count(),0);
                assert.equal(await text(page),source);
            }
            await action(page,'view',{mode:'document'}); await page.waitForFunction(() => +document.querySelector('[data-page-count]')?.dataset.pageCount > 1);
            await command(page,'hide-navigation');
            await page.setViewportSize({width:600,height:800}); await page.waitForTimeout(250);
            assert.equal(await page.locator('.doc-paginated').evaluate(el => el.getBoundingClientRect().width),816);
            await page.screenshot({path:path.join(evidence,engine+'-narrow.png')});
            await page.setViewportSize({width:1500,height:1000});
            await page.evaluate(() => { const append = document.body.append.bind(document.body); document.body.append = function(...nodes) { append(...nodes); nodes.forEach(n => { if(n.tagName === 'IFRAME') n.contentWindow.print = () => { window.printCalled = true; }; }); }; });
            const groups = await page.locator('.ProseMirror').evaluate(flow => {
                const P=yavcDocumentPages,blocks=P.blocks(flow),layout=P.plan(blocks,P.settings({page:'letter',margins:'1in'})),starts=[0,...layout.gaps.map(g=>g.index),blocks.length];
                return starts.slice(0,-1).map((at,i)=>{const holder=document.createElement('div');holder.append(yavcPageLines.fragment(flow,blocks,at,starts[i+1]));return [...holder.children].filter(n=>!n.classList.contains('doc-page-gap')).map(n=>n.textContent.trim());});
            });
            await command(page,'print-document'); await page.waitForFunction(() => window.printCalled);
            const printGroups = await page.locator('.ed-print-frame').evaluate(frame => Array.from(frame.contentDocument.querySelectorAll('.doc-page-flow')).map(flow => Array.from(flow.children).map(node => node.textContent.trim())));
            fs.writeFileSync(path.join(evidence,engine+'-geometry.json'), JSON.stringify(await page.evaluate(() => {
                function geometry(flow) { return {html:flow.children[0].outerHTML,root:flow.parentElement.outerHTML.slice(0,400),items:Array.from(flow.children).slice(0,8).map(node => {const r=node.getBoundingClientRect(),s=node.ownerDocument.defaultView.getComputedStyle(node);return {tag:node.tagName,height:r.height,top:r.top,width:r.width,margin:s.margin,font:s.font,lineHeight:s.lineHeight,display:s.display};})}; }
                return {editing:geometry(document.querySelector('.ProseMirror')),printing:geometry(document.querySelector('iframe.ed-print-frame').contentDocument.querySelector('.doc-page-flow'))};
            }),null,2));
            assert.deepEqual(printGroups.map(g=>g.map(t=>t.slice(0,15))),groups.map(g=>g.map(t=>t.slice(0,15))),'Print and editing view disagree on measured page fragments');
            await page.locator('.ed-print-frame').evaluate(frame => frame.contentWindow.dispatchEvent(new Event('afterprint')));
            await page.evaluate(() => { window.printCalled=false; });
            await page.evaluate(() => pudlSetTheme('dark'));
            await page.screenshot({path:path.join(evidence,engine+'-dark.png')});
            const custom = await action(page,'page-setup',{page:'180mm x 240mm',margins:'15mm 20mm'});
            assert.ok(Math.abs(custom.width - 510.236) < .01);
            await command(page,'undo');
            await action(page,'new',{path:'~/print.docs.md',text:'# Print pages\n\nBefore.\n\n{{no-export}}\nSECRET NOTE\n{{/no-export}}\n\n{{page-break}}\n\n# Second page\n\nAfter.\n'});
            await page.waitForFunction(() => +document.querySelector('[data-page-count]')?.dataset.pageCount === 2);
            await command(page,'print-document');
            await page.waitForFunction(() => window.printCalled);
            const printed = await page.locator('.ed-print-frame').evaluate(frame => ({text:frame.contentDocument.body.textContent,pages:frame.contentDocument.querySelectorAll('.doc-print-sheet').length,html:frame.contentDocument.body.innerHTML}));
            assert.doesNotMatch(printed.html,/SECRET NOTE/); assert.match(printed.text,/Before/); assert.match(printed.text,/After/); assert.equal(printed.pages,2);
            const html = await page.locator('.ed-print-frame').evaluate(frame => frame.contentDocument.documentElement.outerHTML);
            const printPage = await browser.newPage({viewport:{width:1000,height:1200}});
            await printPage.goto(`http://docs.localhost:${port}/`); await printPage.setContent(html);
            await printPage.evaluate(() => document.fonts.ready);
            await printPage.screenshot({path:path.join(evidence,engine+'-print.png'),fullPage:true});
            if(engine === 'chromium') { await printPage.pdf({path:path.join(evidence,'document-pages.pdf'),preferCSSPageSize:true,printBackground:true}); }
            await printPage.close();
            await page.locator('.ed-print-frame').evaluate(frame => frame.contentWindow.dispatchEvent(new Event('afterprint')));
            assert.equal(await page.locator('.ed-print-frame').count(),0);
            await action(page,'new',{path:'~/oversized.docs.md',text:'{{style}}\n.too-tall {height:1200px;}\n{{/style}}\n\n<div class="too-tall">An atomic HTML block</div>\n'});
            await page.waitForFunction(() => document.querySelector('[data-role="page-problems"]')?.textContent.includes('taller than the page'));
            await command(page,'print-document');
            await page.locator('.toast.danger').filter({hasText:'could not be printed'}).waitFor();
            assert.equal(await page.locator('.ed-print-frame').count(),0);
            assert.deepEqual(errors,[]);
            console.log(engine+': pagination, source preservation, rich edit/Undo, page setup/Undo, mode changes, narrow layout and exclusion-safe print passed');
        } catch(err) { await page.screenshot({path:path.join(evidence,engine+'-failure.png')}); console.error(await page.locator('[data-role="message"]').textContent()); throw err; }
        finally { await browser.close(); }
    }
})().catch(err => {console.error(err);process.exitCode=1;});
