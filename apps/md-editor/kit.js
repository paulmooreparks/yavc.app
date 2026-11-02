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
     yavcMdEditor.editBlock(src, pictures)   a drawn block or inline shortcode pressed on the page
     yavcMdEditor.askShortcode(name, existing, host)   a standalone shortcode's form
     yavcMdEditor.boxCommand(ctx, opts, extra)   Box, which wraps the selection in a box
     yavcMdEditor.askProperties(front, opts)   the Properties dialog, for front matter
     yavcMdEditor.loadImages(el, pictures)   pictures of the home folder, read
     yavcMdEditor.drawBlocks(el, blocks, opts)   the engine's preview blocks drawn, unchanged ones kept
     yavcMdEditor.pictureFor(src, pictures)   a picture of the home folder as an address, cached

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

    var loadScript = window.yavcUtil.loadScript;
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
        ['columns', 'Columns', '{{columns}}\n' + PLACEHOLDER + '\n\n{{column}}\n\nThe second column.\n{{/columns}}'],
        ['tip', 'Tip', '{{tip:A title}}\n' + PLACEHOLDER + '\n{{/tip}}'],
        ['note', 'Note', '{{note:A title}}\n' + PLACEHOLDER + '\n{{/note}}'],
        ['info', 'Information Notice', '{{info:A title}}\n' + PLACEHOLDER + '\n{{/info}}'],
        ['warning', 'Warning', '{{warning:A title}}\n' + PLACEHOLDER + '\n{{/warning}}'],
        ['expand', 'Expand', '{{expand:The title}}\n' + PLACEHOLDER + '\n{{/expand}}'],
        ['video', 'Video…', null],
        ['applet', 'Applet…', null],
        ['diagram', 'Diagram', '```mermaid\ngraph LR; A-->B;\n```'],
        ['code', 'Code Listing from a File…', null],
        ['color', 'Coloured Words', '{{color:accent}}these words{{/color}}'],
        ['toc', 'Contents…', null],
        ['status', 'Status Label…', null],
        ['kbd', 'Keys…', null],
        ['glyph', 'Glyph…', null],
        ['page', 'Page Link…', null],
        ['anchor', 'Anchor…', null],
        ['draft-note', 'Note to Self', '{{draft-note}}\n' + PLACEHOLDER + '\n{{/draft-note}}']
    ].map(function (x) { return { id: 'insert-sc-' + x[0], name: x[0], label: x[1], markdown: x[2], shortcode: true }; });

    /* The Markdown an insert item puts in: its example, or for a shortcode
       with a form, what its form is filled in with (null for Cancel). */
    function markdownFor(item, ctx) {
        var host = ctx && ctx.pictures ? ctx.pictures() : null;
        if (item.name === 'figure') { return askFigure(null, host); }
        if (FORMS[item.name]) { return askShortcode(item.name, null, host); }
        return Promise.resolve(item.markdown);
    }
    /* Whether a shortcode goes in a line of text, rather than on a line of its own. */
    function isInlineForm(name) { return !!(FORMS[name] && FORMS[name].inline); }

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
            askText('Link', 'Address', /^https?:\/\//.test(chosen) ? chosen : 'https://').then(function (href) {
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
    /* An inline shortcode into a CodeMirror view, at the cursor. */
    function textInsertInline(view, markdown) {
        var sel = view.state.selection.main;
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: markdown }, selection: { anchor: sel.from + markdown.length }, userEvent: 'input' });
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
                if (!item.shortcode && !item.name) { page.run(item.id); }
                else if (isInlineForm(item.name) && page.insertInline) { page.insertInline(md); }
                else { page.insertMarkdown(md); }
                return;
            }
            var view = ctx.text && ctx.text();
            if (view && isInlineForm(item.name)) { textInsertInline(view, md); }
            else if (view) { textInsert(view, md); } else if (ctx.append) { ctx.append(md); }
        });
    }

    /* The command entries for a host's command table: the formats, the
       paragraph style as one choice, and Insert as a submenu. extra adds
       the host's own insert items ({ id, label, markdown } or { id, label,
       run }), after the kit's. */
    function commands(ctx, extra) {
        var out = [];
        FORMATS.forEach(function (f) {
            out.push({ id: f[0], label: f[1], glyph: f[2], shortcut: window.yavcUtil.shortcut(f[3]), run: function () { apply(f[0], ctx); }, glyphOnly: f[0] !== 'link' && f[0] !== 'color' });
        });
        out.push({ id: 'style', label: 'Paragraph Style', glyph: 'paragraph',
            current: function () { var s = ctx.blockStyle ? ctx.blockStyle() : null, f = STYLES.find(function (x) { return x[0] === s; }); return f ? f[1] : null; },
            items: STYLES.map(function (st) { return { id: st[0], label: st[1], shortcut: window.yavcUtil.shortcut(st[2]), choice: 'md-style', value: st[0], checked: function () { return ctx.blockStyle ? ctx.blockStyle() === st[0] : false; }, run: function () { apply(st[0], ctx); } }; }) });
        var items = INSERTS.map(function (i) { return { id: i.id, label: i.label, run: function () { insertItem(i, ctx); } }; });
        items.push('-');
        SHORTCODES.forEach(function (i) { items.push({ id: i.id, label: i.label, run: function () { insertItem(i, ctx); } }); });
        (extra || []).forEach(function (i) {
            if (i === '-') { items.push('-'); return; }
            items.push({ id: i.id, label: i.label, run: function () { if (i.run) { i.run(); } else { insertItem(i, ctx); } } });
        });
        out.push({ id: 'insert', label: 'Insert', glyph: 'plus', items: items });
        out.push(boxCommand(ctx));
        return out;
    }
    /* Box: the selection, or the line the cursor is on, wrapped in a box,
       a container shortcode (docs/page-view-design.md). On the page the
       selected blocks go into the box; in the text the selected lines go
       between its opening and closing lines. */
    var BOXES = [['tip', 'Tip'], ['note', 'Note'], ['info', 'Information Notice'], ['warning', 'Warning'], ['expand', 'Expand'], ['draft-note', 'Note to Self'], ['columns', 'Columns']];
    function boxCommand(ctx, opts, extra) {
        var list = BOXES.concat(extra || []);
        return Object.assign({ id: 'box', label: 'Box', glyph: 'square',
            items: list.map(function (b) { return Object.assign({ id: 'box-' + b[0], label: b[1], run: function () { wrapBox(b[0], ctx); } }, opts || {}); }) }, opts || {});
    }
    function wrapBox(name, ctx) {
        if (ctx.readOnly && ctx.readOnly()) { if (ctx.say) { ctx.say('This is read-only, so it cannot be changed.', true); } return; }
        var page = ctx.page && ctx.page();
        if (page && ctx.onPage() && page.wrap) { page.wrap(name); return; }
        var view = ctx.text && ctx.text();
        if (!view) { return; }
        var st = view.state, sel = st.selection.main, first = st.doc.lineAt(sel.from), last = st.doc.lineAt(sel.to);
        var text = st.sliceDoc(first.from, last.to);
        if (!text.trim()) { text = PLACEHOLDER; }
        var open = '{{' + name + '}}\n', close = name === 'columns' ? '\n\n{{column}}\n\n' + PLACEHOLDER + '\n{{/columns}}' : '\n{{/' + name + '}}';
        view.dispatch({ changes: { from: first.from, to: last.to, insert: open + text + close }, selection: { anchor: first.from + open.length, head: first.from + open.length + text.length }, userEvent: 'input' });
        view.focus();
    }
    /* The ids a toolbar or menu lists, in the kit's order. */
    var MENU = { format: ['style', '-', 'bold', 'italic', 'strike', 'code', 'link', 'color', 'class', '-', 'bullets', 'numbers', '-', 'insert', 'box'], toolbar: ['style', 'bold', 'italic', 'strike', 'code', 'link', 'color', 'class', 'bullets', 'numbers', 'insert', 'box'] };

    /* The / menu's items, for the page host's inserts(): the shortcodes,
       and the host's own after them. */
    function inserts(extra, pictures) {
        function onPage(md) { if (md && window.yavcMdEditor._page) { window.yavcMdEditor._page.insertMarkdown(md); } }
        var out = SHORTCODES.map(function (i) {
            var it = { id: i.id, label: i.label.replace(/…$/, ''), words: i.name + ' ' + i.label.toLowerCase() };
            if (i.name === 'figure') { it.run = function () { askFigure(null, pictures ? pictures() : null).then(onPage); }; }
            else if (FORMS[i.name]) {
                it.run = function () {
                    askShortcode(i.name, null, pictures ? pictures() : null).then(function (md) {
                        var page = window.yavcMdEditor._page;
                        if (!md || !page) { return; }
                        if (isInlineForm(i.name) && page.insertInline) { page.insertInline(md); } else { page.insertMarkdown(md); }
                    });
                };
            }
            else { it.markdown = i.markdown; }
            return it;
        });
        return out.concat((extra || []).map(function (i) { return { id: i.id, label: i.label, words: (i.words || i.label || '').toLowerCase(), markdown: i.markdown, run: i.run }; }));
    }

    /* === Dialogs ========================================================== */

    /* The kit's questions are the site's dialogs (static/dialogs.js), with
       the kit's own bodies: swatches, colour pickers, several fields. */
    var dlgCount = 0;
    var esc = window.yavcUtil.esc;
    function dialog(title, bodyHTML, buttons, onOpen) {
        dlgCount++;
        return window.yavcDialog.open({ title: title, body: bodyHTML, buttons: buttons, className: 'md-editor-dialog', onOpen: onOpen });
    }
    function askText(title, label, value) { return window.yavcDialog.askText(title, label, value); }
    function askChoice(title, body, buttons) { return window.yavcDialog.askChoice(title, body, buttons); }
    /* Several text fields in one dialog: fields is [{ key, label, value,
       placeholder, help }]; resolves to the values by key, or null. */
    function askFields(title, fields, okLabel) {
        var n = dlgCount + 1;
        var html = fields.map(function (f, k) {
            var id = 'md-dlg-' + n + '-' + k;
            return '<div class="form-group"><label class="form-label" for="' + id + '">' + esc(f.label) + '</label>' +
                '<input class="form-input" id="' + id + '" data-key="' + esc(f.key) + '" value="' + esc(f.value || '') + '" autocomplete="off"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' +
                (f.help ? '<p class="form-help">' + esc(f.help) + '</p>' : '') + '</div>';
        }).join('');
        return dialog(title, html, [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: okLabel || 'OK', primary: true }]).then(function (r) {
            if (r.value !== 'ok') { return null; }
            var out = {};
            r.body.querySelectorAll('[data-key]').forEach(function (i) { out[i.getAttribute('data-key')] = i.value.trim(); });
            return out;
        });
    }
    var SWATCHES = [['ink', 'Text'], ['muted', 'Muted'], ['accent', 'Accent'], ['danger', 'Danger'], ['warn', 'Warning'], ['positive', 'Positive']];
    function swatchCSS(name) {
        return { ink: 'var(--text)', muted: 'var(--text-muted)', accent: 'var(--accent)', danger: 'var(--danger)', warn: 'var(--warn)', positive: 'var(--positive)' }[name] || name;
    }
    function pickerRows(fields) {
        return fields.map(function (f, k) {
            var id = 'md-col-' + dlgCount + '-' + k, v = f.value || '';
            return '<div class="form-group md-colour-row"><label class="form-label" for="' + id + '">' + esc(f.label) + '</label>' +
                '<div class="md-colour-pair"><input type="color" class="md-colour-pick" aria-label="' + esc(f.label) + ' Picker" data-for="' + id + '" value="' + esc(/^#[0-9a-f]{6}$/i.test(v) ? v : (f.fallback || '#000000')) + '">' +
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
    /* A swatch pressed answers the dialog with its name. */
    function wireSwatches(api) {
        api.body.addEventListener('click', function (e) { var b = e.target.closest('[data-swatch]'); if (b) { api.close('swatch:' + b.getAttribute('data-swatch')); } });
    }
    /* The colour for some words: a swatch, or anything typed; '' takes the
       colour off; null is Cancel. */
    function askColour() {
        var html = '<div class="form-group"><span class="form-label">The Site\'s Colours</span><div class="md-swatches" role="group" aria-label="The Site\'s Colours">' +
            SWATCHES.map(function (s) { return '<button type="button" class="btn md-swatch" data-swatch="' + s[0] + '"><span class="md-swatch-dot" style="background:' + swatchCSS(s[0]) + '" aria-hidden="true"></span>' + s[1] + '</button>'; }).join('') + '</div></div>' +
            pickerRows([{ key: 'custom', label: 'Any Colour', value: '', fallback: '#c0392b', placeholder: '#c0392b, tomato, hsl(200 60% 40%); empty takes the colour off' }]);
        return dialog('Colour the Words', html, [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'Use This Colour', primary: true }],
            function (api) { wirePickers(api.body); wireSwatches(api); }).then(function (r) {
            if (r.value && r.value.indexOf('swatch:') === 0) { return r.value.slice(7); }
            if (r.value !== 'ok') { return null; }
            return (r.body.querySelector('[data-key="custom"]') || { value: '' }).value.trim().replace(/[{}\s]/g, '');
        });
    }
    /* A class of the document's stylesheet: one of those it defines, or
       any name; '' takes the class off; null is Cancel. */
    function askClass(names) {
        var id = 'md-dlg-field-' + (dlgCount + 1);
        var html = (names && names.length ? '<div class="form-group"><span class="form-label">The Stylesheet\'s Classes</span><div class="md-swatches" role="group" aria-label="Classes">' +
            names.map(function (c) { return '<button type="button" class="btn md-swatch" data-swatch="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>' : '<p class="form-help">The deck has no stylesheet classes yet. A {{style}} block defines them, as .callout { … }.</p>') +
            '<div class="form-group"><label class="form-label" for="' + id + '">Any Class</label><input class="form-input" id="' + id + '" autocomplete="off" spellcheck="false" placeholder="callout; empty takes the class off"></div>';
        return dialog('Style the Words', html, [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'Use This Style', primary: true }], wireSwatches).then(function (r) {
            if (r.value && r.value.indexOf('swatch:') === 0) { return r.value.slice(7); }
            if (r.value !== 'ok') { return null; }
            return (r.body.querySelector('input') || { value: '' }).value.trim().replace(/[^A-Za-z0-9-]/g, '');
        });
    }
    /* Several colours at once, by key: { key, label, value, fallback,
       placeholder }; resolves to the values by key, or null. */
    function askColours(title, fields) {
        return dialog(title, pickerRows(fields), [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'OK', primary: true }],
            function (api) { wirePickers(api.body); }).then(function (r) {
            if (r.value !== 'ok') { return null; }
            var out = {};
            r.body.querySelectorAll('[data-key]').forEach(function (i) { out[i.getAttribute('data-key')] = i.value.trim(); });
            return out;
        });
    }

    /* A form in the site's dialog: the kit's own fields as the body, a
       Remove button drawn as destructive when something exists to remove,
       Cancel, and the action. setup(api) wires the body once it shows;
       submit(api) gives the answer, or undefined to keep the dialog open
       (it shows its own problem). Resolves to the answer, '' for Remove, or
       null for Cancel. */
    function ownForm(o) {
        var answer, api = null;
        dlgCount++;
        return window.yavcDialog.open({
            title: o.title, className: 'md-editor-dialog ' + (o.className || ''), body: o.body,
            buttons: (o.remove ? [{ id: 'remove', label: 'Remove', danger: true, submit: false }] : []).concat([{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: o.okLabel || 'OK', primary: true }]),
            onOpen: function (a) { api = a; if (o.setup) { o.setup(a); } },
            check: function (v) {
                if (v !== 'ok') { return null; }
                var out = o.submit(api);
                if (out === undefined) { return 'kept open'; }
                answer = out;
                return null;
            }
        }).then(function (r) { return r.value === 'ok' ? answer : r.value === 'remove' ? '' : null; });
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
        var out = { name: m[2], args: (m[3] || '').trim(), positional: [], named: {} }, t = m[3] || '', i = 0;
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
        var f = existing ? parseFigure(existing) : null, id = 'md-fig-' + (dlgCount + 1) + '-', width = splitWidth(f ? f.width : '');
        var body = '<div class="md-figure-fields">' +
            '<label class="form-label" for="' + id + 'src">Picture</label>' +
            '<div class="md-figure-src"><input class="form-input" id="' + id + 'src" data-key="src" value="' + esc(f ? f.src : '') + '" autocomplete="off" spellcheck="false" placeholder="cat.png, ~/Pictures/cat.png or https://…" required>' +
            (pictures ? '<button type="button" class="btn" data-act="browse">Browse…</button><button type="button" class="btn" data-act="upload">Upload…</button>' : '') + '</div>' +
            '<p class="form-help">A picture beside the document, one in your home folder, one of the site\'s, or an address on the web.</p>' +
            '<label class="form-label" for="' + id + 'alt">What It Shows</label>' +
            '<input class="form-input" id="' + id + 'alt" data-key="alt" value="' + esc(f ? f.alt : '') + '" autocomplete="off">' +
            '<p class="form-help">For someone who can\'t see it. Leave it empty for a picture that only decorates.</p>' +
            '<label class="form-label" for="' + id + 'width">Largest Width</label>' +
            '<div class="md-figure-width"><span class="number-field"><input class="form-input" type="number" id="' + id + 'width" data-key="width" value="' + esc(width.n) + '" min="1" step="1" placeholder="Column"></span>' +
            '<span class="form-select-wrap"><select class="form-select" data-key="unit" aria-label="Unit of the Width">' + WIDTH_UNITS.map(function (u) { return '<option value="' + u + '"' + (u === width.u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></span></div>' +
            '<p class="form-help">Of the column (%), or in px, rem, em or ch; empty takes the column\'s width.</p>' +
            '<label class="form-label" for="' + id + 'caption">Caption</label>' +
            '<input class="form-input" id="' + id + 'caption" data-key="caption" value="' + esc(f ? f.caption : '') + '" autocomplete="off">' +
            '<p class="form-help">Under the picture, in Markdown.</p>' +
            '<p class="form-error" data-role="error" hidden></p>' +
            '<input type="file" accept="image/*" hidden data-role="file">' +
            '</div>';
        var dlg = null, errorLine = null;
        function field(k) { return dlg.querySelector('[data-key="' + k + '"]'); }
        function problem(text, focus) { errorLine.textContent = text; errorLine.hidden = false; if (focus) { focus.focus(); } }
        function browse() {
            pictures.site().then(function (site) {
                var F = site.F, FB = site.FB, dir = pictures.dir ? pictures.dir() : null;
                return FB.pick(F, {
                    mode: 'open', title: 'Choose a Picture', host: pictures.root, start: dir && F.resolve(null, dir) ? dir : '~',
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
        function upload(file) {
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
        }
        return ownForm({
            title: f ? 'Change the Picture' : 'Insert a Picture', className: 'md-figure', body: body, remove: !!f, okLabel: f ? 'Change' : 'Insert',
            setup: function (api) {
                dlg = api.dialog; errorLine = dlg.querySelector('[data-role="error"]');
                var file = dlg.querySelector('[data-role="file"]');
                api.body.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-act]');
                    if (!b) { return; }
                    if (b.getAttribute('data-act') === 'browse') { browse(); }
                    else if (b.getAttribute('data-act') === 'upload') { file.value = ''; file.click(); }
                });
                file.addEventListener('change', function () { upload(file); });
                if (f) { field('caption').focus(); }
            },
            submit: function () {
                var src = field('src').value.trim(), number = field('width').value.trim(), unit = field('unit').value;
                if (!src) { problem('The picture needs an address, such as cat.png or ~/Pictures/cat.png.', field('src')); return undefined; }
                if (number && !(parseFloat(number) > 0)) { problem('The width is a number above zero, such as 80.', field('width')); return undefined; }
                return buildFigure({ src: src, alt: field('alt').value.trim(), width: number ? String(parseFloat(number)) + unit : '', caption: field('caption').value.trim() });
            }
        });
    }
    /* A drawn block pressed on the page: a picture opens its dialog, and
       resolves to the block's new source, '' to take it out, or null to
       leave it; any other block is undefined, for the page to edit as its
       Markdown. */
    function editBlock(src, pictures) {
        if (parseFigure(src)) { return askFigure(src, pictures); }
        var sc = parseShortcode((src || '').trim());
        if (sc && FORMS[sc.name] && (src || '').trim().indexOf('\n') < 0) { return askShortcode(sc.name, src.trim(), pictures); }
        return undefined;
    }

    /* === Forms for the standalone shortcodes ==============================
       Each is { title, inline, fields, read(sc) -> values, write(values) ->
       the shortcode or { problem, field } }. A field is { key, label, kind
       (text, select, number), help, placeholder, options (a list of [value,
       label], or a function of the host giving a promise of one), min, max,
       browse (a picker for a file) }. */
    function plain(v) { return String(v == null ? '' : v).trim().replace(/[{}\n]/g, ''); }
    var STATUS = [['green', 'Green, Done or Good'], ['blue', 'Blue, Information'], ['yellow', 'Yellow, a Warning'], ['red', 'Red, Failed or Blocked'], ['grey', 'Grey, Neutral']];
    function appletOptions() {
        var defs = window.pudlApplets && window.pudlApplets.definitions ? window.pudlApplets.definitions() : {};
        return Promise.resolve(Object.keys(defs).sort().map(function (k) { return [k, (defs[k] && defs[k].title) || k]; }));
    }
    function glyphOptions() {
        return (window.yavcMdEngine ? window.yavcMdEngine().then(function (m) { return m.glyphs(''); }) : Promise.resolve([])).then(function (list) {
            return (list || []).map(function (g) { return [g, g]; });
        });
    }
    function pageOptions(host) {
        if (!host || !host.site) { return Promise.resolve(null); }
        return host.site().then(function (site) {
            var dir = site.F.resolve(null, '/site/pages');
            if (!dir || !dir.children) { return null; }
            return dir.children.filter(function (c) { return !c.children; }).map(function (c) { return [c.name, c.title ? c.title + ' (' + c.name + ')' : c.name]; });
        }).catch(function () { return null; });
    }
    var FORMS = {
        video: { title: 'A Hosted Video', fields: [
            { key: 'src', label: 'Link', placeholder: 'https://youtu.be/… or https://vimeo.com/…', help: 'The video\'s link from YouTube or Vimeo. YouTube plays without tracking until it is played.' },
            { key: 'title', label: 'Title', help: 'What the video is, for someone who can\'t see it.' }],
            read: function (sc) {
                var p = sc.positional, src = sc.named.src || (p.length > 1 && /^(youtube|vimeo)$/i.test(p[0]) ? p[0] + ' ' + p[1] : p[0] || '');
                return { src: src, title: sc.named.title || '' };
            },
            write: function (v) {
                var src = plain(v.src);
                if (!src) { return { problem: 'The video needs its link.', field: 'src' }; }
                return '{{video:' + src + (plain(v.title) ? ' title=' + quoteArg(plain(v.title)) : '') + '}}';
            } },
        applet: { title: 'An Applet on the Page', fields: [
            { key: 'name', label: 'Applet', kind: 'select', options: appletOptions },
            { key: 'fit', label: 'Size', kind: 'select', options: [['flow', 'As Tall as It Needs'], ['fill', 'Fills the Space It Is Given']] },
            { key: 'state', label: 'Starting State', help: 'Optional, as the applet understands it, such as a board for Conway\'s Game of Life.' }],
            read: function (sc) { return { name: sc.named.name || sc.positional[0] || '', fit: sc.named.fit || 'flow', state: sc.named.state || '' }; },
            write: function (v) {
                var name = plain(v.name);
                if (!/^[a-z][a-z0-9-]*$/.test(name)) { return { problem: 'Choose an applet.', field: 'name' }; }
                return '{{applet:' + name + ' fit=' + (v.fit === 'fill' ? 'fill' : 'flow') + (plain(v.state) ? ' state=' + quoteArg(plain(v.state)) : '') + '}}';
            } },
        code: { title: 'A Code Listing from a File', fields: [
            { key: 'src', label: 'File', placeholder: '~/bin/hello or /applets/dice/dice.js', browse: true, help: 'A file of yours under ~, or one of the site\'s; the page shows it as it is when the page is read.' },
            { key: 'lang', label: 'Language', placeholder: 'From the file name', help: 'Optional, such as javascript or go, for the colouring.' }],
            read: function (sc) { return { src: sc.named.src || sc.positional[0] || '', lang: sc.named.lang || '' }; },
            write: function (v) {
                var src = plain(v.src);
                if (!/^(~\/|\/(?!\/))/.test(src) || src.indexOf('..') >= 0) { return { problem: 'The file is a path from / or under ~, such as ~/bin/hello.', field: 'src' }; }
                return '{{code:' + quoteArg(src) + (plain(v.lang) ? ' lang=' + quoteArg(plain(v.lang)) : '') + '}}';
            } },
        toc: { title: 'Contents', fields: [
            { key: 'min', label: 'From Heading Level', kind: 'number', min: 1, max: 6 },
            { key: 'max', label: 'To Heading Level', kind: 'number', min: 1, max: 6, help: 'The contents list the headings from the one level to the other, linked.' }],
            read: function (sc) { return { min: sc.named.min || '2', max: sc.named.max || '3' }; },
            write: function (v) {
                var a = parseInt(v.min, 10) || 2, b = parseInt(v.max, 10) || 3;
                if (b < a) { return { problem: 'The last level is at or below the first.', field: 'max' }; }
                return a === 2 && b === 3 ? '{{toc}}' : '{{toc:min=' + a + ' max=' + b + '}}';
            } },
        status: { title: 'A Status Label', inline: true, fields: [
            { key: 'colour', label: 'Colour', kind: 'select', options: STATUS },
            { key: 'label', label: 'Label', placeholder: 'Done' }],
            read: function (sc) { var c = (sc.positional[0] || 'green').toLowerCase(); return { colour: c === 'gray' ? 'grey' : c === 'amber' ? 'yellow' : c, label: sc.args.slice((sc.positional[0] || '').length).trim() }; },
            write: function (v) {
                var label = plain(v.label);
                if (!label) { return { problem: 'The label needs some words.', field: 'label' }; }
                return '{{status:' + (v.colour || 'green') + ' ' + label + '}}';
            } },
        kbd: { title: 'Keys', inline: true, fields: [
            { key: 'keys', label: 'Keys', placeholder: 'Ctrl+Shift+P', help: 'The keys to press together, joined by +.' }],
            read: function (sc) { return { keys: sc.args }; },
            write: function (v) {
                var keys = plain(v.keys);
                if (!keys) { return { problem: 'Name the keys, such as Ctrl+C.', field: 'keys' }; }
                return '{{kbd:' + keys + '}}';
            } },
        glyph: { title: 'A Glyph', inline: true, fields: [
            { key: 'name', label: 'Glyph', kind: 'select', options: glyphOptions, help: 'One of the small symbols the site\'s controls use.' }],
            read: function (sc) { return { name: sc.named.name || sc.positional[0] || '' }; },
            write: function (v) { return plain(v.name) ? '{{glyph:' + plain(v.name) + '}}' : { problem: 'Choose a glyph.', field: 'name' }; } },
        page: { title: 'A Link to a Page', inline: true, fields: [
            { key: 'slug', label: 'Page', kind: 'select', options: pageOptions, placeholder: 'about' },
            { key: 'text', label: 'Text', help: 'The words of the link; the page\'s name if empty.' }],
            read: function (sc) {
                var slug = sc.named.slug || sc.positional[0] || '';
                return { slug: slug, text: sc.named.text || (sc.positional.length > 1 ? sc.args.slice(slug.length).trim() : '') };
            },
            write: function (v) {
                var slug = plain(v.slug);
                if (!/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(slug)) { return { problem: 'Choose a page.', field: 'slug' }; }
                return '{{page:' + slug + (plain(v.text) ? ' text=' + quoteArg(plain(v.text)) : '') + '}}';
            } },
        anchor: { title: 'An Anchor', inline: true, fields: [
            { key: 'name', label: 'Name', placeholder: 'section-two', help: 'A link to #name goes here. Letters, digits, - and _, starting with a letter.' }],
            read: function (sc) { return { name: sc.named.name || sc.positional[0] || '' }; },
            write: function (v) {
                var name = plain(v.name);
                return /^[A-Za-z][A-Za-z0-9_-]*$/.test(name) ? '{{anchor:' + name + '}}' : { problem: 'An anchor\'s name is letters, digits, - and _, starting with a letter.', field: 'name' };
            } }
    };
    /* A shortcode's form: a promise of the shortcode to write, '' to take
       it out, or null for no change. existing is the shortcode being
       changed, or null for a new one. host is where files are, for Browse
       and for the site's pages (as for the picture dialog). */
    function askShortcode(name, existing, host) {
        var form = FORMS[name];
        if (!form) { return Promise.resolve(null); }
        var sc = existing ? parseShortcode(existing) : null;
        var values = form.read(sc || { name: name, args: '', positional: [], named: {} });
        var id = 'md-sc-' + (dlgCount + 1) + '-';
        var body = '<div class="md-form-fields">' + form.fields.map(function (f) {
                var fid = id + f.key, v = values[f.key] == null ? '' : values[f.key], help = f.help ? '<p class="form-help">' + esc(f.help) + '</p>' : '';
                var control;
                if (f.kind === 'select') { control = '<span class="form-select-wrap"><select class="form-select" id="' + fid + '" data-key="' + f.key + '" data-value="' + esc(v) + '"><option value="' + esc(v) + '">' + esc(v || 'Loading…') + '</option></select></span>'; }
                else if (f.kind === 'number') { control = '<span class="number-field"><input class="form-input" type="number" id="' + fid + '" data-key="' + f.key + '" value="' + esc(v) + '" min="' + f.min + '" max="' + f.max + '" step="1"></span>'; }
                else { control = '<input class="form-input" id="' + fid + '" data-key="' + f.key + '" value="' + esc(v) + '" autocomplete="off" spellcheck="false"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>'; }
                if (f.browse && host && host.site) { control = '<div class="md-figure-src">' + control + '<button type="button" class="btn" data-act="browse" data-for="' + f.key + '">Browse…</button></div>'; }
                return '<label class="form-label" for="' + fid + '">' + esc(f.label) + '</label>' + control + help;
            }).join('') + '<p class="form-error" data-role="error" hidden></p></div>';
        var dlg = null, errorLine = null;
        function field(k) { return dlg.querySelector('[data-key="' + k + '"]'); }
        return ownForm({
            title: existing ? 'Change ' + form.title.replace(/^(A|An) /, 'the ') : 'Insert ' + form.title.replace(/^(A|An) /, 'a ').replace(/^a a/, 'an a'),
            className: 'md-form', body: body, remove: !!existing, okLabel: existing ? 'Change' : 'Insert',
            setup: function (api) {
                dlg = api.dialog; errorLine = dlg.querySelector('[data-role="error"]');
                /* A choice fills from its list; a value it does not list is kept as a choice of its own. */
                form.fields.forEach(function (f) {
                    if (f.kind !== 'select') { return; }
                    var sel = field(f.key), want = sel.getAttribute('data-value') || '';
                    Promise.resolve(typeof f.options === 'function' ? f.options(host) : f.options).then(function (list) {
                        if (!list) {
                            /* No list to choose from: a text field takes the choice's place. */
                            var input = document.createElement('input');
                            input.className = 'form-input'; input.id = sel.id; input.setAttribute('data-key', f.key); input.value = want; input.autocomplete = 'off'; input.spellcheck = false;
                            if (f.placeholder) { input.placeholder = f.placeholder; }
                            (sel.closest('.form-select-wrap') || sel).replaceWith(input);
                            return;
                        }
                        var opts = list.slice();
                        if (want && !opts.some(function (o) { return o[0] === want; })) { opts.unshift([want, want]); }
                        sel.innerHTML = (want ? '' : '<option value="">Choose…</option>') + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === want ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
                    }).catch(function () { });
                });
                api.body.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-act="browse"]');
                    if (!b) { return; }
                    var key = b.getAttribute('data-for');
                    host.site().then(function (site) {
                        return site.FB.pick(site.F, { mode: 'open', title: 'Choose a File', host: host.root, start: '~',
                            commit: function (c) { var node = c.path ? site.F.resolve(null, c.path) : null; if (!node || node.children) { return 'Choose a file.'; } field(key).value = site.F.displayPath(site.F.realOf(node)); return true; } });
                    }).catch(function (err) { errorLine.textContent = err && err.message || String(err); errorLine.hidden = false; });
                });
            },
            submit: function () {
                var v = {};
                form.fields.forEach(function (f) { var el = field(f.key); v[f.key] = el ? el.value : ''; });
                var out = form.write(v);
                if (typeof out !== 'string') { errorLine.textContent = out.problem; errorLine.hidden = false; var bad = field(out.field); if (bad) { bad.focus(); } return undefined; }
                return out;
            }
        });
    }
    /* === Drawing a page ===================================================
       One renderer for the Editor's preview and page, and Slides' canvas,
       filmstrip, notes and show (review of 2026-11-03: there were two). */

    /* A picture of the home folder as an address this page can draw. The
       address is made once for each version of the file and kept, so
       drawing again (as typing does) makes no new copy of the bytes; when
       the file changes, the old address is released (performance review,
       2026-11-03). Resolves to '' for a file that is not there. */
    var pictureCache = {}, picturePaths = {};
    function pictureURL(node, F) {
        var r = F.realOf(node), path = F.displayPath(r);
        var version = path + '|' + (r.blob || '') + '|' + (r.mtime ? +r.mtime : '') + '|' + (r.size || '');
        if (pictureCache[version]) { return pictureCache[version]; }
        var made = F.readBytes(node).then(function (bytes) { return URL.createObjectURL(new Blob([bytes], { type: (F.typeOf && F.typeOf(node)) || '' })); });
        var was = picturePaths[path];
        if (was && was !== version && pictureCache[was]) {
            pictureCache[was].then(function (u) { if (u) { URL.revokeObjectURL(u); } });
            delete pictureCache[was];
        }
        picturePaths[path] = version;
        pictureCache[version] = made.catch(function () { delete pictureCache[version]; return ''; });
        return pictureCache[version];
    }
    /* A picture's address from a document's own words (cat.png beside the
       document, ~/Pictures/cat.png), for a slide's background say. */
    function pictureFor(src, pictures) {
        if (!pictures || !pictures.site) { return Promise.resolve(''); }
        return pictures.site().then(function (site) {
            var F = site.F, dir = pictures.dir ? pictures.dir() : null, base = (dir && F.resolve(null, dir)) || F.home();
            var node = base ? F.resolve(base, src) : null;
            return node && !node.children ? pictureURL(node, F) : '';
        }).catch(function () { return ''; });
    }
    /* The pictures of the home folder in drawn HTML (the engine marks each
       with data-attachment, its path from the document's folder), read
       from the folder and shown; one not found is marked. */
    function loadImages(target, pictures) {
        var imgs = target.querySelectorAll('img[data-attachment]:not([src])');
        if (!imgs.length) { return; }
        if (!pictures || !pictures.site) { imgs.forEach(function (img) { img.classList.add('ed-missing-image'); }); return; }
        pictures.site().then(function (site) {
            var F = site.F, dir = pictures.dir ? pictures.dir() : null, base = (dir && F.resolve(null, dir)) || F.home();
            imgs.forEach(function (img) {
                var name = img.dataset.attachment, node = base ? F.resolve(base, name) : null;
                if (!node || node.children) { img.classList.add('ed-missing-image'); img.alt = img.alt || name; return; }
                pictureURL(node, F).then(function (url) { if (url) { img.src = url; } else { img.classList.add('ed-missing-image'); } });
            });
        }).catch(function () { imgs.forEach(function (img) { img.classList.add('ed-missing-image'); }); });
    }
    /* A listing ({{code:path}}) is fetched as the page draws: a path on the
       site from /, or one of the reader's own files under ~. */
    function loadListings(target) {
        target.querySelectorAll('code[data-code-src]:not([data-code-loaded])').forEach(function (code) {
            code.setAttribute('data-code-loaded', '');
            var src = code.getAttribute('data-code-src'), pre = code.closest('pre');
            if (pre) { pre.classList.add('code'); pre.setAttribute('data-code-filename', src.split('?')[0].split('/').pop()); }
            var got = src.charAt(0) === '~'
                ? window.yavcUtil.siteFs().then(function (F) { var n = F.resolve(null, src); if (!n || n.children) { throw new Error('no such file'); } return F.read(n); })
                : fetch(src, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.text(); });
            got.then(function (text) { code.textContent = text; if (pre && window.pudlCode && window.pudlCode.enhance) { window.pudlCode.enhance(pre); } })
               .catch(function (err) { code.textContent = 'The file could not be loaded: ' + (err && err.message || err); });
        });
    }
    /* A Mermaid diagram drawn into its place, made safe with its own
       stylesheet kept under its id (apps/md-engine/safe-html.js). */
    var diagramCount = 0;
    function drawDiagram(place, source) {
        var id = 'md-diagram-' + (++diagramCount);
        mermaid().then(function () {
            window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
                theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default' });
            return window.mermaid.render(id, source);
        }).then(function (out) {
            if (!place.isConnected) { return; }
            place.replaceChildren(window.yavcHTML.fragment(out.svg, { diagram: true }));
            place.classList.add('ed-diagram');
        }).catch(function (err) { place.title = 'The diagram could not be drawn: ' + (err && err.message || err); });
    }
    /* Draws the engine's preview blocks into an element. A block whose
       HTML is the same as one already there keeps its element, with its
       diagram, its pictures, its listing and any applet in it running, so
       typing redraws only the blocks it changed (performance review,
       2026-11-03). opts: { pictures: the host's picture service,
       diagrams: false to leave diagrams undrawn, applets: false to leave
       applets unstarted, as a thumbnail does }. */
    function drawBlocks(target, blocks, opts) {
        opts = opts || {};
        var old = Array.prototype.filter.call(target.children, function (c) { return c.classList && c.classList.contains('doc-block'); });
        var byHtml = {};
        old.forEach(function (c) { var k = c.__mdHtml; if (k != null) { (byHtml[k] = byHtml[k] || []).push(c); } });
        var used = new Set(), fresh = [], order = [];
        (blocks || []).forEach(function (b) {
            var kept = (byHtml[b.html] || []).shift();
            if (kept) { used.add(kept); kept.dataset.line = b.line; order.push(kept); return; }
            var block = document.createElement('div');
            block.className = 'doc-block';
            block.dataset.line = b.line;
            block.__mdHtml = b.html;
            block.replaceChildren(window.yavcHTML.fragment(b.html));
            order.push(block);
            fresh.push({ el: block, diagrams: b.diagrams });
        });
        old.forEach(function (c) {
            if (used.has(c)) { return; }
            if (window.pudlApplets && window.pudlApplets.destroy && c.querySelector('[data-applet]')) { try { window.pudlApplets.destroy(c); } catch (err) { } }
            c.remove();
        });
        Array.prototype.forEach.call(target.childNodes, function (c) { if (!(c.classList && c.classList.contains('doc-block'))) { c.remove(); } });
        order.forEach(function (el, i) { if (target.children[i] !== el) { target.insertBefore(el, target.children[i] || null); } });
        fresh.forEach(function (f) {
            if (opts.diagrams !== false) {
                (f.diagrams || []).forEach(function (d) {
                    var place = f.el.querySelector('[data-preview-diagram="' + CSS.escape(d.id) + '"]');
                    if (place && d.language === 'mermaid') { drawDiagram(place, d.source); }
                });
            }
            if (opts.applets !== false && window.pudlApplets && window.pudlApplets.boot && f.el.querySelector('[data-applet]')) { try { window.pudlApplets.boot(f.el); } catch (err) { } }
            loadImages(f.el, opts.pictures);
            loadListings(f.el);
        });
    }

    /* === Properties =======================================================
       A document's front matter as a form (DESIGN.md, decision 17): the
       stock properties, then any others, each a name and a value, which
       may be added, changed and taken out. front is the engine's reading
       of the front matter (internal/frontmatter): { entries: [{ key,
       value, kind, editable }], problem }. opts.hidden are names the host
       edits elsewhere, such as a deck's theme, left out of the form and
       left as they are. Resolves to { set: { name: value, or null to take
       it out }, order: [names] } with only what changed, or null. The
       engine checks every name and value again, and reads the result back,
       before anything is written. */
    var STOCK = [
        { key: 'title', label: 'Title' },
        { key: 'author', label: 'Author' },
        { key: 'subject', label: 'Subject', help: 'What it is about, in a line.' },
        { key: 'keywords', label: 'Keywords', help: 'Words to find it by, separated by commas.' },
        { key: 'lang', label: 'Language', placeholder: 'en-GB', help: 'The language it is written in, as a code such as en-GB or fr, for spelling and for screen readers.' },
        { key: 'date', label: 'Date', kind: 'date', help: 'When it was written or is for.' }
    ];
    var PROP_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
    var PROP_MAX = 2000;
    function propProblem(name, value) {
        if (!PROP_NAME.test(name)) { return '"' + name + '" is not a property name: use letters, digits, - and _, starting with a letter or _, up to 64 of them.'; }
        if (value.length > PROP_MAX) { return 'The value of ' + name + ' is longer than ' + PROP_MAX + ' characters.'; }
        if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(value)) { return 'The value of ' + name + ' holds a character that cannot be kept, such as a line break.'; }
        return null;
    }
    function askProperties(front, opts) {
        opts = opts || {};
        if (front && front.problem) {
            return askChoice('Properties', front.problem + ' Fix it in the text, and the properties can be edited here again.', [['ok', 'OK', true]]).then(function () { return null; });
        }
        var hidden = {}; (opts.hidden || []).forEach(function (k) { hidden[k] = true; });
        var byKey = {}; ((front && front.entries) || []).forEach(function (e) { byKey[e.key] = e; });
        var stockKeys = {}; STOCK.forEach(function (f) { stockKeys[f.key] = true; });
        var custom = ((front && front.entries) || []).filter(function (e) { return !stockKeys[e.key] && !hidden[e.key]; });
        var n = ++dlgCount, id = 'md-props-' + n + '-';
        function customRow(e, k) {
            var locked = e && !e.editable;
            return '<div class="md-prop-row" data-row data-was="' + esc(e ? e.key : '') + '"' + (locked ? ' data-locked' : '') + '>' +
                '<input class="form-input" data-name aria-label="Name" placeholder="name" value="' + esc(e ? e.key : '') + '" autocomplete="off" spellcheck="false"' + (locked ? ' readonly' : '') + '>' +
                '<input class="form-input" data-value aria-label="Value" placeholder="value" value="' + esc(e ? e.value : '') + '" autocomplete="off"' + (locked ? ' readonly title="Written in a form this dialog does not change; edit it in the text."' : '') + '>' +
                (locked ? '<span class="md-prop-note">In the text</span>' : '<button type="button" class="btn" data-act="remove-row" aria-label="Take Out This Property">Remove</button>') + '</div>';
        }
        var html = '<div class="md-props-stock">' + STOCK.map(function (f) {
            var e = byKey[f.key], v = e ? e.value : '', locked = e && !e.editable, fid = id + f.key;
            var input = f.kind === 'date' && !locked
                ? '<input class="form-input" type="date" data-date id="' + fid + '" data-key="' + f.key + '" value="' + esc(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '') + '">'
                : '<input class="form-input" id="' + fid + '" data-key="' + f.key + '" value="' + esc(v) + '" autocomplete="off"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (locked ? ' readonly' : '') + '>';
            var help = locked ? 'Written in a form this dialog does not change; edit it in the text.' : (f.kind === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? 'It is now "' + v + '", which is not a date this field reads; choosing one replaces it.' : f.help);
            return '<div class="form-group"><label class="form-label" for="' + fid + '">' + esc(f.label) + '</label>' + input + (help ? '<p class="form-help">' + esc(help) + '</p>' : '') + '</div>';
        }).join('') + '</div>' +
            '<div class="form-group"><span class="form-label">Other Properties</span><div class="md-props-custom" data-role="custom">' + custom.map(customRow).join('') + '</div>' +
            '<button type="button" class="btn" data-act="add-row">Add a Property</button>' +
            '<p class="form-help">Any name and value of your own, kept in the front matter.' + (opts.hidden && opts.hidden.length ? ' ' + esc(opts.hiddenNote || '') : '') + '</p></div>' +
            '<p class="form-error" data-role="error" hidden></p>';
        var dlg = null, list = null, errorLine = null;
        function problem(text, focus) { errorLine.textContent = text; errorLine.hidden = false; if (focus) { focus.focus(); } }
        return ownForm({
            title: opts.title || 'Properties', className: 'md-props', body: html,
            setup: function (api) {
                dlg = api.dialog; list = dlg.querySelector('[data-role="custom"]'); errorLine = dlg.querySelector('[data-role="error"]');
                api.body.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-act]');
                    if (!b) { return; }
                    var act = b.getAttribute('data-act');
                    if (act === 'add-row') { list.insertAdjacentHTML('beforeend', customRow(null)); list.lastElementChild.querySelector('[data-name]').focus(); }
                    else if (act === 'remove-row') { var row = b.closest('[data-row]'); var next = row.nextElementSibling || row.previousElementSibling; row.remove(); (next ? next.querySelector('input') : dlg.querySelector('[data-act="add-row"]')).focus(); }
                });
                var first = dlg.querySelector('.md-props-stock input:not([readonly])');
                if (first) { first.focus(); }
            },
            submit: function () {
                errorLine.hidden = true;
                var set = {}, order = [], names = {};
                for (var i = 0; i < STOCK.length; i++) {
                    var f = STOCK[i], input = dlg.querySelector('[data-key="' + f.key + '"]'), was = byKey[f.key], v = input.value.trim();
                    if (input.readOnly) { continue; }
                    if (f.kind === 'date' && !v && was && !/^\d{4}-\d{2}-\d{2}$/.test(was.value)) { continue; }
                    var bad = v ? propProblem(f.key, v) : null;
                    if (bad) { problem(bad, input); return undefined; }
                    if (f.key === 'lang' && v && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(v)) { problem('The language is a code such as en, en-GB or pt-BR.', input); return undefined; }
                    if (f.key === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { problem('The date is a day, such as 2026-11-03.', input); return undefined; }
                    if (v !== (was ? was.value : '')) { set[f.key] = v ? v : null; order.push(f.key); }
                }
                var rows = list.querySelectorAll('[data-row]'), kept = {};
                for (var r = 0; r < rows.length; r++) {
                    var row = rows[r], nameEl = row.querySelector('[data-name]'), valueEl = row.querySelector('[data-value]');
                    var name = nameEl.value.trim(), value = valueEl.value.trim(), wasKey = row.getAttribute('data-was');
                    if (row.hasAttribute('data-locked')) { kept[wasKey] = true; names[wasKey] = true; continue; }
                    if (!name && !value) { continue; }
                    if (!name) { problem('A property needs a name.', nameEl); return undefined; }
                    if (stockKeys[name]) { problem(name + ' has its own field above.', nameEl); return undefined; }
                    if (hidden[name]) { problem(name + ' is set elsewhere' + (opts.hiddenWhere ? ', ' + opts.hiddenWhere : '') + '.', nameEl); return undefined; }
                    if (names[name]) { problem('There are two properties called ' + name + '.', nameEl); return undefined; }
                    var bad2 = propProblem(name, value);
                    if (bad2) { problem(bad2, PROP_NAME.test(name) ? valueEl : nameEl); return undefined; }
                    names[name] = true;
                    if (!value) { continue; }
                    if (wasKey && wasKey === name) { kept[wasKey] = true; }
                    var before = byKey[name];
                    if (!before || before.value !== value) { set[name] = value; order.push(name); }
                }
                custom.forEach(function (c) {
                    if (!kept[c.key] && !(c.key in set)) { set[c.key] = null; order.push(c.key); }
                });
                return { set: set, order: order };
            }
        });
    }

    window.yavcMdEditor = {
        here: HERE, stamp: STAMP, placeholder: PLACEHOLDER,
        libs: libs, pageView: pageView, mermaid: mermaid, loadScript: loadScript,
        FORMATS: FORMATS, STYLES: STYLES, INSERTS: INSERTS, SHORTCODES: SHORTCODES, MENU: MENU,
        commands: commands, apply: apply, classesOf: classesOf, insertItem: insertItem, inserts: inserts, textFormat: textFormat, textInsert: textInsert,
        askText: askText, askFields: askFields, askChoice: askChoice, askProperties: askProperties, STOCK: STOCK, askColour: askColour, askColours: askColours, askClass: askClass,
        askFigure: askFigure, editBlock: editBlock, drawBlocks: drawBlocks, drawDiagram: drawDiagram, pictureFor: pictureFor, askShortcode: askShortcode, FORMS: FORMS, boxCommand: boxCommand, BOXES: BOXES, loadImages: loadImages, parseFigure: parseFigure, buildFigure: buildFigure, parseShortcode: parseShortcode,
        _page: null
    };
})();
