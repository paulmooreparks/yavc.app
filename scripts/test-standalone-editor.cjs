// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The Editor in a standalone document host (docs/standalone-host-brief.md). The host
// is another repository's program: a document service that shows one document in each
// window and keeps the files, the unsaved text and the settings behind them. This test
// starts that service headless, opens its pages in a browser of its own, and proves the
// contracts the Editor depends on against real files in a folder made for the run.
//
//   node scripts/test-standalone-editor.cjs <host executable> [engines]
//
// The service is started with --document-service --headless --dir <state folder>, and
// writes service.json there with its address and token. Its control interface says which
// windows it would have started and takes what the system's Open and Save dialogs would
// choose. A real window, its taskbar entry and the system's own dialogs are the host's
// to prove.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), {spawn} = require('node:child_process'), pw = require('playwright');
const exe = process.argv[2] && path.resolve(process.argv[2]);
if (!exe || !fs.existsSync(exe)) { console.error('Give the standalone host executable as the first argument.'); process.exit(2); }
const engines = process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(what, test, ms = 15000) {
    const end = Date.now() + ms; let last;
    for (;;) { last = await test(); if (last) return last; if (Date.now() > end) throw new Error('Timed out waiting for ' + what); await wait(100); }
}

async function startService(work) {
    const state = path.join(work, 'state'); fs.mkdirSync(state, {recursive: true});
    const child = spawn(exe, ['--document-service', '--headless', '--dir', state], {stdio: 'ignore'});
    const file = path.join(state, 'service.json');
    await until('the service to write service.json', () => fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim().endsWith('}'));
    const service = JSON.parse(fs.readFileSync(file, 'utf8')), origin = 'http://' + service.addr;
    async function control(method, route, body) {
        const response = await fetch(origin + '/control' + route, {method, headers: {Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
        const text = await response.text();
        if (!response.ok) throw new Error(method + ' ' + route + ' answered ' + response.status + ': ' + text.trim());
        return text.trim() ? JSON.parse(text) : null;
    }
    return {origin, control, stop: async () => { await control('POST', '/stop', {}).catch(() => {}); child.kill(); }};
}

(async () => {
    for (const engine of engines) {
        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'yavc-standalone-' + engine + '-')), folder = path.join(work, 'documents'); fs.mkdirSync(folder);
        const service = await startService(work), control = service.control, browser = await pw[engine].launch({headless: true});
        const errors = [], outside = [];
        const file = name => path.join(folder, name), disk = name => fs.readFileSync(file(name), 'utf8');
        // Each window is a page in a browser context of its own, as each real window is a process of its own.
        async function show(entry) {
            const context = await browser.newContext({viewport: {width: 1200, height: 900}}), page = await context.newPage();
            page.setDefaultTimeout(20000);
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', request => { const url = request.url(); if (!url.startsWith(service.origin + '/') && !/^(data|blob|about):/.test(url)) outside.push(url); });
            await page.goto(entry);
            await page.locator('#document .cm-content').waitFor({state: 'attached'});
            await page.waitForFunction(() => document.querySelector('#document').getAttribute('data-applet-state') === 'running');
            return page;
        }
        const open = async name => { const opened = await control('POST', '/open', {application: 'editor', path: name ? file(name) : ''}); assert.equal(opened.existing, false); return {id: opened.id, page: await show(opened.entry)}; };
        const text = page => page.evaluate(() => CM.EditorView.findFromDOM(document.querySelector('#document .cm-editor')).state.doc.toString());
        const type = async (page, words) => { await page.locator('#document .cm-content').click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type(words); };
        const run = (page, command) => page.evaluate(id => pudlCommands.run(id, null, document.querySelector('#document')).then(value => ({value}), error => ({error: error.message})), command);
        const listed = async id => (await control('GET', '/documents')).find(d => d.id === id);
        const shows = (id, name, changed) => until('document ' + id + ' to show ' + (name || 'no file') + (changed === undefined ? '' : changed ? ', changed' : ', unchanged'), async () => { const d = await listed(id); return d && (name ? d.path && path.resolve(d.path) === file(name) : !d.path) && (changed === undefined || d.changed === changed) && d; });
        const started = async () => control('GET', '/started');
        // A window the service would have started for another window's request.
        const nextWindow = async before => until('the service to start a window', async () => { const all = await started(); return all.length > before && all[all.length - 1]; });
        // Closing a window as its process does: the service has the page send what it holds, and says whether to ask first.
        const close = async (id, page) => { const asked = await control('POST', '/window/' + id + '/closing', {}); await control('POST', '/window/' + id + '/closed', {}); await page.context().close(); return asked.ask; };
        let phase = 'start';
        try {
            fs.writeFileSync(file('notes.txt'), 'First line.\n'); fs.writeFileSync(file('other.txt'), 'Another file.\n');
            fs.writeFileSync(file('notes.md'), '# Heading {#top}\n\nA paragraph with [a link](https://example.com/){target="_blank" rel="noopener"}.\n\n![Chart](/images/chart.png)\n');

            phase = 'open, edit and save a real file';
            const first = await open('notes.txt');
            assert.equal(await first.page.evaluate(() => pudlHost.documentWindows.mode(document.querySelector('#document'))), 'single');
            assert.equal(await text(first.page), 'First line.\n');
            await type(first.page, 'Saved words.\n'); await shows(first.id, 'notes.txt', true);
            assert.deepEqual(await run(first.page, 'save'), {value: true});
            assert.equal(disk('notes.txt'), 'First line.\nSaved words.\n'); await shows(first.id, 'notes.txt', false);

            phase = 'a save refused after the file changed on disk';
            await type(first.page, 'Kept words.\n');
            fs.writeFileSync(file('notes.txt'), 'Another program wrote this.\n');
            const refused = await run(first.page, 'save');
            assert.notDeepEqual(refused, {value: true});
            assert.equal(disk('notes.txt'), 'Another program wrote this.\n');
            assert.equal(await text(first.page), 'First line.\nSaved words.\nKept words.\n');
            const said = await first.page.evaluate(() => [...document.querySelectorAll('#document [data-role=message], .notice, .toast-region')].filter(n => !n.hidden && n.textContent.trim()).map(n => n.textContent.trim()).join(' | '));
            assert.match(said, /changed/i, 'the Editor says why the save was refused'); await shows(first.id, 'notes.txt', true);

            phase = 'Save As keeps the text elsewhere, and a refused name asks again';
            await control('POST', '/dialogs', {save: [file('copy.docx'), file('copy.txt')]});
            const savedAs = await run(first.page, 'save-as'); assert.equal(savedAs.error, undefined, savedAs.error);
            await shows(first.id, 'copy.txt', false);
            assert.equal(disk('copy.txt'), 'First line.\nSaved words.\nKept words.\n'); assert.equal(fs.existsSync(file('copy.docx')), false);
            assert.equal(disk('notes.txt'), 'Another program wrote this.\n');
            await type(first.page, 'After the move.\n'); assert.deepEqual(await run(first.page, 'save'), {value: true});
            assert.equal(disk('copy.txt'), 'First line.\nSaved words.\nKept words.\nAfter the move.\n');

            phase = 'a blank window opens a file in place';
            const blank = await open(''), windowsBefore = (await started()).length;
            assert.equal(await text(blank.page), '');
            await control('POST', '/dialogs', {open: [file('other.txt')]});
            const inPlace = await run(blank.page, 'open'); assert.equal(inPlace.error, undefined, inPlace.error);
            await shows(blank.id, 'other.txt', false); assert.equal(await text(blank.page), 'Another file.\n');
            assert.equal((await started()).length, windowsBefore);
            await type(blank.page, 'Added.\n'); assert.deepEqual(await run(blank.page, 'save'), {value: true}); assert.equal(disk('other.txt'), 'Another file.\nAdded.\n');

            phase = 'New from a window in use arrives in another window';
            let count = (await started()).length;
            const newRequest = run(blank.page, 'new'), newWindow = await nextWindow(count);
            assert.equal(newWindow.raised, false); assert.ok(newWindow.entry);
            const fresh = {id: newWindow.id, page: await show(newWindow.entry)};
            assert.equal((await newRequest).error, undefined); assert.equal(await text(fresh.page), ''); await shows(fresh.id, null);
            assert.equal(await text(blank.page), 'Another file.\nAdded.\n');

            phase = 'an untitled document is saved through Save As and is not claimed as kept';
            await type(fresh.page, 'Never saved before.\n'); await shows(fresh.id, null, true);
            assert.equal((await control('POST', '/window/' + fresh.id + '/closing', {})).ask, true);
            await control('POST', '/dialogs', {save: [file('made.txt')]});
            const firstSave = await run(fresh.page, 'save'); assert.equal(firstSave.error, undefined, firstSave.error);
            await shows(fresh.id, 'made.txt', false); assert.equal(disk('made.txt'), 'Never saved before.\n');

            phase = 'Open from a window in use arrives in another window';
            count = (await started()).length;
            await control('POST', '/dialogs', {open: [file('notes.txt')]});
            const openRequest = run(fresh.page, 'open'), openWindow = await nextWindow(count);
            assert.equal(openWindow.raised, false); assert.equal(path.resolve(openWindow.path), file('notes.txt'));
            const second = {id: openWindow.id, page: await show(openWindow.entry)};
            assert.equal((await openRequest).error, undefined); await shows(second.id, 'notes.txt', false);
            assert.equal(await text(second.page), 'Another program wrote this.\n'); assert.equal(await text(fresh.page), 'Never saved before.\n');

            phase = 'Open of a file another window shows raises that window';
            count = (await started()).length;
            await control('POST', '/dialogs', {open: [file('other.txt')]});
            const raiseRequest = run(fresh.page, 'open'), raised = await nextWindow(count);
            assert.equal(raised.raised, true); assert.ok(!raised.entry); assert.equal((await raiseRequest).error, undefined);
            assert.equal((await control('GET', '/documents')).filter(d => d.path && path.resolve(d.path) === file('other.txt')).length, 1);
            assert.equal(await text(fresh.page), 'Never saved before.\n');

            phase = 'unsaved text comes back after the page is dropped';
            await type(second.page, 'Draft words.\n'); await shows(second.id, 'notes.txt', true); await wait(1500);
            await second.page.context().close();
            second.page = await show((await control('POST', '/window/' + second.id + '/entry', {})).entry);
            assert.equal(await text(second.page), 'Another program wrote this.\nDraft words.\n'); await shows(second.id, 'notes.txt', true);
            assert.equal(disk('notes.txt'), 'Another program wrote this.\n');

            phase = 'unsaved text comes back after the window closes, and saves when the file is unchanged';
            assert.equal(await close(second.id, second.page), false);
            await until('the closed window to leave the list', async () => !(await listed(second.id)));
            const again = await open('notes.txt');
            assert.equal(await text(again.page), 'Another program wrote this.\nDraft words.\n'); await shows(again.id, 'notes.txt', true);
            // A window with a file closes without a question, so the Editor has to say that the text came back.
            await again.page.waitForFunction(() => /unsaved changes to notes\.txt are back/i.test(document.querySelector('#document [data-role=message]').textContent));
            assert.deepEqual(await run(again.page, 'save'), {value: true}); assert.equal(disk('notes.txt'), 'Another program wrote this.\nDraft words.\n');

            phase = 'a draft whose file changed while the window was closed is kept and does not replace the file';
            await type(again.page, 'Second draft.\n'); await shows(again.id, 'notes.txt', true); await wait(1500);
            assert.equal(await close(again.id, again.page), false);
            await until('the closed window to leave the list', async () => !(await listed(again.id)));
            fs.writeFileSync(file('notes.txt'), 'Changed while closed.\n');
            const stale = await open('notes.txt');
            assert.equal(await text(stale.page), 'Another program wrote this.\nDraft words.\nSecond draft.\n');
            const warning = stale.page.locator('.notice.warn:visible'); await warning.waitFor();
            assert.match(await warning.innerText(), /notes\.txt was changed elsewhere after you edited it, so Save is unavailable/);
            assert.match((await run(stale.page, 'save')).error || '', /no longer matches/); assert.equal(disk('notes.txt'), 'Changed while closed.\n');
            await control('POST', '/dialogs', {save: [file('rescued.txt')]});
            const rescued = await run(stale.page, 'save-as'); assert.equal(rescued.error, undefined, rescued.error);
            await shows(stale.id, 'rescued.txt', false); assert.equal(disk('rescued.txt'), 'Another program wrote this.\nDraft words.\nSecond draft.\n'); assert.equal(disk('notes.txt'), 'Changed while closed.\n');
            await warning.waitFor({state: 'hidden'});

            // The Editor is a text editor and Markdown's page views are Docs' (DESIGN.md decision 131), so in this host a Markdown file
            // opens as its text, with no View choice. The rich view of a Markdown file, and with it the web root's pictures at a site
            // path (Set Web Root), return to this test when the host hands Markdown files to Docs.
            phase = 'a Markdown file opens as its text and saves, with its attribute blocks kept';
            const markdown = await open('notes.md');
            assert.equal(await markdown.page.locator('#document .ProseMirror').count(), 0, 'the Editor draws no page view');
            assert.equal(await markdown.page.evaluate(() => pudlCommands.run('view-visual', null, document.querySelector('#document')).then(() => 'ran', error => error.message)), 'there is no command view-visual');
            assert.equal(await text(markdown.page), '# Heading {#top}\n\nA paragraph with [a link](https://example.com/){target="_blank" rel="noopener"}.\n\n![Chart](/images/chart.png)\n');
            await markdown.page.locator('#document .cm-line').filter({hasText: 'A paragraph'}).click(); await markdown.page.keyboard.press('End'); await markdown.page.keyboard.type(' More.');
            assert.deepEqual(await run(markdown.page, 'save'), {value: true});
            assert.equal(disk('notes.md'), '# Heading {#top}\n\nA paragraph with [a link](https://example.com/){target="_blank" rel="noopener"}. More.\n\n![Chart](/images/chart.png)\n');

            phase = 'another program acts on a document only with the person\'s leave';
            const act = request => control('POST', '/documents/' + first.id + '/invoke', {request, from: 'package test'}).then(value => ({value}), error => ({error: error.message}));
            const permission = first.page.locator('#document-permission');
            let acting = act({operation: 'document', input: {}}); await permission.waitFor();
            assert.match(await permission.innerText(), /package test/); await permission.locator('button[value=refuse]').click();
            assert.ok((await acting).error, 'a refused action fails');
            acting = act({operation: 'set-text', input: {text: 'Written by another program.\n'}}); await permission.waitFor(); await permission.locator('button[value=once]').click();
            const acted = await acting; assert.equal(acted.error, undefined, acted.error);
            assert.equal(await text(first.page), 'Written by another program.\n'); await shows(first.id, 'copy.txt', true);
            assert.equal(disk('copy.txt'), 'First line.\nSaved words.\nKept words.\nAfter the move.\n');

            phase = 'a file outside what the person chose is refused';
            fs.writeFileSync(path.join(work, 'private.txt'), 'Not chosen.\n');
            const reach = await markdown.page.evaluate(async target => {
                const read = await pudlHost.contentResources.read({resource: target}).then(() => 'read', () => 'refused');
                const beside = await Promise.resolve(pudlHost.fs.readText(target)).then(value => value == null ? 'refused' : 'read', () => 'refused');
                return [read, beside];
            }, path.join(work, 'private.txt'));
            assert.deepEqual(reach, ['refused', 'refused']);

            assert.deepEqual(errors, []); assert.deepEqual(outside, []);
            console.log(engine + ': a standalone Editor opens, saves, refuses a stale save, saves elsewhere, routes New and Open to other windows, raises an open file, keeps drafts across reload and close, keeps a Markdown file\'s text, and asks before another program acts passed');
        } catch (error) {
            console.error(engine + ' failed in: ' + phase, errors, outside, JSON.stringify(await control('GET', '/documents').catch(() => null)));
            throw error;
        } finally { await browser.close(); await service.stop(); }
    }
})().catch(error => { console.error(error); process.exit(1); });
