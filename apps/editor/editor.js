/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Editor: a graphical text editor for the reader's own files
   (Architecture/files-editor-design.md). The editing surface is
   CodeMirror 6 (MIT), vendored as one bundle in js/vendor; the files come
   from js/sitefs.js, the sandbox the terminal and Files share. A reader's
   files in ~ are edited and saved; a page of the site opens read-only,
   with a way to save a copy to ~. */
(function () {
    'use strict';

    var SELF_SRC = document.currentScript && document.currentScript.src;
    function beside(file) { return SELF_SRC ? SELF_SRC.replace(/editor\.js/, file) : '/applets/editor/' + file; }
    /* The site's shared scripts load through static/yavc-util.js, each once. */
    var loadScript = window.yavcUtil.loadScript;
    /* The editing kit (apps/md-editor): CodeMirror, the page view, Mermaid,
       the formats, Insert and the dialogs, shared with Slides. */
    var kitReady = null;
    function loadKit() {
        if (window.yavcMdEditor) { return Promise.resolve(window.yavcMdEditor); }
        if (!kitReady) {
            kitReady = loadScript(window.yavcUtil.versioned('/applets/md-editor/kit.js')).then(function () { return window.yavcMdEditor; }).catch(function (err) { kitReady = null; throw err; });
        }
        return kitReady;
    }
    function loadCodeMirror() { return loadKit().then(function (k) { return k.libs(); }); }
    function loadSiteFs() { return window.yavcUtil.loadGlobal(window.pcSiteFsSrc, 'pcSiteFs'); }
    function loadBrowser() { return window.yavcUtil.loadGlobal(window.pcFileBrowserSrc, 'pcFileBrowser'); }

    /* Whether the Explorer pane shows, kept per browser; with no choice
       made, it shows on a wide screen, unless the page has a file tree of
       its own at the side (the admin desktop says so in a meta tag). */
    /* The Editor's settings are its own toolbar's Wrap lines and Explorer
       controls, which remember themselves in ~/.config/editor.json
       (js/config.js), so they follow the reader wherever ~ does. */
    var SETTINGS = { wrap: true, explorer: null, explorerWidth: null, keys: null, markdownView: 'visual', documentView: 'visual' };
    var MARKDOWN_VIEWS = [['visual', 'Visual'], ['text', 'Text'], ['split', 'Split']];

    /* === Key bindings ===================================================
       The Editor's commands have names, and a key is bound to a command by
       name. These are the bindings it starts with; ~/.config/editor.json's
       "keys" adds to them and overrides them, a key set to null does
       nothing at all (which turns off CodeMirror's own binding for it), and
       a change to the file applies at once. Keys are written as CodeMirror
       writes them: Mod- is Ctrl (Cmd on a Mac), then Alt-, Shift-, and the
       key, such as "Mod-Shift-;" or "Alt-d". */
    var DEFAULT_KEYS = {
        'Mod-s': 'save', 'Mod-o': 'open',
        'Mod-;': 'insert-timestamp', 'Mod-Shift-;': 'stamp-modified'
    };

    /* Now, in local time with its offset, as ISO 8601 and RFC 3339 write
       it (2026-10-06T16:12:00+08:00), or the local date alone, or in UTC
       with no offset, which is how an HTML page's meta dates are kept and
       read (Pages/page.cshtml.cs reads them in the "s" form). */
    function two(n) { return String(Math.floor(Math.abs(n))).padStart(2, '0'); }
    function now(form) {
        var d = new Date();
        if (form === 'utc') { return d.toISOString().slice(0, 19); }
        var date = d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
        if (form === 'date') { return date; }
        var off = -d.getTimezoneOffset();
        return date + 'T' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()) +
            (off >= 0 ? '+' : '-') + two(off / 60) + ':' + two(off % 60);
    }

    /* CodeMirror refuses a key with a modifier it doesn't know, and would
       refuse it at the first keypress, so a key is checked as it is read:
       its parts are those CodeMirror accepts (@codemirror/view's keymap). */
    function validKey(key) {
        var parts = String(key).split(/-(?!$)/), last = parts.pop();
        return !!last && parts.every(function (m) { return /^(cmd|meta|m|a|alt|c|ctrl|control|s|shift|mod)$/i.test(m); });
    }

    /* A key as a command shows it, in PUDL's spelling (static/yavc-util.js). */
    var keyLabel = window.yavcUtil.shortcut;
    function loadConfig() { return window.yavcUtil.loadGlobal(window.pcConfigSrc, 'pcConfig'); }
    function explorerWanted(s) {
        if (s && typeof s.explorer === 'boolean') { return s.explorer; }
        if (document.querySelector('meta[name="pc-file-sidebar"]')) { return false; }
        return window.matchMedia('(min-width: 900px)').matches;
    }

    var esc = window.yavcUtil.esc;

    /* Colours from PUDL's tokens, as CSS variables, so the editor follows
       the theme with no code of its own. */
    function makeTheme(CM) {
        var tint = function (pct) { return 'color-mix(in srgb, var(--accent) ' + pct + '%, transparent)'; };
        return [
            CM.EditorView.theme({
                '&': { color: 'var(--text)', backgroundColor: 'var(--input-bg)', height: '100%', fontSize: '14px' },
                '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.5' },
                '.cm-content': { caretColor: 'var(--accent)' },
                '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' },
                '.cm-activeLine': { backgroundColor: tint(6) },
                '.cm-activeLineGutter': { backgroundColor: tint(12), color: 'var(--text)' },
                '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
                '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: tint(26) + ' !important' },
                '.cm-selectionMatch': { backgroundColor: tint(14) },
                '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: tint(22), outline: '1px solid ' + tint(50) },
                '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--warn) 30%, transparent)' },
                '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--warn) 55%, transparent)' },
                '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' },
                /* CodeMirror's own panels (Go to Line); the find bar is PUDL's. */
                '.cm-panels input:not(.form-input), .cm-panels button:not(.btn):not(.icon-btn)': { font: 'inherit', fontSize: '13px' },
                '.cm-tooltip': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
                '.cm-diagnostic-error': { borderLeftColor: 'var(--syntax-error)' },
                '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--syntax-error)' },
                '&.cm-focused': { outline: 'none' }
            }),
            /* PUDL's syntax tokens (0.26.0), after the README's CodeMirror
               recipe, with the Markdown and shell tags this editor meets. */
            CM.syntaxHighlighting(CM.HighlightStyle.define([
                { tag: [CM.tags.keyword, CM.tags.operator], color: 'var(--syntax-keyword)' },
                { tag: [CM.tags.string, CM.tags.special(CM.tags.string), CM.tags.regexp, CM.tags.monospace], color: 'var(--syntax-string)' },
                { tag: [CM.tags.number, CM.tags.bool, CM.tags.null], color: 'var(--syntax-number)' },
                { tag: [CM.tags.comment, CM.tags.meta, CM.tags.quote, CM.tags.processingInstruction], color: 'var(--syntax-comment)', fontStyle: 'italic' },
                { tag: [CM.tags.function(CM.tags.variableName), CM.tags.variableName, CM.tags.definition(CM.tags.variableName)], color: 'var(--syntax-name)' },
                { tag: [CM.tags.tagName, CM.tags.typeName, CM.tags.angleBracket], color: 'var(--syntax-tag)' },
                { tag: [CM.tags.attributeName, CM.tags.propertyName], color: 'var(--syntax-attr)' },
                { tag: CM.tags.heading, color: 'var(--syntax-heading)', fontWeight: '700' },
                { tag: [CM.tags.link, CM.tags.url], color: 'var(--syntax-link)', textDecoration: 'underline' },
                { tag: CM.tags.invalid, color: 'var(--syntax-error)' },
                { tag: CM.tags.strong, fontWeight: '700' },
                { tag: CM.tags.emphasis, fontStyle: 'italic' }
            ]))
        ];
    }

    var uid = 0;

    function init(root, opts) {
        opts = opts || {};
        var n = ++uid;
        root.classList.add('pc-editor');
        if (opts.fit === 'fill') { root.classList.add('pc-editor-fill'); }
        /* The Editor's keys (Ctrl+F, Ctrl+S and the rest) work while focus
           is inside it. A press on a part that takes no focus of its own,
           such as the toolbar between its buttons, gives focus to the
           nearest ancestor that can take it, so the Editor's box takes it
           (out of the Tab order) rather than the page, whose keys are the
           browser's. */
        if (!root.hasAttribute('tabindex')) { root.tabIndex = -1; }
        root.innerHTML =
            /* The toolbar is PUDL's, drawn here from the Editor's command
               table and toolbars() (PUDL 0.68.0), folding its groups as the
               window narrows. */
            '<div class="ed-toolbar-slot" data-toolbar-slot></div>' +
            '<div class="tablist doc-tabs ed-tabs" role="tablist" aria-label="Open Files" data-role="tabs"></div>' +
            /* PUDL's splitter divides the Explorer from the work. */
            '<div class="ed-panes split" data-role="panes">' +
              /* The Explorer: the shared file browser's tree, files and all
                 (js/filebrowser.js), filled once the filesystem loads. */
              '<nav class="ed-explorer split-pane" data-role="explorer" aria-label="Files" hidden></nav>' +
              '<div class="split-handle ed-split" data-role="explorer-split" aria-label="Resize the Files" data-split-min="160" data-split-max="50%" hidden></div>' +
              '<div class="ed-work split-pane">' +
                '<div class="code-surface ed-surface" data-role="surface"></div>' +
                /* The page: the document as its page (page-view.js), edited
                   in Visual and Split and read in Preview. The page's find
                   bar sits over it (openFind). */
                '<div class="ed-page" data-role="page-box" hidden>' +
                  '<div class="ed-find-place" data-role="find-place" hidden></div>' +
                  '<div class="ed-scroll" data-role="scroll" tabindex="0"><div class="doc-page" data-role="page" data-ed-page></div></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="ed-status" data-role="status-bar">' +
              '<span class="ed-readonly" data-role="readonly" hidden><span class="glyph" style="--glyph: var(--glyph-pencil-off)" aria-hidden="true"></span>Read-only</span>' +
              '<span data-role="where"></span><span data-role="lang"></span><span data-role="count"></span><span data-role="pos"></span>' +
              '<span class="ed-message" data-role="message" role="status" aria-live="polite"></span>' +
            '</div>' +
            '';

        var q = function (sel) { return root.querySelector(sel); };
        var el = {
            tabs: q('[data-role="tabs"]'), surface: q('[data-role="surface"]'), where: q('[data-role="where"]'),
            panes: q('[data-role="panes"]'), pageBox: q('[data-role="page-box"]'), scroll: q('[data-role="scroll"]'), page: q('[data-role="page"]'), findPlace: q('[data-role="find-place"]'),
            lang: q('[data-role="lang"]'), count: q('[data-role="count"]'), pos: q('[data-role="pos"]'), message: q('[data-role="message"]'),
            readonly: q('[data-role="readonly"]'),
            explorer: q('[data-role="explorer"]'), explorerSplit: q('[data-role="explorer-split"]')
        };
        var FB = null, explorer = null;
        /* What the toolbar's commands show (the command table below): lines
           wrapped, the Markdown views offered, the formatting offered, a
           site page's source to open, and the file's address on the site. */
        var wrapOn = true, viewsOffered = false, formatOffered = false, sourceOffered = false, siteUrl = null;
        function commandsChanged() { if (opts.commandsChanged) { opts.commandsChanged(); } }

        var CM = null, F = null, view = null, destroyed = false, unsubscribe = null;
        var tabs = [], active = -1, untitled = 0;
        var wrapComp = null, langComp = null, lintComp = null, roComp = null, keyComp = null;
        var startFile = fileFrom(opts.state) || (opts.ownsUrl ? fileFrom(location.search) : null);

        function fileFrom(s) {
            if (!s) { return null; }
            var v = new URLSearchParams(String(s).replace(/^\?/, '')).get('file');
            return v || null;
        }

        /* === State ====================================================== */

        function current() { return tabs[active] || null; }
        function stateString() { var t = current(); return t && t.path ? 'file=' + encodeURIComponent(t.path).replace(/%2F/g, '/').replace(/%7E/g, '~') : ''; }
        function announce() {
            if (opts.ownsUrl) {
                var qs = new URLSearchParams(location.search), t = current();
                if (t && t.path) { qs.set('file', t.path); } else { qs.delete('file'); }
                var s = qs.toString().replace(/%2F/g, '/').replace(/%7E/g, '~');
                history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash);
            }
            if (opts.changed) { opts.changed(stateString()); }
        }

        /* A passing message goes in the status line; an error is a notice
           above the document, which stays until dismissed or the next one. */
        function say(msg, isError) {
            if (isError && msg) { window.yavcUtil.notice(el.tabs, msg, true); el.message.textContent = ''; return; }
            el.message.textContent = msg || '';
        }

        /* === Languages ==================================================== */

        function languageFor(path) {
            var p = String(path || '');
            if (/\.(md|markdown)$/i.test(p)) { return 'markdown'; }
            if (/\.json$/i.test(p)) { return 'json'; }
            if (/^~\/bin\/|^\/bin\/|\.sh$/i.test(p)) { return 'script'; }
            return 'text';
        }
        var LANG_NAMES = { markdown: 'Markdown', json: 'JSON', script: 'Script', text: 'Plain Text' };
        /* === Shortcodes in the text =========================================
           A {{shortcode}} is marked as one, its name and its arguments in
           their own colours; {{ offers the shortcodes' names and, inside a
           call, its parameters; and the pointer over one says what it is
           and takes. All from the server's table (/api/admin/editor/shortcodes),
           which the Insert menu reads too. */
        var SHORTCODE = /\{\{\/?[a-z][a-z0-9-]*(?::(?:[^}]|\}(?!\}))*)?\}\}/g;
        var shortcodeHighlight = null, shortcodeHover = null;
        /* Built when first asked for, since CodeMirror loads only when the
           first text is shown. */
        function shortcodeHighlighting() {
            if (shortcodeHighlight) { return shortcodeHighlight; }
            var marks = new CM.MatchDecorator({
                regexp: SHORTCODE,
                decorate: function (add, from, to, m) {
                    var head = /^\{\{\/?[a-z][a-z0-9-]*/.exec(m[0])[0].length;
                    add(from, from + head, CM.Decoration.mark({ class: 'cm-shortcode cm-shortcode-name' }));
                    if (to - 2 > from + head) { add(from + head, to - 2, CM.Decoration.mark({ class: 'cm-shortcode cm-shortcode-args' })); }
                    add(to - 2, to, CM.Decoration.mark({ class: 'cm-shortcode cm-shortcode-name' }));
                }
            });
            shortcodeHighlight = CM.ViewPlugin.define(function (v) {
                return { deco: marks.createDeco(v), update: function (u) { this.deco = marks.updateDeco(u, this.deco); } };
            }, { decorations: function (p) { return p.deco; } });
            return shortcodeHighlight;
        }
        function shortcodeByName(name) { return (shortcodes || []).find(function (s) { return s.name === name; }) || null; }
        function shortcodeComplete(ctx) {
            var name = ctx.matchBefore(/\{\{\/?[a-z0-9-]*$/);
            if (name) {
                var closing = name.text.indexOf('{{/') === 0;
                return loadShortcodes().then(function (list) {
                    return {
                        from: name.from + (closing ? 3 : 2),
                        validFor: /^[a-z0-9-]*$/,
                        options: list.filter(function (s) { return !closing || s.kind === 'container'; }).map(function (s) {
                            /* The braces close themselves as {{ is typed (closeBrackets), so only the name goes in, with a colon where arguments follow. */
                            return { label: s.name, type: 'keyword', detail: s.title, info: s.description + (s.example ? '\n\n' + s.example : ''),
                                apply: !closing && s.params.length ? s.name + ':' : s.name };
                        })
                    };
                });
            }
            var inside = ctx.matchBefore(/\{\{([a-z][a-z0-9-]*)(?::[^}]*)?[\s:]([a-z0-9-]*)$/);
            if (!inside) { return null; }
            var m = /\{\{([a-z][a-z0-9-]*)/.exec(inside.text), word = /[a-z0-9-]*$/.exec(inside.text)[0];
            return loadShortcodes().then(function () {
                var s = shortcodeByName(m[1]);
                if (!s || !s.params.length) { return null; }
                return {
                    from: ctx.pos - word.length,
                    validFor: /^[a-z0-9-]*$/,
                    options: s.params.map(function (p) { return { label: p.name, type: 'property', detail: p.required ? 'needed' : '', info: p.description, apply: p.name + '=' }; })
                };
            });
        }
        function shortcodeHovering() {
            if (shortcodeHover) { return shortcodeHover; }
            shortcodeHover = CM.hoverTooltip(function (v, pos) {
            var line = v.state.doc.lineAt(pos), text = line.text, m;
            SHORTCODE.lastIndex = 0;
            while ((m = SHORTCODE.exec(text))) {
                var from = line.from + m.index, to = from + m[0].length;
                if (pos < from || pos > to) { continue; }
                var name = /^\{\{\/?([a-z][a-z0-9-]*)/.exec(m[0])[1], s = shortcodeByName(name);
                if (!s) { loadShortcodes(); return null; }
                return { pos: from, end: to, above: true, create: function () {
                    var dom = document.createElement('div');
                    dom.className = 'ed-sc-tip';
                    dom.innerHTML = '<p class="ed-sc-tip-title"><strong>' + esc(s.title) + '</strong> <code>{{' + esc(s.name) + '}}</code></p><p>' + esc(s.description) + '</p>' +
                        (s.params.length ? '<dl>' + s.params.map(function (p) { return '<dt><code>' + esc(p.name) + '</code>' + (p.required ? ' (needed)' : '') + '</dt><dd>' + esc(p.description) + '</dd>'; }).join('') + '</dl>' : '');
                    return { dom: dom };
                } };
            }
            return null;
            }, { hoverTime: 350 });
            return shortcodeHover;
        }
        function shortcodeExtensions() {
            return [shortcodeHighlighting(), CM.autocompletion({ override: [shortcodeComplete], activateOnTyping: true, icons: false }), shortcodeHovering()];
        }

        function langExtension(lang) {
            if (lang === 'markdown') { return [CM.markdown(), shortcodeExtensions()]; }
            if (lang === 'json') { return CM.json(); }
            if (lang === 'script') { return CM.StreamLanguage.define(CM.shell); }
            return [];
        }

        /* JSON is checked as it is typed. */
        function lintExtension(tab) {
            if (tab.lang !== 'json' || tab.readOnly) { return []; }
            return [CM.linter(CM.jsonParseLinter()), CM.lintGutter()];
        }

        function stateFor(tab, text) {
            return CM.EditorState.create({ doc: text, extensions: extensionsFor(tab) });
        }
        function extensionsFor(tab) {
            return [
                    CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.highlightSpecialChars(),
                    CM.history(), CM.drawSelection(), CM.dropCursor(), CM.indentOnInput(),
                    CM.bracketMatching(), CM.closeBrackets(), CM.rectangularSelection(), CM.crosshairCursor(),
                    CM.highlightActiveLine(), CM.highlightSelectionMatches(),
                    /* The Editor's own bindings come first, so they win over
                       CodeMirror's for the same key. */
                    keyComp.of(keyBindings()),
                    /* CodeMirror's history keys include Ctrl+U, undo selection,
                       which would answer before the menu's Underline does. */
                    CM.keymap.of([].concat(
                        CM.closeBracketsKeymap, CM.defaultKeymap, CM.searchKeymap, CM.historyKeymap.filter(function (b) { return b.key !== 'Mod-u'; }), CM.lintKeymap, [CM.indentWithTab])),
                    CM.search({ top: true, createPanel: findPanel }),
                    makeTheme(CM),
                    wrapComp.of(wrapOn ? CM.EditorView.lineWrapping : []),
                    langComp.of(langExtension(tab.lang)),
                    lintComp.of(lintExtension(tab)),
                    roComp.of([CM.EditorState.readOnly.of(!!tab.readOnly), CM.EditorView.editable.of(!tab.readOnly)]),
                    CM.EditorView.contentAttributes.of({ 'aria-label': 'Text of ' + tab.name }),
                    CM.EditorView.updateListener.of(function (u) {
                        if (u.docChanged && tabs[active] === tab) { markModified(tab); }
                        /* In Split, the page follows the text. */
                        if (u.docChanged && tabs[active] === tab && !visual.fromVisual) { textChangedForPage(); }
                        /* The paragraph style shows the line the cursor is on. */
                        if (u.selectionSet || u.docChanged) { showPos(); showCount(); if (tab.lang === 'markdown') { commandsChanged(); } }
                        if (tabs[active] === tab && (u.selectionSet || u.docChanged ||
                            CM.searchPanelOpen(u.state) !== CM.searchPanelOpen(u.startState))) { keep(); }
                    })
            ];
        }

        /* === Tabs ======================================================== */

        function markModified(tab) {
            var mod = view.state.doc.toString() !== tab.saved;
            if (mod !== tab.modified) { tab.modified = mod; renderTabs(); }
        }

        /* PUDL's document tabs (pudl-tabs.js): the arrow keys move along
           them, and the close button or Delete asks, through
           pudl:tab-close, for the tab to close. */
        /* The tab row is the site's document tabs (static/doc-tabs.js),
           shown only while more than one document is open. */
        /* Right-clicks (PUDL's pudl:contextmenu): the text and the page get
           Edit and Format, a file in the pane gets Open. */
        root.addEventListener('pudl:contextmenu', function (e) {
            var t = e.detail.target;
            if (!t.closest) { return; }
            var node = t.closest('.ed-explorer a[data-path]');
            if (node) {
                var target = F && F.resolve(null, node.getAttribute('data-path'));
                if (!target) { return; }
                e.detail.mark(node);
                if (target.children) { e.detail.add([{ label: target.getAttribute ? 'Open' : 'Open', glyph: 'folder', run: function () { if (explorer) { explorer.go(target); } } }]); }
                else { e.detail.add([{ label: 'Open', glyph: 'document', run: function () { openPath(F.displayPath(F.realOf(target))); } }]); }
                return;
            }
            if (t.closest('.ed-surface, .ed-page, .cm-editor, .ProseMirror, [data-role="surface"], [data-role="page"]')) {
                var rows = ['undo', 'redo', '-', 'find', '-'];
                if (formatOffered) { rows = rows.concat(window.yavcMdEditor ? window.yavcMdEditor.MENU.format : []); }
                e.detail.add(window.pudlCommands ? window.pudlCommands.menuRows(rows, root) : rows);
            }
        });
        var tabRow = window.yavcDocTabs ? window.yavcDocTabs.attach(el.tabs, {
            tabs: function () { return tabs.map(function (t) { return { name: t.name, path: t.path, modified: t.modified, note: t.readOnly ? '(read-only)' : '' }; }); },
            active: function () { return active; },
            activate: function (i) { activate(i); view.focus(); },
            close: closeTab
        }) : null;
        function renderTabs() {
            if (tabRow) { tabRow.render(); }
            var t = current();
            el.where.textContent = t ? (t.path || 'Not saved yet') : '';
            el.lang.textContent = t ? LANG_NAMES[t.lang] : '';
            showCount();
            showFormat(viewMode);
            el.readonly.hidden = !(t && t.readOnly);
            var node = t && t.path && F ? F.resolve(F.home(), t.path) : null;
            sourceOffered = !!(F && F.mounted && node && t.readOnly && F.sourceOf(node));
            /* Any Markdown file has a page: Visual, Split and Preview. */
            viewsOffered = !!(t && t.lang === 'markdown');
            siteUrl = node && F.mounted ? F.publicUrl(node) : null;
            commandsChanged();
            keep();
        }

        /* An article's source under /wwwroot/content can be previewed (A11). */
        function previewable(node) {
            var r = F.realOf(node);
            return r.server === 'wwwroot' && /^content\/[A-Za-z0-9_-]+\.(md|html)$/.test(r.rel);
        }

        /* The words in a Markdown file, or in the text selected in it, with
           the time they take to read in the tooltip. It waits for a pause in
           typing, since counting reads the whole document. Every view
           counts the text, which the page keeps up to date as it is edited. */
        var countTimer = 0;
        function showCount() {
            clearTimeout(countTimer);
            countTimer = setTimeout(function () {
                var t = current(), K = window.yavcMdEditor;
                if (destroyed || !view || !K || !t || t.lang !== 'markdown') { el.count.textContent = ''; el.count.removeAttribute('title'); return; }
                var sel = view.state.selection.main, nf = new Intl.NumberFormat();
                var total = K.wordCount(view.state.doc.toString()), picked = sel.empty ? 0 : K.wordCount(view.state.sliceDoc(sel.from, sel.to));
                el.count.textContent = (picked ? nf.format(picked) + ' of ' : '') + nf.format(total) + (total === 1 ? ' word' : ' words');
                if (total) { el.count.title = 'About ' + K.readingMinutes(total) + ' min to read'; } else { el.count.removeAttribute('title'); }
            }, 250);
        }
        function showPos() {
            if (!view) { return; }
            var head = view.state.selection.main.head, line = view.state.doc.lineAt(head);
            el.pos.textContent = 'Line ' + line.number + ', column ' + (head - line.from + 1);
        }

        function activate(i) {
            var prev = current(), switching = i !== active;
            if (prev && view) { prev.state = view.state; prev.scroll = scrollAnchor(); }
            /* Each tab keeps its own view. The page belongs to the file it
               was made for, so the one coming to the front makes its own. */
            if (switching && viewMode !== 'text') { setView('text'); }
            active = i;
            var t = current();
            if (!t) { view.setState(CM.EditorState.create({ doc: '' })); renderTabs(); announce(); return; }
            view.setState(t.state);
            /* A tab kept from before the key bindings last changed takes
               the bindings as they are now. */
            view.dispatch({ effects: keyComp.reconfigure(keyBindings()) });
            /* Each tab keeps its place, and a search panel kept open from
               before a reload opens again. */
            scrollTo(t.scroll);
            if (t.openSearch) { t.openSearch = false; CM.openSearchPanel(view); }
            renderTabs();
            showPos();
            announce();
            /* Each tab keeps its view: the one it had, or for a Markdown
               file the one the settings open Markdown in. */
            var want = t.view || (t.lang === 'markdown' ? markdownDefault() : 'text');
            if (want !== 'text' && t.lang === 'markdown' && want !== viewMode) { setView(want); }
            markExplorer();
            say(t.external ? 'This file was changed somewhere else since you opened it.' : '', !!t.external);
            if (switching && t.view && t.view !== 'text' && canEditVisually()) { setView(t.view); }
        }

        function addTab(t, text) {
            t.saved = text;
            t.modified = false;
            t.state = stateFor(t, text);
            tabs.push(t);
            activate(tabs.length - 1);
            /* Focus would raise the Editor's window over one the reader has
               since brought forward, so it waits for the window to be in
               front. */
            if (inFront()) { view.focus(); }
        }
        function inFront() { return opts.ownsUrl || !root.closest('.win') || !!root.closest('.win.active'); }

        /* Opens a file by path: switches to it if it is open already. */
        /* With strict, a file that can't be opened throws, for the Open
           dialog to show; otherwise the status line says why. */
        async function openPath(path, strict) {
            function fail(msg) { if (strict) { throw new Error(msg); } say(msg, true); return false; }
            /* An address or kept tab from before the site moved under /site
               still finds its file. */
            path = F.upgradePath(path);
            var node = F.resolve(F.home(), path);
            if (!node) { return fail(path + ': no such file'); }
            if (node.children) { return fail(path + ' is a folder'); }
            var r = F.realOf(node), display = F.displayPath(r);
            for (var i = 0; i < tabs.length; i++) { if (tabs[i].path === display) { if (i !== active) { activate(i); } view.focus(); return true; } }
            if (!F.isText(r)) { return fail(display + ' isn\'t a text file, so the editor can\'t open it.'); }
            var text;
            try { text = await F.read(r); } catch (err) { return fail(err.message); }
            var readOnly = !r.home;
            /* A server file remembers its time, which tells a change made
               elsewhere from this tab's own save. */
            addTab({ path: display, name: r.name, lang: languageFor(display), readOnly: readOnly, mtime: r.server ? +r.mtime : null }, text);
            say(readOnly
                ? (F.mounted && F.sourceOf(r) ? 'This is the page as the site shows it, read-only. "Edit the source" opens the file it\'s made from.'
                    : 'This is part of the site, so it opens read-only. "Save a copy to ~" keeps an editable copy.')
                : '');
            return true;
        }

        /* A file that does not exist yet, in a folder of ~: a tab that
           creates it when saved. */
        function newNamed(path) {
            var sp = F.splitPath(path), dir = F.resolve(F.home(), sp.dir);
            if (!dir || !dir.children || !dir.home || !F.validName(sp.base)) {
                newTab();
                say(path + ': no such file, and one can\'t be made there', true);
                return;
            }
            var display = F.displayPath(dir).replace(/\/$/, '') + '/' + sp.base;
            addTab({ path: display, name: sp.base, lang: languageFor(display), readOnly: false, fresh: true }, '');
            say(display + ' is a new file. Saving creates it.');
        }

        /* At docs.yavc.app the Editor starts for documents (docs-design,
           decision 17): the server marks the mount, and a new file is then
           a .docs.md document, which opens on its page. */
        var forDocuments = root.getAttribute('data-editor-start') === 'documents';
        function newTab() {
            untitled++;
            if (forDocuments) {
                addTab({ path: null, name: 'untitled-' + untitled + '.docs.md', lang: 'markdown', readOnly: false }, '');
                return;
            }
            addTab({ path: null, name: 'untitled-' + untitled, lang: 'text', readOnly: false }, '');
        }

        async function closeTab(i) {
            var t = tabs[i];
            if (!t) { return; }
            if (t.modified) {
                if (active !== i) { activate(i); }
                var choice = await window.yavcDialog.askSave(t.name);
                if (choice == null) { return; }
                if (choice === 'save' && !(await save())) { return; }
            }
            /* The editor's text belongs to the tab in front. Closing another
               tab leaves it there and only renumbers. Closing the tab in
               front drops its text with it: active is cleared first, or
               activate() would keep the closed file's text in whichever tab
               slid into its place, and a save would write it there. */
            var wasActive = active;
            tabs.splice(i, 1);
            if (!tabs.length) { active = -1; newTab(); return; }
            if (i !== wasActive) {
                active = i < wasActive ? wasActive - 1 : wasActive;
                renderTabs();
                return;
            }
            active = -1;
            activate(Math.min(i, tabs.length - 1));
        }

        /* === Saving ====================================================== */

        async function save() {
            var t = current();
            if (!t || t.readOnly) { return false; }
            if (!t.path) { return saveAs(); }
            return writeTo(t, t.path);
        }

        /* With strict, a write that fails throws, for the Save as dialog to
           show; otherwise the status line says why. */
        async function writeTo(t, path, strict) {
            var text = view.state.doc.toString();
            say('Saving…');
            var res = await F.write(F.home(), path, text, false);
            if (res.error) {
                if (strict) { say(''); throw new Error('Not saved: ' + res.error); }
                say('Not saved: ' + res.error, true);
                return false;
            }
            var display = F.displayPath(res.node);
            var renamed = t.path !== display;
            t.path = display;
            t.name = res.node.name;
            t.saved = text;
            t.mtime = res.node.server ? +res.node.mtime : null;
            t.modified = false;
            t.external = false;
            t.fresh = false;
            t.readOnly = false;
            if (renamed) {
                var lang = languageFor(display);
                t.lang = lang;
                view.dispatch({ effects: [langComp.reconfigure(langExtension(lang)), lintComp.reconfigure(lintExtension(t)),
                    roComp.reconfigure([CM.EditorState.readOnly.of(false), CM.EditorView.editable.of(true)])] });
            }
            renderTabs();
            announce();
            markExplorer();
            say('Saved ' + display + '.');
            return true;
        }

        async function saveAs() {
            var t = current();
            if (!t) { return false; }
            /* A file of yours saves beside itself; anything else starts in ~. */
            var node = t.path ? F.resolve(F.home(), t.path) : null, r = node ? F.realOf(node) : null;
            var startDir = r && r.home && !t.readOnly ? F.displayPath(r.parent) : '~';
            var name = t.readOnly ? t.name + (/\.[a-z0-9]+$/i.test(t.name) ? '' : '.txt') : t.name;
            /* The dialog stays open while the file is written, and says
               there why it couldn't be. */
            var res = await FB.pick(F, {
                mode: 'save', title: t.readOnly ? 'Save a Copy' : 'Save As', host: root, start: (F && F.resolve(F.home(), '~/Documents')) ? '~/Documents' : '~',
                start: startDir, name: name, current: t.readOnly ? null : t.path, computer: true,
                commit: function (c) { return c.download ? true : writeTo(t, c.path, true); }
            });
            if (!res) { return false; }
            if (res.download) {
                download(res.download, new Blob([view.state.doc.toString()], { type: 'text/plain' }));
                say('Downloaded ' + res.download + '. The tab still holds your text.');
                return false;
            }
            return true;
        }

        var download = window.yavcUtil.download;

        /* === Dialogs ====================================================== */

        /* One dialog for questions and paths: resolves to the chosen
           button's name, or with an input, to the text entered. */
        async function openDialog() {
            var t = current(), node = t && t.path ? F.resolve(F.home(), t.path) : null;
            /* It opens beside the file in front, or in ~. */
            var res = await FB.pick(F, {
                mode: 'open', title: 'Open', host: root, computer: true,
                start: node ? F.displayPath(F.realOf(node).parent) : '~',
                check: function (r) { return F.isText(r) ? null : r.name + ' isn\'t a text file, so the editor can\'t open it.'; },
                /* The dialog stays open while the file is read, and says
                   there why it couldn't be. */
                commit: function (c) { return c.file ? openFromComputer(c.file, true) : openPath(c.path, true); }
            });
        }

        /* A file from the reader's computer opens as a new tab that belongs
           nowhere yet, so saving it asks where. */
        var COMPUTER_MAX = 5 * 1024 * 1024;
        async function openFromComputer(file, strict) {
            function fail(msg) { if (strict) { throw new Error(msg); } say(msg, true); }
            if (file.size > COMPUTER_MAX) { return fail(file.name + ' is larger than 5 MB, too large to edit here.'); }
            var text = await file.text();
            if (text.indexOf('\0') >= 0) { return fail(file.name + ' isn\'t a text file, so the editor can\'t open it.'); }
            addTab({ path: null, name: file.name, lang: languageFor(file.name), readOnly: false }, text);
            /* It stays unsaved until it is saved somewhere on the site. */
            var t = current();
            t.saved = null;
            t.modified = true;
            renderTabs();
            say('Opened ' + file.name + ' from your computer. Save puts it in ~, and Save as can download it again.');
        }

        /* === The Explorer pane ============================================ */

        function setupExplorer() {
            el.explorer.innerHTML = FB.markup.body({ list: false, treeLabel: 'Files' });
            explorer = FB.create(el.explorer, F, {
                treeFiles: true,
                toggleFolders: true,
                onOpen: function (node) {
                    var r = F.realOf(node);
                    if (r.kind === 'link') { window.open(r.url, '_blank', 'noopener'); return; }
                    if (r.kind === 'app' || !F.isText(r)) {
                        var url = F.publicUrl(r);
                        if (url) { window.open(url, '_blank', 'noopener'); } else { say(node.name + ' isn\'t a file the editor can open.', true); }
                        return;
                    }
                    openPath(F.displayPath(r));
                },
                say: function (m, isError) { if (m) { say(m, isError); } }
            });
            showExplorer(explorerWanted(settings));
            markExplorer();
            explorer.onChange(keep);
        }

        /* The settings, as last read or changed, and a change arriving from
           elsewhere: another Editor, another tab, or the file edited. */
        var settings = Object.assign({}, SETTINGS), unConfig = null;
        function applySettings(s) {
            settings = Object.assign({}, SETTINGS, s);
            if (wrapOn !== !!settings.wrap) { setWrap(!!settings.wrap, false); }
            if (explorer && typeof settings.explorer === 'boolean' && el.explorer.hidden === settings.explorer) { showExplorer(settings.explorer); }
            if (explorerSplit) { explorerSplit.set(typeof settings.explorerWidth === 'number' ? settings.explorerWidth : null); }
            if (view && keyComp) {
                view.dispatch({ effects: keyComp.reconfigure(keyBindings()) });
                if (keyProblems) { say(keyProblems, true); }
            }
        }

        /* The Explorer's width, dragged at its divider and kept with the
           other settings. */
        var explorerSplit = null;
        function setupExplorerSplit() {
            if (!window.pcSplit) { return; }
            explorerSplit = window.pcSplit.of(el.explorerSplit, function (w) { saveSetting({ explorerWidth: w }); });
            explorerSplit.set(typeof settings.explorerWidth === 'number' ? settings.explorerWidth : null);
        }
        function saveSetting(changes) {
            Object.assign(settings, changes);
            loadConfig().then(function (c) { return c.set('editor', changes); }).catch(function () { });
        }

        function showExplorer(on) {
            el.explorer.hidden = !on;
            el.explorerSplit.hidden = !on;
            if (on && window.pudlSplit) { window.pudlSplit.refresh(); }
            commandsChanged();
        }
        function toggleExplorer() {
            if (!explorer) { return; }
            var on = el.explorer.hidden;
            showExplorer(on);
            saveSetting({ explorer: on });
        }
        /* Wrap lines, as the toolbar, the View menu or a key switches it,
           kept with the settings when the reader changes it. */
        /* Settings are shared by every address of the site, so the view a
           Markdown file opens in at docs.yavc.app is a setting of its own,
           which starts at Visual whatever the Editor's is. */
        var viewKey = forDocuments ? 'documentView' : 'markdownView';
        function markdownDefault() {
            return MARKDOWN_VIEWS.some(function (v) { return v[0] === settings[viewKey]; }) ? settings[viewKey] : 'visual';
        }
        function setMarkdownDefault(v) {
            var change = {};
            change[viewKey] = v;
            saveSetting(change);
            commandsChanged();
        }
        function setWrap(on, keepIt) {
            wrapOn = !!on;
            if (view) { view.dispatch({ effects: wrapComp.reconfigure(wrapOn ? CM.EditorView.lineWrapping : []) }); }
            if (keepIt) { saveSetting({ wrap: wrapOn }); }
            commandsChanged();
        }

        /* The Explorer marks the file in front and opens its way to it. */
        function markExplorer() {
            if (!explorer) { return; }
            var t = current(), node = t && t.path ? F.resolve(F.home(), t.path) : null;
            explorer.markCurrent(node ? F.pathOf(F.realOf(node)) : null);
        }

        /* === Views: Text, Visual and Split ================================= */

        /* A Markdown article's page is the public site's own page for the
           unsaved text, a draft the server keeps for an hour (A11). Visual
           and Split make that page the editing surface (js/editor-visual.js,
           Architecture/wysiwyg-editor-design.md), Visual alone and Split
           beside the text. Save publishes. Preview is not a view: it opens
           the page as it is on the site (openOnSite). */
        var viewMode = 'text';
        var visual = { api: null, front: null, fromVisual: false, timer: 0, loading: null, gen: 0 };

        /* A call to one of the server's admin APIs, signing in again when the
           session has ended. The token is read at each try, since signing in
           replaces it. */
        async function adminPost(url, data) {
            var payload = JSON.stringify(data);
            function send() {
                var token = (document.querySelector('meta[name="request-verification-token"]') || {}).content || '';
                return fetch(url, {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json', RequestVerificationToken: token },
                    body: payload
                });
            }
            var r = await send();
            if (r.status === 401 && window.pcAdmin && window.pcAdmin.signIn) {
                try { await window.pcAdmin.signIn(); r = await send(); } catch (err) { /* The 401 stands. */ }
            }
            var body = await r.json().catch(function () { return {}; });
            if (!r.ok) { throw new Error(body.error || ('the server answered ' + r.status)); }
            return body;
        }

        function articleNode() {
            var t = current(), node = t && t.path && F ? F.resolve(F.home(), t.path) : null;
            return node && F.mounted && previewable(node) ? node : null;
        }
        function canEditVisually() { var node = articleNode(); return !!(node && /\.md$/i.test(F.realOf(node).rel)); }
        function slugOf(node) { return F.realOf(node).rel.replace(/^content\//, '').replace(/\.(md|html)$/i, ''); }

        /* === Views: Visual, Split and Preview =============================
           The page is Dinah Desktop's page view (page-view.js): the whole
           document as one ProseMirror editor in Visual, beside the text in
           Split, where each follows the other; Preview draws the page for
           reading. The Markdown goes to and from the page through the
           Markdown engine, md/yavc-md.wasm, which runs here in the browser,
           so the text never leaves it. */
        /* The page view's files sit beside this one and take its version,
           so a change to them ships with the Editor's own. */
        var HERE = (SELF_SRC || '/applets/editor/editor.js').split('?')[0].replace(/editor\.js$/, '');
        var STAMP = SELF_SRC && SELF_SRC.indexOf('?') >= 0 ? SELF_SRC.slice(SELF_SRC.indexOf('?')) : '';
        /* The Markdown engine is shared with Slides: apps/md-engine/loader.js
           loads it once for the page. */
        function mdEngine() {
            return loadScript(window.yavcUtil.versioned('/applets/md-engine/loader.js')).then(function () { return window.yavcMdEngine(); });
        }
        async function pageParts() {
            await mdEngine();
            await loadKit().then(function (k) { return k.pageView(); });
        }
        function pageActive() { return !!(visual.api && visual.api.active()); }
        function pageHost() {
            return {
                /* The / menu on the page offers the Insert menu's shortcodes. */
                inserts: function () {
                    var extra = [];
                    if (F && F.mounted && shortcodes) {
                        shortcodes.filter(function (s) { return s.name !== 'column' && !SHORTCODES.some(function (i) { return i.name === s.name; }); }).forEach(function (s) {
                            extra.push({ id: 'insert-' + s.name, label: s.title, words: s.name + ' ' + s.title.toLowerCase(), markdown: s.example });
                        });
                    }
                    return window.yavcMdEditor ? window.yavcMdEditor.inserts(extra, picturesHost) : [];
                },
                /* A picture pressed on the page opens the picture dialog. */
                editBlock: function (src) { return window.yavcMdEditor.editBlock(src, picturesHost()); },
                root: root, page: el.page, scroll: el.scroll,
                text: function () { return view.state.doc.toString(); },
                setText: takeVisualText,
                docOf: function (text) { return mdEngine().then(function (m) { return m.doc(text); }); },
                markdownOf: function (doc) { return mdEngine().then(function (m) { return m.markdown(doc); }); },
                sourceOf: function (src) { return mdEngine().then(function (m) { return m.source(src); }); },
                wrapOf: function (line) { return mdEngine().then(function (m) { return m.container(line); }); },
                inlineOf: function (src) { return mdEngine().then(function (m) { return m.inline(src); }); },
                blocksOf: function (text) { return mdEngine().then(function (m) { return m.blocks(text); }); },
                draw: function (target, html, diagrams) { drawBlocks(target, [{ line: 0, html: html, diagrams: diagrams }]); },
                keys: pageKeys,
                say: say,
                changed: function () { commandsChanged(); if (visualFind && !el.findPlace.hidden) { visualFind.refresh(); } },
                failed: function (text) { say(text, true); setView(viewMode === 'visual' ? 'preview' : 'text'); }
            };
        }
        /* The Editor's keys on the page, in ProseMirror's spelling, which is
           CodeMirror's: the formatting, the styles, Save and Find. */
        function pageKeys() {
            var keys = [];
            FORMATS.forEach(function (f) { if (f[3]) { keys.push({ key: f[3], run: function () { applyFormat(f[0]); return true; } }); } });
            STYLES.forEach(function (st) { keys.push({ key: st[2], run: function () { applyFormat(st[0]); return true; } }); });
            keys.push({ key: 'Mod-s', run: function () { save(); return true; } });
            keys.push({ key: 'Mod-f', run: function () { openFind(); return true; } });
            return keys;
        }
        function textChangedForPage() {
            if (pageActive()) { visual.api.textChanged(); }
            if (viewMode === 'preview') { schedulePreview(); }
        }

        /* Shows the document as asked. Visual and Split need a Markdown
           file that can be changed; Preview any Markdown file. */
        async function setView(mode) {
            var t = current();
            if (['visual', 'split', 'preview'].indexOf(mode) < 0) { mode = 'text'; }
            if (mode !== 'text' && !(t && t.lang === 'markdown')) { mode = 'text'; }
            if ((mode === 'visual' || mode === 'split') && t && t.readOnly) { mode = 'preview'; }
            viewMode = mode;
            commandsChanged();
            root.classList.toggle('ed-previewing', mode !== 'text');
            root.classList.toggle('ed-visual-only', mode === 'visual' || mode === 'preview');
            root.classList.toggle('ed-reading', mode === 'preview');
            showFormat(mode);
            el.pageBox.hidden = mode === 'text';
            var gen = ++visual.gen;
            clearTimeout(visual.timer);
            if (mode === 'text') {
                closePageFind(false);
                if (visual.api) { await visual.api.enable(false); }
                el.page.replaceChildren();
                say('');
                keep();
                return;
            }
            try {
                await mdEngine();
                if (gen !== visual.gen) { return; }
                if (mode === 'preview') {
                    if (visual.api) { await visual.api.enable(false); }
                    if (gen !== visual.gen) { return; }
                    await drawPreview();
                } else {
                    if (!visual.api) {
                        await pageParts();
                        if (gen !== visual.gen) { return; }
                        visual.api = window.yavcPageView.attach(pageHost());
                        if (window.yavcMdEditor) { window.yavcMdEditor._page = visual.api; }
                    }
                    await visual.api.enable(true);
                    if (gen !== visual.gen) { return; }
                    if (!el.findPlace.hidden && lastFind) { pageFind.set(lastFind); visualFind.refresh(); }
                    say(mode === 'split'
                        ? 'Edit the text or the page; each follows the other. Click a block drawn from its Markdown to change it.'
                        : 'Edit the page as it will look. Click a block drawn from its Markdown to change it.');
                    if (mode === 'visual') { visual.api.focus(); }
                }
            } catch (err) {
                say('The page could not be made: ' + (err && err.message || err), true);
            }
            keep();
        }
        function detachVisual() {
            clearTimeout(visual.timer);
            if (visual.api) { try { visual.api.enable(false); } catch (err) { } }
        }

        /* === Preview ===================================================== */
        function schedulePreview() {
            clearTimeout(visual.timer);
            visual.timer = setTimeout(function () { drawPreview().catch(function (err) { say('The preview could not be drawn: ' + (err && err.message || err), true); }); }, 250);
        }
        async function drawPreview() {
            var gen = visual.gen, m = await mdEngine();
            if (gen !== visual.gen || !view || viewMode !== 'preview') { return; }
            var p = m.preview(view.state.doc.toString()), top = el.scroll.scrollTop;
            drawBlocks(el.page, p.blocks);
            el.scroll.scrollTop = top;
            var problems = p.problems || [];
            if (problems.length) {
                say((problems.length === 1 ? 'One problem' : problems.length + ' problems') + (problems[0].line ? ', line ' + problems[0].line : '') + ': ' + problems[0].message, false);
            } else { say(''); }
        }
        /* Draws preview blocks into an element with the kit's renderer
           (apps/md-editor/kit.js drawBlocks): made safe, diagrams, pictures,
           listings and applets drawn, and blocks that did not change kept. */
        function drawBlocks(target, blocks) { window.yavcMdEditor.drawBlocks(target, blocks, { pictures: picturesHost() }); }
        var INSERTS = window.yavcMdEditor ? window.yavcMdEditor.INSERTS : [], SHORTCODES = window.yavcMdEditor ? window.yavcMdEditor.SHORTCODES : [];
        /* Where a format or an insert goes: the page in Visual, the text
           in Text and Preview, and in Split whichever has the keyboard. */
        function editCtx() {
            return {
                page: function () { return visual.api; }, text: function () { return view; },
                onPage: function () { return formatsThePage(); },
                readOnly: function () { var t = current(); return !t || !!t.readOnly; },
                blockStyle: blockStyle, say: say, pictures: picturesHost
            };
        }
        function insertBlock(item) { window.yavcMdEditor.insertItem(item, editCtx()); }
        /* File, Properties: the front matter read by the engine, changed in
           the kit's dialog, and written back by the engine, which changes
           only the lines of the properties that changed and reads the
           result back before it is used. The text takes it as one change,
           which Undo takes back. */
        async function editProperties() {
            var t = current();
            if (!t || t.readOnly || !view) { return; }
            try {
                if (pageActive() && visual.api.sync) { await visual.api.sync(); }
                var m = await mdEngine(), text = view.state.doc.toString();
                var front = m.front(text);
                var r = await window.yavcMdEditor.askProperties(front, { title: 'Properties of ' + (t.name || 'the Document') });
                if (!r || !r.order.length) { return; }
                if (view.state.doc.toString() !== text) { say('The document changed while the dialog was open, so the properties were not written. Try again.', true); return; }
                var next = m.frontset({ text: text, set: r.set, order: r.order }).text;
                var a = 0;
                while (a < text.length && a < next.length && text[text.length - 1 - a] === next[next.length - 1 - a]) { a++; }
                view.dispatch({ changes: { from: 0, to: text.length - a, insert: next.slice(0, next.length - a) }, userEvent: 'input' });
                say('The properties were changed.');
            } catch (err) { say(String(err && err.message || err), true); }
        }
        /* Where the document's pictures are, for the kit's picture dialog
           and its loader: beside the document when it is saved under ~. */
        function picturesHost() {
            return {
                site: function () { return Promise.resolve({ F: F, FB: FB }); },
                root: root, say: say,
                dir: function () { var t = current(); return t && t.path ? (F.splitPath(t.path).dir || '~') : null; }
            };
        }

        /* === Find and replace ===========================================
           One find bar for the text and the page, in PUDL's parts: the two
           fields sunken, the buttons raised, Match Case, Whole Word and
           Regular Expression as latching buttons (as Chat's Thinking is),
           the count of matches, and Close. In the text the bar is
           CodeMirror's search panel (search({ createPanel })), so CodeMirror
           highlights the matches and keeps the query with the tab; on the
           page it sits over the frame and drives the visual editor's own
           search (js/editor-visual.js). The query carries over when the view
           changes. Enter finds the next match and Shift+Enter the one
           before; in the Replace field Enter replaces it and Ctrl+Enter
           replaces them all; Escape closes the bar. */
        var lastFind = null, visualFind = null;
        var FIND_OPTS = [['caseSensitive', 'Aa', 'Match Case'], ['wholeWord', 'W', 'Whole Word'], ['regexp', '.*', 'Regular Expression']];
        function findBar(driver) {
            var dom = document.createElement('div');
            dom.className = 'ed-find';
            dom.setAttribute('role', 'search');
            dom.setAttribute('aria-label', 'Find and Replace');
            var g = function (name) { return '<span class="glyph" style="--glyph: var(--glyph-' + name + ')" aria-hidden="true"></span>'; };
            /* The grid inside the bar, so the bar's own width can set it out
               (a container query in css/editor.css). */
            dom.innerHTML = '<div class="ed-find-grid">' +
                '<div class="ed-find-row">' +
                  '<input class="form-input ed-find-field" type="text" data-find="search" placeholder="Find" aria-label="Find" autocomplete="off" spellcheck="false" main-field="true" />' +
                  '<span class="ed-find-tools">' +
                    '<span class="ed-find-count" data-find="count" aria-live="polite"></span>' +
                    '<button type="button" class="btn btn-sm" data-find="prev" aria-label="Previous Match" title="Previous Match (Shift+Enter)">' + g('arrow-up') + '</button>' +
                    '<button type="button" class="btn btn-sm" data-find="next" aria-label="Next Match" title="Next Match (Enter)">' + g('arrow-down') + '</button>' +
                    '<span class="ed-find-opts" role="group" aria-label="Options">' + FIND_OPTS.map(function (o) {
                        return '<button type="button" class="btn btn-sm ed-find-opt" data-opt="' + o[0] + '" aria-pressed="false" aria-label="' + o[2] + '" title="' + o[2] + '">' + o[1] + '</button>';
                    }).join('') + '</span>' +
                    '<button type="button" class="icon-btn ed-find-close" data-find="close" aria-label="Close" title="Close (Escape)">' + g('close') + '</button>' +
                  '</span>' +
                '</div>' +
                '<div class="ed-find-row" data-find="replace-row">' +
                  '<input class="form-input ed-find-field" type="text" data-find="replace" placeholder="Replace With" aria-label="Replace With" autocomplete="off" spellcheck="false" />' +
                  '<span class="ed-find-tools">' +
                    '<button type="button" class="btn btn-sm" data-find="replace-one" title="Replace This Match (Enter)">Replace</button>' +
                    '<button type="button" class="btn btn-sm" data-find="replace-all" title="Replace Every Match (Ctrl+Enter)">Replace All</button>' +
                  '</span>' +
                '</div>' +
            '</div>';
            var f = function (k) { return dom.querySelector('[data-find="' + k + '"]'); };
            var search = f('search'), replace = f('replace');
            var opt = function (k) { return dom.querySelector('[data-opt="' + k + '"]'); };
            function query() {
                var q = { search: search.value, replace: replace.value };
                FIND_OPTS.forEach(function (o) { q[o[0]] = opt(o[0]).getAttribute('aria-pressed') === 'true'; });
                return q;
            }
            function show(q) {
                if (!q) { return; }
                if (search.value !== (q.search || '')) { search.value = q.search || ''; }
                if (replace.value !== (q.replace || '')) { replace.value = q.replace || ''; }
                FIND_OPTS.forEach(function (o) { opt(o[0]).setAttribute('aria-pressed', String(!!q[o[0]])); });
            }
            function refresh() {
                var c = driver.count(), count = f('count');
                count.textContent = !search.value ? '' : c.error ? 'Not a valid expression' : !c.total ? 'No matches'
                    : c.at ? c.at + ' of ' + (c.total >= 1000 ? '1000+' : c.total) : (c.total >= 1000 ? '1000+' : c.total) + (c.total === 1 ? ' match' : ' matches');
                count.classList.toggle('ed-find-none', !!search.value && (!!c.error || !c.total));
                f('prev').disabled = f('next').disabled = !c.total;
                f('replace-row').hidden = driver.readOnly();
                f('replace-one').disabled = f('replace-all').disabled = !c.total;
            }
            function apply() { var q = query(); lastFind = q; driver.set(q); refresh(); }
            search.addEventListener('input', apply);
            replace.addEventListener('input', apply);
            /* A press on a button leaves the keyboard in the field. */
            dom.addEventListener('mousedown', function (e) { if (e.target.closest('button')) { e.preventDefault(); } });
            dom.addEventListener('click', function (e) {
                var b = e.target.closest('button');
                if (!b || b.disabled) { return; }
                if (b.hasAttribute('data-opt')) { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); apply(); return; }
                switch (b.getAttribute('data-find')) {
                    case 'prev': driver.prev(); break;
                    case 'next': driver.next(); break;
                    case 'replace-one': driver.replace(); break;
                    case 'replace-all': driver.replaceAll(); break;
                    case 'close': driver.close(); return;
                }
                refresh();
            });
            dom.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); driver.close(); return; }
                if (e.key !== 'Enter' || e.isComposing) { return; }
                e.preventDefault(); e.stopPropagation();
                if (e.target === replace) { if (e.ctrlKey || e.metaKey) { driver.replaceAll(); } else { driver.replace(); } }
                else if (e.shiftKey) { driver.prev(); } else { driver.next(); }
                refresh();
            });
            return { dom: dom, show: show, refresh: refresh, focus: function () { search.focus(); search.select(); } };
        }

        /* The text's search, which is CodeMirror's. */
        function textFind(v) {
            return {
                set: function (q) { v.dispatch({ effects: CM.setSearchQuery.of(new CM.SearchQuery(q)) }); },
                next: function () { CM.findNext(v); },
                prev: function () { CM.findPrevious(v); },
                replace: function () { CM.replaceNext(v); },
                replaceAll: function () { CM.replaceAll(v); },
                close: function () { CM.closeSearchPanel(v); v.focus(); },
                readOnly: function () { return v.state.readOnly; },
                count: function () {
                    var q = CM.getSearchQuery(v.state);
                    if (!q.search) { return { total: 0 }; }
                    if (!q.valid) { return { total: 0, error: true }; }
                    var sel = v.state.selection.main, total = 0, at = 0, cur = q.getCursor(v.state);
                    for (var r = cur.next(); !r.done && total < 1000; r = cur.next()) {
                        total++;
                        if (r.value.from === sel.from && r.value.to === sel.to) { at = total; }
                    }
                    return { total: total, at: at };
                }
            };
        }
        /* CodeMirror's search panel, made as the find bar. */
        function findPanel(v) {
            var bar = findBar(textFind(v)), shown = null;
            return {
                dom: bar.dom, top: true,
                /* As CodeMirror's own panel does, the bar takes the keyboard
                   when it first appears; openSearchPanel focuses it after. */
                mount: function () { shown = CM.getSearchQuery(v.state); bar.show(shown); bar.refresh(); bar.focus(); },
                update: function (u) {
                    var q = CM.getSearchQuery(u.state);
                    if (q !== shown) { shown = q; bar.show(q); }
                    bar.refresh();
                }
            };
        }

        /* The page's search: the page view marks the matches of a matcher
           built from the find bar's query, and the bar moves among them. */
        var pageMatches = { total: 0, at: 0 }, pageQuery = null;
        function matcherOf(q) {
            if (!q || !q.search) { return null; }
            var src = q.regexp ? q.search : q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (q.wholeWord) { src = '(?<![\\p{L}\\p{N}_])(?:' + src + ')(?![\\p{L}\\p{N}_])'; }
            var re;
            try { re = new RegExp(src, 'gu' + (q.caseSensitive ? '' : 'i')); } catch (err) { return null; }
            return function (text) {
                var out = [], m;
                re.lastIndex = 0;
                while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } out.push({ from: m.index, to: m.index + m[0].length }); }
                return out;
            };
        }
        function replacementFor(q, matched) {
            var rep = q && q.replace != null ? q.replace : '';
            if (!q || !q.regexp) { return rep; }
            try { return matched.replace(new RegExp(q.search, q.caseSensitive ? 'u' : 'iu'), rep); } catch (err) { return rep; }
        }
        function pageGo(i) { visual.api.goToMatch(i); pageMatches.at = i + 1; }
        var pageFind = {
            set: function (q) {
                pageQuery = q;
                if (!pageActive()) { pageMatches = { total: 0, at: 0 }; return; }
                var matcher = matcherOf(q), r = visual.api.find(matcher);
                pageMatches = { total: r.count, at: 0, error: !!(q && q.search && !matcher) };
                if (r.count) { pageGo(r.after >= 0 ? r.after : 0); }
            },
            next: function () { if (pageMatches.total && pageActive()) { pageGo(pageMatches.at % pageMatches.total); } },
            prev: function () { if (pageMatches.total && pageActive()) { pageGo((pageMatches.at - 2 + pageMatches.total) % pageMatches.total); } },
            replace: function () {
                if (!pageMatches.total || !pageActive()) { return; }
                var i = Math.max(0, pageMatches.at - 1);
                visual.api.replaceMatch(i, replacementFor(pageQuery, visual.api.matchText(i)));
                var r = visual.api.find(matcherOf(pageQuery));
                pageMatches = { total: r.count, at: 0 };
                if (r.count) { pageGo(Math.min(i, r.count - 1)); }
            },
            replaceAll: function () {
                if (!pageMatches.total || !pageActive()) { return; }
                visual.api.replaceAllMatches(function (text) { return replacementFor(pageQuery, text); });
                visual.api.find(matcherOf(pageQuery));
                pageMatches = { total: 0, at: 0 };
            },
            close: function () { closePageFind(true); },
            readOnly: function () { var t = current(); return !t || !!t.readOnly; },
            count: function () { return pageMatches; }
        };
        function openPageFind() {
            if (!visualFind) { visualFind = findBar(pageFind); el.findPlace.appendChild(visualFind.dom); }
            el.findPlace.hidden = false;
            var q = lastFind || (view ? CM.getSearchQuery(view.state) : null);
            if (q && q.search) { visualFind.show(q); pageFind.set(q); }
            visualFind.refresh();
            visualFind.focus();
        }
        function closePageFind(back) {
            el.findPlace.hidden = true;
            if (pageActive()) { visual.api.find(null); }
            pageMatches = { total: 0, at: 0 };
            if (back && pageActive()) { visual.api.focus(); }
        }
        /* Find in whichever the reader is working in: the page in Visual, or
           in Split while the text does not have the keyboard; else the text. */
        function openFind() {
            if (formatsThePage() && pageActive()) { openPageFind(); return; }
            if (!view) { return; }
            if (lastFind && !CM.getSearchQuery(view.state).search) {
                view.dispatch({ effects: CM.setSearchQuery.of(new CM.SearchQuery(lastFind)) });
            }
            CM.openSearchPanel(view);
        }

        /* The page's edit, as text: the least change that turns the text into
           the new text, so the cursor and the undo history in Split keep
           their sense. */
        function takeVisualText(text) {
            var old = view.state.doc.toString();
            if (old === text) { return; }
            var a = 0, b = 0;
            while (a < old.length && a < text.length && old[a] === text[a]) { a++; }
            while (b < old.length - a && b < text.length - a && old[old.length - 1 - b] === text[text.length - 1 - b]) { b++; }
            visual.fromVisual = true;
            try { view.dispatch({ changes: { from: a, to: old.length - b, insert: text.slice(a, text.length - b) }, userEvent: 'input.visual' }); }
            finally { visual.fromVisual = false; }
        }

        /* The formatting is offered for a Markdown file in any view, and
           in Visual and Split whatever the file. */
        function showFormat(mode) {
            var t = current();
            var on = !!(mode === 'visual' || mode === 'split' || (t && t.lang === 'markdown' && !t.readOnly));
            if (on !== formatOffered) { formatOffered = on; commandsChanged(); if (window.pudlMenubar) { window.pudlMenubar.refresh(); } }
        }
        /* The formatting goes to the page in Visual, to the text in Text and
           Preview, and in Split to whichever has the keyboard, the text when
           it does and the page otherwise. A toolbar button keeps the
           keyboard where it was, so Split can still tell. */
        function formatsThePage() { return pageActive() && (viewMode === 'visual' || (viewMode === 'split' && !(view && view.hasFocus))); }
        function applyFormat(name) { window.yavcMdEditor.apply(name, editCtx()); }

        /* The insert menu lists the shortcodes, from the server's table, in
           alphabetical order of the titles it shows. */
        var shortcodes = null, shortcodesLoading = null;
        function loadShortcodes() {
            if (shortcodes) { return Promise.resolve(shortcodes); }
            if (!shortcodesLoading) {
                shortcodesLoading = fetch('/api/admin/editor/shortcodes', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
                    /* The body is read either way: a refusal left unread (a
                       visitor not signed in) stays open in the browser. */
                    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return r.ok ? b : { shortcodes: [] }; }); })
                    .then(function (b) { shortcodes = (b.shortcodes || []).map(function (s) { s.params = s.params || []; return s; }); return shortcodes; })
                    .catch(function () { shortcodes = []; return shortcodes; });
            }
            return shortcodesLoading;
        }
        /* The Insert menu's items, one command a shortcode, in order of
           their titles; until the table has loaded, one saying so. */
        function insertItems() {
            var items = INSERTS.map(function (i) { return { id: i.id, label: i.label, run: function () { insertBlock(i); } }; });
            items.push('-');
            SHORTCODES.forEach(function (i) { items.push({ id: i.id, label: i.label, run: function () { insertBlock(i); } }); });
            if (F && F.mounted && shortcodes) {
                items.push('-');
                shortcodes.filter(function (s) { return s.name !== 'column'; }).sort(function (a, b) {
                    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
                }).forEach(function (s) {
                    items.push({ id: 'insert-' + s.name, label: s.title, run: function () { insertShortcode(s.name); } });
                });
            }
            return items;
        }
        function insertShortcode(name) {
            var s = (shortcodes || []).find(function (x) { return x.name === name; });
            if (!s) { return; }
            /* A figure is asked for as a form; the rest go in as their
               examples, into the page or into the text. */
            var asked = s.name === 'figure' ? window.yavcMdEditor.askFigure(null, picturesHost()) : Promise.resolve(s.example);
            asked.then(function (src) {
                if (!src) { return; }
                if (formatsThePage()) { visual.api.insertShortcode(s.name === 'figure' ? 'block' : s.kind === 'span' ? 'inline' : s.kind, src); }
                else { insertText(s.kind === 'inline' || s.kind === 'span' ? src : '\n' + src + '\n'); }
            });
        }

        /* === Changes made elsewhere ======================================= */

        /* A file saved by the terminal, Files or another tab: an open tab
           with no unsaved changes takes the new text; one with changes is
           told, and keeps the reader's version. */
        function onFsChange() {
            tabs.forEach(function (t, i) {
                if (!t.path || t.readOnly) { return; }
                var node = F.resolve(F.home(), t.path);
                if (!node && t.fresh) { return; }
                if (!node) { t.external = true; if (i === active) { say(t.path + ' was deleted or moved somewhere else. Save to keep this text.', true); } return; }
                var r = F.realOf(node);
                /* A server file changed elsewhere shows a new time; only then
                   is its text fetched. */
                if (r.server) {
                    if (t.mtime != null && +r.mtime === t.mtime) { return; }
                    F.read(r).then(function (text) { t.mtime = +r.mtime; takeOutside(t, tabs.indexOf(t), text); renderTabs(); }).catch(function () { });
                    return;
                }
                takeOutside(t, i, F.readHome(r));
            });
            renderTabs();
        }

        /* A change made somewhere else, as the text between what the two
           versions share at their start and at their end, so the cursor
           and the place in the file stay where they were. It isn't the
           reader's edit, so undo doesn't take it back. */
        function outsideChange(state, text) {
            var old = state.doc.toString(), start = 0, end = 0;
            var max = Math.min(old.length, text.length);
            while (start < max && old.charCodeAt(start) === text.charCodeAt(start)) { start++; }
            while (end < max - start && old.charCodeAt(old.length - 1 - end) === text.charCodeAt(text.length - 1 - end)) { end++; }
            return {
                changes: { from: start, to: old.length - end, insert: text.slice(start, text.length - end) },
                annotations: CM.Transaction.addToHistory.of(false)
            };
        }

        function takeOutside(t, i, text) {
            if (i < 0 || text === t.saved) { return; }
            var edited = (i === active ? view.state.doc.toString() : t.state.doc.toString()) !== t.saved;
            if (!edited) {
                t.saved = text;
                if (i === active) { view.dispatch(outsideChange(view.state, text)); t.modified = false; }
                else { t.state = t.state.update(outsideChange(t.state, text)).state; }
            } else {
                t.external = true;
                if (i === active) { say(t.path + ' was changed somewhere else. Saving will replace that version with yours.', true); }
            }
        }

        /* A file handed to a running editor, by an open request
           (pudlApplets.request) or a preset, opens in a tab, or as a new
           file by that name. */
        function takeFile(s) {
            var f = fileFrom(s);
            if (!f || !F || !CM) { return; }
            openPath(f).then(function (opened) { if (!opened && !F.resolve(F.home(), f)) { newNamed(f); } });
        }

        /* === Keeping the work through a reload ============================ */

        /* The Editor's snapshot (js/snapshot.js): each open tab with its
           unsaved text, cursor and selection, how far it is scrolled, its
           undo history and its search, and which tab is in front and whether
           which view each is in. A reload brings all of it back. A draft
           for a file that can't be reached when the Editor starts, as a
           server file can't while signed out, waits in the snapshot until it
           can.

           The same record is the Editor's session, kept in this browser's
           storage under pc-editor-session, so closing the Editor's window
           and opening it again, in this tab or another, or after the browser
           restarts, brings back the documents it had open, unsaved text
           and all. A reload prefers the tab's own snapshot, which is newer
           when two tabs each have an Editor. The first instance keeps the
           session; a numbered one keeps only its snapshot. */
        var snap = window.pcSnapshot ? window.pcSnapshot.join(root, takeSnapshot) : null;
        var waiting = [], restoring = false;
        var SESSION_KEY = 'pc-editor-session';
        /* PUDL keys a numbered instance name-2 to name-9 (0.27.0). */
        var ownsSession = !/-[2-9]$/.test(String(opts.instance || ''));
        var sessionTimer = 0;
        function keep() {
            if (restoring) { return; }
            if (snap) { snap.changed(); }
            if (ownsSession) { clearTimeout(sessionTimer); sessionTimer = setTimeout(keepSession, 500); }
        }
        /* Writes the session now; false when the browser would not keep it. */
        function keepSession() {
            clearTimeout(sessionTimer);
            if (!ownsSession || restoring || !view || !CM) { return true; }
            var s = takeSnapshot();
            try {
                if (s && (s.tabs.length || s.waiting.length)) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
                else { localStorage.removeItem(SESSION_KEY); }
                return true;
            } catch (err) { return false; }
        }
        function readSession() {
            if (!ownsSession) { return null; }
            try { var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return s && Array.isArray(s.tabs) ? s : null; }
            catch (err) { return null; }
        }

        /* Whether a file is the one a snapshot was taken against: its
           length and an FNV-1a hash of its text. */
        function fingerprint(text) {
            var h = 0x811c9dc5;
            for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
            return text.length + ':' + (h >>> 0).toString(16);
        }

        /* Where a tab is scrolled to, as the line at the top of the view and
           how far into it, which survives a window of another size. */
        var pendingScroll = null;
        function scrollAnchor() {
            if (!view) { return null; }
            /* A place asked for and not yet reached is still the place. */
            if (pendingScroll != null) { return pendingScroll; }
            var top = view.scrollDOM.scrollTop, block = view.lineBlockAtHeight(top);
            return block ? { at: block.from, off: Math.round(top - block.top) } : null;
        }
        function scrollTo(place) {
            pendingScroll = null;
            if (!place || typeof place !== 'object' || !view) { return; }
            var at = Math.min(place.at || 0, view.state.doc.length), off = place.off || 0, tab = current();
            var asked = pendingScroll = { at: at, off: off };
            requestAnimationFrame(function () {
                /* Unless another place was asked for meanwhile, or another
                   tab came to the front. */
                if (pendingScroll !== asked) { return; }
                pendingScroll = null;
                if (current() !== tab) { return; }
                /* The line is brought into view, which measures it, and the
                   offset into it then set in the same terms it was read in. */
                view.dispatch({ effects: CM.EditorView.scrollIntoView(at, { y: 'start', yMargin: 0 }) });
                requestAnimationFrame(function () {
                    if (current() === tab && view.state.doc.length >= at) { view.scrollDOM.scrollTop = view.lineBlockAt(at).top + off; }
                });
            });
        }

        function searchOf(state) {
            var q = CM.getSearchQuery(state), open = CM.searchPanelOpen(state);
            if (!open && !q.search) { return null; }
            return { open: open, search: q.search, replace: q.replace, caseSensitive: q.caseSensitive, regexp: q.regexp, wholeWord: q.wholeWord };
        }

        var SNAPSHOT_MAX = 1500000;
        function takeSnapshot() {
            /* Until what was kept is all back, it is still the whole of it. */
            if (restoring) { return snap.kept; }
            if (!view || !CM) { return null; }
            var front = current();
            if (front) { front.state = view.state; front.scroll = scrollAnchor(); }
            var list = [], frontAt = -1;
            tabs.forEach(function (t) {
                var st = t.state, text = st.doc.toString();
                if (!t.path && !t.modified) { return; }
                if (t === front) { frontAt = list.length; }
                var json = st.toJSON({ history: CM.historyField });
                list.push({
                    path: t.path, name: t.name, lang: t.lang, mtime: t.mtime, fresh: !!t.fresh,
                    draft: t.modified ? text : null, sum: t.modified ? null : fingerprint(text),
                    selection: json.selection, history: json.history, scroll: t.scroll == null ? null : t.scroll,
                    search: searchOf(st), view: t === front ? viewMode : (t.view || 'text')
                });
            });
            var out = { tabs: list, front: frontAt, waiting: waiting, view: viewMode, explorer: explorer ? explorer.snapshot() : null };
            /* Undo history is the first thing let go when the whole would be
               too large for the browser to keep. */
            if (JSON.stringify(out).length > SNAPSHOT_MAX) { list.forEach(function (k) { k.history = null; }); }
            return out;
        }

        /* A tab's kept state on the text it now has. Its cursor and undo
           history only fit the text they were taken from: the draft, or for
           a tab without changes, the file as it was then. A file changed
           since keeps its cursor near where it was, without its history. */
        function applyKept(t, k) {
            var text = typeof k.draft === 'string' ? k.draft : t.saved;
            var exact = typeof k.draft === 'string' || (k.sum != null && k.sum === fingerprint(t.saved));
            var state = null;
            if (exact && k.selection) {
                try {
                    var json = { doc: text, selection: k.selection };
                    if (k.history) { json.history = k.history; }
                    state = CM.EditorState.fromJSON(json, { extensions: extensionsFor(t) }, k.history ? { history: CM.historyField } : undefined);
                } catch (err) { state = null; }
            }
            if (!state) {
                state = stateFor(t, text);
                var head = k.selection && k.selection.ranges && k.selection.ranges[k.selection.main || 0];
                if (head) {
                    var at = Math.min(head.head, text.length);
                    state = state.update({ selection: { anchor: at } }).state;
                }
            }
            if (k.search && k.search.search) {
                state = state.update({ effects: CM.setSearchQuery.of(new CM.SearchQuery(k.search)) }).state;
            }
            t.state = state;
            t.scroll = k.scroll;
            t.view = k.view === 'visual' || k.view === 'split' ? k.view : 'text';
            t.openSearch = !!(k.search && k.search.open);
            t.modified = text !== t.saved;
            /* The tab in front takes its new state through activate(), which
               would otherwise keep the old one. */
            var i = tabs.indexOf(t);
            if (i === active) { active = -1; activate(i); }
        }

        /* The snapshot kept before the reload, or the Editor's own record
           from before snapshots, which it kept the same way. */
        function readKept() {
            if (snap && snap.kept && Array.isArray(snap.kept.tabs)) { return snap.kept; }
            var session = readSession();
            if (session) { return session; }
            try {
                var old = JSON.parse(sessionStorage.getItem('pc-editor-work') || 'null');
                sessionStorage.removeItem('pc-editor-work');
                return old && Array.isArray(old.tabs) ? old : null;
            } catch (err) { return null; }
        }

        /* Reopens the kept tabs as they were; resolves to what to tell the
           reader, or null when there was nothing kept. */
        async function restoreKept() {
            var kept = readKept();
            if (!kept) { return null; }
            var back = [], all = (kept.waiting || []).concat(kept.tabs), frontTab = null;
            restoring = true;
            try { frontTab = await reopen(all, back, kept.tabs[kept.front] || null); } finally { restoring = false; }
            if (frontTab) { var fi = tabs.indexOf(frontTab); if (fi >= 0) { activate(fi); } }
            var msg = back.length ? 'Your unsaved changes to ' + back.join(', ') + ' are back.' : '';
            if (waiting.length) {
                msg += (msg ? ' ' : '') + 'Unsaved changes to ' + waiting.map(function (k) { return k.path; }).join(', ') +
                    ' are kept until the file can be reached again; you may need to sign in, then reload.';
            }
            if (explorer && kept.explorer) { explorer.restore(kept.explorer); }
            keep();
            // A snapshot from before the views kept only whether the preview showed.
            return { text: msg, error: waiting.length > 0, view: kept.view || 'text' };
        }
        async function reopen(all, back, frontKept) {
            var frontTab = null;
            for (var i = 0; i < all.length; i++) {
                var k = all[i], t = null;
                if (!k || typeof k !== 'object') { continue; }
                if (!k.path) {
                    if (typeof k.draft !== 'string') { continue; }
                    var n = /^untitled-(\d+)(\.docs\.md)?$/.exec(k.name || '');
                    if (n) { untitled = Math.max(untitled, +n[1]); }
                    addTab({ path: null, name: k.name || 'untitled', lang: k.lang || 'text', readOnly: false }, '');
                    t = current();
                } else {
                    var node = F.resolve(F.home(), F.upgradePath(k.path));
                    if (!node && k.fresh) {
                        newNamed(k.path);
                        t = current() && current().path === k.path ? current() : null;
                    } else if (node && await openPath(k.path)) {
                        t = current();
                        /* The file was saved somewhere else since: the
                           reader's text stays, and saving would replace
                           that version. */
                        if (typeof k.draft === 'string' && k.mtime != null && t.mtime != null && k.mtime !== t.mtime) { t.external = true; }
                    } else if (typeof k.draft === 'string') {
                        waiting.push(k);
                    }
                }
                if (!t) { continue; }
                applyKept(t, k);
                if (t.modified) { back.push(t.name); }
                if (k === frontKept) { frontTab = t; }
            }
            renderTabs();
            return frontTab;
        }

        /* Unsaved text kept in the session comes back with the Editor, so
           leaving the page or closing the window asks only when the session
           could not keep it (static/doc-tabs.js guard). Save All saves every
           changed file, and the window stays if a save fails. */
        var unguard = window.yavcDocTabs.guard(root, {
            changed: function () { return tabs.filter(function (t) { return t.modified; }).map(function (t) { return t.name; }); },
            keptOnReload: function () { return ownsSession && keepSession(); },
            keptOnClose: function () { return ownsSession && keepSession(); },
            saveAll: async function () {
                for (var i = 0; i < tabs.length; i++) {
                    if (!tabs[i].modified) { continue; }
                    activate(i);
                    if (!(await save())) { return false; }
                }
                return true;
            }
        });

        /* === Controls ===================================================== */

        /* A tab closed from the keyboard leaves the focus on the tab that
           takes its place, so Delete can close one after another. */
        /* Preview opens the page as it is on the site. In the window view it
           opens a page of this site as a window rather than a browser tab,
           and one already open comes to the front with its content fetched
           again, so it shows what was just saved. Anywhere else, or for an
           address that is not a page of this site, it opens a new tab. Text
           not yet saved is not on the site, which the status line says. */
        function previewNote() {
            if (current() && current().modified) { say('Preview shows the page as it is on the site; save to see your changes there.'); }
        }
        /* Preview: the file's page on the site, in a window in the window
           view and in a new tab otherwise. */
        function preview() {
            if (!siteUrl) { return; }
            var href = new URL(siteUrl, location.href).href;
            previewNote();
            if (!inWindowView(href)) { window.open(href, '_blank', 'noopener'); }
        }
        function openSource() {
            var cur = current(), node = cur && F.resolve(F.home(), cur.path), src = node && F.sourceOf(node);
            if (src) { openPath(F.displayPath(src)); }
        }
        function inWindowView(href) {
            if (!window.pudlWindows || !document.querySelector('[data-win-layer]')) { return false; }
            var url = new URL(href, location.href);
            var page = url.origin === location.origin && /^\/page\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
            if (!page) { return false; }
            var key = page[1], win = document.querySelector('.win[data-win="' + key + '"]');
            if (win && window.pudlWindows.state().open.indexOf(key) >= 0) {
                window.pudlWindows.raise(key);
                if (window.pcLoadWindow) { window.pcLoadWindow(win, '', true).catch(function () { }); }
            } else {
                window.pudlWindows.open(key);
            }
            return true;
        }

        /* === Commands and their keys ===================================== */

        /* Every command a key can be bound to, by the name ~/.config/editor.json
           uses for it. */
        var COMMANDS = {
            'new': newTab,
            'open': openDialog,
            'save': save,
            'save-as': saveAs,
            'close-document': function () { if (current()) { closeTab(active); } },
            'undo': function () { CM.undo(view); },
            'redo': function () { CM.redo(view); },
            'find': openFind,
            'go-to-line': goToLine,
            'toggle-files': toggleExplorer,
            'toggle-wrap': function () { setWrap(!wrapOn, true); },
            'preview': preview,
            'insert-timestamp': function () { insertText(now()); },
            'insert-date': function () { insertText(now('date')); },
            'stamp-modified': stampModified,
            'key-bindings': editKeys
        };

        function goToLine() {
            var binding = CM.searchKeymap.find(function (key) { return key.key === 'Mod-Alt-g'; });
            if (binding) { binding.run(view); }
        }

        /* The bindings in force: the Editor's own, with the settings file's
           over them. A key set to null runs nothing and goes no further. */
        var keyProblems = '';
        function effectiveKeys() {
            var own = settings.keys && typeof settings.keys === 'object' && !Array.isArray(settings.keys) ? settings.keys : {};
            return Object.assign({}, DEFAULT_KEYS, own);
        }
        function keyBindings() {
            var map = effectiveKeys(), list = [], problems = [];
            Object.keys(map).forEach(function (key) {
                var name = map[key];
                if (!validKey(key)) { problems.push('"' + key + '" isn\'t a key CodeMirror knows'); return; }
                if (name === null) { list.push({ key: key, preventDefault: true, run: function () { return true; } }); return; }
                var run = COMMANDS[name];
                if (!run) { problems.push('there is no command called "' + name + '"'); return; }
                list.push({ key: key, preventDefault: true, run: function () { run(); return true; } });
            });
            keyProblems = problems.length ? 'In the key bindings, ' + problems.join(', and ') + '.' : '';
            return CM.keymap.of(list);
        }

        /* The key for a command, as a menu shows it. */
        function shortcutFor(name) {
            var map = effectiveKeys();
            var key = Object.keys(map).find(function (k) { return map[k] === name && validKey(k); });
            return key ? keyLabel(key) : undefined;
        }

        function insertText(text) {
            var t = current();
            if (!t || t.readOnly) { say('This file is read-only, so nothing can be added to it.', true); return; }
            view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input' });
            view.focus();
        }

        /* Sets the page's last-modified date to now: the lastModified line
           of a Markdown page's front matter, in local time with its offset,
           or an HTML page's last-modified meta tag, in UTC as those are
           kept. Either is added if the page has none. */
        function stampModified() {
            var t = current();
            if (!t || t.readOnly) { say('This file is read-only, so its date can\'t be changed.', true); return; }
            var doc = view.state.doc.toString(), eol = /\r\n/.test(doc) ? '\r\n' : '\n', change, stamp;
            if (t.lang === 'markdown') {
                var fm = /^---[ \t]*\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(doc);
                if (!fm) { say('This page has no front matter (the lines between --- at its top), so there is no last-modified date to set.', true); return; }
                stamp = now();
                var body = fm[1] || '', from = fm[0].indexOf('\n') + 1;
                var line = /^lastmodified[ \t]*:.*$/im.exec(body);
                if (line) {
                    change = { from: from + line.index, to: from + line.index + line[0].length, insert: line[0].replace(/:.*$/, ': ' + stamp) };
                } else {
                    var date = /^date[ \t]*:.*(?:\r?\n|$)/im.exec(body);
                    change = { from: from + (date ? date.index + date[0].length : body.length), insert: 'lastModified: ' + stamp + eol };
                }
            } else if (/\.html?$/i.test(t.path || t.name)) {
                stamp = now('utc');
                var tag = '<meta http-equiv="last-modified" content="' + stamp + '" />';
                var meta = /<meta\s+http-equiv\s*=\s*["']last-modified["'][^>]*>/i.exec(doc);
                if (meta) {
                    change = { from: meta.index, to: meta.index + meta[0].length, insert: tag };
                } else {
                    var head = /<\/head\s*>/i.exec(doc);
                    if (!head) { say('This page has no <head>, so there is nowhere to put its last-modified date.', true); return; }
                    var indent = /[ \t]*$/.exec(doc.slice(0, head.index))[0];
                    change = { from: head.index, insert: tag + eol + indent };
                }
                stamp += ' UTC';
            } else {
                say('Update last-modified works in a Markdown or HTML page.', true);
                return;
            }
            view.dispatch({ changes: change, userEvent: 'input' });
            view.focus();
            say('Last modified ' + stamp + '.');
        }

        /* Opens the settings file at its key bindings, writing the Editor's
           own bindings into it first if it has none, so there is something
           to change. */
        async function editKeys() {
            if (!settings.keys) {
                var err = await loadConfig().then(function (c) { return c.set('editor', { keys: Object.assign({}, DEFAULT_KEYS) }); })
                    .catch(function (e) { return e.message; });
                if (err) { say('The key bindings could not be written: ' + err, true); return; }
            }
            if (await openPath('~/.config/editor.json')) {
                say('Under "keys", each key runs the command after it, and a key set to null does nothing. Saved changes apply at once. The commands are ' +
                    Object.keys(COMMANDS).join(', ') + '.');
            }
        }

        /* === The command table and the toolbar (PUDL 0.68.0) ===============
           Every command the toolbar, the menus, the keys and an agent reach,
           once, by the names ~/.config/editor.json binds keys to. A command's
           shortcut is the key bound to it, or failing one, CodeMirror's own;
           CodeMirror answers its keys in the text first, so PUDL answers a
           key only where CodeMirror did not. */
        var FORMATS = window.yavcMdEditor ? window.yavcMdEditor.FORMATS : [];
        /* The paragraph style, as GK Companion's Editor has it: one menu that
           shows the style of the line the cursor is in, holding Paragraph
           (Ctrl+0) and the six heading levels (Ctrl+1 to Ctrl+6). */
        var STYLES = window.yavcMdEditor ? window.yavcMdEditor.STYLES : [];
        function blockStyle() {
            if (formatsThePage()) { return visual.api && visual.api.block ? visual.api.block() : null; }
            if (!view) { return null; }
            var m = /^\s{0,3}(#{1,6})(\s|$)/.exec(view.state.doc.lineAt(view.state.selection.main.head).text);
            return m ? 'h' + m[1].length : 'paragraph';
        }
        function commandTable() {
            var ready = !!(CM && view), tab = current(), editable = !!(tab && !tab.readOnly);
            function key(name, builtIn) { return function () { return (ready && shortcutFor(name)) || (builtIn ? keyLabel(builtIn) : undefined); }; }
            function cmd(id, label, glyph, run, more) {
                return Object.assign({ id: id, label: label, glyph: glyph || undefined, shortcut: key(id, more && more.builtIn),
                    disabled: function () { return !ready; }, run: run }, more || {});
            }
            var table = [
                cmd('toggle-files', 'Files', 'panel', toggleExplorer, { checked: function () { return !el.explorer.hidden; } }),
                cmd('new', 'New', 'file', function () { newTab(); }),
                cmd('open', 'Open…', 'folder', function () { openDialog(); }),
                cmd('save', 'Save', 'yavc-save', function () { save(); }, { disabled: function () { var t = current(); return !ready || !t || t.readOnly; }, reason: 'This file is read-only.' }),
                cmd('save-as', 'Save As…', null, function () { saveAs(); }, { label: function () { var t = current(); return t && t.readOnly ? 'Save a Copy to ~…' : 'Save As…'; }, disabled: function () { return !ready || !current(); } }),
                cmd('close-document', 'Close Document', null, function () { COMMANDS['close-document'](); }, { disabled: function () { return !ready || !current(); } }),
                /* glyphOnly: a glyph every reader knows shows alone on the
                   menu bar's ribbon (PUDL 0.79.0), its words its tooltip. */
                cmd('undo', 'Undo', 'yavc-undo', function () { CM.undo(view); }, { builtIn: 'Mod-z', glyphOnly: true }),
                cmd('redo', 'Redo', 'yavc-redo', function () { CM.redo(view); }, { builtIn: 'Mod-y', glyphOnly: true }),
                cmd('find', 'Find and Replace…', 'search', openFind, { builtIn: 'Mod-f' }),
                cmd('go-to-line', 'Go to Line…', null, goToLine, { builtIn: 'Mod-Alt-g' }),
                cmd('toggle-wrap', 'Wrap Lines', 'yavc-wrap', function () { setWrap(!wrapOn, true); }, { checked: function () { return wrapOn; } }),
                cmd('insert-timestamp', 'Insert Date and Time', null, COMMANDS['insert-timestamp'], { disabled: function () { return !ready || !editable; } }),
                cmd('insert-date', 'Insert Date', null, COMMANDS['insert-date'], { disabled: function () { return !ready || !editable; } }),
                cmd('stamp-modified', 'Update Last-Modified', null, stampModified, { disabled: function () { return !ready || !editable; } }),
                cmd('key-bindings', 'Key Bindings…', null, editKeys),
                cmd('insert', 'Insert', 'plus', null, { items: insertItems, hidden: function () { return !formatOffered; }, shortcut: undefined }),
                cmd('source', 'Edit the Source', 'code', openSource, { hidden: function () { return !sourceOffered; } }),
                cmd('preview', 'Preview', 'new-window', preview, { hidden: function () { return !siteUrl; } }),
                /* A deck (a file named .slides.md) presents in Slides, where
                   the site has it. */
                cmd('present', 'Present the Deck', 'play', function () {
                    var t = current();
                    if (t && t.path && window.pudlApplets.request) { window.pudlApplets.request('present', { path: t.path, present: '1' }, root); }
                }, { hidden: function () { var t = current(); return !(t && t.path && /\.slides\.md$/i.test(t.path) && window.pudlApplets.can && window.pudlApplets.can('present')); } })
            ];
            FORMATS.forEach(function (f) {
                table.push(cmd(f[0], f[1], f[2], function () { applyFormat(f[0]); }, {
                    shortcut: f[3] ? keyLabel(f[3]) : undefined, hidden: function () { return !formatOffered; }, glyphOnly: true
                }));
            });
            /* The style menu has no glyph, so the style's name stays on the
               row when the other formatting folds to glyphs. Each level is
               hidden where there is nothing to format, so its key does
               nothing there either. */
            var unformatted = function () { return !formatOffered; }, noEdit = function () { return !ready || !editable; };
            table.push({ id: 'style', label: 'Paragraph Style', hidden: unformatted, disabled: noEdit,
                current: function () { var s = blockStyle(), f = STYLES.find(function (x) { return x[0] === s; }); return f ? f[1] : null; },
                items: STYLES.map(function (s) {
                    return { id: s[0], label: s[1], shortcut: keyLabel(s[2]), choice: 'ed-style', value: s[0],
                        checked: function () { return blockStyle() === s[0]; }, hidden: unformatted, disabled: noEdit,
                        run: function () { applyFormat(s[0]); } };
                }) });
            if (window.yavcMdEditor) {
                table.push(window.yavcMdEditor.tableCommand(editCtx(), { hidden: unformatted, disabled: noEdit }));
                table.push(window.yavcMdEditor.boxCommand(editCtx(), { hidden: unformatted, disabled: noEdit }));
            }
            /* The document's front matter as a form (DESIGN.md, decision 17). */
            table.push(cmd('properties', 'Properties…', 'tag', editProperties, {
                hidden: function () { var t = current(); return !(t && t.lang === 'markdown'); },
                disabled: function () { var t = current(); return !ready || !t || !!t.readOnly; } }));
            table.push({ id: 'md-default', label: 'Open Markdown As', hidden: function () { return !viewsOffered; },
                current: function () { var f = MARKDOWN_VIEWS.find(function (x) { return x[0] === markdownDefault(); }); return f ? f[1] : null; },
                items: MARKDOWN_VIEWS.map(function (v) {
                    return { id: 'md-default-' + v[0], label: v[1], choice: 'ed-md-default', value: v[0],
                        checked: function () { return markdownDefault() === v[0]; }, run: function () { setMarkdownDefault(v[0]); } };
                }) });
            [['text', 'Text'], ['visual', 'Visual'], ['split', 'Split'], ['preview', 'Preview']].forEach(function (v) {
                table.push({ id: 'view-' + v[0], label: v[1], choice: 'ed-view', choiceLabel: 'View', value: v[0],
                    checked: function () { return viewMode === v[0]; },
                    hidden: function () { return !viewsOffered; },
                    disabled: function () { return !ready || (v[0] !== 'text' && v[0] !== 'preview' && !editable); },
                    /* A view the reader chooses is the tab's from then on. */
                    run: function () { var t = current(); if (t) { t.view = v[0]; } setView(v[0]); } });
            });
            return table;
        }

        /* The toolbar: what is used most stays named longest, and the view
           switch and Preview keep to the end of the row. */
        function toolbars() {
            /* ribbon: 'hide' (PUDL 0.80.1): every command here is in a
               menu (menus() below), so the ribbon has them while it shows. */
            return [{ label: 'Editor', ribbon: 'hide', groups: [
                { label: 'File', glyph: 'file', priority: 3, items: ['toggle-files', 'new', 'open', 'save', 'save-as'] },
                { label: 'Edit', glyph: 'yavc-undo', priority: 2, items: ['undo', 'redo', 'find', 'toggle-wrap'] },
                { label: 'Format', glyph: 'bold', priority: 1, items: ['style', 'bold', 'italic', 'underline', 'strike', 'code', 'link', 'color', 'bullets', 'numbers', 'insert', 'table', 'box'] },
                { label: 'View', glyph: 'new-window', priority: 4, end: true, items: ['source', { choice: 'ed-view' }, 'preview'] }
            ] }];
        }

        /* The menus list the same commands by id, which PUDL (0.68.1) looks
           up in the command table. The menu bar's ribbon (PUDL 0.79.0) is
           built from the menus, and the toolbar hides while it shows (PUDL
           0.80.1), so the Editor's own titles hold every command the
           toolbar has: File, Edit, Insert and Format, as GK Companion's
           Editor has them, and Layout for the file tree, wrapping and the
           views, which the site's View menu lists again where a reader of
           the menus looks for them. Headings and separators start the
           ribbon's groups. */
        var LAYOUT = ['toggle-files', 'toggle-wrap', '-', 'view-text', 'view-visual', 'view-split', 'view-preview', 'md-default', '-', 'source', 'preview'];
        function menus() {
            var titles = [
                { label: 'Editor', glyph: 'document', items: window.pcAppletIdentity(root, ['key-bindings']) },
                { id: 'file', label: 'File', glyph: 'file', items: ['new', 'open', 'save', 'save-as', '-', 'properties', 'present', '-', 'close-document'] },
                { id: 'edit', label: 'Edit', glyph: 'pencil', items: ['undo', 'redo', '-', 'find'] },
                { id: 'insert', label: 'Insert', glyph: 'plus', items: ['link', 'insert', 'table', 'box', '-', 'insert-timestamp', 'insert-date', 'stamp-modified'] }
            ];
            /* Format, where there is formatting to do. */
            if (formatOffered) { titles.push({ id: 'format', label: 'Format', glyph: 'paragraph', items: ['style', '-', 'bold', 'italic', 'underline', 'strike', 'code', '-', 'highlight', 'superscript', 'subscript', '-', 'color', 'class', '-', 'bullets', 'numbers'] }); }
            return { titles: titles, into: { view: LAYOUT, go: ['go-to-line'] } };
        }

        /* === Start ======================================================== */

        var boot = Promise.all([loadCodeMirror(), loadSiteFs().then(function (api) { F = api; return F.load(); }), loadBrowser()]).then(async function (res) {
            if (destroyed) { return; }
            CM = res[0];
            FB = res[2];
            /* Settings that can't be read leave the defaults in place. */
            var config = await loadConfig().catch(function () { return null; });
            if (config) {
                settings = Object.assign({}, SETTINGS, await config.load('editor', SETTINGS).catch(function () { return SETTINGS; }));
                unConfig = config.onChange('editor', applySettings);
            }
            if (destroyed) { return; }
            wrapOn = !!settings.wrap;
            /* The shortcodes for the Insert menu, which draws again once they are here. */
            loadShortcodes().then(commandsChanged);
            loadKit().then(function () { FORMATS = window.yavcMdEditor.FORMATS; STYLES = window.yavcMdEditor.STYLES; INSERTS = window.yavcMdEditor.INSERTS; SHORTCODES = window.yavcMdEditor.SHORTCODES; commandsChanged(); });
            setupExplorer();
            setupExplorerSplit();
            wrapComp = new CM.Compartment(); langComp = new CM.Compartment(); lintComp = new CM.Compartment(); roComp = new CM.Compartment();
            keyComp = new CM.Compartment();
            view = new CM.EditorView({ parent: el.surface });
            view.scrollDOM.addEventListener('scroll', keep, { passive: true });
            unsubscribe = F.onChange(onFsChange);
            var restored = await restoreKept();
            /* The file the address or window asks for comes to the front,
               which after a reload is the one that was in front. */
            var opened = startFile ? await openPath(startFile) : false;
            if (!opened) {
                if (startFile && !F.resolve(F.home(), startFile)) { newNamed(startFile); } else if (!tabs.length) { newTab(); }
            }
            if (restored && restored.text) { say(restored.text, restored.error); }
            /* The view showing before the reload comes back, which asks the
               server for the page, so it is not waited for. */
            if (restored && restored.view && restored.view !== 'text' && viewsOffered) { setView(restored.view); }
            /* The keyboard goes back where it was: into the text, unless the
               search panel had it, which opening it did. */
            if (snap && snap.focused) { if (!view.dom.contains(document.activeElement)) { view.focus(); } }
            else if (!(opts.ownsUrl || root.closest('.win.active'))) { view.contentDOM.blur(); }
        }).catch(function (err) {
            if (destroyed) { return; }
            root.innerHTML = '<p class="ed-failed">The editor could not start: ' + esc(err.message) + '.</p>';
        });


        /* === The live actions (actions.json; docs/agents-design.md) ===== */

        function docNo(i) {
            if (i == null) { if (active < 0 || !tabs[active]) { throw new Error('no document is open'); } return active; }
            i = Math.floor(Number(i));
            if (!(i >= 1 && i <= tabs.length)) { throw new Error('there is no document ' + i + '; ' + tabs.length + ' are open'); }
            return i - 1;
        }
        function docText(i) { return i === active && view ? view.state.doc.toString() : tabs[i].state.doc.toString(); }
        function docView(i, withText) {
            var t = tabs[i];
            var v = { index: i + 1, name: t.name, path: t.path || null, lang: t.lang, modified: !!t.modified, readOnly: !!t.readOnly };
            if (withText) { v.text = docText(i); }
            return v;
        }
        function setDocText(i, text) {
            if (i !== active) { activate(i); }
            if (tabs[i].readOnly) { throw new Error('the document is read-only'); }
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(text) }, userEvent: 'input' });
            markModified(tabs[i]);
        }
        var liveActions = {
            'documents@1': async function () { return { output: { active: active + 1, documents: tabs.map(function (t, i) { return docView(i, false); }) } }; },
            'document@1': async function (input) { var i = docNo(input.index); return { output: docView(i, true) }; },
            'open-file@1': async function (input) { await openPath(String(input.path), true); return { output: docView(active, false) }; },
            'new@1': async function (input) {
                /* A new document never takes the name of a file that exists,
                   or the person's next Save would overwrite it unasked
                   (security review, 2026-11-03). */
                if (input.path && F.resolve(F.home(), String(input.path))) { throw new Error('there is already a file at ' + input.path + '; open it, or give the new document another name'); }
                if (input.path) { newNamed(String(input.path)); } else { newTab(); }
                if (input.text != null) { setDocText(active, input.text); }
                return { output: docView(active, false) };
            },
            'set-text@1': async function (input) { var i = docNo(input.index); setDocText(i, input.text); return { output: docView(i, false) }; },
            'insert@1': async function (input) { docNo(); if (current().readOnly) { throw new Error('the document is read-only'); } insertText(String(input.text)); return { output: docView(active, false) }; },
            'replace@1': async function (input) {
                var i = docNo(input.index), text = docText(i), n = 0;
                var flags = (input.all !== false ? 'g' : '') + (input.ignoreCase ? 'i' : '');
                var re = new RegExp(input.regex ? input.find : String(input.find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
                var out = text.replace(re, function () { n++; return input.regex ? String(input.replace).replace(/\$(\d)/g, function (m, d) { return arguments.length > 3 ? (arguments[d] || '') : m; }) : input.replace; });
                if (n) { setDocText(i, out); }
                return { output: { replaced: n } };
            },
            'save@1': async function (input) {
                var i = docNo(input.index);
                if (i !== active) { activate(i); }
                var t = tabs[i];
                if (t.readOnly) { throw new Error('the document is read-only; save a copy under ~ instead'); }
                var path = input.path ? String(input.path) : t.path;
                if (!path) { throw new Error('the document has no file yet; give a path such as ~/notes/a.md'); }
                await writeTo(t, path, true);
                return { output: docView(i, false) };
            },
            'close@1': async function (input) { var i = docNo(input.index); var before = tabs.length; await closeTab(i); return { output: { closed: tabs.length < before, open: tabs.length } }; },
            'view@1': async function (input) { docNo(); await setView(input.mode); return { output: { mode: viewMode } }; },
            'go-to@1': async function (input) {
                docNo();
                var line = Math.min(view.state.doc.lines, Math.max(1, Math.floor(Number(input.line))));
                var l = view.state.doc.line(line), col = Math.min(l.length, Math.max(1, Math.floor(Number(input.column || 1))) - 1);
                view.dispatch({ selection: { anchor: l.from + col }, scrollIntoView: true });
                view.focus();
                return { output: { line: line } };
            }
        };
        var detachLive = window.pudlApplets && window.pudlApplets.attach ? window.pudlApplets.attach('yavc.editor', liveActions) : null;

        return {
            state: function () { return stateString() || null; },
            setState: takeFile,
            menus: menus,
            commandTable: commandTable,
            toolbars: toolbars,
            destroy: function () {
                /* The session as the Editor closes, for when it opens again. */
                if (detachLive) { detachLive(); }
                keepSession();
                destroyed = true;
                if (snap) { snap.leave(); }
                if (unsubscribe) { unsubscribe(); }
                if (unConfig) { unConfig(); }
                unguard();
                if (explorer) { explorer.destroy(); }
                if (view) { view.destroy(); }
            },
            ready: boot
        };
    }

    window.pudlApplets.register('editor', { init: init });
})();
