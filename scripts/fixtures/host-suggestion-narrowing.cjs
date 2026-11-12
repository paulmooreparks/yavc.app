// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A host suggestion is marked no wider than what it changes: the changed
// row of a table and the changed words of a paragraph, in both views.
const path = require('node:path'), os = require('node:os');
const TEXT = [
    '# Narrowing', '',
    'A long paragraph opens with alpha words, then has the single beta word, and goes on for long enough that marking all of it would hide the change.', '',
    '| Key | Meaning | Note |', '| --- | --- | --- |', '| F1 | Cash | first |', '| F2 | Card | second |', '| F3 | Gift | third |', '',
    '{{raw}}', '<table><tbody>', '<tr><td>R1</td><td>one</td></tr>', '<tr><td>R2</td><td>two</td></tr>', '</tbody></table>', '{{/raw}}', ''
].join('\n');
module.exports = async function (page, action, assert) {
    const publish = (revision, items) => page.evaluate(([text, revision, items]) => {
        fixture.overlays.publish('memory:document.docs.md', { revision: revision, text: text, items: items.map(function (item) {
            var start = text.indexOf(item.before);
            return { id: item.id, start: start, end: start + item.before.length, before: item.before, after: item.after, author: 'Agent' };
        }) });
    }, [TEXT, revision, items]);
    const paragraph = TEXT.split('\n')[2];
    await action('docs', 'set-text', { text: TEXT });
    await publish('narrow-1', [
        { id: 'word', before: paragraph, after: paragraph.replace('beta', 'gamma') },
        { id: 'row', before: '| F2 | Card | second |', after: '| F2 | Debit | second |' }
    ]);
    await action('docs', 'view', { mode: 'visual' });
    const rich = '#document .ProseMirror';
    await page.locator(rich + ' [data-host-suggestion="row"]').waitFor();
    await page.locator(rich + ' tr.pm-sugg-old').waitFor();
    const drawn = await page.evaluate(rich => {
        const root = document.querySelector(rich), texts = selector => Array.from(root.querySelectorAll(selector)).map(node => node.textContent.trim());
        return {
            tables: root.querySelectorAll('table.pm-sugg-old').length, paragraphs: root.querySelectorAll('p.pm-sugg-old').length,
            rows: texts('tr.pm-sugg-old'), words: texts('.pm-sugg-word').sort(),
            cells: texts('[data-host-suggestion="row"] .host-suggestion-cell'),
            rowChange: [texts('[data-host-suggestion="row"] del'), texts('[data-host-suggestion="row"] ins')],
            wordChange: [texts('[data-host-suggestion="word"] del'), texts('[data-host-suggestion="word"] ins')],
            context: texts('[data-host-suggestion="word"] .host-suggestion-context')
        };
    }, rich);
    assert.equal(drawn.tables, 0, 'A change to one row must not mark the whole table.');
    assert.equal(drawn.paragraphs, 0, 'A change to one word must not mark the whole paragraph.');
    assert.equal(drawn.rows.length, 1); assert.match(drawn.rows[0], /F2\s*Card\s*second/);
    assert.deepEqual(drawn.words, ['Card', 'beta']);
    assert.equal(drawn.cells.length, 3); assert.deepEqual(drawn.rowChange, [['Card'], ['Debit']]);
    assert.deepEqual(drawn.wordChange, [['beta'], ['gamma']]);
    assert.equal(drawn.context.length, 2); assert.match(drawn.context[0], /^A long paragraph.*single$/); assert.match(drawn.context[1], /^word, and goes on.*…$/);
    // The card for a changed row is a row of the table, straight after it, with one cell across every column, and it is no part of the document.
    const card = await page.evaluate(rich => {
        const row = document.querySelector(rich + ' tr.host-suggestion-row'), cell = row && row.firstElementChild, before = row && row.previousElementSibling;
        return { found: !!row, after: before ? before.classList.contains('pm-sugg-old') && /F2/.test(before.textContent) : false, span: cell && cell.colSpan, columns: before && before.cells.length,
            kinds: cell && Array.from(cell.children).map(node => node.getAttribute('role')), roles: Array.from(row ? row.querySelectorAll('[role="row"],[role="cell"]') : []).length, ownRole: row && row.getAttribute('role'),
            inBody: row && row.parentElement.tagName, outside: document.querySelectorAll(rich + ' > .host-suggestion[data-host-suggestion="row"]').length };
    }, rich);
    assert.equal(card.found, true); assert.equal(card.after, true, 'The card comes straight after the changed row.');
    assert.equal(card.span, card.columns); assert.deepEqual(card.kinds, ['note']); assert.equal(card.roles, 0); assert.equal(card.ownRole, null, 'The row keeps its own table meaning.');
    assert.equal(card.outside, 0, 'The card is not also placed after the table.');
    assert.equal((await action('docs', 'document')).text, TEXT, 'The card is not part of the document.');
    // The keyboard moves through the table past the card: the card is not a cell, and Down from the changed row goes to the next data row and Up comes back.
    const caretRow = () => page.evaluate(() => { const node = getSelection().anchorNode, row = node && (node.nodeType === 1 ? node : node.parentElement).closest('tr'); return row ? row.textContent.trim().replace(/\s+/g, ' ') : null; });
    await page.locator(rich + ' tr.pm-sugg-old td').last().click();
    assert.match(await caretRow(), /F2/);
    await page.locator(rich + ' tr.pm-sugg-old td').last().click();
    await page.keyboard.press('ArrowDown'); assert.match(await caretRow(), /F3/, 'Down goes from the changed row to the next data row, past the card.');
    await page.keyboard.press('ArrowUp'); assert.match(await caretRow(), /F2/);
    // In Text view the same two suggestions strike only the changed words.
    await action('docs', 'view', { mode: 'text' });
    await page.locator('#document .cm-editor [data-host-suggestion="row"]').waitFor();
    assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('#document .cm-editor .host-suggestion-old')).map(node => node.textContent).sort()), ['Card', 'beta']);
    // A change that spans rows marks those rows; one that the rows cannot hold marks the table.
    await publish('narrow-2', [{ id: 'rows', before: '| F1 | Cash | first |\n| F2 | Card | second |', after: '| F1 | Coins | first |\n| F2 | Card | later |' }]);
    await action('docs', 'view', { mode: 'visual' });
    await page.locator(rich + ' [data-host-suggestion="rows"]').waitFor();
    await page.waitForFunction(rich => document.querySelectorAll(rich + ' tr.pm-sugg-old').length === 2, rich);
    assert.deepEqual(await page.evaluate(rich => [document.querySelectorAll(rich + ' table.pm-sugg-old').length, document.querySelectorAll(rich + ' .pm-sugg-word').length], rich), [0, 0]);
    await publish('narrow-3', [{ id: 'shape', before: '| --- | --- | --- |', after: '| :-- | --- | --- |' }]);
    await page.locator(rich + ' [data-host-suggestion="shape"]').waitFor();
    await page.waitForFunction(rich => document.querySelectorAll(rich + ' table.pm-sugg-old').length === 1 && !document.querySelector(rich + ' tr.pm-sugg-old'), rich);
    // An insertion has no old words to strike, so the row it lands in is marked.
    await publish('narrow-4', [{ id: 'added', before: '| F3 | Gift | third |', after: '| F3 | Gift Card | third |' }]);
    await page.locator(rich + ' [data-host-suggestion="added"]').waitFor();
    await page.waitForFunction(rich => { var rows = document.querySelectorAll(rich + ' tr.pm-sugg-old'); return rows.length === 1 && /F3/.test(rows[0].textContent) && !document.querySelector(rich + ' table.pm-sugg-old'); }, rich);
    assert.deepEqual(await page.evaluate(rich => Array.from(document.querySelectorAll(rich + ' [data-host-suggestion="added"] ins')).map(node => node.textContent.trim()), rich), ['Card']);
    // A table written as HTML in the host's literal container has a line for each row too.
    await publish('narrow-raw', [{ id: 'literal', before: '<tr><td>R2</td><td>two</td></tr>', after: '<tr><td>R2</td><td>deux</td></tr>' }]);
    await page.locator(rich + ' [data-host-suggestion="literal"]').waitFor();
    await page.waitForFunction(rich => { var rows = document.querySelectorAll(rich + ' tr.pm-sugg-old'); return rows.length === 1 && /R2/.test(rows[0].textContent) && !document.querySelector(rich + ' table.pm-sugg-old'); }, rich);
    assert.deepEqual(await page.evaluate(rich => Array.from(document.querySelectorAll(rich + ' .pm-sugg-word')).map(node => node.textContent), rich), ['two']);
    // The card for a change in the literal container's table follows the changed row too.
    assert.equal(await page.evaluate(rich => { const row = document.querySelector(rich + ' tr.host-suggestion-row'); return !!row && /R2/.test(row.previousElementSibling.textContent) && row.firstElementChild.colSpan === row.previousElementSibling.cells.length; }, rich), true);
    // A long table across pages: its header is repeated the same with a card row in it as without, and the page keeps no sign of the card in a PDF.
    const LONG = ['# Long table', '', '| Key | Meaning | Note |', '| --- | --- | --- |'].concat(Array.from({ length: 150 }, (_, i) => '| K' + i + ' | Value ' + i + ' | note ' + i + ' |'), ['']).join('\n');
    const publishLong = items => page.evaluate(([text, items]) => fixture.overlays.publish('memory:document.docs.md', { revision: 'long-' + items.length + Math.random(), text: text, items: items.map(item => { const start = text.indexOf(item.before); return { id: item.id, start: start, end: start + item.before.length, before: item.before, after: item.after, author: 'Agent' }; }) }), [LONG, items]);
    await action('docs', 'set-text', { text: LONG }); await publishLong([]); await action('docs', 'view', { mode: 'document' });
    await page.waitForFunction(() => +(document.querySelector('#document [data-page-count]')?.getAttribute('data-page-count') || 0) >= 3);
    const repeated = () => page.evaluate(() => ({ headers: Array.from(document.querySelectorAll('#document .ProseMirror tr')).filter(row => /^\s*Key\s*Meaning\s*Note\s*$/.test(row.textContent)).length, pages: +document.querySelector('#document [data-page-count]').getAttribute('data-page-count') }));
    await page.waitForTimeout(500); const plain = await repeated();
    await publishLong([{ id: 'far', before: '| K70 | Value 70 | note 70 |', after: '| K70 | Value 70 | changed |' }, { id: 'near', before: '| K2 | Value 2 | note 2 |', after: '| K2 | Value 2 | changed |' }]);
    await page.locator(rich + ' tr.host-suggestion-row').first().waitFor(); await page.waitForTimeout(800);
    const marked = await repeated();
    assert.equal(await page.locator(rich + ' tr.host-suggestion-row').count(), 2);
    assert.ok(plain.headers >= 3, 'The header is repeated on the later pages.'); assert.equal(marked.headers, plain.headers, 'A card row does not change how the header is repeated.');
    assert.equal((await action('docs', 'document')).text, LONG);
    const pending = page.waitForEvent('download'); await page.evaluate(() => pudlCommands.run('export-pdf', null, document.querySelector('#document'))); const download = await pending;
    const pdf = path.join(os.tmpdir(), 'yavc-suggestion-row.pdf'); await download.saveAs(pdf);
    const spawned = require('node:child_process').spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
    if (spawned.error) { console.log('pdftotext is not installed here, so the PDF text was not read.'); } else { assert.ok(/K70/.test(spawned.stdout) && !/Suggested by/.test(spawned.stdout), 'A PDF has the table and no card.'); }
    if (process.env.YAVC_SHOTS) { await publish('narrow-shot', [{ id: 'word', before: paragraph, after: paragraph.replace('beta', 'gamma') }, { id: 'row', before: '| F2 | Card | second |', after: '| F2 | Debit | second |' }]); await page.locator(rich + ' [data-host-suggestion="row"]').waitFor(); await page.waitForTimeout(300); await page.locator('#document').screenshot({ path: process.env.YAVC_SHOTS + '-visual.png' }); await action('docs', 'view', { mode: 'text' }); await page.waitForTimeout(500); await page.locator('#document').screenshot({ path: process.env.YAVC_SHOTS + '-text.png' }); }
    await publish('narrow-5', []);
};
