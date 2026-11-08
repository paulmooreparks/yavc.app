// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8420', evidence = path.join(os.tmpdir(), 'yavc-export-paper-evidence'); fs.mkdirSync(evidence, { recursive: true });
const source = fs.readFileSync(path.join(__dirname, '../site/home/Howto/Feature Playground/Editor Export.docs.md'), 'utf8');
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium','firefox','webkit']) {
        const browser = await playwright[engine].launch({ headless: true }), page = await browser.newPage();
        try {
            await page.goto(`http://docs.localhost:${port}/`); await page.locator('.cm-editor').waitFor({state:'attached'});
            await page.evaluate(text => pudlActions.run('yavc.docs/new@1', { path: '~/paper.docs.md', text }, { grant: 'all' }), source);
            await page.evaluate(() => pudlActions.run('yavc.docs/view@1', { mode: 'text' }, { grant: 'all' }));
            for (const theme of ['light', 'dark']) {
                await page.evaluate(theme => pudlSetTheme(theme), theme);
                const pending = page.waitForEvent('download');
                await page.evaluate(() => pudlCommands.run('export-docx', null, document.querySelector('[data-applet]')));
                await (await pending).saveAs(path.join(evidence, engine + '-' + theme + '.docx'));
            }
            const colors = await page.evaluate(async () => {
                const E = await yavcMdEditor.exports(), m = await yavcMdEngine();
                async function prepare(text, more) { return E.prepare(Object.assign({ text, engine: m.withMacros(text, '') }, more)); }
                const plain = await prepare('Text.');
                const authored = await prepare('{{style}}\n--doc-page:#fff1dc;\n--doc-ink:#203040;\n{{/style}}\n\nText.');
                const shared = await prepare('Text.', { stylesheet: '~/paper.css', read: () => '--doc-page:#dceeff;--doc-ink:#123456;' });
                const inline = await prepare('{{style}}\n--doc-page:#eaf4e8;\n{{/style}}\n\nText.', { stylesheet: '~/paper.css', read: () => '--doc-page:#dceeff;--doc-ink:#123456;' });
                const pdf = E.pdfDefinition(authored);
                const alpha = await prepare('{{style}}\n--doc-page:#000000;--doc-ink:rgba(255,255,255,.5);\n{{/style}}\n\nText.').then(() => false, err => /must be opaque/.test(err.message));
                const alphaPaper = await prepare('{{style}}\n--doc-page:rgba(0,0,0,.5);\n{{/style}}\n\nText.').then(() => false, err => /must be opaque/.test(err.message));
                const blob = await E.build('docx', { text: '{{style}}\n--doc-page:#fff1dc;--doc-ink:#203040;\n{{/style}}\n\nText.', engine: m.withMacros('', '') });
                window.paperAuthoredBlob = blob.blob;
                return { plain: [plain.page.background, plain.blocks[0].runs[0].color], authored: [authored.page.background, authored.blocks[0].runs[0].color], shared: [shared.page.background, shared.blocks[0].runs[0].color], inline: [inline.page.background, inline.blocks[0].runs[0].color], pdf: pdf.background.canvas[0].color, alpha, alphaPaper };
            });
            assert.deepEqual(colors, { plain: ['ffffff','202124'], authored: ['fff1dc','203040'], shared: ['dceeff','123456'], inline: ['eaf4e8','123456'], pdf: '#fff1dc', alpha: true, alphaPaper: true });
            const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await paperAuthoredBlob.arrayBuffer())));
            fs.writeFileSync(path.join(evidence, engine + '-authored.docx'), Buffer.from(bytes));
            await page.evaluate(() => pudlActions.run('yavc.docs/new@1', { path: '~/paper-colors.docs.md', text: '{{style}}\n--doc-page:#fff1dc;--doc-ink:#203040;\n{{/style}}\n\n# Paper colors\n\nAn authored paper and ink pair.' }, { grant: 'all' }));
            await page.evaluate(() => pudlActions.run('yavc.docs/view@1', { mode: 'split' }, { grant: 'all' }));
            await page.waitForFunction(() => { const page = document.querySelector('.ProseMirror')?.closest('.doc-page'); return page && getComputedStyle(page).backgroundColor === 'rgb(255, 241, 220)' && getComputedStyle(page).color === 'rgb(32, 48, 64)'; });
            await page.screenshot({ path: path.join(evidence, engine + '-paper-preview.png') });
            console.log(engine + ': explicit paper, light/dark parity and default/shared/inline color precedence passed');
        } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
