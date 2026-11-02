/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Files: a graphical view of the same sandbox the terminal sees
   (Architecture/files-editor-design.md). The browsing itself, the folder
   tree, the path bar and the list, is js/filebrowser.js, which the Editor
   shares; Files adds the toolbar, the Actions menu, the detail line, its
   dialogs and uploads, and decides what opening an entry means. The
   reader's own home directory, ~, and on the edit origin /wwwroot, can be
   changed here the way the terminal changes them. Everything goes through
   js/sitefs.js. */
(function () {
    'use strict';

    var SELF_SRC = document.currentScript && document.currentScript.src;
    function beside(file) { return SELF_SRC ? SELF_SRC.replace(/files\.js/, file) : '/applets/files/' + file; }
    /* The site's shared scripts load through static/yavc-util.js, each once. */
    var loadScript = window.yavcUtil.loadScript;
    function loadSiteFs() { return window.yavcUtil.loadGlobal(window.pcSiteFsSrc, 'pcSiteFs'); }
    /* Files' one setting, whether names starting with a dot show, lives in
       ~/.config/files.json (js/config.js) and is toggled from its menu. */
    function loadConfig() { return window.yavcUtil.loadGlobal(window.pcConfigSrc, 'pcConfig'); }

    function loadBrowser() { return window.yavcUtil.loadGlobal(window.pcFileBrowserSrc, 'pcFileBrowser'); }

    var esc = window.yavcUtil.esc;

    function init(root, opts) {
        opts = opts || {};
        root.classList.add('pc-files');
        if (opts.fit === 'fill') { root.classList.add('pc-files-fill'); }
        /* The toolbar's place first: PUDL draws the toolbar from the command
           table as the applet starts (PUDL 0.68.0), before the files have
           loaded and the rest is built. */
        root.innerHTML = '<div class="fm-toolbar-slot" data-toolbar-slot></div><div class="fm-shell" data-role="shell"><p class="fm-loading">Loading…</p></div>';
        var shell = root.querySelector('[data-role="shell"]');
        function commandsChanged() { if (opts.commandsChanged) { opts.commandsChanged(); } if (window.pudlMenubar) { window.pudlMenubar.refresh(); } }

        var F = null, FB = null, b = null, el = null, destroyed = false;
        /* A folder handed over or in the address comes first; then, after
           a reload, the folder the snapshot was taken in (js/snapshot.js),
           since a window's address doesn't keep it. */
        var snap = window.pcSnapshot ? window.pcSnapshot.join(root, function () { return b ? b.snapshot() : null; }) : null;
        var startPath = pathFrom(opts.state) || (opts.ownsUrl ? pathFrom(location.search) : null) ||
            (snap && snap.kept && typeof snap.kept.cwd === 'string' ? snap.kept.cwd : null) || '/site';

        function pathFrom(s) {
            if (!s) { return null; }
            var v = new URLSearchParams(String(s).replace(/^\?/, '')).get('path');
            return v && (v[0] === '/' || v[0] === '~') ? v : null;
        }

        function build() {
            shell.innerHTML =
                '<div class="fm-pathrow">' + FB.markup.pathBar() + '</div>' +
                FB.markup.body({ drop: true, hint: 'Drop files here to upload them' }) +
                '<div class="fm-detail" data-role="detail" aria-live="polite"></div>' +
                '<p class="fm-status" data-role="status" role="status" aria-live="polite"></p>' +
                '<input type="file" multiple hidden data-role="file-input" />';
            var q = function (sel) { return root.querySelector(sel); };
            el = {
                detail: q('[data-role="detail"]'), status: q('[data-role="status"]'),
                fileInput: q('[data-role="file-input"]'), main: q('[data-fb="main"]')
            };
        }

        /* === State ====================================================== */

        function cwd() { return b.cwd(); }
        function stateString() { return 'path=' + encodeURIComponent(F.pathOf(cwd())).replace(/%2F/g, '/'); }
        function announce() {
            if (opts.ownsUrl) {
                var qs = new URLSearchParams(location.search);
                qs.set('path', F.pathOf(cwd()));
                history.replaceState(history.state, '', location.pathname + '?' + qs.toString().replace(/%2F/g, '/') + location.hash);
            }
            if (opts.changed) { opts.changed(stateString()); }
        }

        /* A passing message goes in the status line; an error is a notice
           above the list, which stays until dismissed or the next one. */
        function say(msg, isError) {
            if (!el) { return; }
            if (isError && msg) { window.yavcUtil.notice(el.main, msg, true); el.status.textContent = ''; return; }
            el.status.textContent = msg || '';
        }

        function inHome(node) { var r = F.realOf(node); return !!r.home; }
        function linkFor(node) { return (opts.pageUrl || '/page/files') + '?path=' + encodeURIComponent(F.pathOf(node)).replace(/%2F/g, '/'); }

        /* The address an entry has of its own, which its row's link names:
           a page or an applet on its page, a link where it points. A file
           has none, so its row opens through the browser's onOpen. */
        function addressOf(c) {
            var r = F.realOf(c), kind = F.kindOf(c);
            if (kind === 'page' || kind === 'app') { return F.mounted ? F.publicUrl(r) : '/page/' + encodeURIComponent(r.name); }
            if (kind === 'link') { return r.url; }
            return null;
        }

        /* === Around the browser ========================================= */

        /* The browser's first drawing comes before create() returns; the
           call after it covers that one. */
        function afterRender() {
            if (!b) { return; }
            el.main.classList.toggle('fm-can-drop', inHome(cwd()));
            renderDetail();
            commandsChanged();
        }

        function renderDetail() {
            var c = b.selected(), dir = cwd();
            if (!c) {
                var count = (dir.children || []).length;
                el.detail.innerHTML = '<span class="fm-d-title">' + esc(F.displayPath(dir)) + '</span><span class="fm-d-meta">' + count + (count === 1 ? ' item' : ' items') +
                    (inHome(dir) ? (F.realOf(dir).server ? ' · on the server' : ' · your own files, kept in this browser') : ' · read-only') + '</span>';
                return;
            }
            var r = F.realOf(c), kind = F.kindOf(c), bits = [];
            var date = r.home ? r.mtime : r.date;
            if (date) { bits.push(FB.fmtDate(date)); }
            if (F.size(c) != null) { bits.push(FB.fmtSize(F.size(c))); }
            if (kind === 'dir') { bits.push((r.children || []).length + ' items'); }
            var desc = kind === 'script' ? F.scriptSummary(c.name, F.scriptSource(c)) : r.description;
            if (kind === 'link') { desc = (desc ? desc + ' · ' : '') + r.url; }
            el.detail.innerHTML =
                '<span class="fm-d-title">' + FB.glyph(kind) + esc(r.title && !r.home ? r.title : c.name) + '</span>' +
                '<span class="fm-d-meta">' + esc(FB.kindName(kind)) + (bits.length ? ' · ' + esc(bits.join(' · ')) : '') + ' · <code>' + esc(F.displayPath(c)) + '</code></span>' +
                (desc ? '<span class="fm-d-desc">' + esc(desc) + '</span>' : '') +
                (r.tags && r.tags.length ? '<span class="fm-d-tags">' + r.tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join(' ') + '</span>' : '');
        }

        /* === The command table and the toolbar (PUDL 0.68.0) ===============
           Every command the toolbar, the menus and an agent reach, once. A
           command offers itself only where it applies, as the Actions menu
           did: changing ~ is not on offer outside it, and what acts on the
           selection waits for one. Delete and F2 stay with the list's own
           keys (onKey), so a key typed in a dialog never deletes a file. */
        function sel() {
            var c = b && F ? b.selected() : null, kind = c ? F.kindOf(c) : null, r = c ? F.realOf(c) : null;
            /* A picture or another file of bytes is not the Editor's to open. */
            return { c: c, kind: kind, r: r, editable: !!c && canOpen('open', kind) && !(r && !r.children && !F.isText(r)) };
        }
        function here() { return !!(b && F) && inHome(cwd()); }
        function commandTable() {
            var ready = function () { return !!(b && F); };
            function cmd(id, label, glyph, more) {
                return Object.assign({ id: id, label: label, glyph: glyph || undefined,
                    disabled: function () { return !ready(); }, run: function () { if (b) { return act(id); } } }, more || {});
            }
            function owned() { var s = sel(); return !!s.c && s.r.home && !s.r.special; }
            return [
                cmd('up', 'Up One Folder', 'arrow-up', { disabled: function () { return !ready() || !cwd().parent; } }),
                cmd('home', 'Home', 'home'),
                cmd('new-file', 'New File…', 'file', { hidden: function () { return !here(); } }),
                cmd('new-folder', 'New Folder…', 'folder', { hidden: function () { return !here(); } }),
                cmd('upload', 'Upload…', 'upload', { hidden: function () { return !here(); } }),
                cmd('open', 'Open', 'open', {
                    label: function () { var s = sel(); return !s.c ? 'Open' : s.kind === 'dir' ? 'Open Folder' : s.kind === 'app' ? 'Launch' : s.kind === 'link' ? 'Open Link in a New Tab' : (s.kind === 'file' || s.kind === 'script') && s.editable ? 'Open in the Editor' : 'Open'; },
                    hidden: function () { return !sel().c; } }),
                cmd('edit', 'Edit', 'pencil', {
                    label: function () { var s = sel(); return s.r && !s.r.home ? 'View in the Editor' : 'Edit'; },
                    hidden: function () { var s = sel(); return !(s.c && s.kind !== 'dir' && s.kind !== 'link' && s.kind !== 'app' && s.editable); } }),
                cmd('run', 'Run in the Terminal', 'terminal', { hidden: function () { var s = sel(); return !(s.c && (s.kind === 'script' || s.kind === 'app') && canOpen('shell')); } }),
                cmd('download', 'Download', 'download', { hidden: function () { var s = sel(); return !(s.c && s.kind !== 'dir'); } }),
                cmd('copy', 'Copy to ~', 'copy', { hidden: function () { var s = sel(); return !(s.c && !s.r.home && s.kind === 'page'); } }),
                cmd('rename', 'Rename…', 'yavc-rename', { hidden: function () { return !owned(); } }),
                cmd('move', 'Move To…', 'move', { hidden: function () { return !owned(); } }),
                cmd('delete', 'Delete…', 'yavc-bin', { danger: true, hidden: function () { return !owned(); } }),
                cmd('terminal', 'New Terminal Window Here', 'terminal', { hidden: function () { return !canOpen('shell'); } }),
                cmd('hidden', 'Show Hidden Files', 'eye', { checked: function () { return showHidden; } })
            ];
        }

        /* Going places first; making things where things can be made; what
           acts on the selection, which folds first; and the view at the end. */
        function toolbars() {
            /* ribbon: 'hide' (PUDL 0.80.1): every command here is in a
               menu, so the ribbon has them while it shows. */
            return [{ label: 'Files', ribbon: 'hide', groups: [
                { label: 'Go', glyph: 'home', priority: 4, items: ['up', 'home'] },
                { label: 'New', glyph: 'plus', priority: 2, items: ['new-file', 'new-folder', 'upload'] },
                { label: 'Selected', glyph: 'file', priority: 1, items: ['open', 'edit', 'run', 'download', 'copy', 'rename', 'move', 'delete'] },
                { label: 'View', glyph: 'eye', priority: 3, end: true, items: ['hidden', 'terminal'] }
            ] }];
        }

        /* === Opening things ============================================== */

        var inWindows = function () { return opts.host === 'window' && window.pudlWindows; };

        /* Files and shells are asked for through PUDL's requests
           (pudlApplets.request): whichever applet serves the request
           answers, and an action with nothing to serve it is not offered. */
        function canOpen(verb, kind) { return window.pudlApplets.can(verb, kind); }
        function request(verb, req) { return window.pudlApplets.request(verb, req, root); }

        function openInEditor(node) {
            /* A deck (a file named .slides.md) opens in Slides, where the site has it. */
            if (/\.slides\.md$/i.test(node.name) && window.pudlApplets.can && window.pudlApplets.can('present') && request('present', { path: F.displayPath(F.realOf(node)) })) { return; }
            if (!request('open', { path: F.displayPath(F.realOf(node)), kind: F.kindOf(node) })) { say('Nothing on this site opens ' + node.name + '.', true); }
        }

        function openEntry(c) {
            var r = F.realOf(c), kind = F.kindOf(c);
            if (kind === 'dir') { b.go(c); b.focusList(); return; }
            if (kind === 'link') { window.open(r.url, '_blank', 'noopener'); return; }
            /* A built-in command, from /bin, is explained in a terminal. */
            if (kind === 'command') { openTerminal('man ' + r.name); return; }
            /* A picture or any other file an editor can't show: under
               /wwwroot it opens as the public site serves it; a picture of
               the home folder opens in a tab of its own; anything else
               downloads. */
            if ((kind === 'file' || kind === 'script') && !F.isText(r)) {
                var seen = F.publicUrl(r);
                if (seen) { window.open(seen, '_blank', 'noopener'); }
                /* Only a picture the browser cannot run script in opens in a tab: a blob
                   address is this site's origin, so an SVG opened that way would run
                   its script as yavc.app (security review, 2026-11-03). An SVG downloads. */
                else if (r.home && /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(F.typeOf ? F.typeOf(r) : '')) { showPicture(r); }
                else { download(c); }
                return;
            }
            if (kind === 'file' || kind === 'script') { openInEditor(c); return; }
            if (F.mounted) { var url = F.publicUrl(r); if (url) { window.open(url, '_blank', 'noopener'); } return; }
            if (inWindows()) { window.pudlWindows.open(r.name); return; }
            location.assign('/page/' + encodeURIComponent(r.name));
        }

        function openTerminal(run) {
            if (!request('shell', { path: F.pathOf(cwd()), run: run })) { say('Nothing on this site opens a terminal.', true); }
        }

        /* === Dialogs ====================================================== */

        function nameCheck(v) {
            if (!v) { return 'Give it a name.'; }
            if (!F.validName(v)) { return 'A name can\'t contain / or be . or ..'; }
            if (F.childNamed(cwd(), v)) { return 'Something called ' + v + ' is already here.'; }
            return null;
        }

        /* === Actions ====================================================== */

        async function act(action) {
            var c = b.selected(), dir = cwd();
            switch (action) {
                case 'up': b.up(); return;
                case 'home': b.go(F.home()); return;
                case 'open': if (c) { openEntry(c); } return;
                case 'edit': if (c) { openInEditor(c); } return;
                case 'run': if (c) { openTerminal(c.name); } return;
                case 'terminal': openTerminal(null); return;
                case 'hidden':
                    setHidden(!showHidden);
                    loadConfig().then(function (cfg) { return cfg.set('files', { hidden: showHidden }); }).catch(function () { });
                    return;
                case 'download': if (c) { download(c); } return;
                case 'copy': if (c) { await copyHome(c); } return;
                case 'new-file': {
                    var name = await window.yavcDialog.askText('New File', 'Name', '', { text: 'In ' + F.displayPath(dir), okLabel: 'Create', validate: nameCheck });
                    if (name == null) { return; }
                    var res = await F.write(dir, name, '', false);
                    if (res.error) { say(res.error, true); return; }
                    b.refresh(); b.select(name); say('Made ' + name + '.');
                    return;
                }
                case 'new-folder': {
                    var dname = await window.yavcDialog.askText('New Folder', 'Name', '', { text: 'In ' + F.displayPath(dir), okLabel: 'Create', validate: nameCheck });
                    if (dname == null) { return; }
                    var e1 = await F.mkdir(dir, dname, false);
                    if (e1) { say(e1, true); return; }
                    b.refresh(); b.select(dname); say('Made ' + dname + '/.');
                    return;
                }
                case 'upload': el.fileInput.value = ''; el.fileInput.click(); return;
                case 'rename': {
                    if (!c) { return; }
                    var nn = await window.yavcDialog.askText('Rename', 'New Name for ' + c.name, c.name, { okLabel: 'Rename', validate: function (v) { return v === c.name ? null : nameCheck(v); } });
                    if (nn == null || nn === c.name) { return; }
                    var e2 = await F.move(dir, c, nn);
                    if (e2) { say(e2, true); return; }
                    b.refresh(); b.select(nn); say('Renamed to ' + nn + '.');
                    return;
                }
                case 'move': {
                    if (!c) { return; }
                    var dest = await window.yavcDialog.askText('Move ' + c.name, 'To the Folder', F.displayPath(dir), { help: 'For example ~/notes', okLabel: 'Move', validate: function (v) {
                        var d = F.resolve(dir, v);
                        if (!d || !d.children) { return 'There\'s no folder at ' + v + '.'; }
                        if (!d.home) { return 'Only folders in your home directory (~)' + (F.mounted ? ' or under /wwwroot' : '') + ' can take it.'; }
                        return null;
                    } });
                    if (dest == null) { return; }
                    var e3 = await F.move(dir, c, dest);
                    if (e3) { say(e3, true); return; }
                    b.refresh(); say('Moved ' + c.name + ' to ' + dest + '.');
                    return;
                }
                case 'delete': {
                    if (!c) { return; }
                    var many = c.children ? ' and everything in it (' + c.children.length + (c.children.length === 1 ? ' item' : ' items') + ')' : '';
                    var where = F.realOf(c).server ? '. A copy is kept in the history for 30 days.' : ' from this browser. It can\'t be undone.';
                    var ok = await window.yavcDialog.confirm('Delete ' + c.name + '?', 'This deletes ' + F.displayPath(c) + many + where, { okLabel: 'Delete', danger: true });
                    if (!ok) { return; }
                    var e4 = await F.remove(c, true);
                    if (e4) { say(e4, true); return; }
                    b.select(null, false); b.refresh(); say('Deleted ' + c.name + '.');
                    return;
                }
            }
        }

        async function showPicture(r) {
            try {
                var url = URL.createObjectURL(new Blob([await F.readBytes(r)], { type: F.typeOf(r) }));
                var w = window.open(url, '_blank', 'noopener');
                if (!w) { say('The browser blocked the picture\'s tab.', true); }
                setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
            } catch (err) { say(err.message, true); }
        }
        async function download(c) {
            var r = F.realOf(c), blob;
            /* A file of bytes downloads byte for byte; anything else as its text. */
            try {
                blob = r.server || !F.isText(r) ? new Blob([await F.readBytes(r)], { type: (F.typeOf && F.typeOf(r)) || 'application/octet-stream' })
                    : new Blob([await F.read(r)], { type: 'text/plain;charset=utf-8' });
            } catch (err) { say(err.message, true); return; }
            var name = r.home ? r.name : r.name + '.txt';
            window.yavcUtil.download(name, blob);
            say('Downloaded ' + name + '.');
        }

        async function copyHome(c) {
            var res = await F.copy(F.home(), c, '~/');
            if (res.error) { say(res.error, true); return; }
            say('Copied to ~/' + F.realOf(c).name + '.');
        }

        async function uploadFiles(files) {
            var dir = cwd();
            if (!inHome(dir)) { say('Files can only go into your home directory (~)' + (F.mounted ? ' or under /wwwroot.' : '.'), true); return; }
            var done = 0, errors = [];
            for (var i = 0; i < files.length; i++) {
                var res = await F.upload(dir, files[i]);
                if (res.error) { errors.push(res.error); } else { done++; }
            }
            b.refresh();
            say((done ? 'Uploaded ' + done + (done === 1 ? ' file.' : ' files.') : '') + (errors.length ? ' ' + errors.join('; ') : ''), errors.length > 0);
        }

        /* === Wiring ====================================================== */

        /* The file manager's own keys, beside the browser's. */
        function onKey(e, c) {
            if (!c || !inHome(c) || F.realOf(c).special) { return false; }
            if (e.key === 'Delete') { act('delete'); return true; }
            if (e.key === 'F2') { act('rename'); return true; }
            return false;
        }

        /* === Start ======================================================== */

        var showHidden = false, unConfig = null;

        /* The menus list the toolbar's commands by id, which PUDL (0.68.1)
           looks up in the command table. The Folder title holds every
           command the toolbar has, because the toolbar hides while the menu
           bar shows as a ribbon (PUDL 0.80.1) and the Folder tab must then
           offer all of them; Go and View list theirs again where a reader
           of the menus looks for them. Files' help is a page of the site,
           /help/files, which the site's Help menu links to (DESIGN.md,
           decision 19). */
        function menus() {
            return { titles: [{ label: 'Files', items: window.pcAppletIdentity(root) },
                { id: 'file', label: 'File', items: ['new-file', 'new-folder', 'upload', '-', 'open', 'edit', 'run', 'download', 'terminal', '-', 'rename', 'move', 'copy', '-', 'delete'] }],
                into: { go: ['up', 'home'], view: ['hidden'] } };
        }

        function setHidden(on) { showHidden = !!on; if (b) { b.showHidden(showHidden); commandsChanged(); } }

        var boot = Promise.all([loadSiteFs().then(function (api) { F = api; return F.load(); }), loadBrowser()]).then(async function (got) {
            if (destroyed) { return; }
            FB = got[1];
            var cfg = await loadConfig().catch(function () { return null; }), treeWidth = null;
            if (cfg) {
                var fset = await cfg.load('files', { hidden: false, treeWidth: null }).catch(function () { return {}; });
                showHidden = !!fset.hidden;
                treeWidth = typeof fset.treeWidth === 'number' ? fset.treeWidth : null;
                unConfig = cfg.onChange('files', function (s) {
                    if (!!s.hidden !== showHidden) { setHidden(s.hidden); }
                    if (b) { b.treeWidth(typeof s.treeWidth === 'number' ? s.treeWidth : null); }
                });
            }
            if (destroyed) { return; }
            build();
        /* A right-click (PUDL's pudl:contextmenu) on a row gives the row's
           commands, on a folder in the tree the way there, and on the list
           itself the folder's. The commands are the table's own, by id. */
        root.addEventListener('pudl:contextmenu', function (e) {
            if (!b || !F) { return; }
            var own = function (ids) { return window.pudlCommands ? window.pudlCommands.menuRows(ids, root) : ids; };
            var t = e.detail.target, row = t.closest && t.closest('tr.fm-row'), node = t.closest && t.closest('.fm-tree a[data-path]');
            if (row) {
                b.select(row.getAttribute('data-name'), false);
                e.detail.mark(row);
                e.detail.add(own(['open', 'edit', 'run', 'download', '-', 'rename', 'move', 'copy', 'delete', '-', 'new-file', 'new-folder', 'upload']));
                return;
            }
            if (node) {
                var target = F.resolve(null, node.getAttribute('data-path'));
                if (!target) { return; }
                e.detail.mark(node);
                e.detail.add([{ label: 'Open', glyph: 'folder', run: function () { b.go(target); } }, '-'].concat(own(['new-file', 'new-folder', 'upload'])));
                return;
            }
            if (t.closest && t.closest('.fm-list, .fm-rows, table')) {
                e.detail.add(own(['new-file', 'new-folder', 'upload', '-', 'hidden', 'terminal']));
            }
        });
            el.fileInput.addEventListener('change', function () { if (el.fileInput.files && el.fileInput.files.length) { uploadFiles(Array.prototype.slice.call(el.fileInput.files)); } });
            b = FB.create(root, F, {
                start: F.upgradePath(startPath),
                linkFor: linkFor,
                addressOf: addressOf,
                draggable: true,
                onUpload: uploadFiles,
                onOpen: openEntry,
                onSelect: function () { renderDetail(); commandsChanged(); },
                onNavigate: announce,
                onRender: afterRender,
                onKey: onKey,
                say: say,
                showHidden: showHidden,
                treeWidth: treeWidth,
                onResize: function (w) { if (cfg) { cfg.set('files', { treeWidth: w }); } },
                emptyText: function (dir) { return inHome(dir) ? 'Create a file or a folder, or drop files here to upload them.' : ''; }
            });
            /* A reload brings back the selection, the open folders and the
               scroll (js/snapshot.js). */
            if (snap) {
                if (snap.kept) { b.restore(snap.kept); }
                b.onChange(snap.changed);
            }
            afterRender();
            announce();
            if ((snap && snap.focused) || opts.ownsUrl || root.closest('.win.active')) { b.focusList(); }
        }).catch(function (err) {
            if (destroyed) { return; }
            root.innerHTML = '<p class="fm-failed">Files could not start: ' + esc(err.message) + '.</p>';
        });

        return {
            state: function () { return b && F ? stateString() : null; },
            /* A folder handed over, by a browse request or a preset. */
            setState: function (s) { var p = pathFrom(s); if (b && p) { Promise.resolve(b.goPath(F.upgradePath(p))).then(function (went) { if (went) { b.focusList(); } }); } },
            commandTable: commandTable,
            toolbars: toolbars,
            menus: menus,
            destroy: function () {
                destroyed = true;
                if (snap) { snap.leave(); }
                if (unConfig) { unConfig(); }
                if (b) { b.destroy(); }
            },
            ready: boot
        };
    }

    window.pudlApplets.register('files', { init: init });
})();
