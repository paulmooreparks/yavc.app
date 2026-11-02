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
     yavcMdEditor.inserts(extra, pictures)   the / menu's items, for the page host
     yavcMdEditor.askText / askChoice / askColour / askColours   PUDL dialogs
     yavcMdEditor.askFigure(existing, pictures)   the picture dialog
     yavcMdEditor.editBlock(src, pictures)   a drawn block pressed on the page
     yavcMdEditor.loadImages(el, pictures)   pictures of the home folder, read

   ctx says where a format goes: { page(): the page view's handle or null,
   text(): the CodeMirror view or null, onPage(): whether the page takes
   it, readOnly(): whether nothing may change, say(text, isError),
   pictures(): where the document's pictures are }. pictures is { site():
   a promise of { F, FB }, the site file system and its dialogs; root: the
   applet's element; dir(): the document's folder as a path, or null }. The
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
        ['bullets', 'Bulleted List', 'list'], ['numbers', 'Numbered List', 'list-numbered'], ['color', 'Text Colour…', 'colour'], ['class', 'Style…', 'tag']
    ];
    /* The classes a stylesheet defines, for the Style dialog. */
    function classesOf(css) {
        var out = {}, re = /\.([A-Za-z][A-Za-z0-9-]*)/g, m;
        while ((m = re.exec(css || ''))) { if (!/^(deck|sc|doc|pm|dinah|md|win|btn|menu|notice|form)(-|$)/.test(m[1])) { out[m[1]] = true; } }
        return Object.keys(out).sort();
    }
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
    function markdownFor(item, ctx) {
        if (item.name === 'video') { return askVideo(); }
        if (item.name === 'figure') { return askFigure(null, ctx && ctx.pictures ? ctx.pictures() : null); }
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
        if (name === 'class') {
            askClass(ctx.classes ? ctx.classes() : []).then(function (v) {
                if (v == null) { view.focus(); return; }
                var s3 = view.state, sl3 = s3.selection.main, inner3 = s3.sliceDoc(sl3.from, sl3.to) || 'these words';
                if (!v) { view.focus(); return; }
                var open3 = '{{class:' + v + '}}', close3 = '{{/class}}';
                view.dispatch({ changes: { from: sl3.from, to: sl3.to, insert: open3 + inner3 + close3 }, selection: { anchor: sl3.from + open3.length, head: sl3.from + open3.length + inner3.length }, userEvent: 'input' });
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
            if (name === 'class') { askClass(ctx.classes ? ctx.classes() : []).then(function (v) { if (v == null) { return; } page.run('class', v || null); page.focus(); }); return; }
            page.run(name);
            return;
        }
        textFormat(ctx.text && ctx.text(), name, ctx);
    }
    function insertItem(item, ctx) {
        if (ctx.readOnly && ctx.readOnly()) { if (ctx.say) { ctx.say('This is read-only, so nothing can be added to it.', true); } return; }
        markdownFor(item, ctx).then(function (md) {
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
    var MENU = { format: ['style', '-', 'bold', 'italic', 'strike', 'code', 'link', 'color', 'class', '-', 'bullets', 'numbers', '-', 'insert'], toolbar: ['style', 'bold', 'italic', 'strike', 'code', 'link', 'color', 'class', 'bullets', 'numbers', 'insert'] };

    /* The / menu's items, for the page host's inserts(): the shortcodes,
       and the host's own after them. */
    function inserts(extra, pictures) {
        function onPage(md) { if (md && window.yavcMdEditor._page) { window.yavcMdEditor._page.insertMarkdown(md); } }
        var out = SHORTCODES.map(function (i) {
            var it = { id: i.id, label: i.label.replace(/…$/, ''), words: i.name + ' ' + i.label.toLowerCase() };
            if (i.name === 'video') { it.run = function () { askVideo().then(onPage); }; }
            else if (i.name === 'figure') { it.run = function () { askFigure(null, pictures ? pictures() : null).then(onPage); }; }
            else { it.markdown = i.markdown; }
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
    /* A class of the document's stylesheet: one of those it defines, or
       any name; '' takes the class off; null is Cancel. */
    function askClass(names) {
        var id = 'md-dlg-field-' + (dlgCount + 1);
        var html = (names && names.length ? '<div class="form-group"><span class="form-label">The stylesheet\'s classes</span><div class="md-swatches" role="group" aria-label="Classes">' +
            names.map(function (c) { return '<button type="button" class="btn md-swatch" data-swatch="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>' : '<p class="form-help">The deck has no stylesheet classes yet. A {{style}} block defines them, as .callout { … }.</p>') +
            '<div class="form-group"><label class="form-label" for="' + id + '">Any class</label><input class="form-input" id="' + id + '" autocomplete="off" spellcheck="false" placeholder="callout; empty takes the class off"></div>';
        var p = dialog('Style the words', html, [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'Use this style', primary: true }]);
        var dlg = document.querySelector('.md-editor-dialog:last-of-type');
        if (dlg) { dlg.querySelector('.dialog-body').addEventListener('click', function (e) { var b = e.target.closest('[data-swatch]'); if (b) { dlg.close('swatch:' + b.getAttribute('data-swatch')); } }); }
        return p.then(function (r) {
            if (r.value && r.value.indexOf('swatch:') === 0) { return r.value.slice(7); }
            if (r.value !== 'ok') { return null; }
            return (r.body.querySelector('input') || { value: '' }).value.trim().replace(/[^A-Za-z0-9-]/g, '');
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

    /* === Pictures ========================================================
       A picture in a document is a {{figure}} shortcode (or a plain
       Markdown image), asked for and changed as a form: its address, with
       Browse for one in the home folder or on the site and Upload for one
       from the computer, what it shows, its largest width and a caption
       (DESIGN.md, decision 14). A picture uploaded goes beside the document
       when the document is saved under ~, else into ~/Pictures, and is
       written as a path the page reads from the home folder. */

    /* A shortcode's call taken apart: {{name:positional key=value
       key="a value"}}, with \" inside quotes, as the engine reads it. */
    function parseShortcode(src) {
        var m = /^\{\{(\/?)([a-z][a-z0-9-]*)(?::([\s\S]*?))?\}\}$/.exec((src || '').trim());
        if (!m) { return null; }
        var out = { name: m[2], positional: [], named: {} }, t = m[3] || '', i = 0;
        while (i < t.length) {
            while (i < t.length && /\s/.test(t[i])) { i++; }
            if (i >= t.length) { break; }
            var key = null, start = i;
            while (i < t.length && /[A-Za-z0-9_-]/.test(t[i])) { i++; }
            if (t[i] === '=' && i > start) { key = t.slice(start, i); i++; } else { i = start; }
            var value = '';
            if (t[i] === '"') {
                i++;
                while (i < t.length && t[i] !== '"') { if (t[i] === '\\' && i + 1 < t.length) { i++; } value += t[i]; i++; }
                i++;
            } else {
                while (i < t.length && !/\s/.test(t[i])) { value += t[i]; i++; }
            }
            if (key === null) { out.positional.push(value); } else { out.named[key] = value; }
        }
        return out;
    }
    function quoteArg(v) { return /[\s"]/.test(v) || v === '' ? '"' + v.replace(/(["\\])/g, '\\$1') + '"' : v; }
    function buildFigure(f) {
        var parts = ['{{figure:' + quoteArg(f.src), 'alt=' + quoteArg(f.alt || '')];
        if (f.width) { parts.push('width=' + quoteArg(f.width)); }
        if (f.caption) { parts.push('caption=' + quoteArg(f.caption)); }
        return parts.join(' ') + '}}';
    }
    /* The picture a block is, as { src, alt, width, caption }, or null for
       a block that is not one picture: a {{figure}} on its own, or a
       Markdown image on its own. */
    function parseFigure(src) {
        var t = (src || '').trim();
        if (!t || t.indexOf('\n') >= 0) { return null; }
        var sc = parseShortcode(t);
        if (sc) {
            if (sc.name !== 'figure') { return null; }
            return { src: sc.named.src || sc.positional[0] || '', alt: sc.named.alt || '', width: sc.named.width || '', caption: sc.named.caption || '' };
        }
        var m = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)$/.exec(t);
        if (m) { return { src: m[2], alt: m[1], width: '', caption: '' }; }
        return null;
    }
    var PICTURE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
    /* A width such as 80% or 600px as its number and its unit, for the
       dialog's number field and unit choice; % when there is none. */
    var WIDTH_UNITS = ['%', 'px', 'rem', 'em', 'ch'];
    function splitWidth(w) {
        var m = /^(\d+(?:\.\d+)?)\s*(%|px|rem|em|ch)?$/.exec((w || '').trim());
        return m ? { n: m[1], u: m[2] || '%' } : { n: '', u: '%' };
    }
    /* How a picture is written in the document: by name when it sits in
       the document's folder, by its ~ path elsewhere in the home folder,
       and by its address on the site otherwise. */
    function addressOf(F, node, dirPath) {
        var display = F.displayPath(node), dir = dirPath ? dirPath.replace(/\/$/, '') + '/' : null;
        if (dir && display.indexOf(dir) === 0) { return display.slice(dir.length); }
        if (display.indexOf('~/') === 0) { return display; }
        var url = F.publicUrl(node);
        if (url) { try { return new URL(url).pathname; } catch (err) { } }
        return display;
    }
    /* The picture dialog: a promise of the {{figure}} to write, '' to take
       the picture out, or null for no change. existing is the block being
       changed, or null for a new picture. */
    function askFigure(existing, pictures) {
        var f = existing ? parseFigure(existing) : null, n = ++dlgCount, id = 'md-fig-' + n + '-', width = splitWidth(f ? f.width : '');
        var dlg = document.createElement('dialog');
        dlg.className = 'dialog md-editor-dialog md-figure';
        dlg.setAttribute('aria-labelledby', id + 'title');
        dlg.innerHTML = '<form method="dialog"><h3 class="dialog-title" id="' + id + 'title">' + (f ? 'Change the picture' : 'Insert a picture') + '</h3>' +
            '<div class="dialog-body md-figure-fields">' +
            '<label class="form-label" for="' + id + 'src">Picture</label>' +
            '<div class="md-figure-src"><input class="form-input" id="' + id + 'src" data-key="src" value="' + esc(f ? f.src : '') + '" autocomplete="off" spellcheck="false" placeholder="cat.png, ~/Pictures/cat.png or https://…" required>' +
            (pictures ? '<button type="button" class="btn" data-act="browse">Browse…</button><button type="button" class="btn" data-act="upload">Upload…</button>' : '') + '</div>' +
            '<p class="form-help">A picture beside the document, one in your home folder, one of the site\'s, or an address on the web.</p>' +
            '<label class="form-label" for="' + id + 'alt">What it shows</label>' +
            '<input class="form-input" id="' + id + 'alt" data-key="alt" value="' + esc(f ? f.alt : '') + '" autocomplete="off">' +
            '<p class="form-help">For someone who can\'t see it. Leave it empty for a picture that only decorates.</p>' +
            '<label class="form-label" for="' + id + 'width">Largest width</label>' +
            '<div class="md-figure-width"><span class="number-field"><input class="form-input" type="number" id="' + id + 'width" data-key="width" value="' + esc(width.n) + '" min="1" step="1" placeholder="Column"></span>' +
            '<select class="form-select" data-key="unit" aria-label="Unit of the width">' + WIDTH_UNITS.map(function (u) { return '<option value="' + u + '"' + (u === width.u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></div>' +
            '<p class="form-help">Of the column (%), or in px, rem, em or ch; empty takes the column\'s width.</p>' +
            '<label class="form-label" for="' + id + 'caption">Caption</label>' +
            '<input class="form-input" id="' + id + 'caption" data-key="caption" value="' + esc(f ? f.caption : '') + '" autocomplete="off">' +
            '<p class="form-help">Under the picture, in Markdown.</p>' +
            '<p class="form-error" data-role="error" hidden></p>' +
            '<input type="file" accept="image/*" hidden data-role="file">' +
            '</div><div class="dialog-actions">' +
            (f ? '<button type="button" class="btn" data-act="remove">Remove</button>' : '') +
            '<button type="button" class="btn" data-act="cancel">Cancel</button>' +
            '<button type="submit" class="btn btn-primary">' + (f ? 'Change' : 'Insert') + '</button></div></form>';
        document.body.appendChild(dlg);
        if (window.pudlFields && window.pudlFields.enhance) { window.pudlFields.enhance(dlg); }
        var form = dlg.querySelector('form'), field = function (k) { return dlg.querySelector('[data-key="' + k + '"]'); };
        var errorLine = dlg.querySelector('[data-role="error"]'), file = dlg.querySelector('[data-role="file"]');
        function problem(text, focus) { errorLine.textContent = text; errorLine.hidden = false; if (focus) { focus.focus(); } }
        return new Promise(function (resolve) {
            var done = false;
            function finish(v) { if (done) { return; } done = true; if (dlg.open) { dlg.close(); } resolve(v); setTimeout(function () { dlg.remove(); }, 0); }
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var src = field('src').value.trim(), number = field('width').value.trim(), unit = field('unit').value;
                if (!src) { problem('The picture needs an address, such as cat.png or ~/Pictures/cat.png.', field('src')); return; }
                if (number && !(parseFloat(number) > 0)) { problem('The width is a number above zero, such as 80.', field('width')); return; }
                finish(buildFigure({ src: src, alt: field('alt').value.trim(), width: number ? String(parseFloat(number)) + unit : '', caption: field('caption').value.trim() }));
            });
            dlg.addEventListener('click', function (e) {
                var b = e.target.closest('[data-act]');
                if (!b) { return; }
                var act = b.getAttribute('data-act');
                if (act === 'cancel') { finish(null); }
                else if (act === 'remove') { finish(''); }
                else if (act === 'browse') { browse(); }
                else if (act === 'upload') { file.value = ''; file.click(); }
            });
            dlg.addEventListener('close', function () { finish(null); });
            function browse() {
                pictures.site().then(function (site) {
                    var F = site.F, FB = site.FB, dir = pictures.dir ? pictures.dir() : null;
                    return FB.pick(F, {
                        mode: 'open', title: 'Choose a picture', host: pictures.root, start: dir && F.resolve(null, dir) ? dir : '~',
                        check: function (r) { return PICTURE_EXT.test(r.name) ? null : r.name + ' isn\'t a picture.'; },
                        commit: function (c) {
                            var node = c.path ? F.resolve(null, c.path) : null;
                            if (!node) { return 'Choose a picture.'; }
                            field('src').value = addressOf(F, node, dir);
                            return true;
                        }
                    });
                }).then(function (res) { if (res) { errorLine.hidden = true; field('alt').focus(); } }).catch(function (err) { problem(err && err.message || String(err)); });
            }
            file.addEventListener('change', function () {
                var picked = file.files && file.files[0];
                if (!picked) { return; }
                var F = null, dir = pictures.dir ? pictures.dir() : null, into = null;
                pictures.site().then(function (site) {
                    F = site.F;
                    into = dir ? F.resolve(null, dir) : null;
                    if (into && F.realOf(into).home) { return null; }
                    /* An unsaved document, or one on the site: the picture goes to ~/Pictures. */
                    dir = '~/Pictures';
                    return F.mkdir(null, dir, true).then(function (err) { if (err) { throw new Error(err); } into = F.resolve(null, dir); });
                }).then(function () { return F.upload(into, picked); }).then(function (res) {
                    if (res.error) { throw new Error(res.error); }
                    field('src').value = addressOf(F, res.node, dir);
                    errorLine.hidden = true;
                    if (pictures.say) { pictures.say('Uploaded ' + picked.name + ' to ' + F.displayPath(into) + '.'); }
                    field('alt').focus();
                }).catch(function (err) { problem(err && err.message || String(err)); });
            });
            dlg.showModal();
            (f ? field('caption') : field('src')).focus();
        });
    }
    /* A drawn block pressed on the page: a picture opens its dialog, and
       resolves to the block's new source, '' to take it out, or null to
       leave it; any other block is undefined, for the page to edit as its
       Markdown. */
    function editBlock(src, pictures) {
        if (!parseFigure(src)) { return undefined; }
        return askFigure(src, pictures);
    }
    /* The pictures of the home folder in drawn HTML (the engine marks each
       with data-attachment, its path from the document's folder), read
       from the folder and shown; one not found is marked. */
    function loadImages(target, pictures) {
        var imgs = target.querySelectorAll('img[data-attachment]');
        if (!imgs.length) { return; }
        if (!pictures || !pictures.site) { imgs.forEach(function (img) { img.classList.add('ed-missing-image'); }); return; }
        pictures.site().then(function (site) {
            var F = site.F, dir = pictures.dir ? pictures.dir() : null, base = (dir && F.resolve(null, dir)) || F.home();
            imgs.forEach(function (img) {
                var name = img.dataset.attachment, node = base ? F.resolve(base, name) : null;
                if (!node || node.children) { img.classList.add('ed-missing-image'); img.alt = img.alt || name; return; }
                F.readBytes(node).then(function (bytes) {
                    /* The address stays until the picture is drawn again, so an export can read it. */
                    img.src = URL.createObjectURL(new Blob([bytes], { type: (F.typeOf && F.typeOf(node)) || '' }));
                }).catch(function () { img.classList.add('ed-missing-image'); });
            });
        }).catch(function () { imgs.forEach(function (img) { img.classList.add('ed-missing-image'); }); });
    }

    window.yavcMdEditor = {
        here: HERE, stamp: STAMP, placeholder: PLACEHOLDER,
        libs: libs, pageView: pageView, mermaid: mermaid, loadScript: loadScript,
        FORMATS: FORMATS, STYLES: STYLES, INSERTS: INSERTS, SHORTCODES: SHORTCODES, MENU: MENU,
        commands: commands, apply: apply, classesOf: classesOf, insertItem: insertItem, inserts: inserts, textFormat: textFormat, textInsert: textInsert,
        askText: askText, askChoice: askChoice, askColour: askColour, askColours: askColours, askClass: askClass,
        askFigure: askFigure, editBlock: editBlock, loadImages: loadImages, parseFigure: parseFigure, buildFigure: buildFigure, parseShortcode: parseShortcode,
        _page: null
    };
})();
