/* Text comparison for the Diff Viewer (diff.js), and for anything else
   that compares two texts. Lines are compared with Myers'
   O(ND) algorithm ("An O(ND) Difference Algorithm and Its Variations",
   1986), after the lines the two texts share at the start and the end are
   set aside, and a changed line paired with the line that replaced it is
   compared again word by word.

     textDiff.lines(a, b, { ignoreWhitespace }) -> {
         rows: [{ op: '=' | '-' | '+', a: line number or null,
                  b: line number or null, text, words? }],
         added, removed, same: true when nothing differs,
         gaveUp: true when the texts differ too much to align }
     textDiff.split(text) -> the lines of a text

   Line numbers count from 1. A row's words, on a removed or added line
   that has a partner, are [{ text, changed }], the pieces of that line in
   order. Two texts that differ in more than LIMIT places are not aligned
   line by line: every line of the first is removed and every line of the
   second added, and gaveUp says so. */
(function () {
    'use strict';
    if (window.textDiff) { return; }

    /* The alignment keeps one frontier per edit, so its memory grows with
       the square of the edits; past this many it gives up. */
    var LIMIT = 2000;

    function split(text) {
        text = String(text == null ? '' : text);
        if (text === '') { return []; }
        var lines = text.split(/\r\n|\r|\n/);
        /* A final line ending ends the last line; it does not start one. */
        if (lines.length > 1 && lines[lines.length - 1] === '') { lines.pop(); }
        return lines;
    }

    /* The shortest edit script from a to b, compared by key, as a list of
       '=', '-' and '+'; or null when it would take more than limit edits. */
    function myers(a, b, limit) {
        var n = a.length, m = b.length, max = n + m, off = max + 1;
        var v = new Int32Array(2 * max + 3), trace = [];
        v[off + 1] = 0;
        for (var d = 0; d <= max; d++) {
            if (d > limit) { return null; }
            trace.push(v.slice(off - d - 1, off + d + 2));
            for (var k = -d; k <= d; k += 2) {
                var x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
                var y = x - k;
                while (x < n && y < m && a[x] === b[y]) { x++; y++; }
                v[off + k] = x;
                if (x >= n && y >= m) { return backtrack(trace, n, m); }
            }
        }
        return backtrack(trace, n, m);
    }

    /* Walks the saved frontiers back from the end, one edit at a time. */
    function backtrack(trace, n, m) {
        var ops = [], x = n, y = m;
        for (var d = trace.length - 1; d >= 0; d--) {
            var vd = trace[d], base = d + 1, k = x - y;
            var at = function (kk) { return vd[base + kk]; };
            var prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
            var prevX = d === 0 ? 0 : at(prevK), prevY = prevX - prevK;
            while (x > prevX && y > prevY) { ops.push('='); x--; y--; }
            if (d > 0) { ops.push(x === prevX ? '+' : '-'); x = prevX; y = prevY; }
        }
        while (x > 0 && y > 0) { ops.push('='); x--; y--; }
        return ops.reverse();
    }

    function keyOf(line, ignoreWhitespace) { return ignoreWhitespace ? line.replace(/\s+/g, ' ').trim() : line; }

    /* A line in words, spaces and marks, so a changed line shows which of
       them changed. */
    function tokens(line) { return line.match(/\w+|\s+|[^\w\s]/g) || []; }

    function words(oldLine, newLine) {
        var a = tokens(oldLine), b = tokens(newLine), ops = myers(a, b, 400);
        if (!ops) { return null; }
        var outA = [], outB = [], i = 0, j = 0;
        function push(list, text, changed) {
            var last = list[list.length - 1];
            if (last && last.changed === changed) { last.text += text; } else { list.push({ text: text, changed: changed }); }
        }
        ops.forEach(function (op) {
            if (op === '=') { push(outA, a[i++], false); push(outB, b[j++], false); }
            else if (op === '-') { push(outA, a[i++], true); }
            else { push(outB, b[j++], true); }
        });
        return [outA, outB];
    }

    function lines(textA, textB, opts) {
        opts = opts || {};
        var a = split(textA), b = split(textB), ws = !!opts.ignoreWhitespace;
        var ka = a.map(function (l) { return keyOf(l, ws); }), kb = b.map(function (l) { return keyOf(l, ws); });

        var head = 0;
        while (head < a.length && head < b.length && ka[head] === kb[head]) { head++; }
        var tail = 0;
        while (tail < a.length - head && tail < b.length - head && ka[a.length - 1 - tail] === kb[b.length - 1 - tail]) { tail++; }

        var midA = ka.slice(head, a.length - tail), midB = kb.slice(head, b.length - tail);
        var ops = myers(midA, midB, LIMIT), gaveUp = false;
        if (!ops) {
            gaveUp = true;
            ops = midA.map(function () { return '-'; }).concat(midB.map(function () { return '+'; }));
        }

        var rows = [], i = 0, j = 0, added = 0, removed = 0;
        for (var h = 0; h < head; h++) { rows.push({ op: '=', a: i + 1, b: j + 1, text: b[j] }); i++; j++; }
        ops.forEach(function (op) {
            if (op === '=') { rows.push({ op: '=', a: i + 1, b: j + 1, text: b[j] }); i++; j++; }
            else if (op === '-') { rows.push({ op: '-', a: i + 1, b: null, text: a[i] }); i++; removed++; }
            else { rows.push({ op: '+', a: null, b: j + 1, text: b[j] }); j++; added++; }
        });
        for (var t = 0; t < tail; t++) { rows.push({ op: '=', a: i + 1, b: j + 1, text: b[j] }); i++; j++; }

        /* In each run of removed lines followed by added ones, the first of
           each are partners, the second of each, and so on; partners are
           compared word by word. */
        for (var r = 0; r < rows.length;) {
            if (rows[r].op !== '-') { r++; continue; }
            var del = r;
            while (r < rows.length && rows[r].op === '-') { r++; }
            var add = r;
            while (r < rows.length && rows[r].op === '+') { r++; }
            for (var p = 0; p < Math.min(add - del, r - add); p++) {
                var w = words(rows[del + p].text, rows[add + p].text);
                if (w) { rows[del + p].words = w[0]; rows[add + p].words = w[1]; }
            }
        }

        return { rows: rows, added: added, removed: removed, same: added === 0 && removed === 0, gaveUp: gaveUp };
    }

    window.textDiff = { lines: lines, split: split };
})();

/* Diff viewer (Architecture/applet-roadmap.md): two texts compared line by
   line, side by side or in one column, with the words that changed within
   a changed line marked. Either side is typed or pasted, or opened from the
   host's files through its Open dialog (pudlHost.fs.open), or from the
   reader's computer. The comparison is textdiff.js, which the collection's
   build bundles in front of this script.

   The address keeps the view and its choices, and the texts themselves
   while they are short: two files of the site by their paths, otherwise
   up to MAX_STATE characters of text between the two sides, encoded.
   Longer pasted texts are not kept, and the status line says so.

   State: "view=one&ws=1&all=1&pa=/wwwroot/x&pb=~/y" or "ta=...&tb=...". */
(function () {
    'use strict';

    function engine() { return window.textDiff ? Promise.resolve(window.textDiff) : Promise.reject(new Error('textdiff.js is not bundled with the viewer')); }
    function hostFs() { return (window.pudlHost && window.pudlHost.fs) || null; }

    var MAX_STATE = 2000;
    /* Unchanged lines kept around a change when only the changes show. */
    var CONTEXT = 3;
    var SIDES = [['a', 'Original'], ['b', 'Changed']];
    var count = 0;

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function b64(s) { var bytes = new TextEncoder().encode(s), bin = ''; bytes.forEach(function (c) { bin += String.fromCharCode(c); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    function unb64(s) {
        try {
            var bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
            return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
        } catch (err) { return null; }
    }
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    function parseState(s) {
        var q = new URLSearchParams(String(s || '').replace(/^\?/, ''));
        var st = { view: q.get('view') === 'one' ? 'one' : 'split', ws: q.get('ws') === '1', all: q.get('all') === '1', a: {}, b: {} };
        SIDES.forEach(function (side) {
            var k = side[0], path = q.get('p' + k), text = q.get('t' + k);
            if (path) { st[k].path = path; }
            else if (text != null) { var t = unb64(text); if (t != null) { st[k].text = t; } }
        });
        return st;
    }

    function init(root, opts) {
        opts = opts || {};
        var n = ++count, ownUrl = !!opts.ownsUrl;
        var st = parseState(ownUrl && location.search ? location.search : (typeof opts.state === 'string' ? opts.state : ''));
        /* Each side: its text, and where it came from (a path of the site's
           files, a file from the computer, or typed). */
        var sides = { a: { text: st.a.text || '', path: st.a.path || null, name: null }, b: { text: st.b.text || '', path: st.b.path || null, name: null } };
        var D = null, result = null, unkept = false;

        root.classList.add('pc-diff');
        root.innerHTML =
            '<details class="df-inputs" open><summary>The two texts</summary><div class="df-sides">' +
            SIDES.map(function (side) {
                var id = 'df-' + n + '-' + side[0];
                return '<div class="df-side">' +
                    '<div class="df-side-head"><label class="form-label" for="' + id + '">' + side[1] + '</label>' +
                    '<span class="df-source" data-df-source="' + side[0] + '"></span>' +
                    '<button type="button" class="btn btn-sm" data-df-open="' + side[0] + '">Open…</button></div>' +
                    '<textarea class="form-textarea df-text" id="' + id + '" data-df-text="' + side[0] + '" spellcheck="false" wrap="off" ' +
                    'placeholder="Type or paste a text, or open a file"></textarea></div>';
            }).join('') +
            '</div></details>' +
            /* PUDL's folding toolbar (0.68.1), drawn from the command table
               below into the slot, with the comparison's summary beside it. */
            '<div class="df-bar">' +
            '<div class="df-toolbar" data-toolbar-slot></div>' +
            '<p class="df-summary" role="status" aria-live="polite"></p>' +
            '</div>' +
            '<div class="df-out"></div>' +
            '<p class="df-status" aria-live="polite"></p>' +
            '<dialog class="dialog df-about" aria-labelledby="df-about-' + n + '">' +
            '<h3 class="dialog-title" id="df-about-' + n + '">About Diff Viewer</h3>' +
            '<div class="dialog-body"><p>The diff viewer compares two texts line by line. Type or paste each one, or open a file from the site or from your computer. ' +
            'Removed lines are marked with a minus and added lines with a plus, and within a changed line the words that changed are marked as well.</p>' +
            '<p>Ignore spaces treats lines that differ only in their spacing as the same. Unless Show every line is on, only the changes show, with ' +
            CONTEXT + ' lines around each. The address keeps two files of the site by their paths, and short texts themselves, so a link shares the comparison.</p></div>' +
            '<div class="dialog-actions"><button type="button" class="btn btn-primary" data-df="about-close">Close</button></div>' +
            '</dialog>';

        function q(sel) { return root.querySelector(sel); }
        var out = q('.df-out'), summary = q('.df-summary'), status = q('.df-status'), about = q('.df-about');
        function say(msg) { status.textContent = msg || ''; }

        /* === State ======================================================= */

        function stateString() {
            var parts = [];
            if (st.view === 'one') { parts.push('view=one'); }
            if (st.ws) { parts.push('ws=1'); }
            if (st.all) { parts.push('all=1'); }
            var texts = sides.a.text.length + sides.b.text.length;
            unkept = false;
            SIDES.forEach(function (side) {
                var s = sides[side[0]];
                if (s.path) { parts.push('p' + side[0] + '=' + encodeURIComponent(s.path)); }
                else if (s.text && texts <= MAX_STATE) { parts.push('t' + side[0] + '=' + b64(s.text)); }
                else if (s.text) { unkept = true; }
            });
            return parts.join('&');
        }

        var writeTimer = null;
        function commit() {
            var s = stateString();
            clearTimeout(writeTimer);
            writeTimer = setTimeout(function () {
                if (ownUrl) { history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash); }
                if (opts.changed) { opts.changed(s); }
            }, 250);
        }

        /* === Drawing ===================================================== */

        function lineHtml(row) {
            if (!row.words) { return esc(row.text) || '\u200b'; }
            return row.words.map(function (w) { return w.changed ? '<span class="df-word">' + esc(w.text) + '</span>' : esc(w.text); }).join('') || '\u200b';
        }

        /* The rows to show: every row, or the changes with CONTEXT lines
           around each and a note where unchanged lines are left out. */
        function shown(rows) {
            if (st.all) { return rows; }
            var keep = rows.map(function () { return false; });
            rows.forEach(function (r, i) {
                if (r.op === '=') { return; }
                for (var j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) { keep[j] = true; }
            });
            var list = [], skipped = 0;
            rows.forEach(function (r, i) {
                if (keep[i]) {
                    if (skipped) { list.push({ gap: skipped }); skipped = 0; }
                    list.push(r);
                } else { skipped++; }
            });
            if (skipped) { list.push({ gap: skipped }); }
            return list;
        }

        function gapRow(cols, g) {
            return '<tr class="df-gap"><td colspan="' + cols + '">' + plural(g.gap, 'line', 'lines') + ' the same</td></tr>';
        }

        function cell(row, side) {
            if (!row) { return '<td class="df-num"></td><td class="df-sign"></td><td class="df-line df-empty"></td>'; }
            var kind = row.op === '-' ? ' df-del' : row.op === '+' ? ' df-add' : '';
            var num = side === 'a' ? row.a : row.b;
            var sign = row.op === '-' ? '\u2212' : row.op === '+' ? '+' : '';
            return '<td class="df-num">' + num + '</td><td class="df-sign' + kind + '">' + sign + '</td><td class="df-line' + kind + '">' + lineHtml(row) + '</td>';
        }

        function drawSplit(list) {
            var html = '', i = 0;
            while (i < list.length) {
                var r = list[i];
                if (r.gap) { html += gapRow(6, r); i++; continue; }
                if (r.op === '=') { html += '<tr>' + cell(r, 'a') + cell(r, 'b') + '</tr>'; i++; continue; }
                /* A run of removed lines and the added lines after it stand
                   side by side, pair by pair. */
                var dels = [], adds = [];
                while (i < list.length && list[i].op === '-') { dels.push(list[i++]); }
                while (i < list.length && list[i].op === '+') { adds.push(list[i++]); }
                for (var k = 0; k < Math.max(dels.length, adds.length); k++) { html += '<tr>' + cell(dels[k], 'a') + cell(adds[k], 'b') + '</tr>'; }
            }
            return '<table class="df-table df-split"><caption class="visually-hidden">The original on the left and the changed text on the right</caption>' +
                '<colgroup><col class="df-c-num"><col class="df-c-sign"><col><col class="df-c-num"><col class="df-c-sign"><col></colgroup><tbody>' + html + '</tbody></table>';
        }

        function drawOne(list) {
            var html = list.map(function (r) {
                if (r.gap) { return gapRow(4, r); }
                var kind = r.op === '-' ? ' df-del' : r.op === '+' ? ' df-add' : '';
                var sign = r.op === '-' ? '\u2212' : r.op === '+' ? '+' : '';
                return '<tr><td class="df-num">' + (r.a || '') + '</td><td class="df-num">' + (r.b || '') + '</td>' +
                    '<td class="df-sign' + kind + '">' + sign + '</td><td class="df-line' + kind + '">' + lineHtml(r) + '</td></tr>';
            }).join('');
            return '<table class="df-table df-one"><caption class="visually-hidden">Both texts in one column, with the line numbers of the original and of the changed text</caption>' +
                '<colgroup><col class="df-c-num"><col class="df-c-num"><col class="df-c-sign"><col></colgroup><tbody>' + html + '</tbody></table>';
        }

        function drawControls() {
            if (opts.commandsChanged) { opts.commandsChanged(); }
            SIDES.forEach(function (side) {
                var s = sides[side[0]], ta = q('[data-df-text="' + side[0] + '"]');
                if (ta.value !== s.text) { ta.value = s.text; }
                q('[data-df-source="' + side[0] + '"]').textContent = s.path || s.name || '';
            });
        }

        function compare() {
            if (!D) { return; }
            result = D.lines(sides.a.text, sides.b.text, { ignoreWhitespace: st.ws });
            if (!sides.a.text && !sides.b.text) {
                summary.textContent = '';
                out.innerHTML = '<p class="df-empty-note">Type, paste or open the two texts to compare them.</p>';
                return;
            }
            summary.textContent = result.same ? (st.ws ? 'The texts are the same, apart from spacing.' : 'The texts are the same.')
                : plural(result.removed, 'line', 'lines') + ' removed, ' + plural(result.added, 'line', 'lines') + ' added' +
                  (result.gaveUp ? '. The texts differ in too many places to line up, so all of each is shown.' : '.');
            out.innerHTML = result.same && !st.all ? '' : (st.view === 'one' ? drawOne : drawSplit)(shown(result.rows));
        }

        function draw() { drawControls(); compare(); }

        function update() {
            draw();
            commit();
            say(unkept ? 'The texts are too long for the address to keep, so a link to this page won\'t bring them back. Two files of the site are kept by their paths.' : '');
        }

        /* === Sources ===================================================== */

        /* The host's Open, or without one a file from the reader's
           computer, which is kept by its name rather than a path. */
        async function openSide(k) {
            var s = sides[k], f = hostFs();
            if (!f || !f.open) { pending = k; chooser.click(); return; }
            var got;
            try {
                got = await f.open({
                    title: 'Open the ' + (k === 'a' ? 'original' : 'changed') + ' text', host: root,
                    start: s.path ? s.path.slice(0, s.path.lastIndexOf('/')) || '/' : '~'
                });
            } catch (err) { say('That file could not be opened: ' + (err && err.message || err) + '.'); return; }
            if (!got) { return; }
            s.text = got.text; s.path = got.path || null; s.name = got.path ? null : got.name;
            update();
        }
        var pending = null, chooser = document.createElement('input');
        chooser.type = 'file'; chooser.hidden = true;
        root.appendChild(chooser);
        chooser.addEventListener('change', async function () {
            var file = chooser.files && chooser.files[0], k = pending;
            chooser.value = ''; pending = null;
            if (!file || !k) { return; }
            try { sides[k].text = await file.text(); sides[k].path = null; sides[k].name = file.name; }
            catch (err) { say(file.name + ' could not be read: ' + err.message + '.'); return; }
            update();
        });

        /* Two sides named by path in the address are read when the applet
           starts, or when the state changes to name them. */
        async function readPaths() {
            if (!sides.a.path && !sides.b.path) { return; }
            var f = hostFs();
            for (var i = 0; i < SIDES.length; i++) {
                var k = SIDES[i][0], s = sides[k];
                if (!s.path) { continue; }
                if (!f) { say('There are no files here to read ' + s.path + ' from.'); s.path = null; continue; }
                var text = null;
                try { text = await f.readText(s.path); } catch (err) { say(s.path + ' could not be read: ' + (err && err.message || err) + '.'); s.path = null; continue; }
                if (text == null) { say('There\'s no file at ' + s.path + '.'); s.path = null; continue; }
                s.text = text;
            }
            draw();
        }

        function swap() {
            var t = sides.a;
            sides.a = sides.b;
            sides.b = t;
            update();
        }

        /* === Commands, the toolbar and the menus ========================= */

        /* Every command the toolbar, the menus and an agent reach, once
           (PUDL's command table, 0.68.1). */
        function commandTable() {
            var empty = !sides.a.text && !sides.b.text, none = 'There is nothing to compare yet';
            return [
                { id: 'view-split', label: 'Side by Side', choice: 'df-view', choiceLabel: 'View', value: 'split', checked: st.view === 'split', run: function () { st.view = 'split'; update(); } },
                { id: 'view-one', label: 'One Column', choice: 'df-view', choiceLabel: 'View', value: 'one', checked: st.view === 'one', run: function () { st.view = 'one'; update(); } },
                { id: 'all', label: 'Show Every Line', checked: st.all, run: function () { st.all = !st.all; update(); } },
                { id: 'ws', label: 'Ignore Spaces', checked: st.ws, run: function () { st.ws = !st.ws; update(); } },
                { id: 'swap', label: 'Swap the Sides', disabled: empty, reason: none, run: swap },
                { id: 'open-a', label: 'Open the Original…', glyph: 'folder', run: function () { return openSide('a'); } },
                { id: 'open-b', label: 'Open the Changed Text…', glyph: 'folder', run: function () { return openSide('b'); } },
                { id: 'clear', label: 'Clear Both Sides', disabled: empty, reason: none,
                  run: function () { sides.a = { text: '', path: null, name: null }; sides.b = { text: '', path: null, name: null }; update(); } },
                { id: 'about', label: 'About Diff Viewer', glyph: 'info', run: function () { about.showModal(); } }
            ];
        }
        function toolbars() {
            return [{ label: 'Diff Viewer', groups: [
                { label: 'View', glyph: 'list', priority: 2, items: [{ choice: 'df-view' }, 'all'] },
                { label: 'Compare', glyph: 'copy', priority: 1, items: ['ws', 'swap'] }
            ] }];
        }

        function menus() {
            return { titles: [
                { label: 'Diff Viewer', items: window.pudlHost.identity(root, [{ label: 'About Diff Viewer', run: function () { about.showModal(); } }]) },
                { id: 'file', label: 'File', items: ['open-a', 'open-b', '-', 'clear'] },
                { label: 'Compare', items: ['swap', 'ws'] }
            ], into: { view: ['view-split', 'view-one', 'all'] } };
        }

        /* === Events ====================================================== */

        var typeTimer = null;
        function onInput(e) {
            var t = e.target;
            if (t.hasAttribute('data-df-text')) {
                var s = sides[t.getAttribute('data-df-text')];
                s.text = t.value;
                /* A text typed over is no longer the file it came from. */
                s.path = null;
                s.name = null;
                clearTimeout(typeTimer);
                typeTimer = setTimeout(update, 250);
            }
        }
        function onClick(e) {
            var b = e.target.closest('button');
            if (!b || !root.contains(b)) { return; }
            if (b.hasAttribute('data-df-open')) { openSide(b.getAttribute('data-df-open')); return; }
            if (b.getAttribute('data-df') === 'about-close') { about.close(); }
        }
        root.addEventListener('input', onInput);
        root.addEventListener('click', onClick);

        drawControls();
        engine().then(function (api) {
            D = api;
            draw();
            readPaths();
        }, function (err) { say('The comparison could not start: ' + err.message + '.'); });

        return {
            menus: menus,
            commandTable: commandTable,
            toolbars: toolbars,
            state: stateString,
            setState: function (s) {
                st = parseState(s);
                sides.a = { text: st.a.text || '', path: st.a.path || null, name: null };
                sides.b = { text: st.b.text || '', path: st.b.path || null, name: null };
                draw();
                readPaths();
            },
            destroy: function () {
                clearTimeout(writeTimer);
                clearTimeout(typeTimer);
                root.removeEventListener('input', onInput);
                root.removeEventListener('click', onClick);
                if (about.open) { about.close(); }
            }
        };
    }

    window.pudlApplets.register('diff', { init: init });
})();
