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
                    page.setDefaultTimeout(25000); page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { { const m = /\/lang\/([a-z]+)\.js/.exec(request.url()); if (m) fetched.push(m[1]); } });
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
                    assert.deepEqual(fetched, ['go'], engine + ': the Go grammar is fetched once, when the file opens, and no other');
                    const c = await colours(page, ['func', '"hi"', '42', '// Hello says hello.']);
                    for (const word of ['func', '"hi"', '42', '// Hello says hello.']) { assert.ok(c[word], engine + ': ' + word + ' has its own span'); assert.notEqual(c[word].color, c.plain, engine + ': ' + word + ' is coloured'); }
                    assert.notEqual(c.func.color, c['"hi"'].color, engine + ': a keyword and a string differ');
                    assert.ok(c['// Hello says hello.'].italic, engine + ': a comment is italic');
                    assert.equal(await page.locator('[data-role="lang"]').first().textContent(), 'Go', engine + ': the status bar says Go');
                    // The colours are the theme's tokens, so the Dark theme changes them, and each is readable against the editor's own background in both themes (a contrast of 4.5 or more).
                    const contrast = (a, b) => { const lum = c => { const unit = /^color\(/.test(c) ? 1 : 255, v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / unit).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }, x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
                    await run('open-file', { path: 'memory:main.go' }); await page.waitForTimeout(400);
                    const themed = {};
                    for (const theme of ['light', 'dark']) {
                        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme); await page.waitForTimeout(250);
                        const now = await colours(page, ['func', '"hi"', '42', '// Hello says hello.']), background = await page.evaluate(() => getComputedStyle(document.querySelector('.cm-editor')).backgroundColor);
                        themed[theme] = now;
                        for (const word of ['func', '"hi"', '42', '// Hello says hello.']) assert.ok(contrast(now[word].color, background) >= 4.5, engine + ' ' + theme + ': ' + word + ' is readable (' + now[word].color + ' on ' + background + ' is ' + contrast(now[word].color, background).toFixed(2) + ')');
                    }
                    assert.notEqual(themed.light.func.color, themed.dark.func.color, engine + ': the Dark theme changes the colour, so it comes from the theme');
                    await page.evaluate(() => { delete document.documentElement.dataset.theme; });
                    // High contrast (forced colours): the system's colours replace ours, so the words are the system text colour on the system background, and a comment is still italic.
                    let forced = true;
                    try { await page.emulateMedia({ forcedColors: 'active' }); } catch (e) { forced = false; }
                    if (forced) {
                        await page.waitForTimeout(300);
                        const hc = await colours(page, ['func', '// Hello says hello.']), bg = await page.evaluate(() => getComputedStyle(document.querySelector('.cm-editor')).backgroundColor);
                        if (hc.func && hc.func.color === hc.plain) {
                            assert.ok(contrast(hc.func.color, bg) >= 7, engine + ' high contrast: words are the system text colour on the system background (' + hc.func.color + ' on ' + bg + ')');
                            assert.ok(hc['// Hello says hello.'].italic, engine + ' high contrast: a comment is still told apart by italics');
                        } else assert.ok(hc.func && contrast(hc.func.color, bg) >= 4.5, engine + ' high contrast: coloured words stay readable');
                        await page.emulateMedia({ forcedColors: 'none' });
                    } else console.log(engine + ': forced colours cannot be emulated here, so high contrast was not checked');
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
                    await call('set-text', { text: 'Words\n\n```ruby\nfunc = 42\n```\n\n```text\nfunc 42\n```\n' }); await call('view', { mode: 'text' });
                    await page.locator('.cm-content').waitFor(); await page.waitForTimeout(900);
                    assert.deepEqual(fetched, [], engine + ': a fence of a language with no grammar, and a text fence, fetch nothing');
                    await call('set-text', { text: 'Words\n\n```go\npackage main\n\nfunc main() {\n\tprintln("hi")\n}\n```\n' });
                    await page.waitForFunction(() => Array.from(document.querySelectorAll('.cm-content span')).some(s => s.textContent === 'func'));
                    await page.waitForTimeout(400);
                    assert.deepEqual(fetched, ['go'], engine + ': a Go fence fetches the grammar once, and no other');
                    const c = await colours(page, ['func', '"hi"']);
                    assert.ok(c.func && c['"hi"'], engine + ': the fence has coloured words');
                    assert.notEqual(c.func.color, c.plain, engine + ': a keyword in the fence is coloured');
                    assert.notEqual(c['"hi"'].color, c.plain, engine + ': a string in the fence is coloured');
                    // A fence inside a list item and inside a quote is coloured too.
                    for (const [what, text] of [['a list item', '- item\n\n  ```go\n  func main() {\n  \tprintln("hi")\n  }\n  ```\n'], ['a quote', '> ```go\n> func main() {\n> \tprintln("hi")\n> }\n> ```\n'], ['a numbered item in a quote', '> 1. item\n>\n>    ```go\n>    func main() {}\n>    ```\n']]) {
                        await call('set-text', { text }); await page.waitForTimeout(900);
                        const n = await colours(page, ['func']);
                        assert.ok(n.func, engine + ': the fence in ' + what + ' has coloured words');
                        assert.notEqual(n.func.color, n.plain, engine + ': a keyword in a fence in ' + what + ' is coloured');
                    }
                    await call('set-text', { text: 'Words\n\n```go\npackage main\n\nfunc main() {\n\tprintln("hi")\n}\n```\n' }); await page.waitForTimeout(500);
                    assert.equal((await call('document')).text.includes('```go\npackage main'), true, engine + ': the text is unchanged');
                    assert.deepEqual(errors, []); await page.close();
                }

                // The other languages of the core set, each in a page of its own so that only its grammar can have been fetched.
                for (const [id, file, name, words] of [['c', 'hello.c', 'C', ['return', '"hi"', '42', '/* Hello says hello. */']], ['csharp', 'hello.cs', 'C#', ['class', '"hi"', '42', '// Hello says hello.']], ['python', 'hello.py', 'Python', ['def', '"hi"', '42', '# Hello says hello.']]]) {
                    phase = 'a ' + name + ' file in the Editor';
                    const { page, errors, fetched } = await open('editor');
                    await page.locator('#source .cm-content').waitFor();
                    await page.evaluate(path => pudlActions.run('yavc.editor/open-file@1', { path }, { grant: 'all' }), 'memory:' + file);
                    await page.waitForFunction(w => Array.from(document.querySelectorAll('.cm-content span')).some(s => s.textContent === w), words[0]); await page.waitForTimeout(400);
                    assert.deepEqual(fetched, [id], engine + ': opening a ' + name + ' file fetches its grammar and no other');
                    const c = await colours(page, words);
                    for (const word of words) { assert.ok(c[word], engine + ' ' + name + ': ' + word + ' has its own span'); assert.notEqual(c[word].color, c.plain, engine + ' ' + name + ': ' + word + ' is coloured'); }
                    assert.notEqual(c[words[0]].color, c['"hi"'].color, engine + ' ' + name + ': a keyword and a string differ');
                    assert.ok(c[words[3]].italic, engine + ' ' + name + ': a comment is italic');
                    assert.equal(await page.locator('[data-role="lang"]').first().textContent(), name, engine + ': the status bar says ' + name);
                    assert.deepEqual(errors, []); await page.close();
                }

                phase = 'fences of every language and their other names in Docs';
                {
                    const { page, errors, fetched } = await open('docs');
                    await page.locator('#document .ProseMirror').waitFor();
                    const call = (name, input = {}) => page.evaluate(({ name, input }) => pudlActions.run('yavc.docs/' + name + '@1', input, { grant: 'all' }), { name, input });
                    await call('view', { mode: 'text' });
                    for (const [info, id, keyword, code] of [['golang', 'go', 'func', 'func main() {}'], ['c', 'c', 'return', 'int main() { return 0; }'], ['cs', 'csharp', 'class', 'class A {}'], ['c#', 'csharp', 'class', 'class B {}'], ['py', 'python', 'def', 'def f(): pass'], ['python3', 'python', 'def', 'def g(): pass']]) {
                        await call('set-text', { text: '```' + info + '\n' + code + '\n```\n' }); await page.waitForTimeout(900);
                        const n = await colours(page, [keyword]);
                        assert.ok(n[keyword], engine + ': a fence called ' + info + ' has coloured words');
                        assert.notEqual(n[keyword].color, n.plain, engine + ': a fence called ' + info + ' is coloured');
                        assert.ok(fetched.includes(id), engine + ': a fence called ' + info + ' fetched ' + id);
                    }
                    assert.deepEqual([...new Set(fetched)].sort(), ['c', 'csharp', 'go', 'python'], engine + ': each grammar was fetched, and only those');
                    assert.equal(fetched.length, 4, engine + ': each grammar was fetched once');
                    assert.deepEqual(errors, []); await page.close();
                }
                console.log(engine + ': Go, C, C# and Python are coloured in the Editor and in Docs fences, and load only when needed');
            } catch (err) { console.error(engine, phase); throw err; } finally { await browser.close(); }
        }
    } finally { server.close(); }
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
