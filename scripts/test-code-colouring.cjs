// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Go source is coloured in the Editor's Text view and in a Go fence in Docs' Text view, and the grammar is fetched only when a file or a fence of that language appears (DESIGN.md decision 188). A file of another type stays plain, and the status bar names the language. Against a built content package in an independent host:
//   node scripts/test-code-colouring.cjs <artifact> [chromium firefox webkit]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/independent/content-release/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
(async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8')), allowed = new Set(manifest.files.map(f => f.path));
    const server = http.createServer(async (req, res) => {
        try {
            const u = new URL(req.url, 'http://localhost'); if (!u.pathname.startsWith(prefix)) return res.writeHead(404).end();
            const name = decodeURIComponent(u.pathname.slice(prefix.length)); if (!allowed.has(name)) return res.writeHead(404).end();
            res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream'); res.end(await fs.readFile(path.join(artifact, name)));
        } catch (error) { res.writeHead(500).end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const engine of process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit']) {
            const browser = await pw[engine].launch({ headless: true }); let phase = 'startup';
            try {
                // What colour a word has in the Text view, as the browser draws it, against the colour of plain text there.
                const colours = (page, words) => page.evaluate(words => {
                    const content = document.querySelector('.cm-content'), plain = getComputedStyle(content).color, out = { plain };
                    for (const word of words) {
                        const span = Array.from(content.querySelectorAll('span')).find(s => s.children.length === 0 && s.textContent === word);
                        out[word] = span ? { color: getComputedStyle(span).color, italic: getComputedStyle(span).fontStyle === 'italic' } : null;
                    }
                    return out;
                }, words);
                const open = async apps => {
                    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [], fetched = [];
                    page.setDefaultTimeout(25000); page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/\/lang\/go\.js/.test(request.url())) fetched.push(request.url()); });
                    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}workspace-lab/index.html?apps=${apps}`);
                    return { page, errors, fetched };
                };

                phase = 'a Go file in the Editor';
                {
                    const { page, errors, fetched } = await open('editor');
                    await page.locator('#source .cm-content').waitFor();
                    const run = (name, input) => page.evaluate(({ name, input }) => pudlActions.run('yavc.editor/' + name + '@1', input, { grant: 'all' }), { name, input });
                    await run('open-file', { path: 'memory:notes.txt' }); await page.waitForTimeout(600);
                    assert.deepEqual(fetched, [], engine + ': a plain text file does not fetch the Go grammar');
                    assert.equal(await page.locator('[data-role="lang"]').first().textContent(), 'Plain Text');
                    await run('open-file', { path: 'memory:main.go' });
                    await page.waitForFunction(() => Array.from(document.querySelectorAll('.cm-content span')).some(s => s.textContent === 'func'));
                    await page.waitForTimeout(400);
                    assert.equal(fetched.length, 1, engine + ': the Go grammar is fetched once, when the file opens');
                    const c = await colours(page, ['func', '"hi"', '42', '// Hello says hello.']);
                    for (const word of ['func', '"hi"', '42', '// Hello says hello.']) { assert.ok(c[word], engine + ': ' + word + ' has its own span'); assert.notEqual(c[word].color, c.plain, engine + ': ' + word + ' is coloured'); }
                    assert.notEqual(c.func.color, c['"hi"'].color, engine + ': a keyword and a string differ');
                    assert.ok(c['// Hello says hello.'].italic, engine + ': a comment is italic');
                    assert.equal(await page.locator('[data-role="lang"]').first().textContent(), 'Go', engine + ': the status bar says Go');
                    // The plain text file beside it, which says "func" too, is still plain.
                    await run('open-file', { path: 'memory:notes.txt' }); await page.waitForTimeout(400);
                    assert.equal(await page.locator('[data-role="lang"]').first().textContent(), 'Plain Text');
                    assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('.cm-content span')).filter(s => s.textContent === 'func').length), 0, engine + ': a .txt file is not coloured');
                    assert.deepEqual(errors, []); await page.close();
                }

                phase = 'a fence in Docs';
                {
                    const { page, errors, fetched } = await open('docs');
                    await page.locator('#document .ProseMirror').waitFor();
                    const call = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }), { name, input });
                    await call('set-text', { text: 'Words\n\n```python\nfunc = 42\n```\n\n```text\nfunc 42\n```\n' }); await call('view', { mode: 'text' });
                    await page.locator('.cm-content').waitFor(); await page.waitForTimeout(900);
                    assert.deepEqual(fetched, [], engine + ': a fence of another language does not fetch the Go grammar');
                    await call('set-text', { text: 'Words\n\n```go\npackage main\n\nfunc main() {\n\tprintln("hi")\n}\n```\n' });
                    await page.waitForFunction(() => Array.from(document.querySelectorAll('.cm-content span')).some(s => s.textContent === 'func'));
                    await page.waitForTimeout(400);
                    assert.equal(fetched.length, 1, engine + ': a Go fence fetches the grammar once');
                    const c = await colours(page, ['func', '"hi"']);
                    assert.ok(c.func && c['"hi"'], engine + ': the fence has coloured words');
                    assert.notEqual(c.func.color, c.plain, engine + ': a keyword in the fence is coloured');
                    assert.notEqual(c['"hi"'].color, c.plain, engine + ': a string in the fence is coloured');
                    assert.equal((await call('document')).text.includes('```go\npackage main'), true, engine + ': the text is unchanged');
                    assert.deepEqual(errors, []); await page.close();
                }
                console.log(engine + ': Go is coloured in the Editor and in a Docs fence, and loads only when needed');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
