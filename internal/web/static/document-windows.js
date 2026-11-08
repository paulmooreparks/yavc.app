/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Optional host contract. Editors request another document without owning
   window creation. A receiving host can provide this interface itself. */
(function () {
    'use strict';
    var bindings = new Map(), incoming = new Map(), queue = Promise.resolve();
    function keyOf(root) { var win = root.closest('.win[data-win]'); return win && win.getAttribute('data-win'); }
    function mode(root) {
        var policy = document.querySelector('meta[name="yavc-document-grouping"]');
        return keyOf(root) && policy && policy.content === 'single' ? 'single' : 'tabbed';
    }
    async function create(root, app, payload) {
        if (!root.isConnected) throw new Error('The originating application was closed.');
        if (!['editor', 'docs', 'slides', 'diagrams'].includes(app)) throw new Error('This application does not support document windows.');
        if (!payload.snapshot && /^(open|open-file)$/.test(payload.operation)) {
            for (var pair of bindings) {
                if (pair[0].isConnected && pair[1].application === app && pair[1].resource() === payload.input.path) {
                    pudlWindows.raise(keyOf(pair[0])); return pair[1].accept(payload);
                }
            }
        }
        var open = pudlWindows.state().open, key = null;
        for (var i = 1; i <= 9; i++) { var candidate = app + (i === 1 ? '' : '-' + i); if (!open.includes(candidate) && !incoming.has(candidate)) { key = candidate; break; } }
        if (!key) throw new Error('All nine ' + app + ' windows are in use. Close a window before opening another document.');
        incoming.set(key, {value: payload.snapshot || null});
        var result;
        try {
            result = await pudlWindows.open(key, root);
            if (result.status !== 'opened') throw result.error || new Error('The document window could not open.');
            await pudlApplets.start(key);
            var mount = result.window && result.window.querySelector('[data-applet="' + app + '"]'), binding = bindings.get(mount);
            if (!binding) throw new Error('The document window could not start.');
            var output = payload.snapshot ? null : await binding.accept(payload);
            if (!binding.flush()) throw new Error('The new document could not be retained for recovery.');
            return output;
        } finally { incoming.delete(key); }
    }
    function open(root, app, payload) {
        var task = queue.catch(function () {}).then(function () { return create(root, app, payload); });
        queue = task; return task;
    }
    window.yavcDocumentWindows = Object.freeze({version: 1, mode: mode, initial: function (root) { return incoming.get(keyOf(root)); },
        bind: function (root, api) { bindings.set(root, api); return function () { bindings.delete(root); }; },
        open: open,
        split: async function (root, app, snapshot) {
            var moved = [], selected = snapshot.front == null ? snapshot.active || 0 : snapshot.front;
            if (mode(root) !== 'single') return {moved: moved};
            var owner = root.closest('.win') || root, inert = owner.inert;
            function closing(event) { event.preventDefault(); }
            owner.inert = true; owner.addEventListener('pudl:window-closing', closing);
            try {
            for (var i = 0; i < snapshot.tabs.length; i++) {
                if (i === selected) continue;
                var single = Object.assign({}, snapshot, {tabs: [snapshot.tabs[i]], active: 0, front: 0, waiting: [], view: snapshot.tabs[i].view || snapshot.view});
                try { await open(root, app, {snapshot: single}); moved.push(i); }
                catch (error) { return {moved: moved, error: error.message}; }
            }
            return {moved: moved};
            } finally { owner.inert = inert; owner.removeEventListener('pudl:window-closing', closing); }
        }});
})();
