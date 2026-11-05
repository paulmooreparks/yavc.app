// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const playwright = require('playwright');
const port = process.env.YAVC_CHROME_TEST_PORT || '8419';
const evidence = path.join(os.tmpdir(), 'yavc-editor-export-evidence'); fs.mkdirSync(evidence, { recursive: true });
const source = '---\ntitle: Export test\nauthor: Test author\npage: letter\nmargins: 1in\n---\n\n# Export test\n\nBefore {{no-export}}SECRET_INLINE{{/no-export}}after. Café.\n\n{{no-export}}\n## SECRET_HEADING\n\nSECRET_BLOCK\n\n{{page-break}}\n\n![secret](https://invalid.example/SECRET_IMAGE.png)\n{{/no-export}}\n\n{{draft-note}}\nSECRET_DRAFT\n{{/draft-note}}\n\n## Visible heading\n\nA **bold** and *italic* paragraph with <u>underlined</u> text.\n\n> A quote.\n\n- First\n- Second\n\n| Left | Right |\n| :--- | ---: |\n| One | Two |\n';
async function action(page, name, input = {}) { return page.evaluate(({ name, input }) => pudlActions.run('yavc.editor/' + name + '@1', input, { grant: 'all' }), { name, input }); }
async function download(page, format, name) {
    const pending = page.waitForEvent('download');
    await page.evaluate(format => pudlCommands.run('export-' + format, null, document.querySelector('[data-applet]')), format);
    const result = await pending, filename = path.join(evidence, name + '.' + format); await result.saveAs(filename); return filename;
}
(async () => {
    for (const engine of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']) {
        const browser = await playwright[engine].launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1450, height: 950 } }); page.setDefaultTimeout(45000);
        const requests = []; page.on('request', request => requests.push(request.url()));
        try {
            await page.goto(`http://editor.localhost:${port}/`); await page.locator('.cm-editor').waitFor();
            await action(page, 'new', { path: '~/exports.md', text: source }); await action(page, 'view', { mode: 'split' });
            await page.locator('.sc-no-export').first().waitFor();
            await action(page, 'view', { mode: 'text' }); requests.length = 0;
            const paths = [];
            paths.push(await download(page, 'docx', engine + '-omitted'));
            paths.push(await download(page, 'pdf', engine + '-omitted'));
            assert.ok(!requests.some(url => url.includes('SECRET_IMAGE')));
            assert.equal((await action(page, 'document')).text, source);
            const clean = source.replace(/\{\{no-export\}\}[\s\S]*?\{\{\/no-export\}\}/g, '').replace(/\{\{draft-note\}\}[\s\S]*?\{\{\/draft-note\}\}/g, '');
            await action(page, 'new', { path: '~/clean.md', text: clean });
            paths.push(await download(page, 'docx', engine + '-clean'));
            paths.push(await download(page, 'pdf', engine + '-clean'));
            const exported = await action(page, 'export', { format: 'docx' }); assert.equal(exported.format, 'docx'); assert.ok(exported.blocks > 0);
            const checks = await page.evaluate(async () => {
                const E = await yavcMdEditor.exports(), m = await yavcMdEngine();
                function options(text, more) { return Object.assign({ text, engine: m.withMacros(text, '') }, more); }
                async function refuses(text) { return E.prepare(options(text)).then(() => false, () => true); }
                const paragraph = await refuses('{{style}}\np { display:flex; }\n{{/style}}\n\nParagraph.\n');
                const root = await refuses('{{style}}\ndisplay:flex;\n{{/style}}\n\nParagraph.\n');
                const malformed = await refuses('Before {{no-export}}unfinished');
                const remote = await refuses('![External](https://invalid.example/public.png)');
                const colored = await E.prepare(options('{{style}}\n.red { color:color(srgb 1 0 0); }\n{{/style}}\n\n{{class:red}}red{{/class}}\n'));
                const glyph = await E.build('pdf', options('Unsupported 😀')).then(() => false, err => /font cannot display/.test(err.message));
                let reads = 0;
                const stale = await E.build('docx', options('Text.', { current: () => false, read: () => { reads++; return ''; }, stylesheet: '~/sample.css' })).then(() => false, () => true);
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2; canvas.getContext('2d').fillRect(0, 0, 2, 2);
                const picture = await E.prepare(options('![Pixel](' + canvas.toDataURL() + ')\n'));
                const lines = await E.prepare(options('Soft line\ncontinues.  \nHard break.'));
                const spaces = await E.prepare(options('Before {{no-export}}secret{{/no-export}} after.'));
                return { paragraph, root, malformed, remote, red: colored.blocks[0].runs[0].color, glyph, stale, reads, image: picture.blocks[0].kind, lines: lines.blocks[0].runs.map(r => r.text).join(''), spaces: spaces.blocks[0].runs.map(r => r.text).join('') };
            });
            assert.deepEqual(checks, { paragraph: true, root: true, malformed: true, remote: true, red: 'ff0000', glyph: true, stale: true, reads: 0, image: 'image', lines: 'Soft line continues.\nHard break.', spaces: 'Before after.' });
            fs.writeFileSync(path.join(evidence, engine + '-paths.json'), JSON.stringify(paths));
            await page.screenshot({ path: path.join(evidence, engine + '-editor.png') });
            console.log(engine + ': DOCX/PDF downloads, action artifact, source retention, exclusion isolation, layout/font refusals, color and image conversion passed');
        } finally { await browser.close(); }
    }
})().catch(err => { console.error(err); process.exitCode = 1; });
