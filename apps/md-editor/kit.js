/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The shared editing kit (docs/slides-design.md, decision 16; DESIGN.md):
   what the Editor and Slides both build on the page view and the Markdown
   engine, written once. It gives a host

     yavcMdEditor.libs()                CodeMirror, loaded beside this file
     yavcMdEditor.pageView()            the page view (page-view.js), loaded
     yavcMdEditor.mermaid()             Mermaid, loaded
     yavcMdEditor.FORMATS, STYLES, INSERTS, SHORTCODES   the tables
     yavcMdEditor.commands(ctx)         PUDL command entries for the formats,
                                        the paragraph style and Insert
     yavcMdEditor.textFormat(view, name, ctx)   a format on a CodeMirror view
     yavcMdEditor.textInsert(view, markdown)    Markdown into a CodeMirror view
     yavcMdEditor.inserts(extra)        the / menu's items, for the page host
     yavcMdEditor.askText / askChoice / askColour / askColours   PUDL dialogs

   ctx says where a format goes: { page(): the page view's handle or null,
   text(): the CodeMirror view or null, onPage(): whether the page takes
   it, readOnly(): whether nothing may change, say(text, isError) }. The
   command ids are the names the Editor's key bindings use: bold, italic,
   strike, code, link, bullets, numbers, color, paragraph, h1 to h6, and
   insert-… for the blocks. Loaded with the site's static version, as
   apps/md-engine is. */
(function () {
    'use strict';
    if (window.yavcMdEditor) { return; }

    var HERE = ((document.currentScript && document.currentScript.src) || '/applets/md-editor/kit.js').split('?')[0].replace(/[^/]*$/, '');
    var STAMP = (function () { var s = (document.currentScript && document.currentScript.src) || ''; return s.indexOf('?') >= 0 ? s.slice(s.indexOf('?')) : ''; })();
    var PLACEHOLDER = 'Type here.';

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var had = document.querySelector('script[data-md-editor="' + src + '"]');
            if (had) { if (had.dataset.loaded) { resolve(); } else { had.addEventListener('load', function () { resolve(); }); had.addEventListener('error', function () { reject(new Error('could not load ' + src)); }); } return; }
            var s = document.createElement('script');
            s.src = src;
            s.setAttribute('data-md-editor', src);
            s.onload = function () { s.dataset.loaded = '1'; resolve(); };
            s.onerror = function () { reject(new Error('could not load ' + src)); };
            document.head.appendChild(s);
        });
    }
    var cmReady = null, pvReady = null, mmReady = null;
    function libs() {
        if (window.CM && window.CM.EditorView) { return Promise.resolve(window.CM); }
        if (!cmReady) { cmReady = loadScript(HERE + 'vendor/codemirror-6.43/codemirror.js?v=4').then(function () { return window.CM; }).catch(function (e) { cmReady = null; throw e; }); }
        return cmReady;
    }
    function pageView() {
        if (window.yavcPageView) { return Promise.resolve(window.yavcPageView); }
        if (!pvReady) { pvReady = loadScript(HERE + 'page-view.js' + STAMP).then(function () { return window.yavcPageView; }).catch(function (e) { pvReady = null; throw e; }); }
        return pvReady;
    }
    function mermaid() {
        if (window.mermaid) { return Promise.resolve(window.mermaid); }
        if (!mmReady) { mmReady = loadScript(HERE + 'vendor/mermaid/mermaid.min.js').then(function () { return window.mermaid; }).catch(function (e) { mmReady = null; throw e; }); }
        return mmReady;
    }

    /* === The tables ======================================================= */

    var FORMATS = [
        ['bold', 'Bold', 'bold', 'Mod-b'], ['italic', 'Italic', 'italic', 'Mod-i'], ['strike', 'Strike Through', 'strike'],
        ['code', 'Code', 'code', 'Mod-`'], ['link', 'Link…', 'link', 'Mod-k'],
        ['bullets', 'Bulleted List', 'list'], ['numbers', 'Numbered List', 'list-numbered'], ['color', 'Text Colour…', 'colour']
    ];
    var STYLES = [['paragraph', 'Paragraph', 'Mod-0']].concat([1, 2, 3, 4, 5, 6].map(function (n) { return ['h' + n, 'Heading ' + n, 'Mod-' + n]; }));
    var INSERTS = [
        { id: 'insert-checklist', label: 'Checklist', markdown: '- [ ] ' + PLACEHOLDER },
        { id: 'insert-table', label: 'Table', markdown: '| Heading 1 | Heading 2 | Heading 3 |\n| --- | --- | --- |\n| | | |\n| | | |' },
        { id: 'insert-code', label: 'Code Block', markdown: '```\ncode\n```' }
    ];
    var SHORTCODES = [
        ['figure', 'Picture', '{{figure:/static/icon.svg alt="What it shows" width=60%}}'],
        ['columns', 'Columns', '{{columns}}\nThe first column.\n\n{{column}}\n\nThe second.\n{{/columns}}'],
        ['tip', 'Tip', '{{tip:A title}}\nText.\n{{/tip}}'],
        ['note', 'Note', '{{note:A title}}\nText.\n{{/note}}'],
        ['info', 'Information Notice', '{{info:A title}}\nText.\n{{/info}}'],
        ['warning', 'Warning', '{{warning:A title}}\nText.\n{{/warning}}'],
        ['expand', 'Expand', '{{expand:The title}}\nWhat opens.\n{{/expand}}'],
        ['video', 'Video…', null],
        ['applet', 'Applet', '{{applet:dice fit=flow}}'],
        ['diagram', 'Diagram', '```mermaid\ngraph LR; A-->B;\n```'],
        ['code-file', 'Code Listing from a File', '{{code:~/bin/hello}}'],
        ['color', 'Coloured Words', '{{color:accent}}these words{{/color}}'],
        ['toc', 'Contents', '{{toc}}'],
        ['status', 'Status Label', '{{status:green Done}}'],
        ['kbd', 'Keys', '{{kbd:Ctrl+Shift+P}}'],
        ['glyph', 'Glyph', '{{glyph:check}}'],
        ['page', 'Page Link', '{{page:author}}'],
        ['anchor', 'Anchor', '{{anchor:name}}'],
        ['draft-note', 'Note to Self', '{{draft-note}}\nCheck this date.\n{{/draft-note}}']
    ].map(function (x) { return { id: 'insert-sc-' + x[0], name: x[0], label: x[1], markdown: x[2], shortcode: true }; });

    /* A hosted video's shortcode, from its link, asked for. */
    function askVideo() {
        return askText('A hosted video', 'Its link, from YouTube or Vimeo', '').then(function (v) {
            v = (v || '').trim();
            return v ? '{{video:' + v.replace(/[\s}]/g, '') + ' title="Video"}}' : null;
        });
    }
    function markdownFor(item) {
        if (item.name === 'video') { return askVideo(); }
        return Promise.resolve(item.markdown);
    }

    /* === Formats on the Markdown ========================================= */

    var WRAPS = { bold: '**', italic: '*', strike: '~~', code: '`' };
    function textFormat(view, name, ctx) {
        if (!view) { return; }
        var state = view.state, sel = state.selection.main;
        if (WRAPS[name]) {
            var w = WRAPS[name], text = state.sliceDoc(sel.from, sel.to);
            var before = state.sliceDoc(Math.max(0, sel.from - w.length), sel.from), after = state.sliceDoc(sel.to, Math.min(state.doc.length, sel.to + w.length));
            if (text.startsWith(w) && text.endsWith(w) && text.length >= 2 * w.length) {
                view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text.slice(w.length, text.length - w.length) }, selection: { anchor: sel.from, head: sel.to - 2 * w.length }, userEvent: 'input' });
            } else if (before === w && after === w) {
                view.dispatch({ changes: [{ from: sel.from - w.length, to: sel.from }, { from: sel.to, to: sel.to + w.length }], selection: { anchor: sel.from - w.length, head: sel.to - w.length }, userEvent: 'input' });
            } else {
                view.dispatch({ changes: { from: sel.from, to: sel.to, insert: w + text + w }, selection: { anchor: sel.from + w.length, head: sel.to + w.length }, userEvent: 'input' });
            }
            view.focus();
            return;
        }
        if (name === 'link') {
            var chosen = state.sliceDoc(sel.from, sel.to);
            askText('Link to', 'The address', /^https?:\/\//.test(chosen) ? chosen : 'https://').then(function (href) {
                if (!href) { view.focus(); return; }
                var label = chosen && !/^https?:\/\//.test(chosen) ? chosen : href;
                var md = '[' + label + '](' + href + ')';
                view.dispatch({ changes: { from: sel.from, to: sel.to, insert: md }, selection: { anchor: sel.from + 1, head: sel.from + 1 + label.length }, userEvent: 'input' });
                view.focus();
            });
            return;
        }
        if (name === 'color') {
            askColour().then(function (v) {
                if (v == null) { view.focus(); return; }
                var s2 = view.state, sl = s2.selection.main, inner = s2.sliceDoc(sl.from, sl.to) || 'these words';
                if (!v) { view.focus(); return; }
                var open = '{{color:' + v + '}}', close = '{{/color}}';
                view.dispatch({ changes: { from: sl.from, to: sl.to, insert: open + inner + close }, selection: { anchor: sl.from + open.length, head: sl.from + open.length + inner.length }, userEvent: 'input' });
                view.focus();
            });
            return;
        }
        var first = state.doc.lineAt(sel.from), last = state.doc.lineAt(sel.to), changes = [];
        var level = /^h([1-6])$/.exec(name), prefix = level ? '#'.repeat(+level[1]) + ' ' : name === 'bullets' ? '- ' : null;
        if (!level && name !== 'bullets' && name !== 'numbers' && name !== 'paragraph') { return; }
        var every = true;
        for (var n = first.number; n <= last.number; n++) {
            var line = state.doc.line(n), m = /^(\s*)(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?/.exec(line.text), marked = m[2] || '';
            if (name === 'numbers') { if (!/^\d+[.)]\s+$/.test(marked)) { every = false; } }
            else if (prefix && marked !== prefix) { every = false; }
        }
        var k = 1;
        for (var n2 = first.number; n2 <= last.number; n2++) {
            var ln = state.doc.line(n2), mm = /^(\s*)(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?/.exec(ln.text);
            var indent = mm[1], old = mm[2] || '', put = '';
            /* A list already on every line comes off; a heading level chosen
               again stays, as a paragraph style does. */
            if (name === 'paragraph' || (every && !level)) { put = ''; }
            else if (name === 'numbers') { put = (k++) + '. '; }
            else { put = prefix; }
            if (old !== put) { changes.push({ from: ln.from + indent.length, to: ln.from + indent.length + old.length, insert: put }); }
        }
        if (changes.length) { view.dispatch({ changes: changes, userEvent: 'input' }); }
        view.focus();
    }
    function textInsert(view, markdown) {
        if (!view) { return; }
        var sel = view.state.selection.main, at = sel.to;
        var line = view.state.doc.lineAt(at), lead = line.text.trim() ? '\n\n' : '\n';
        view.dispatch({ changes: { from: at, insert: lead + markdown + '\n' }, selection: { anchor: at + lead.length }, userEvent: 'input' });
        view.focus();
    }

    /* === Where a format goes ============================================ */

    function apply(name, ctx) {
        if (ctx.readOnly && ctx.readOnly()) { if (ctx.say) { ctx.say('This is read-only, so it cannot be changed.', true); } return; }
        var page = ctx.page && ctx.page();
        if (page && ctx.onPage()) {
            if (name === 'color') { askColour().then(function (v) { if (v == null) { return; } page.run('color', v || null); page.focus(); }); return; }
            page.run(name);
            return;
        }
        textFormat(ctx.text && ctx.text(), name, ctx);
    }
    function insertItem(item, ctx) {
        if (ctx.readOnly && ctx.readOnly()) { if (ctx.say) { ctx.say('This is read-only, so nothing can be added to it.', true); } return; }
        markdownFor(item).then(function (md) {
            if (!md) { return; }
            var page = ctx.page && ctx.page();
            if (page && ctx.onPage()) {
                if (!item.shortcode && !item.name) { page.run(item.id); } else { page.insertMarkdown(md); }
                return;
            }
            var view = ctx.text && ctx.text();
            if (view) { textInsert(view, md); } else if (ctx.append) { ctx.append(md); }
        });
    }

    /* The command entries for a host's command table: the formats, the
       paragraph style as one choice, and Insert as a submenu. extra adds
       the host's own insert items ({ id, label, markdown } or { id, label,
       run }), after the kit's. */
    function commands(ctx, extra) {
        var out = [];
        FORMATS.forEach(function (f) {
            out.push({ id: f[0], label: f[1], glyph: f[2], shortcut: f[3] ? f[3].replace('Mod-', 'Mod+') : undefined, run: function () { apply(f[0], ctx); }, glyphOnly: f[0] !== 'link' && f[0] !== 'color' });
        });
        out.push({ id: 'style', label: 'Paragraph Style', glyph: 'paragraph',
            current: function () { var s = ctx.blockStyle ? ctx.blockStyle() : null, f = STYLES.find(function (x) { return x[0] === s; }); return f ? f[1] : null; },
            items: STYLES.map(function (st) { return { id: st[0], label: st[1], shortcut: st[2].replace('Mod-', 'Mod+'), choice: 'md-style', value: st[0], checked: function () { return ctx.blockStyle ? ctx.blockStyle() === st[0] : false; }, run: function () { apply(st[0], ctx); } }; }) });
        var items = INSERTS.map(function (i) { return { id: i.id, label: i.label, run: function () { insertItem(i, ctx); } }; });
        items.push('-');
        SHORTCODES.forEach(function (i) { items.push({ id: i.id, label: i.label, run: function () { insertItem(i, ctx); } }); });
        (extra || []).forEach(function (i) {
            if (i === '-') { items.push('-'); return; }
            items.push({ id: i.id, label: i.label, run: function () { if (i.run) { i.run(); } else { insertItem(i, ctx); } } });
        });
        out.push({ id: 'insert', label: 'Insert', glyph: 'plus', items: items });
        return out;
    }
    /* The ids a toolbar or menu lists, in the kit's order. */
    var MENU = { format: ['style', '-', 'bold', 'italic', 'strike', 'code', 'link', 'color', '-', 'bullets', 'numbers', '-', 'insert'], toolbar: ['style', 'bold', 'italic', 'strike', 'code', 'link', 'color', 'bullets', 'numbers', 'insert'] };

    /* The / menu's items, for the page host's inserts(): the shortcodes,
       and the host's own after them. */
    function inserts(extra) {
        var out = SHORTCODES.map(function (i) {
            var it = { id: i.id, label: i.label.replace(/…$/, ''), words: i.name + ' ' + i.label.toLowerCase() };
            if (i.name === 'video') { it.run = function () { askVideo().then(function (md) { if (md && window.yavcMdEditor._page) { window.yavcMdEditor._page.insertMarkdown(md); } }); }; } else { it.markdown = i.markdown; }
            return it;
        });
        return out.concat((extra || []).map(function (i) { return { id: i.id, label: i.label, words: (i.words || i.label || '').toLowerCase(), markdown: i.markdown, run: i.run }; }));
    }

    /* === Dialogs ========================================================== */

    var dlgCount = 0;
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    /* One PUDL dialog, made for each question and removed after it. */
    function dialog(title, bodyHTML, buttons) {
        var n = ++dlgCount, dlg = document.createElement('dialog');
        dlg.className = 'dialog md-editor-dialog';
        dlg.setAttribute('aria-labelledby', 'md-dlg-title-' + n);
        dlg.innerHTML = '<form method="dialog"><h3 class="dialog-title" id="md-dlg-title-' + n + '">' + esc(title) + '</h3><div class="dialog-body">' + bodyHTML + '</div>' +
            '<div class="dialog-actions">' + buttons.map(function (b) { return b.primary ? '<button class="btn btn-primary" type="submit" value="' + esc(b.id) + '">' + esc(b.label) + '</button>' : '<button class="btn" type="button" data-choice="' + esc(b.id) + '">' + esc(b.label) + '</button>'; }).join('') + '</div></form>';
        dlg.querySelectorAll('[data-choice]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(b.getAttribute('data-choice')); }); });
        document.body.appendChild(dlg);
        return new Promise(function (resolve) {
            dlg.addEventListener('close', function () { var v = dlg.returnValue; var body = dlg.querySelector('.dialog-body'); resolve({ value: v, body: body }); setTimeout(function () { dlg.remove(); }, 0); }, { once: true });
            dlg.returnValue = '';
            dlg.showModal();
            var f = dlg.querySelector('input, select, textarea');
            if (f) { f.focus(); if (f.select) { f.select(); } }
        });
    }
    function askText(title, label, value) {
        var id = 'md-dlg-field-' + (dlgCount + 1);
        return dialog(title, '<div class="form-group"><label class="form-label" for="' + id + '">' + esc(label) + '</label><input class="form-input" id="' + id + '" value="' + esc(value || '') + '" autocomplete="off" spellcheck="false"></div>',
            [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'OK', primary: true }]).then(function (r) { return r.value === 'ok' ? r.body.querySelector('input').value : null; });
    }
    function askChoice(title, body, buttons) {
        return dialog(title, '<p>' + esc(body) + '</p>', buttons.map(function (b) { return { id: b[0], label: b[1], primary: !!b[2] }; })).then(function (r) { return r.value || null; });
    }
    var SWATCHES = [['ink', 'Text'], ['muted', 'Muted'], ['accent', 'Accent'], ['danger', 'Danger'], ['warn', 'Warning'], ['positive', 'Positive']];
    function swatchCSS(name) {
        return { ink: 'var(--text)', muted: 'var(--text-muted)', accent: 'var(--accent)', danger: 'var(--danger)', warn: 'var(--warn)', positive: 'var(--positive)' }[name] || name;
    }
    function pickerRows(fields) {
        return fields.map(function (f, k) {
            var id = 'md-col-' + dlgCount + '-' + k, v = f.value || '';
            return '<div class="form-group md-colour-row"><label class="form-label" for="' + id + '">' + esc(f.label) + '</label>' +
                '<div class="md-colour-pair"><input type="color" class="md-colour-pick" aria-label="' + esc(f.label) + ' picker" data-for="' + id + '" value="' + esc(/^#[0-9a-f]{6}$/i.test(v) ? v : (f.fallback || '#000000')) + '">' +
                '<input class="form-input" id="' + id + '" data-key="' + esc(f.key) + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '" autocomplete="off" spellcheck="false"' + (f.help ? ' aria-describedby="' + id + '-help"' : '') + '></div>' +
                (f.help ? '<p class="form-help" id="' + id + '-help">' + esc(f.help) + '</p>' : '') + '</div>';
        }).join('');
    }
    function wirePickers(body) {
        body.addEventListener('input', function (e) {
            if (e.target.classList.contains('md-colour-pick')) { var t = body.querySelector('#' + e.target.getAttribute('data-for')); if (t) { t.value = e.target.value; } }
            else if (e.target.matches('.form-input') && /^#[0-9a-f]{6}$/i.test(e.target.value)) { var pk = body.querySelector('[data-for="' + e.target.id + '"]'); if (pk) { pk.value = e.target.value; } }
        });
    }
    /* The colour for some words: a swatch, or anything typed; '' takes the
       colour off; null is Cancel. */
    function askColour() {
        var html = '<div class="form-group"><span class="form-label">The site\'s colours</span><div class="md-swatches" role="group" aria-label="The site\'s colours">' +
            SWATCHES.map(function (s) { return '<button type="button" class="btn md-swatch" data-swatch="' + s[0] + '"><span class="md-swatch-dot" style="background:' + swatchCSS(s[0]) + '" aria-hidden="true"></span>' + s[1] + '</button>'; }).join('') + '</div></div>' +
            pickerRows([{ key: 'custom', label: 'Any colour', value: '', fallback: '#c0392b', placeholder: '#c0392b, tomato, hsl(200 60% 40%); empty takes the colour off' }]);
        var p = dialog('Colour the words', html, [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'Use this colour', primary: true }]);
        var dlg = document.querySelector('.md-editor-dialog:last-of-type');
        if (dlg) {
            wirePickers(dlg.querySelector('.dialog-body'));
            dlg.querySelector('.dialog-body').addEventListener('click', function (e) { var b = e.target.closest('[data-swatch]'); if (b) { dlg.close('swatch:' + b.getAttribute('data-swatch')); } });
        }
        return p.then(function (r) {
            if (r.value && r.value.indexOf('swatch:') === 0) { return r.value.slice(7); }
            if (r.value !== 'ok') { return null; }
            return (r.body.querySelector('[data-key="custom"]') || { value: '' }).value.trim().replace(/[{}\s]/g, '');
        });
    }
    /* Several colours at once, by key: { key, label, value, fallback,
       placeholder }; resolves to the values by key, or null. */
    function askColours(title, fields) {
        var p = dialog(title, pickerRows(fields), [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'OK', primary: true }]);
        var dlg = document.querySelector('.md-editor-dialog:last-of-type');
        if (dlg) { wirePickers(dlg.querySelector('.dialog-body')); }
        return p.then(function (r) {
            if (r.value !== 'ok') { return null; }
            var out = {};
            r.body.querySelectorAll('[data-key]').forEach(function (i) { out[i.getAttribute('data-key')] = i.value.trim(); });
            return out;
        });
    }

    window.yavcMdEditor = {
        here: HERE, stamp: STAMP, placeholder: PLACEHOLDER,
        libs: libs, pageView: pageView, mermaid: mermaid, loadScript: loadScript,
        FORMATS: FORMATS, STYLES: STYLES, INSERTS: INSERTS, SHORTCODES: SHORTCODES, MENU: MENU,
        commands: commands, apply: apply, insertItem: insertItem, inserts: inserts, textFormat: textFormat, textInsert: textInsert,
        askText: askText, askChoice: askChoice, askColour: askColour, askColours: askColours,
        _page: null
    };
})();
