/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The site's own behaviour over PUDL, on every page: the View menu's
   appearance commands, which set the choice through PUDL's APIs and keep
   it in the engine (DESIGN.md, Appearance), plus the About dialogs.
   Loaded before pudl-windows.js, without defer. */
(function () {
    'use strict';
    if (window.yavcDesktop) { return; }
    window.yavcDesktop = true;
    var root = document.documentElement;

    /* === Appearance ====================================================== */
    function keep(change) {
        return window.fetch('/appearance', { method: 'PUT', body: JSON.stringify(change),
            headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }).catch(function () { });
    }
    var commands = {
        mode: function (value) { if (window.pudlSetTheme) { window.pudlSetTheme(value); } return keep({ mode: value }); },
        skin: function (value) { if (window.pudlSkins) { window.pudlSkins.select(value); } return keep({ skin: value }); },
        palette: function (value) {
            if (value === 'standard') { root.removeAttribute('data-palette'); } else { root.setAttribute('data-palette', value); }
            document.dispatchEvent(new CustomEvent('yavc:palette-change', { detail: { palette: value } }));
            return keep({ palette: value });
        }
    };
    window.yavcAppearance = {
        set: function (name, value) { return commands[name] ? commands[name](value) : Promise.resolve(); },
        get: function () {
            return { mode: window.pudlThemePreference ? window.pudlThemePreference() : root.getAttribute('data-theme-pref'),
                     skin: window.pudlSkins ? window.pudlSkins.preference() : root.getAttribute('data-skin'),
                     palette: root.getAttribute('data-palette') || 'standard' };
        }
    };
    /* The menu's rows say which choice is in force. The server writes
       the state into the source list; after a change the rows are set
       again and the bar is asked to rebuild its panels from them. */
    function tick() {
        var a = window.yavcAppearance.get();
        var changed = false;
        document.querySelectorAll('[data-site-command]').forEach(function (b) {
            var name = b.getAttribute('data-site-command'), value = b.getAttribute('data-args');
            if (a[name] === undefined) { return; }
            var want = a[name] === value ? 'true' : 'false';
            if (b.getAttribute('aria-checked') !== want) { b.setAttribute('aria-checked', want); changed = true; }
        });
        if (changed && window.pudlMenubar && window.pudlMenubar.refresh) { window.pudlMenubar.refresh(); }
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-site-command]');
        if (!b) { return; }
        var fn = commands[b.getAttribute('data-site-command')];
        if (fn) { e.preventDefault(); fn(b.getAttribute('data-args')); tick(); }
    });
    document.addEventListener('pudl:theme-change', tick);
    document.addEventListener('pudl:skin-change', tick);
    document.addEventListener('yavc:palette-change', tick);

    /* === The About dialogs =============================================== */
    /* A dialog has an address of its own (/about, /about/pudl), which the
       server draws with the dialog open. A link to it opens the dialog in
       place and puts its address in the history, so Back closes it; Close
       goes back to the page's own address. A dialog the server opened is
       made modal as the page starts. */
    var dialogPushed = false, reopening = false;
    function openDialog(dialog, push) {
        if (!dialog || dialog.open && dialog.matches(':modal')) { return; }
        /* A dialog the server drew open is plain; it is closed and shown
           again as modal, which is not a close the address should follow. */
        if (dialog.open) { reopening = true; dialog.close(); reopening = false; }
        dialog.showModal();
        dialogPushed = push;
    }
    document.addEventListener('click', function (e) {
        var link = e.target.closest && e.target.closest('a[data-dialog]');
        if (link) {
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) { return; }
            var dialog = document.getElementById(link.getAttribute('data-dialog'));
            if (!dialog || !dialog.showModal) { return; }
            var url = new URL(link.href);
            if (url.origin !== location.origin) { return; }
            url.search = location.search;
            e.preventDefault();
            history.pushState(history.state, '', url);
            openDialog(dialog, true);
            return;
        }
    });
    document.addEventListener('close', function (e) {
        if (reopening || !(e.target instanceof HTMLDialogElement) || !e.target.classList.contains('about-dialog') || e.target.open) { return; }
        if (dialogPushed) { dialogPushed = false; history.back(); }
        else if (/\/about(\/pudl)?$/.test(location.pathname)) { history.replaceState(history.state, '', '/' + location.search); }
    }, true);
    window.addEventListener('popstate', function () {
        var id = location.pathname === '/about' ? 'about-site' : location.pathname === '/about/pudl' ? 'about-pudl' : null;
        document.querySelectorAll('dialog.about-dialog[open]').forEach(function (d) { if (d.id !== id) { dialogPushed = false; d.close(); } });
        if (id) { openDialog(document.getElementById(id), true); }
    });
    function startDialogs() {
        document.querySelectorAll('dialog.about-dialog[open]').forEach(function (d) { openDialog(d, false); });
    }

    function start() {
        startDialogs();
        tick();
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
})();
