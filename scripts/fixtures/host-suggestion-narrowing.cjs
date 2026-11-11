// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A host suggestion is marked no wider than what it changes: the changed
// row of a table and the changed words of a paragraph, in both views.
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
    if (process.env.YAVC_SHOTS) { await publish('narrow-shot', [{ id: 'word', before: paragraph, after: paragraph.replace('beta', 'gamma') }, { id: 'row', before: '| F2 | Card | second |', after: '| F2 | Debit | second |' }]); await page.locator(rich + ' [data-host-suggestion="row"]').waitFor(); await page.waitForTimeout(300); await page.locator('#document').screenshot({ path: process.env.YAVC_SHOTS + '-visual.png' }); await action('docs', 'view', { mode: 'text' }); await page.waitForTimeout(500); await page.locator('#document').screenshot({ path: process.env.YAVC_SHOTS + '-text.png' }); }
    await publish('narrow-5', []);
};
