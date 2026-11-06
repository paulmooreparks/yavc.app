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
    var SETTINGS = { wrap: true, explorer: null, explorerWidth: null, keys: null, markdownView: 'document', documentView: 'document', documentZoom: '100', navigation: 'files' };
    var navigationCount = 0;
    var MARKDOWN_VIEWS = [['document', 'Document'], ['visual', 'Visual'], ['text', 'Text'], ['split', 'Split'], ['preview', 'Preview']];
    function supportsView(tab, mode) { return !!tab && (mode === 'text' || (tab.lang === 'markdown' && MARKDOWN_VIEWS.some(function (entry) { return entry[0] === mode; }))); }
    function resolvedView(tab, preferred) {
        if (supportsView(tab, preferred)) { return preferred; }
        return ['document', 'visual', 'text'].find(function (mode) { return supportsView(tab, mode); }) || 'text';
    }

    /* === Key bindings ===================================================
       The Editor's commands have names, and a key is bound to a command by
       name. These are the bindings it starts with; ~/.config/editor.json's
       "keys" adds to them and overrides them, a key set to null does
       nothing at all (which turns off CodeMirror's own binding for it), and
       a change to the file applies at once. Keys are written as CodeMirror
       writes them: Mod- is Ctrl (Cmd on a Mac), then Alt-, Shift-, and the
       key, such as "Mod-Shift-;" or "Alt-d". */
    var DEFAULT_KEYS = {
        'Mod-Alt-o': 'toggle-outline', 'Alt-Shift-ArrowUp': 'section-up', 'Alt-Shift-ArrowDown': 'section-down',
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

    /* Colours from PUDL's tokens, in the editing kit's code theme
       (apps/md-editor/kit.js codeTheme), shared with Diagrams. */
    function makeTheme(CM) { return window.yavcMdEditor.codeTheme(CM); }

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
              '<aside class="ed-explorer split-pane" data-role="explorer" aria-label="Document Navigation" hidden></aside>' +
              '<div class="split-handle ed-split" data-role="explorer-split" aria-label="Resize the Navigation Pane" data-split-min="160" data-split-max="50%" hidden></div>' +
              '<div class="ed-work split-pane">' +
                '<div class="code-surface ed-surface" data-role="surface"></div>' +
                /* The page: the document as its page (page-view.js), edited
                   in Visual and Split and read in Preview. The page's find
                   bar sits over it (openFind). */
                '<div class="ed-page" data-role="page-box" hidden>' +
                  '<div class="ed-find-place" data-role="find-place" hidden></div>' +
                  '<div class="notice warn" data-role="style-problems" hidden role="status"><div class="notice-content"><p class="notice-body"></p></div></div>' +
                  '<div class="notice warn" data-role="page-problems" hidden role="status"><div class="notice-content"><p class="notice-body"></p></div></div>' +
                  '<div class="ed-scroll" data-role="scroll" tabindex="0"><div class="doc-page" data-role="page" data-ed-page></div></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="ed-status" data-role="status-bar">' +
              '<span class="ed-readonly" data-role="readonly" hidden><span class="glyph" style="--glyph: var(--glyph-pencil-off)" aria-hidden="true"></span>Read-only</span>' +
              '<span data-role="where"></span><span data-role="lang"></span><span data-role="count"></span><span data-role="pages"></span><span data-role="pos"></span>' +
              '<span class="ed-message" data-role="message" role="status" aria-live="polite"></span>' +
            '</div>' +
            '';

        var q = function (sel) { return root.querySelector(sel); };
        var el = {
            tabs: q('[data-role="tabs"]'), surface: q('[data-role="surface"]'), where: q('[data-role="where"]'),
            panes: q('[data-role="panes"]'), pageBox: q('[data-role="page-box"]'), scroll: q('[data-role="scroll"]'), page: q('[data-role="page"]'), findPlace: q('[data-role="find-place"]'),
            lang: q('[data-role="lang"]'), count: q('[data-role="count"]'), pages: q('[data-role="pages"]'), pos: q('[data-role="pos"]'), message: q('[data-role="message"]'),
            readonly: q('[data-role="readonly"]'),
            explorer: q('[data-role="explorer"]'), explorerSplit: q('[data-role="explorer-split"]')
        };
        var FB = null, explorer = null;
        /* What the toolbar's commands show (the command table below): lines
           wrapped, the Markdown views offered, the formatting offered, a
           site page's source to open, and the file's address on the site. */
        var wrapOn = true, viewsOffered = false, formatOffered = false, sourceOffered = false, siteUrl = null;
        function commandsChanged() { if (opts.commandsChanged) { opts.commandsChanged(); } }

        var CM = null, F = null, view = null, destroyed = false, unsubscribe = null, styleLifetime = new AbortController();
        var tabs = [], active = -1, untitled = 0;
        var wrapComp = null, langComp = null, lintComp = null, roComp = null, keyComp = null, lspComp = null, lsp = null;
        var startFile = fileFrom(opts.state) || (opts.ownsUrl ? fileFrom(location.search) : null);
        var startLine = Number(new URLSearchParams(opts.state || (opts.ownsUrl ? location.search : '')).get('line')) || 1;

        function fileFrom(s) {
            if (!s) { return null; }
            var v = new URLSearchParams(String(s).replace(/^\?/, '')).get('file');
            return v || null;
        }

        /* === State ====================================================== */

        function current() { return tabs[active] || null; }
        function stateString() { var t = current(); return t && t.path ? 'file=' + encodeURIComponent(t.path).replace(/%2F/g, '/').replace(/%7E/g, '~') + (t.navigationLine > 1 ? '&line=' + t.navigationLine : '') : ''; }
        function announce(push) {
            if (opts.ownsUrl) {
                var qs = new URLSearchParams(location.search), t = current();
                if (t && t.path) { qs.set('file', t.path); } else { qs.delete('file'); }
                if (t && t.navigationLine > 1) { qs.set('line', String(t.navigationLine)); } else { qs.delete('line'); }
                var s = qs.toString().replace(/%2F/g, '/').replace(/%7E/g, '~');
                var address = location.pathname + (s ? '?' + s : '') + location.hash;
                if (address !== location.pathname + location.search + location.hash) { history[push ? 'pushState' : 'replaceState'](history.state, '', address); }
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
            if (/\.(json|canvas)$/i.test(p)) { return 'json'; }
            if (/\.css$/i.test(p)) { return 'css'; }
            if (/^~\/bin\/|^\/bin\/|\.sh$/i.test(p)) { return 'script'; }
            return 'text';
        }
        var LANG_NAMES = { markdown: 'Markdown', json: 'JSON', css: 'CSS', script: 'Script', text: 'Plain Text' };
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
        function currentMacroEngine() { return macroContext && view ? macroContext.withMacros(view.state.doc.toString(), macroOwner === current() ? sharedMacros : '') : null; }
        function customShortcodes() { return window.yavcMacroTools && currentMacroEngine() ? window.yavcMacroTools.metadata(currentMacroEngine()) : []; }
        function shortcodeByName(name) { return customShortcodes().concat(shortcodes || []).find(function (s) { return s.name === name; }) || null; }
        function shortcodeComplete(ctx) {
            var name = ctx.matchBefore(/\{\{\/?[a-z0-9-]*$/);
            if (name) {
                var closing = name.text.indexOf('{{/') === 0;
                return loadShortcodes().then(function (list) {
                    list = customShortcodes().concat(list);
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
            if (lang === 'css') { return CM.css(); }
            if (lang === 'script') { return CM.StreamLanguage.define(CM.shell); }
            return [];
        }

        /* JSON is checked as it is typed. */
        function lintExtension(tab) {
            if (tab.lang !== 'json' || tab.readOnly) { return []; }
            return [lsp ? [] : CM.linter(CM.jsonParseLinter()), CM.lintGutter()];
        }

        function stateFor(tab, text) {
            return CM.EditorState.create({ doc: text, extensions: extensionsFor(tab) });
        }
        function languageAssistance(tab) {
            return lsp && tab.lang === 'json' ? lsp.extension(/\.canvas$/i.test(tab.path || tab.name) ? 'canvas' : 'json', !!tab.readOnly) : [];
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
                    window.yavcMdEditor.codeSearch(CM, keepQuery),
                    makeTheme(CM),
                    wrapComp.of(wrapOn ? CM.EditorView.lineWrapping : []),
                    langComp.of(langExtension(tab.lang)),
                    lintComp.of(lintExtension(tab)),
                    lspComp.of(languageAssistance(tab)),
                    roComp.of([CM.EditorState.readOnly.of(!!tab.readOnly), CM.EditorView.editable.of(!tab.readOnly)]),
                    CM.EditorView.contentAttributes.of({ 'aria-label': 'Text of ' + tab.name }),
                    CM.EditorView.updateListener.of(function (u) {
                        if (u.docChanged && tabs[active] === tab) { markModified(tab); scheduleStyles(); scheduleOutline(); }
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
            var mod = !!tab.savePending || !!tab.saveFailed || view.state.doc.toString() !== tab.saved;
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
            el.where.title = el.where.textContent;
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
            markOutline();
        }

        function activate(i) {
            var prev = current(), switching = i !== active;
            if (prev && view) { prev.state = view.state; prev.scroll = scrollAnchor(); }
            /* Each tab keeps its own view. The page belongs to the file it
               was made for, so the one coming to the front makes its own. */
            if (switching && viewMode !== 'text') { setView('text'); }
            active = i;
            var t = current();
            if (!t) { view.setState(CM.EditorState.create({ doc: '' })); refreshStyles(); renderTabs(); announce(); return; }
            view.setState(t.state);
            refreshStyles();
            scheduleOutline();
            /* A tab kept from before the key bindings last changed takes
               the bindings as they are now. */
            view.dispatch({ effects: [keyComp.reconfigure(keyBindings()), lspComp.reconfigure(languageAssistance(t))] });
            /* Each tab keeps its place, and a search panel kept open from
               before a reload opens again. */
            scrollTo(t.scroll);
            if (t.openSearch) { t.openSearch = false; CM.openSearchPanel(view); }
            renderTabs();
            showPos();
            announce();
            /* Each tab keeps its view: the one it had, or for a Markdown
               file the one the settings open Markdown in. */
            var want = resolvedView(t, t.view || markdownDefault());
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
            // A restored named draft is already open even though Save has not created its file.
            var display = node && !node.children ? F.displayPath(F.realOf(node)) : path;
            for (var i = 0; i < tabs.length; i++) { if (tabs[i].path === display) { if (i !== active) { activate(i); } view.focus(); return true; } }
            if (!node) { return fail(path + ': no such file'); }
            if (node.children) { return fail(path + ' is a folder'); }
            var r = F.realOf(node);
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
            var text = (current() === t ? view.state : t.state).doc.toString();
            var ticket = t.saveTicket = (t.saveTicket || 0) + 1;
            t.savePending = (t.savePending || 0) + 1;
            var pending = (t.saveQueue || Promise.resolve()).then(function () {
                if (destroyed || tabs.indexOf(t) < 0) { throw new Error('The document was closed before its queued save could run.'); }
                return writeSubmitted(t, path, text, ticket);
            });
            t.saveQueue = pending.catch(function () { });
            try { return await pending; }
            catch (err) {
                if (!destroyed && tabs.indexOf(t) >= 0) { t.saveFailed = true; t.modified = true; if (current() === t) { say(err.message, true); } }
                if (strict) { throw err; }
                return false;
            } finally {
                t.savePending--;
                if (!destroyed && tabs.indexOf(t) >= 0) {
                    t.modified = !!t.savePending || !!t.saveFailed || (current() === t ? view.state : t.state).doc.toString() !== t.saved;
                    renderTabs(); keep();
                }
            }
        }
        async function writeSubmitted(t, path, text, ticket) {
            if (current() === t) { say('Saving…'); }
            t.submittedWrite = { path: path, text: text };
            var res;
            try { res = await F.write(F.home(), path, text, false); }
            finally { t.submittedWrite = null; }
            if (res.error) { throw new Error('Not saved: ' + res.error); }
            /* A removed tab object never acknowledges a reopened resource. */
            if (destroyed || tabs.indexOf(t) < 0) { return false; }
            var display = F.displayPath(res.node);
            var renamed = t.path !== display;
            t.path = display;
            t.name = res.node.name;
            t.saved = text;
            t.mtime = res.node.server ? +res.node.mtime : null;
            t.saveFailed = false;
            t.modified = (current() === t ? view.state : t.state).doc.toString() !== text || ticket !== t.saveTicket;
            t.external = false;
            t.fresh = false;
            t.readOnly = false;
            if (renamed) {
                var lang = languageFor(display);
                t.lang = lang;
                var effects = [langComp.reconfigure(langExtension(lang)), lintComp.reconfigure(lintExtension(t)),
                    roComp.reconfigure([CM.EditorState.readOnly.of(false), CM.EditorView.editable.of(true)])];
                if (current() === t) { effects.push(lspComp.reconfigure(languageAssistance(t))); view.dispatch({ effects: effects }); }
                else { t.state = t.state.update({ effects: effects }).state; }
                if (current() === t) { refreshStyles(true); }
            }
            renderTabs();
            announce();
            markExplorer();
            if (current() === t) { say('Saved ' + display + (t.modified ? '; newer edits are still unsaved.' : '.')); }
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
                download(res.download, new Blob([(current() === t ? view.state : t.state).doc.toString()], { type: 'text/plain' }));
                say('Downloaded ' + res.download + '. The tab still holds your text.');
                return false;
            }
            return true;
        }

        var download = window.yavcUtil.download;
        async function exportDocument(format) {
            var tab = current(); if (!tab || tab.lang !== 'markdown') { throw new Error('Choose a Markdown document to export.'); }
            if (pageActive()) { await visual.api.sync(); }
            if (destroyed || current() !== tab) { throw new Error('The document changed during export.'); }
            var text = view.state.doc.toString(), directory = styleDirectory(), pictures = picturesHost(); pictures.dir = function () { return directory; };
            function unchanged() { return !destroyed && current() === tab && view.state.doc.toString() === text; }
            var enginePromise = documentEngine(text), K = await loadKit(), m = await enginePromise, E = await K.exports();
            await K.styles();
            var front = m.front(text), path = '';
            (front.entries || []).forEach(function (entry) { if (entry.key === 'stylesheet') { path = entry.value; } });
            var result = await E.build(format, { text: text, engine: m, stylesheet: window.yavcStyleTools.resolve(path, directory),
                read: function (path) { if (!unchanged()) { throw new Error('The document changed during export.'); } return window.pudlHost.fs.readText(path); }, pictures: pictures, current: unchanged });
            result.name = (tab.path ? tab.path.split('/').pop().replace(/(?:\.docs)?\.md$/i, '') : 'document') + '.' + format;
            return result;
        }
        async function downloadDocument(format) {
            say('Writing the ' + format.toUpperCase() + ' file…');
            try { var result = await exportDocument(format); download(result.name, result.blob); say('Downloaded ' + result.name + '. ' + result.warnings.join(' ')); }
            catch (err) { say('The document could not be exported: ' + err.message, true); }
        }

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
            var id = 'ed-navigation-' + (++navigationCount);
            el.explorer.innerHTML = '<div class="tabs ed-navigation" data-tabs-size="each"><button type="button" class="btn btn-sm ed-navigation-back" data-close-navigation><span class="glyph" style="--glyph:var(--glyph-back)" aria-hidden="true"></span>Back to Document</button><div class="tablist" role="tablist" aria-label="Navigation Pane">' +
                '<button type="button" role="tab" id="' + id + '-files-tab" aria-controls="' + id + '-files" aria-selected="true">Files</button>' +
                '<button type="button" role="tab" id="' + id + '-outline-tab" aria-controls="' + id + '-outline" aria-selected="false" data-outline-tab>Outline</button></div>' +
                '<section class="ed-files-panel" role="tabpanel" id="' + id + '-files" aria-labelledby="' + id + '-files-tab">' + FB.markup.body({ list: false, treeLabel: 'Files' }) + '</section>' +
                '<section class="ed-outline-panel" role="tabpanel" id="' + id + '-outline" aria-labelledby="' + id + '-outline-tab">' +
                '<div class="ed-outline-tools" role="group" aria-label="Section Order"><button type="button" class="btn btn-sm" data-section-move="up"><span class="glyph" style="--glyph:var(--glyph-arrow-up)" aria-hidden="true"></span>Move Up</button><button type="button" class="btn btn-sm" data-section-move="down"><span class="glyph" style="--glyph:var(--glyph-arrow-down)" aria-hidden="true"></span>Move Down</button></div><div data-outline-tree></div></section></div>';
            explorer = FB.create(el.explorer.querySelector('.ed-files-panel'), F, {
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
            if (window.pudlTabs) { window.pudlTabs.enhance(); }
            navigationObserver = new MutationObserver(function () {
                var selected = el.explorer.querySelector('[data-outline-tab]').getAttribute('aria-selected') === 'true';
                if (selected !== outlineVisible) { outlineVisible = selected; saveSetting({ navigation: selected ? 'outline' : 'files' }); refreshOutline(); commandsChanged(); }
            });
            navigationObserver.observe(el.explorer.querySelector('.tablist'), { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
            el.explorer.addEventListener('click', function (event) {
                if (event.target.closest('[data-close-navigation]')) { hideNavigation(); return; }
                var move = event.target.closest('[data-section-move]'); if (move) { moveOutline(move.dataset.sectionMove); return; }
                var link = event.target.closest('[data-outline-index]'); if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) { return; }
                event.preventDefault(); navigateOutline(Number(link.dataset.outlineIndex));
            });
            el.explorer.addEventListener('focusin', function (event) { var link = event.target.closest('[data-outline-index]'); if (link) { outlineTarget = Number(link.dataset.outlineIndex); outlineControls(); } });
            el.explorer.addEventListener('keydown', function (event) { if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && /^(ArrowUp|ArrowDown)$/.test(event.key)) { event.preventDefault(); event.stopPropagation(); moveOutline(event.key === 'ArrowUp' ? 'up' : 'down'); } }, true);
            el.explorer.addEventListener('dragstart', function (event) {
                var link = event.target.closest('[data-outline-index]'); if (!link || !current() || current().readOnly) { event.preventDefault(); return; }
                outlineDrag = { index: Number(link.dataset.outlineIndex), text: outlineText, tab: current() }; event.dataTransfer.setData('text/plain', link.textContent); event.dataTransfer.effectAllowed = 'move';
            });
            el.explorer.addEventListener('dragover', function (event) { var link = event.target.closest('[data-outline-index]'); if (link && outlineDrag) { var from = outlineEntries[outlineDrag.index], to = outlineEntries[Number(link.dataset.outlineIndex)]; if (from && to && from.level === to.level && from.parent === to.parent) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } } });
            el.explorer.addEventListener('drop', function (event) {
                var link = event.target.closest('[data-outline-index]'), drag = outlineDrag; outlineDrag = null;
                if (!link || !drag || drag.tab !== current() || drag.text !== view.state.doc.toString()) { return; }
                event.preventDefault(); var target = Number(link.dataset.outlineIndex); moveOutline(null, drag.index, target, event.clientY > link.getBoundingClientRect().top + link.getBoundingClientRect().height / 2);
            });
            el.explorer.addEventListener('dragend', function () { outlineDrag = null; });
            if (settings.navigation === 'outline') { el.explorer.querySelector('[data-outline-tab]').click(); }
        }

        var outlineVisible = false, outlineEntries = [], outlineText = '', outlineOwner = null, outlineRenderedOwner = null, outlineRenderedShape = '', outlinePendingFocus = null, outlineTarget = -1, outlineDrag = null, outlineRevision = 0, outlineTimer = 0, navigationObserver = null;
        function suspendOutline(place) {
            var link = document.activeElement && document.activeElement.closest('[data-outline-index]');
            if (link && place.contains(link) && outlineOwner === current()) {
                var entry = outlineEntries[Number(link.dataset.outlineIndex)];
                if (entry) { outlinePendingFocus = { owner: outlineOwner, key: outlineKey(outlineEntries, entry) }; }
            }
            place.inert = true; place.setAttribute('aria-busy', 'true');
        }
        function restoreOutlineFocus(place) {
            var pending = outlinePendingFocus; outlinePendingFocus = null;
            if (!pending || pending.owner !== current() || !outlineVisible || el.explorer.hidden || document.activeElement !== document.body && !place.contains(document.activeElement)) { return; }
            var matches = outlineEntries.map(function (entry, i) { return outlineKey(outlineEntries, entry) === pending.key ? i : -1; }).filter(function (i) { return i >= 0; });
            if (matches.length === 1) { var link = place.querySelector('[data-outline-index="' + matches[0] + '"]'); if (link) { link.focus(); } }
        }
        function scheduleOutline() {
            clearTimeout(outlineTimer);
            var place = el.explorer.querySelector('[data-outline-tree]');
            if (place && view && (current() !== outlineOwner || view.state.doc.toString() !== outlineText)) { suspendOutline(place); }
            outlineTimer = setTimeout(refreshOutline, 150);
        }
        function outlineControls() {
            var entry = outlineEntries[outlineTarget], editable = current() && !current().readOnly;
            el.explorer.querySelectorAll('[data-section-move]').forEach(function (button) { button.disabled = !editable || !entry || (button.dataset.sectionMove === 'up' ? entry.previous : entry.next) < 0; });
        }
        function currentHeadingIndex() {
            if (!view || current() !== outlineOwner) { return -1; }
            if (pageActive() && visual.api.outlineIndex) { return visual.api.outlineIndex(); }
            var index = -1, position = view.state.selection.main.head; outlineEntries.forEach(function (entry, i) { if (entry.from <= position) { index = i; } }); return index;
        }
        function markOutline() {
            if (!view || !outlineEntries.length || current() !== outlineOwner) { outlineControls(); return; }
            var index = currentHeadingIndex();
            if (!el.explorer.contains(document.activeElement)) { outlineTarget = index; }
            el.explorer.querySelectorAll('[data-outline-index]').forEach(function (link) { if (Number(link.dataset.outlineIndex) === index) { link.setAttribute('aria-current', 'location'); } else { link.removeAttribute('aria-current'); } });
            outlineControls();
        }
        function headingHref(entry) {
            var url = new URL(opts.pageUrl || location.pathname, location.href), tab = current();
            if (opts.ownsUrl) { url = new URL(location.href); }
            if (tab && tab.path) { url.searchParams.set('file', tab.path); } else { url.searchParams.delete('file'); }
            url.searchParams.set('line', String(entry.line)); return url.href;
        }
        function refreshOutline() { return loadOutline().catch(function (err) { if (!destroyed) { say('The outline could not be updated: ' + err.message, true); } }); }
        async function loadOutline() {
            var revision = ++outlineRevision, tab = current();
            if (!view || !el.explorer.querySelector('[data-outline-tree]')) { return; }
            var pendingPlace = el.explorer.querySelector('[data-outline-tree]');
            if (tab !== outlineOwner || view.state.doc.toString() !== outlineText) { suspendOutline(pendingPlace); }
            var text = view.state.doc.toString(), m = await mdEngine();
            if (destroyed || revision !== outlineRevision || current() !== tab || view.state.doc.toString() !== text) { return; }
            var place = el.explorer.querySelector('[data-outline-tree]'), focus = document.activeElement && document.activeElement.closest('[data-outline-index]'), oldFocus = focus && el.explorer.contains(focus) ? Number(focus.dataset.outlineIndex) : null;
            var expanded = {}; el.explorer.querySelectorAll('[data-outline-index][aria-expanded]').forEach(function (link) { expanded[link.dataset.outlineIndex] = link.getAttribute('aria-expanded'); });
            var entries = tab && tab.lang === 'markdown' ? m.outline(text) : [];
            var sameShape = tab === outlineOwner && JSON.stringify(entries.map(function (entry) { return [entry.level, entry.title]; })) === JSON.stringify(outlineEntries.map(function (entry) { return [entry.level, entry.title]; }));
            outlineEntries = entries; outlineText = text; outlineOwner = tab; outlineDrag = null;
            place.inert = false; place.setAttribute('aria-busy', 'false');
            if (!outlineVisible) { outlinePendingFocus = null; markOutline(); return; }
            var shape = JSON.stringify(entries.map(function (entry) { return [entry.level, entry.title]; }));
            if (outlineRenderedOwner === tab && outlineRenderedShape === shape && place.querySelector('.tree')) {
                place.querySelectorAll('[data-outline-index]').forEach(function (link, i) { link.href = headingHref(entries[i]); link.draggable = !tab.readOnly; });
                markOutline(); restoreOutlineFocus(place); return;
            }
            place.replaceChildren();
            outlineRenderedOwner = tab; outlineRenderedShape = shape;
            if (!entries.length) { var empty = document.createElement('p'); empty.className = 'ed-outline-empty'; empty.textContent = tab && tab.lang === 'markdown' ? 'No document headings yet.' : 'Outline is available for Markdown files.'; place.append(empty); outlinePendingFocus = null; outlineTarget = -1; outlineControls(); return; }
            var tree = document.createElement('ul'); tree.className = 'tree'; tree.setAttribute('aria-label', 'Document Outline'); tree.setAttribute('data-tree-toggles', 'buttons');
            var nodes = [];
            entries.forEach(function (entry, i) {
                var item = document.createElement('li'), link = document.createElement('a'); link.href = headingHref(entry); link.textContent = entry.title; link.dataset.outlineIndex = String(i); link.draggable = !tab.readOnly; link.setAttribute('data-tree-label', entry.title); item.append(link); nodes.push(item);
                if (entry.parent < 0) { tree.append(item); } else { var parent = nodes[entry.parent], list = parent.querySelector(':scope > ul'); if (!list) { list = document.createElement('ul'); parent.append(list); parent.querySelector(':scope > a').setAttribute('aria-expanded', sameShape && expanded[String(entry.parent)] || 'true'); } list.append(item); }
            });
            place.append(tree); markOutline(); if (window.pudlTree) { window.pudlTree.enhance(tree); }
            if (outlinePendingFocus) { restoreOutlineFocus(place); }
            else if (oldFocus != null) { var next = tree.querySelector('[data-outline-index="' + Math.min(oldFocus, entries.length-1) + '"]'); if (next) { next.focus(); } }
        }
        async function navigateOutline(index) {
            try { await navigateOutlineHeading(index); } catch (err) { if (!destroyed) { say(err.message, true); } }
        }
        async function navigateOutlineHeading(index) {
            var tab = current(), entry = outlineEntries[index]; if (!entry || tab !== outlineOwner) { return; }
            if (pageActive()) { await visual.api.sync(); }
            if (destroyed || current() !== tab) { return; }
            if (view.state.doc.toString() !== outlineText) {
                var identity = outlineKey(outlineEntries, entry);
                await refreshOutline();
                if (destroyed || current() !== tab || view.state.doc.toString() !== outlineText) { return; }
                var matches = outlineEntries.map(function (heading, i) { return outlineKey(outlineEntries, heading) === identity ? i : -1; }).filter(function (i) { return i >= 0; });
                if (matches.length !== 1) { say('The document headings changed. Choose the heading again.'); return; }
                index = matches[0]; entry = outlineEntries[index];
            }
            if (pageActive()) { await visual.api.reload(); }
            if (destroyed || current() !== tab || view.state.doc.toString() !== outlineText) { return; }
            view.dispatch({ selection: { anchor: entry.from }, effects: CM.EditorView.scrollIntoView(entry.from, { y: 'center' }) });
            if (pageActive() && visual.api.goToHeading) { visual.api.goToHeading(index); }
            else if (readsAsPreview()) { var block = el.page.querySelector('[data-line="' + entry.line + '"]'); if (block) { block.scrollIntoView({ block: 'center' }); } }
            else { view.focus(); }
            tab.navigationLine = entry.line; outlineTarget = index; markOutline(); announce(true);
            if (window.matchMedia('(max-width: 700px)').matches) { showExplorer(false); }
        }
        function outlineKey(list, heading) {
            var parts = []; for (var node = heading; node; node = node.parent >= 0 ? list[node.parent] : null) { parts.unshift([node.level, node.title]); } return JSON.stringify(parts);
        }
        async function moveOutline(direction, index, target, after) {
            var tab = current(); if (!tab || tab.readOnly || !view) { return; }
            index = index == null ? el.explorer.querySelector('.ed-outline-panel').contains(document.activeElement) ? outlineTarget : currentHeadingIndex() : index;
            var entry = outlineEntries[index], originalEntries = outlineEntries, destination = target == null ? null : outlineEntries[target];
            if (!entry || tab !== outlineOwner) { return; }
            try {
                if (pageActive()) { await visual.api.sync(); }
                var text = view.state.doc.toString(), m = await mdEngine();
                if (destroyed || current() !== tab || view.state.doc.toString() !== text) { scheduleOutline(); if (!destroyed) { say('The document changed. Choose the section again.', true); } return; }
                if (text !== outlineText) {
                    var entries = m.outline(text);
                    function rebind(heading) { var identity = outlineKey(originalEntries, heading), matches = entries.filter(function (candidate) { return outlineKey(entries, candidate) === identity; }); if (matches.length !== 1) { throw new Error('The document headings changed. Choose the section again.'); } return matches[0]; }
                    entry = rebind(entry); if (destination) { destination = rebind(destination); }
                }
                var request = { text: text, from: entry.from };
                if (direction) { request.direction = direction; } else { if (!destination) { return; } request[after ? 'after' : 'before'] = destination.from; }
                var moved = m.moveSection(request);
                if (moved.text === text) { return; }
                view.dispatch({ changes: { from: 0, to: text.length, insert: moved.text }, selection: { anchor: moved.from }, userEvent: 'input.move-section' });
                if (pageActive()) { await visual.api.reload(); }
                await refreshOutline();
                if (destroyed || current() !== tab || view.state.doc.toString() !== moved.text) { return; }
                var next = outlineEntries.findIndex(function (heading) { return heading.from === moved.from; });
                if (next >= 0 && pageActive()) { visual.api.goToHeading(next); }
                outlineTarget = next; outlineControls();
                if (next >= 0) { tab.navigationLine = outlineEntries[next].line; announce(); }
                if (next >= 0) { var link = el.explorer.querySelector('[data-outline-index="' + next + '"]'); if (link) { link.focus(); } }
                say('The section moved. Undo restores its previous position.');
            } catch (err) { if (!destroyed) { say(err.message, true); } }
        }
        function toggleOutline() {
            if (!explorer) { return; }
            if (!el.explorer.hidden && outlineVisible) { showExplorer(false); saveSetting({ explorer: false }); return; }
            showExplorer(true); saveSetting({ explorer: true, navigation: 'outline' }); el.explorer.querySelector('[data-outline-tab]').click(); refreshOutline();
        }
        function hideNavigation() { showExplorer(false); saveSetting({ explorer: false }); }

        /* The settings, as last read or changed, and a change arriving from
           elsewhere: another Editor, another tab, or the file edited. */
        var settings = Object.assign({}, SETTINGS), unConfig = null;
        function applySettings(s) {
            settings = Object.assign({}, SETTINGS, s);
            documentZoom = /^(width|page)$/.test(String(settings.documentZoom)) || Number(settings.documentZoom) >= 25 && Number(settings.documentZoom) <= 400 ? String(settings.documentZoom) : '100'; applyDocumentZoom();
            if (wrapOn !== !!settings.wrap) { setWrap(!!settings.wrap, false); }
            if (explorer && typeof settings.explorer === 'boolean' && el.explorer.hidden === settings.explorer) { showExplorer(settings.explorer); }
            if (explorerSplit) { explorerSplit.set(typeof settings.explorerWidth === 'number' ? settings.explorerWidth : null); }
            if (explorer && (settings.navigation === 'outline') !== outlineVisible) { var tab = settings.navigation === 'outline' ? el.explorer.querySelector('[data-outline-tab]') : el.explorer.querySelector('[role="tab"]:not([data-outline-tab])'); if (tab) { tab.click(); } }
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
            root.classList.toggle('ed-navigation-visible', !!on);
            if (on && outlineVisible) { scheduleOutline(); }
            if (on && window.pudlSplit) { window.pudlSplit.refresh(); }
            commandsChanged();
        }
        function toggleExplorer() {
            if (!explorer) { return; }
            var on = el.explorer.hidden || outlineVisible;
            showExplorer(on);
            if (on) { el.explorer.querySelector('[role="tab"]:not([data-outline-tab])').click(); }
            saveSetting({ explorer: on, navigation: 'files' });
        }
        /* Wrap lines, as the toolbar, the View menu or a key switches it,
           kept with the settings when the reader changes it. */
        /* A saved preference overrides capability defaults. Document files
           and the Docs host share the document-view preference. */
        function viewKey() { var t = current(); return forDocuments || (t && /\.docs\.md$/i.test(t.path || t.name || '')) ? 'documentView' : 'markdownView'; }
        function markdownDefault() {
            return MARKDOWN_VIEWS.some(function (v) { return v[0] === settings[viewKey()]; }) ? settings[viewKey()] : 'document';
        }
        function setMarkdownDefault(v) {
            var change = {};
            change[viewKey()] = v;
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
        var pageSettings = null, printFrame = null, previewPages = null, documentZoom = '100';
        function applyDocumentZoom() {
            var scale = 1;
            if (pagedView(viewMode) && pageSettings) {
                var css = getComputedStyle(el.scroll), width = el.scroll.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight), height = el.scroll.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
                scale = documentZoom === 'width' ? width / (pageSettings.width / .75) : documentZoom === 'page' ? Math.min(width / (pageSettings.width / .75), height / (pageSettings.height / .75)) : Number(documentZoom) / 100;
                scale = Math.max(.1, Math.min(4, scale || 1));
            }
            el.page.style.zoom = String(scale);
        }
        var zoomObserver = new ResizeObserver(applyDocumentZoom); zoomObserver.observe(el.scroll);
        function setDocumentZoom(value) {
            if (!/^(width|page)$/.test(String(value)) && (!Number.isFinite(Number(value)) || Number(value) < 25 || Number(value) > 400)) { throw new Error('Zoom must be 25 to 400 percent, Fit Width or Fit Page.'); }
            documentZoom = String(value); saveSetting({ documentZoom: documentZoom }); applyDocumentZoom(); commandsChanged();
        }
        function readsAsPreview() { var t = current(); return viewMode === 'preview' || !!(t && t.readOnly && viewMode !== 'text'); }
        function pagedView(mode) { return mode === 'document'; }
        function pageLayout(layout) {
            el.pages.textContent = layout.count + (layout.count === 1 ? ' page' : ' pages');
            pageNotice(layout.oversized ? 'A block is taller than the page. Shorten it or enlarge the page before printing. Line-level pagination is not available yet.' : '');
        }
        function pageNotice(message) {
            var notice = root.querySelector('[data-role="page-problems"]');
            notice.hidden = !message; notice.querySelector('.notice-body').textContent = message;
        }
        function clearPages() {
            el.page.querySelectorAll(':scope > .doc-furniture').forEach(function (node) { node.remove(); }); el.page.style.zoom = '1';
            el.pages.textContent = ''; pageSettings = null; pageNotice('');
            el.page.classList.remove('doc-paginated'); el.page.style.minHeight = '';
            el.page.removeAttribute('data-page-count');
            ['width', 'height', 'left', 'top', 'right', 'bottom', 'gap'].forEach(function (key) { el.page.style.removeProperty('--sheet-' + key); });
        }
        async function configurePages() {
            var t = current(), text = view.state.doc.toString(), K = await loadKit(), P = await K.pages(), m = await mdEngine();
            if (destroyed || current() !== t || !pagedView(viewMode) || text !== view.state.doc.toString()) { return; }
            try { var S = window.yavcDocumentSettings, props = S.properties(m.front(text)); pageSettings = P.settings(props); pageSettings.furniture = S.furniture(props, m); P.surface(el.page, pageSettings); applyDocumentZoom(); pageNotice(''); }
            catch (err) { clearPages(); pageNotice(err.message); }
        }
        async function editPageSetup() {
            var t = current(); if (!t || t.readOnly || !view) { return; }
            if (pageActive()) { await visual.api.sync(); }
            var text = view.state.doc.toString(), m = await mdEngine(), K = await loadKit(), P = await K.pages(), UI = await K.pageSetup();
            function unchanged() { return !destroyed && current() === t && view.state.doc.toString() === text; }
            if (!unchanged()) { return; }
            try { await UI.open({ properties: P.properties(m.front(text)), current: unchanged, signal: styleLifetime.signal, save: function (values) {
                var next = m.frontset({ text: text, set: values, order: ['page', 'orientation', 'margins'] }).text;
                takeVisualText(next); textChangedForPage(); refreshStyles();
            } }); } catch (err) { say(err.message, true); }
        }
        async function editDocumentOptions(kind) {
            var t = current(); if (!t || t.readOnly || t.lang !== 'markdown') { return; }
            if (pageActive()) { await visual.api.sync(); }
            var text = view.state.doc.toString(), K = await loadKit(), P = await K.pages(), m = await mdEngine(), S = window.yavcDocumentSettings;
            function unchanged() { return !destroyed && current() === t && view.state.doc.toString() === text; }
            if (!unchanged()) { return; }
            try { await S.open(kind, { properties: S.properties(m.front(text)), styles: m.styles(text).map(function (block) { return block.css; }), stylesheet: currentSharedStyle, read: window.pudlHost.fs.readText, engine: m, current: unchanged, signal: styleLifetime.signal, save: function (set, mappings) {
                var order = Object.keys(set).concat(Object.keys(mappings));
                takeVisualText(m.frontset({ text: text, set: set, mappings: mappings, order: order }).text); textChangedForPage(); refreshStyles();
            } }); } catch (err) { say(err.message, true); }
        }
        async function printDocument() {
            var t = current(); if (!t || t.lang !== 'markdown') { return; }
            try {
                if (pageActive()) { await visual.api.sync(); }
                var text = view.state.doc.toString(), K = await loadKit(), E = await K.exports(), P = await K.pages(), m = await documentEngine(text);
                function unchanged() { return !destroyed && current() === t && view.state.doc.toString() === text; }
                if (printFrame) { printFrame.remove(); printFrame = null; }
                await E.prepare({ text: text, engine: m, stylesheet: currentSharedStyle, pictures: picturesHost(), read: window.pudlHost.fs.readText, current: unchanged,
                    renderPages: async function (surface, page) {
                        if (!unchanged()) { throw new Error('The document changed during print preparation.'); }
                        var d = P.surface(surface, page), flow = document.createElement('div'); flow.className = 'doc-page-flow';
                        Array.from(surface.querySelectorAll('.dinah-src[data-start],.doc-block,.dinah-block')).reverse().forEach(function (node) { node.replaceWith.apply(node, Array.from(node.childNodes)); });
                        flow.append.apply(flow, Array.from(surface.childNodes)); surface.append(flow);
                        await document.fonts.ready;
                        var blocks = P.blocks(flow), layout = P.plan(blocks, page);
                        if (layout.oversized) { throw new Error('A block is taller than the page. Shorten it or enlarge the page before printing.'); }
                        var frame = document.createElement('iframe'); frame.className = 'ed-print-frame'; frame.title = 'Document Print'; frame.inert = true; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true'); document.body.append(frame); printFrame = frame;
                        frame.contentWindow.addEventListener('afterprint', function () { frame.remove(); if (printFrame === frame) { printFrame = null; } }, { once: true });
                        var doc = frame.contentDocument; doc.title = t.name || 'Document';
                        document.querySelectorAll('head link[rel="stylesheet"], head style').forEach(function (node) { doc.head.append(node.cloneNode(true)); });
                        var css = doc.createElement('style'); css.textContent = '@page{size:' + page.width + 'pt ' + page.height + 'pt;margin:0}html,body{margin:0;padding:0;background:white} .doc-print-sheet{box-sizing:border-box;break-after:page;break-inside:avoid;margin:0!important;min-height:0!important;height:' + d.height + 'px!important;background-image:none!important;print-color-adjust:exact;-webkit-print-color-adjust:exact} .doc-print-sheet:last-child{break-after:auto} .doc-print-sheet .sc-page-break{display:none}'; doc.head.append(css);
                        var at = 0, starts = [0].concat(layout.gaps.map(function (gap) { return gap.index; })).concat(blocks.length);
                        for (var i = 0; i < starts.length - 1; i++) {
                            var sheet = surface.cloneNode(false); sheet.classList.add('doc-print-sheet'); var body = doc.createElement('div'); body.className = 'doc-page-flow'; sheet.append(body);
                            for (at = starts[i]; at < starts[i + 1]; at++) { body.append(blocks[at].node.cloneNode(true)); }
                            var layer = doc.createElement('div'); layer.className = 'doc-furniture';
                            var header = window.yavcDocumentSettings.row(page, 'header', i + 1, starts.length - 1, doc), footer = window.yavcDocumentSettings.row(page, 'footer', i + 1, starts.length - 1, doc);
                            header.style.top = (page.margins[1] / 1.5 - 8) + 'px'; footer.style.top = ((page.height - page.margins[3] / 2) / .75 - 8) + 'px'; layer.append(header, footer); sheet.append(layer);
                            doc.body.append(sheet);
                        }
                        await Promise.all(Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(function (link) { return link.sheet ? Promise.resolve() : new Promise(function (resolve, reject) { link.onload = resolve; link.onerror = function () { reject(new Error('A print stylesheet could not load.')); }; }); }));
                        await doc.fonts.ready; await Promise.all(Array.from(doc.images).map(function (img) { return img.decode(); }));
                        if (!unchanged()) { frame.remove(); throw new Error('The document changed during print preparation.'); }
                        frame.contentWindow.print(); say('Print uses the document page size and margins. Turn off browser headers and footers and select the matching paper size.');
                    }
                });
            } catch (err) { if (printFrame) { printFrame.remove(); printFrame = null; } say('The document could not be printed: ' + err.message, true); }
        }

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
        var macroContext = null, macroOwner = null, sharedMacros = '', macroRevision = 0;
        async function documentEngine(definitions) {
            var t = current(), source = definitions == null ? view ? view.state.doc.toString() : '' : definitions, host = picturesHost(), directory = host.dir(), revision = ++macroRevision;
            host.dir = function () { return directory; };
            var m = await mdEngine(), K = await loadKit(), M = await K.macros(), prepared = await M.prepare(m, source, host);
            if (!destroyed && revision === macroRevision && current() === t && view.state.doc.toString() === source) { macroContext = prepared.engine; macroOwner = t; sharedMacros = prepared.shared; }
            return revision === macroRevision ? prepared.engine : m.withMacros(source, macroOwner === t ? sharedMacros : '');
        }
        async function editDefinitions() {
            var t = current(); if (!t || t.readOnly) { return; }
            if (pageActive()) { await visual.api.sync(); }
            var text = view.state.doc.toString(), m = await mdEngine(), K = await loadKit(), M = await K.macros();
            function unchanged() { return !destroyed && current() === t && view.state.doc.toString() === text; }
            if (!unchanged()) { return; }
            try { await M.manage({ engine: m, text: text, host: picturesHost(), current: unchanged, signal: styleLifetime.signal,
                save: function (next) { takeVisualText(next); textChangedForPage(); refreshStyles(); } }); }
            catch (err) { say(err.message, true); }
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
                pagination: function () { return pagedView(viewMode) ? pageSettings : null; },
                paginated: pageLayout,
                paginationProblem: pageNotice,
                customName: function (name) { return customShortcodes().some(function (item) { return item.name === name; }); },
                text: function () { return view.state.doc.toString(); },
                setText: takeVisualText,
                docOf: function (text) { return documentEngine(text).then(function (m) { return m.doc(text); }); },
                markdownOf: function (doc) { return mdEngine().then(function (m) { return m.markdown(doc); }); },
                sourceOf: function (src) { return documentEngine().then(function (m) { return m.source(src); }); },
                wrapOf: function (line) { return documentEngine().then(function (m) { return m.container(line); }); },
                inlineOf: function (src) { return documentEngine().then(function (m) { return m.inline(src); }); },
                blocksOf: function (text) { return documentEngine().then(function (m) { return m.blocks(text); }); },
                draw: function (target, html, diagrams) { drawBlocks(target, [{ line: 0, html: html, diagrams: diagrams }]); },
                keys: pageKeys,
                say: say,
                changed: function () { commandsChanged(); markOutline(); if (visualFind && !el.findPlace.hidden) { visualFind.refresh(); } },
                failed: function (text) { setView(viewMode === 'document' ? 'visual' : 'text').then(function () { say(text, true); }); }
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
            keys.push({ key: 'Mod-Alt-o', run: function () { toggleOutline(); return true; } });
            keys.push({ key: 'Alt-Shift-ArrowUp', run: function () { moveOutline('up'); return true; } });
            keys.push({ key: 'Alt-Shift-ArrowDown', run: function () { moveOutline('down'); return true; } });
            return keys;
        }
        function textChangedForPage() {
            if (pageActive()) { visual.api.textChanged(); }
            if (readsAsPreview()) { schedulePreview(); }
        }

        /* Shows the document as asked. Visual and Split need a Markdown
           file that can be changed; Preview any Markdown file. */
        async function setView(mode) {
            var t = current();
            mode = resolvedView(t, mode);
            viewMode = mode;
            commandsChanged();
            root.classList.toggle('ed-previewing', mode !== 'text');
            root.classList.toggle('ed-visual-only', mode === 'visual' || mode === 'preview' || mode === 'document');
            root.classList.toggle('ed-document', pagedView(mode));
            if (previewPages) { previewPages.destroy(); previewPages = null; }
            if (!pagedView(mode)) { clearPages(); }
            root.classList.toggle('ed-reading', readsAsPreview());
            showFormat(mode);
            el.pageBox.hidden = mode === 'text';
            var gen = ++visual.gen;
            refreshStyles();
            clearTimeout(visual.timer);
            if (mode === 'text') {
                closePageFind(false);
                if (visual.api) { await visual.api.enable(false); }
                if (gen !== visual.gen || destroyed) { return; }
                el.page.replaceChildren();
                say('');
                keep();
                return;
            }
            try {
                await mdEngine();
                if (pagedView(mode)) { await configurePages(); }
                if (gen !== visual.gen) { return; }
                if (readsAsPreview()) {
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
                    visual.api.repaginate();
                    if (mode === 'visual' || mode === 'document') { visual.api.focus(); }
                }
            } catch (err) {
                if (gen !== visual.gen || destroyed) { return; }
                await setView(mode === 'document' ? 'visual' : 'text');
                say('The page could not be made. Using ' + viewMode + ' view: ' + (err && err.message || err), true);
                return;
            }
            keep();
        }
        function detachVisual() {
            clearTimeout(visual.timer);
            if (visual.api) { try { visual.api.enable(false); } catch (err) { } }
        }

        /* === Preview ===================================================== */
        var documentStyles = null, styledIdentity = null, styledMode = '', styledTypography = '', currentSharedStyle = '', styleRevision = 0, styleTimer = 0;
        function styleDirectory() { var t = current(); return t && t.path && F ? F.splitPath(t.path).dir : '~'; }
        function scheduleStyles() { clearTimeout(styleTimer); styleTimer = setTimeout(refreshStyles, 150); }
        async function refreshStyles(reload) {
            var revision = ++styleRevision, t = current(), text = t && view ? view.state.doc.toString() : '';
            if (styledIdentity !== t || styledMode !== viewMode) { if (documentStyles) { documentStyles.destroy(); documentStyles = null; } styledIdentity = t; styledMode = viewMode; currentSharedStyle = ''; }
            if (!t || t.lang !== 'markdown') { if (documentStyles) { documentStyles.destroy(); documentStyles = null; } return; }
            try {
                var K = await loadKit(), m = await mdEngine(), D = await K.styles(), P = await K.pages();
                if (destroyed || revision !== styleRevision || t !== current()) { return; }
                var typeCSS = window.yavcDocumentSettings.typeCSS(window.yavcDocumentSettings.properties(m.front(text)));
                if (documentStyles && styledTypography !== typeCSS) { documentStyles.destroy(); documentStyles = null; }
                styledTypography = typeCSS;
                if (!documentStyles) { documentStyles = D.attach({ surfaces: function () { return [el.page]; }, boundaries: function () { return [el.scroll]; },
                    base: (pagedView(viewMode) ? P.paper : '') + ';' + typeCSS,
                    read: function (path) { return window.pudlHost.fs.readText(path); }, onProblems: function (problems) {
                        var notice = root.querySelector('[data-role="style-problems"]'); notice.hidden = !problems.length; notice.querySelector('.notice-body').textContent = problems.join(' ');
                    } }); }
                var front = m.front(text), path = ''; (front.entries || []).forEach(function (entry) { if (entry.key === 'stylesheet') { path = entry.value; } });
                currentSharedStyle = window.yavcStyleTools.resolve(path, styleDirectory());
                await documentStyles.update({ identity: t, inline: m.styles(text).map(function (block) { return block.css; }), stylesheet: currentSharedStyle, reload: reload === true });
                var oldShared = sharedMacros; await documentEngine();
                if (!destroyed && revision === styleRevision && oldShared !== sharedMacros) {
                    if (pageActive()) { visual.api.textChanged(true); } else if (readsAsPreview()) { schedulePreview(); }
                }
                if (!destroyed && revision === styleRevision) { if (pagedView(viewMode)) { await configurePages(); if (visual.api) { visual.api.repaginate(); } if (previewPages) { previewPages.refresh(); } } commandsChanged(); }
            } catch (err) { if (!destroyed && revision === styleRevision) { say('Styles could not be applied: ' + err.message, true); } }
        }
        async function editStyles(shared) {
            var t = current(); if (!t || t.readOnly) { return; }
            if (pageActive() && visual.api.sync) { await visual.api.sync(); }
            var text = view.state.doc.toString(), m = await mdEngine(), K = await loadKit(); await K.styles();
            function unchanged() { return !destroyed && current() === t && view.state.doc.toString() === text; }
            if (!unchanged()) { return; }
            try {
                if (shared) {
                    var path = ''; (m.front(text).entries || []).forEach(function (entry) { if (entry.key === 'stylesheet') { path = entry.value; } });
                    await window.yavcStyleTools.shared({ path: path, dir: styleDirectory(), current: unchanged, signal: styleLifetime.signal, read: window.pudlHost.fs.readText, write: window.pudlHost.fs.writeText });
                } else {
                    await window.yavcStyleTools.document({ text: text, engine: m, current: unchanged, signal: styleLifetime.signal, save: function (next) {
                        takeVisualText(next); textChangedForPage(); refreshStyles();
                    } });
                }
                refreshStyles(true);
            } catch (err) { say(err.message, true); }
        }
        function schedulePreview() {
            clearTimeout(visual.timer);
            visual.timer = setTimeout(function () { drawPreview().catch(function (err) { say('The preview could not be drawn: ' + (err && err.message || err), true); }); }, 250);
        }
        async function drawPreview() {
            var gen = visual.gen, t = current(), source = view.state.doc.toString(), m = await documentEngine(source);
            if (gen !== visual.gen || !view || !readsAsPreview() || current() !== t || view.state.doc.toString() !== source) { return; }
            var p = m.preview(source), top = el.scroll.scrollTop;
            if (pagedView(viewMode)) {
                var flow = el.page.querySelector(':scope > .doc-page-flow');
                if (!flow) { el.page.replaceChildren(); flow = document.createElement('div'); flow.className = 'doc-page-flow'; el.page.append(flow); }
                drawBlocks(flow, p.blocks);
                if (!previewPages) { previewPages = window.yavcDocumentPages.preview({ host: el.page, flow: flow, settings: function () { return pageSettings; }, changed: pageLayout, problem: pageNotice }); }
                previewPages.refresh();
            } else { drawBlocks(el.page, p.blocks); }
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
                blockStyle: blockStyle, classes: function () { return documentStyles ? documentStyles.state().classes : []; }, say: say, pictures: picturesHost
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
                macroContext: currentMacroEngine,
                signal: styleLifetime.signal, identity: current, text: function () { return view ? view.state.doc.toString() : ''; },
                dir: function () { var t = current(); return t && t.path ? (F.splitPath(t.path).dir || '~') : null; }
            };
        }

        /* === Find and replace ===========================================
           The find bar is the editing kit's (apps/md-editor/kit.js findBar
           and codeSearch), shared with Diagrams: in the text it is
           CodeMirror's search panel, and on the page it drives the visual
           editor's own search. The query carries over when the view
           changes. */
        var lastFind = null, visualFind = null;
        function keepQuery(q) { lastFind = q; }
        function findBar(driver) { return window.yavcMdEditor.findBar(driver, keepQuery); }

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
        function formatsThePage() { return pageActive() && (viewMode === 'visual' || viewMode === 'document' || (viewMode === 'split' && !(view && view.hasFocus))); }
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
            var custom = customShortcodes();
            if (custom.length) { items.push('-'); custom.forEach(function (s) { items.push({ id: 'insert-custom-' + s.name, label: s.name, run: function () { insertCustom(s.name); } }); }); }
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
        async function insertCustom(name) {
            var t = current(), source = view.state.doc.toString(), m = await documentEngine();
            if (destroyed || styleLifetime.signal.aborted || current() !== t || view.state.doc.toString() !== source) { return; }
            var src = await window.yavcMacroTools.ask(m, name, null, picturesHost()), metadata = window.yavcMacroTools.metadata(m).find(function (item) { return item.name === name; });
            if (!src || current() !== t || view.state.doc.toString() !== source) { return; }
            if (formatsThePage()) { visual.api.insertShortcode(metadata.kind, src); }
            else { insertText(metadata.kind === 'inline' ? src : '\n' + src + '\n'); }
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
            refreshStyles(true);
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
            if (t.submittedWrite && t.path === t.submittedWrite.path && text === t.submittedWrite.text) { return; }
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
            openPath(f).then(async function (opened) { if (!opened && !F.resolve(F.home(), f)) { newNamed(f); } await restoreLine(Number(new URLSearchParams(s || '').get('line')) || 1); });
        }
        async function restoreLine(number) {
            var tab = current(); if (!view || !tab) { return; }
            var text = view.state.doc.toString(), m = await mdEngine();
            if (destroyed || current() !== tab || view.state.doc.toString() !== text) { return; }
            var line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, Math.floor(number)))), entries = tab.lang === 'markdown' ? m.outline(text) : [];
            view.dispatch({ selection: { anchor: line.from }, effects: CM.EditorView.scrollIntoView(line.from, { y: 'center' }) });
            var index = entries.findIndex(function (heading) { return heading.line === line.number; });
            if (index >= 0 && pageActive()) { visual.api.goToHeading(index); }
            else if (readsAsPreview()) { var block = el.page.querySelector('[data-line="' + line.number + '"]'); if (block) { block.scrollIntoView({ block: 'center' }); } }
            tab.navigationLine = line.number; markOutline(); announce();
        }
        function locationChanged() { if (opts.ownsUrl) { takeFile(location.search); } }
        if (opts.ownsUrl) { window.addEventListener('popstate', locationChanged); }

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
            'toggle-outline': toggleOutline,
            'hide-navigation': hideNavigation,
            'section-up': function () { return moveOutline('up'); },
            'section-down': function () { return moveOutline('down'); },
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
                cmd('toggle-files', 'Files', 'folder', toggleExplorer, { checked: function () { return !el.explorer.hidden && !outlineVisible; } }),
                cmd('toggle-outline', 'Outline', 'list', toggleOutline, { checked: function () { return !el.explorer.hidden && outlineVisible; }, shortcut: key('toggle-outline', 'Mod-Alt-o') }),
                cmd('hide-navigation', 'Hide Navigation Pane', 'panel', hideNavigation, { hidden: function () { return el.explorer.hidden; } }),
                cmd('section-up', 'Move Section Up', 'arrow-up', function () { return moveOutline('up'); }, { shortcut: key('section-up', 'Alt-Shift-ArrowUp'), disabled: function () { var entry = outlineEntries[outlineTarget]; return !editable || !entry || entry.previous < 0; } }),
                cmd('section-down', 'Move Section Down', 'arrow-down', function () { return moveOutline('down'); }, { shortcut: key('section-down', 'Alt-Shift-ArrowDown'), disabled: function () { var entry = outlineEntries[outlineTarget]; return !editable || !entry || entry.next < 0; } }),
                cmd('new', 'New', 'file', function () { newTab(); }),
                cmd('open', 'Open…', 'folder', function () { openDialog(); }),
                cmd('save', 'Save', 'yavc-save', function () { save(); }, { disabled: function () { var t = current(); return !ready || !t || t.readOnly; }, reason: 'This file is read-only.' }),
                cmd('save-as', 'Save As…', 'yavc-save-as', function () { saveAs(); }, { label: function () { var t = current(); return t && t.readOnly ? 'Save a Copy to ~…' : 'Save As…'; }, disabled: function () { return !ready || !current(); } }),
                cmd('close-document', 'Close Document', null, function () { COMMANDS['close-document'](); }, { disabled: function () { return !ready || !current(); } }),
                /* glyphOnly: a glyph every reader knows shows alone on the
                   menu bar's ribbon (PUDL 0.79.0), its words its tooltip. */
                cmd('export-docx', 'Download as Word', 'download', function () { return downloadDocument('docx'); }, { disabled: function () { return !ready || !tab || tab.lang !== 'markdown'; } }),
                cmd('export-pdf', 'Download as PDF', 'download', function () { return downloadDocument('pdf'); }, { disabled: function () { return !ready || !tab || tab.lang !== 'markdown'; } }),
                cmd('undo', 'Undo', 'yavc-undo', function () { CM.undo(view); }, { builtIn: 'Mod-z', glyphOnly: true }),
                cmd('redo', 'Redo', 'yavc-redo', function () { CM.redo(view); }, { builtIn: 'Mod-y', glyphOnly: true }),
                cmd('find', 'Find and Replace…', 'search', openFind, { builtIn: 'Mod-f' }),
                cmd('json-format', 'Format JSON', 'code', function () { if (lsp) { lsp.format(view); } }, { shortcut: 'Shift+Alt+F', hidden: function () { return !tab || tab.lang !== 'json'; }, disabled: function () { return !editable || !lsp; } }),
                cmd('language-restart', 'Restart Language Assistance', 'reload', function () { if (lsp) { lsp.restart(); view.dispatch({ effects: lspComp.reconfigure(languageAssistance(current())) }); } }, { hidden: function () { return !tab || tab.lang !== 'json'; }, disabled: function () { return !ready || !lsp; } }),
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
                    shortcut: f[3] ? keyLabel(f[3]) : undefined, hidden: function () { return !formatOffered; }, glyphOnly: true,
                    checked: f[0] === 'quote' ? function () { return window.yavcMdEditor.quoteState(editCtx()); } : undefined
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
            table.push(cmd('page-setup', 'Page Setup…', 'file', editPageSetup, { hidden: unformatted, disabled: noEdit }));
            table.push(cmd('header-footer', 'Header and Footer…', 'file', function () { return editDocumentOptions('furniture'); }, { hidden: unformatted, disabled: noEdit }));
            table.push(cmd('typography', 'Typography…', 'paragraph', function () { return editDocumentOptions('typography'); }, { hidden: unformatted, disabled: noEdit }));
            table.push(cmd('document-zoom', 'Document Zoom', 'search', null, { hidden: function () { return viewMode !== 'document'; }, items: [
                cmd('document-fit-width', 'Fit Width', null, function () { setDocumentZoom('width'); }),
                cmd('document-fit-page', 'Fit Page', null, function () { setDocumentZoom('page'); }),
                cmd('document-zoom-custom', 'Zoom…', null, async function () { var value = await window.yavcMdEditor.askText('Document Zoom', 'Percent', /^\d/.test(documentZoom) ? documentZoom : '100', { validate: function (text) { return !Number.isFinite(Number(text)) || Number(text) < 25 || Number(text) > 400 ? 'Enter 25 to 400.' : null; } }); if (value != null) { setDocumentZoom(value); } }),
                cmd('document-zoom-reset', '100%', null, function () { setDocumentZoom('100'); })
            ] }));
            table.push(cmd('print-document', 'Print…', 'yavc-print', printDocument, { hidden: unformatted, disabled: function () { return !ready || !tab || tab.lang !== 'markdown'; } }));
            table.push(cmd('stylesheet', 'Document Stylesheet…', 'code', function () { return editStyles(false); }, { shortcut: 'Mod+Shift+F', hidden: unformatted, disabled: noEdit }));
            table.push(cmd('custom-shortcodes', 'Custom Shortcodes…', 'code', editDefinitions, { hidden: unformatted, disabled: noEdit }));
            table.push(cmd('shared-stylesheet', 'Edit Shared Stylesheet…', 'file', function () { return editStyles(true); }, { hidden: unformatted,
                disabled: function () { return noEdit() || !/^~\/.+\.css$/i.test(currentSharedStyle) || !(window.pudlHost && window.pudlHost.fs && window.pudlHost.fs.writeText); },
                reason: 'Choose a home-folder CSS file in Document Stylesheet first. This host also needs a writable file service.' }));
            table.push({ id: 'md-default', label: 'Open Markdown As', hidden: function () { return !viewsOffered; },
                current: function () { var f = MARKDOWN_VIEWS.find(function (x) { return x[0] === markdownDefault(); }); return f ? f[1] : null; },
                items: MARKDOWN_VIEWS.map(function (v) {
                    return { id: 'md-default-' + v[0], label: v[1], choice: 'ed-md-default', value: v[0],
                        checked: function () { return markdownDefault() === v[0]; }, run: function () { setMarkdownDefault(v[0]); } };
                }) });
            MARKDOWN_VIEWS.forEach(function (v) {
                table.push({ id: 'view-' + v[0], label: v[1], choice: 'ed-view', choiceLabel: 'View', value: v[0],
                    checked: function () { return viewMode === v[0]; },
                    hidden: function () { return !tab; },
                    disabled: function () { return !ready || !supportsView(tab, v[0]); },
                    /* A view the reader chooses is the tab's from then on. */
                    run: function () { var t = current(); if (t) { t.view = v[0]; } setView(v[0]); } });
            });
            return table.concat(commonToolbar ? commonToolbar.commands() : [], [{ id: 'view-mode', label: 'View', glyph: 'panel', toolbarChoice: 'ed-view', toolbarPriority: 50, items: ['view-document', 'view-visual', 'view-text', 'view-split', 'view-preview'] }]);
        }

        /* The toolbar: what is used most stays named longest, and the view
           switch and Preview keep to the end of the row. */
        function toolbars() {
            if (commonToolbar) { return []; }
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
        var LAYOUT = ['toggle-files', 'toggle-outline', 'hide-navigation', 'toggle-wrap', '-', 'view-document', 'view-visual', 'view-text', 'view-split', 'view-preview', 'document-zoom', 'md-default', '-', 'source', 'preview'];
        function menus() {
            var titles = [
                { label: 'Editor', glyph: 'document', items: window.pcAppletIdentity(root, ['key-bindings']) },
                { id: 'file', label: 'File', glyph: 'file', items: ['new', 'open', 'save', 'save-as', '-', 'export-docx', 'export-pdf', 'print-document', '-', 'page-setup', 'properties', 'present', '-', 'close-document'] },
                { id: 'edit', label: 'Edit', glyph: 'pencil', items: ['undo', 'redo', '-', 'find', '-', 'json-format', 'language-restart'] },
                { id: 'insert', label: 'Insert', glyph: 'plus', items: ['link', 'insert', 'table', 'box', '-', 'insert-timestamp', 'insert-date', 'stamp-modified'] }
            ];
            /* Format, where there is formatting to do. */
            if (formatOffered) { titles.push({ id: 'format', label: 'Format', glyph: 'paragraph', items: ['style', '-', 'bold', 'italic', 'underline', 'strike', 'code', '-', 'highlight', 'superscript', 'subscript', '-', 'color', 'class', '-', 'bullets', 'numbers', 'quote', 'table', '-', 'typography', 'header-footer', '-', 'stylesheet', 'shared-stylesheet', 'custom-shortcodes'] }); }
            return { titles: titles, into: { view: LAYOUT.concat(commonToolbar ? ['-', 'common-toolbar-show', 'common-toolbar-customize'] : []), go: ['go-to-line', '-', 'section-up', 'section-down'] } };
        }

        /* === Start ======================================================== */

        var boot = Promise.all([loadCodeMirror(), loadSiteFs().then(function (api) { F = api; return F.load(); }), loadBrowser()]).then(async function (res) {
            if (destroyed) { return; }
            CM = res[0];
            lspComp = new CM.Compartment();
            try {
                var languageServices = await window.yavcMdEditor.languageServices();
                if (destroyed) { return; }
                lsp = languageServices.create(CM, function (message) { say(message, true); });
            } catch (err) { if (!destroyed) { say('Language assistance could not load. Text editing remains available.', true); } }
            if (destroyed) { return; }
            FB = res[2];
            /* Settings that can't be read leave the defaults in place. */
            var config = await loadConfig().catch(function () { return null; });
            if (config) {
                settings = Object.assign({}, SETTINGS, await config.load('editor', SETTINGS).catch(function () { return SETTINGS; }));
                documentZoom = /^(width|page)$/.test(String(settings.documentZoom)) || Number(settings.documentZoom) >= 25 && Number(settings.documentZoom) <= 400 ? String(settings.documentZoom) : '100';
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
            if (startFile && startLine > 1) { await setView(viewMode); await restoreLine(startLine); }
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
        async function updateDocumentOptions(input, running) {
            docNo(); var tab = current(); if (tab.readOnly || tab.lang !== 'markdown') { throw new Error('Choose an editable Markdown document.'); }
            if (pageActive()) { await visual.api.sync(); }
            var text = view.state.doc.toString(), K = await loadKit(), P = await K.pages(), m = await mdEngine(), S = window.yavcDocumentSettings;
            if (destroyed || current() !== tab || view.state.doc.toString() !== text) { throw new Error('The document changed. Try again.'); }
            var set = {}, mappings = {}, allowed = running ? ['header', 'footer', 'header-first'] : ['font', 'heading-font', 'size', 'spacing', 'paragraph-spacing'];
            Object.keys(input).forEach(function (key) {
                if (allowed.indexOf(key) < 0) { throw new Error('Unsupported document setting.'); }
                if (running && /^(header|footer)$/.test(key) && input[key] && typeof input[key] === 'object' && !Array.isArray(input[key])) { mappings[key] = input[key]; }
                else { if (input[key] !== null && typeof input[key] !== 'string') { throw new Error('Document settings must be text.'); } set[key] = input[key]; }
            });
            var props = Object.assign({}, S.properties(m.front(text)), set, mappings);
            S.typography(props); var page = P.settings(props); page.furniture = S.furniture(props, m); S.check(page);
            takeVisualText(m.frontset({ text: text, set: set, mappings: mappings, order: Object.keys(set).concat(Object.keys(mappings)) }).text); textChangedForPage(); refreshStyles();
            return { output: { changed: true } };
        }
        var liveActions = {
            'header-footer@1': async function (input) { return updateDocumentOptions(input, true); },
            'typography@1': async function (input) { return updateDocumentOptions(input, false); },
            'document-zoom@1': async function (input) { docNo(); if (viewMode !== 'document') { throw new Error('Choose Document view before setting document zoom.'); } setDocumentZoom(input.value); return { output: { value: documentZoom } }; },
            'page-setup@1': async function (input) {
                docNo(); var tab = current(); if (tab.readOnly || tab.lang !== 'markdown') { throw new Error('Choose an editable Markdown document.'); }
                if (pageActive()) { await visual.api.sync(); }
                var text = view.state.doc.toString(), K = await loadKit(), P = await K.pages(), m = await mdEngine();
                if (destroyed || current() !== tab || view.state.doc.toString() !== text) { throw new Error('The document changed during page setup.'); }
                var props = P.properties(m.front(text)), values = Object.assign({}, props, input), page = P.settings(values);
                takeVisualText(m.frontset({ text: text, set: input, order: ['page', 'orientation', 'margins'] }).text); textChangedForPage(); refreshStyles();
                return { output: { width: page.width, height: page.height, margins: page.margins } };
            },
            'export@1': async function (input) {
                var result = await exportDocument(input.format);
                return { output: { format: input.format, blocks: result.blocks, warnings: result.warnings }, artifacts: [{ key: input.format, name: result.name, mime: result.blob.type, data: new Uint8Array(await result.blob.arrayBuffer()) }] };
            },
            'outline@1': async function () {
                docNo(); var tab = current(); if (tab.lang !== 'markdown') { throw new Error('Outline is available for Markdown files.'); }
                if (pageActive()) { await visual.api.sync(); }
                var text = view.state.doc.toString(), m = await mdEngine();
                if (current() !== tab || view.state.doc.toString() !== text) { throw new Error('The document changed. Read its outline again.'); }
                return { output: m.outlineState(text) };
            },
            'move-section@1': async function (input) {
                docNo(); var tab = current(); if (tab.readOnly || tab.lang !== 'markdown') { throw new Error('Choose an editable Markdown document.'); }
                if (pageActive()) { await visual.api.sync(); }
                var text = view.state.doc.toString(), m = await mdEngine();
                if (destroyed || current() !== tab || view.state.doc.toString() !== text) { throw new Error('The document changed. Read its outline again.'); }
                var moved = m.moveSection({ text: text, from: input.from, direction: input.direction, before: input.before, after: input.after, expected: input.revision });
                if (moved.text === text) { return { output: { moved: false, from: moved.from } }; }
                view.dispatch({ changes: { from: 0, to: text.length, insert: moved.text }, selection: { anchor: moved.from }, userEvent: 'input.move-section' });
                if (pageActive()) { await visual.api.reload(); }
                if (!destroyed && current() === tab && view.state.doc.toString() === moved.text) { await refreshOutline(); }
                return { output: { moved: true, from: moved.from } };
            },
            'table@1': async function (input) {
                docNo(); if (current().readOnly || !pageActive() || !visual.api.inTable()) { throw new Error('Select a table cell in an editable Visual or Split view.'); }
                if (!visual.api.run(input.op)) { throw new Error('The table command is unavailable for this selection.'); }
                await visual.api.sync(); return { output: { changed: true } };
            },
            'format@1': async function (input) {
                docNo(); if (current().readOnly) { throw new Error('The document is read-only.'); }
                if (formatsThePage()) { if (!visual.api.run(input.op)) { throw new Error('This format is unavailable for the selection.'); } await visual.api.sync(); }
                else { window.yavcMdEditor.textFormat(view, input.op, editCtx()); }
                return { output: { formatted: true } };
            },
            'define@1': async function () { docNo(); if (pageActive()) { await visual.api.sync(); } return { output: (await documentEngine()).macros() }; },
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
                var savedIndex = tabs.indexOf(t);
                if (savedIndex < 0) { throw new Error('The document closed while its save was running.'); }
                return { output: docView(savedIndex, false) };
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
        var commonToolbar = window.pudlHost && window.pudlHost.commandToolbar ? window.pudlHost.commandToolbar.attach(root, { app: 'editor', label: forDocuments ? 'Docs' : 'Editor', table: commandTable,
            defaults: ['save', '-', 'undo', 'redo', '-', 'style', 'bold', 'italic', 'link', 'insert', '-', 'find', '-', 'view-mode'] }) : null;

        return {
            state: function () { return stateString() || null; },
            setState: takeFile,
            menus: menus,
            commandTable: commandTable,
            toolbars: toolbars,
            destroy: function () {
                zoomObserver.disconnect();
                if (printFrame) { printFrame.remove(); }
                if (previewPages) { previewPages.destroy(); }
                var finalSync = Promise.resolve().then(function () { if (visual.api) { return visual.api.sync(); } });
                outlineRevision++; clearTimeout(outlineTimer); if (navigationObserver) { navigationObserver.disconnect(); }
                window.removeEventListener('popstate', locationChanged);
                if (commonToolbar) { commonToolbar.destroy(); }
                /* The session as the Editor closes, for when it opens again. */
                if (detachLive) { detachLive(); }
                keepSession();
                destroyed = true;
                styleLifetime.abort();
                styleRevision++; clearTimeout(styleTimer); if (documentStyles) { documentStyles.destroy(); }
                if (unsubscribe) { unsubscribe(); }
                if (unConfig) { unConfig(); }
                unguard();
                if (explorer) { explorer.destroy(); }
                finalSync.catch(function (err) { say(err.message, true); }).finally(function () { keepSession(); if (snap) { snap.leave(); } if (visual.api) { visual.api.destroy(); } if (view) { view.destroy(); } });
                if (lsp) { lsp.dispose(); }
            },
            ready: boot
        };
    }

    window.pudlApplets.register('editor', { init: init });
})();
