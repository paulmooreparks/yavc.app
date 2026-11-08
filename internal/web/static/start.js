/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The host owns addresses/preferences. PUDL owns launcher presentation. */
(function () {
    'use strict';
    async function start() {
        var root = document.getElementById('site-start'), layout = document.getElementById('site-launcher-layout'), pane = document.getElementById('site-launcher-slot');
        if (!root || !layout || !pane || !window.pudlLauncher) return;
        var restoring = true, saving = Promise.resolve(), preferences = {}, preferencesReady = false, earlyTouched = false, earlyVisible = false;
        var desktop = document.body.classList.contains('desktop'), windows = !!document.querySelector('[data-win-layer]');
        var fields = ['start', 'start-mode', 'start-category', 'start-q'];
        function opener(visible) { return window.pudlMenubar ? pudlMenubar.launcherButton(visible ? { visible: true } : undefined) : document.querySelector('[data-menubar-fallback]'); }
        function dimensions(value) {
            var size = {};
            ['width', 'height'].forEach(function (key) { var v = value && value[key]; if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10000) size[key] = v; });
            return size;
        }
        function presentation(u, prefs) {
            var mode = u.searchParams.get('start-mode');
            return /^(popup|pane|collapsed|closed)$/.test(mode) ? mode : u.searchParams.get('start') === '1' ? 'popup' :
                prefs && /^(popup|pane|collapsed|closed)$/.test(prefs.presentation) ? prefs.presentation :
                prefs && prefs.pinned === true ? (prefs.collapsed === true ? 'collapsed' : 'pane') : 'closed';
        }
        function earlyToggle(e) { earlyTouched = true; earlyVisible = e.newState === 'open'; }
        root.addEventListener('beforetoggle', earlyToggle);
        if (window.pudlHost && pudlHost.config) {
            try { preferences = await pudlHost.config.load('site-launcher', {}) || {}; preferencesReady = true; }
            catch (err) { window.yavcUtil.toast('Launcher preferences could not be loaded.', true); }
        }
        var initialURL = new URL(location.href);
        var initialBrowse = earlyTouched ? pudlStart.state(root) : { query: (initialURL.searchParams.get('start-q') || '').slice(0, 512), category: initialURL.searchParams.get('start-category') || '' };
        root.removeEventListener('beforetoggle', earlyToggle);
        if (!pudlLauncher.enhance(root, { pane: pane, layout: layout, invoker: function () { return opener(false); }, anchor: function () { return opener(true); }, placement: 'below',
            presentation: presentation(initialURL, preferences), compactVisible: earlyTouched ? earlyVisible : initialURL.searchParams.get('start') === '1', size: dimensions(preferences), paneSize: dimensions(preferences.paneSize) })) return;
        if (earlyTouched && !pudlLauncher.state(root).compact) pudlLauncher.present(root, earlyVisible ? 'popup' : 'closed', { focus: false });
        function cleanURL(value) { var u = new URL(value); fields.forEach(function (key) { u.searchParams.delete(key); }); return u; }
        function catalogURL(category, query) {
            var u = cleanURL(location.href), state = pudlLauncher.state(root);
            if (category) u.searchParams.set('start-category', category);
            if (query) u.searchParams.set('start-q', query);
            if (state.presentation !== 'closed') u.searchParams.set('start-mode', state.presentation);
            if (state.visible) u.searchParams.set('start', '1');
            return u;
        }
        function windowURL(key, base) {
            var u = new URL(base), current = new URL(location.href); u.search = current.search;
            var open = (u.searchParams.get('open') || '').split(',').filter(Boolean);
            if (open.indexOf(key) < 0) open.push(key);
            u.searchParams.set('open', open.join(',')); u.searchParams.set('top', key);
            var minimized = (u.searchParams.get('min') || '').split(',').filter(function (id) { return id && id !== key; });
            if (minimized.length) u.searchParams.set('min', minimized.join(',')); else u.searchParams.delete('min');
            return u;
        }
        function links() {
            var state = pudlStart.state(root);
            root.querySelector('[data-site-start-category]').value = state.category;
            root.querySelectorAll('[data-start-category-key]').forEach(function (a) { a.href = catalogURL(a.dataset.startCategoryKey, state.query); });
            if (desktop) root.querySelectorAll('a[data-site-start-app]').forEach(function (a) { a.href = windowURL(a.dataset.siteStartApp, a.href); });
            if (windows) root.querySelectorAll('a[data-site-start-window]').forEach(function (a) { a.href = windowURL(a.dataset.siteStartWindow, location.href); });
            var form = root.querySelector('form'); form.action = location.pathname;
            form.querySelectorAll('[data-start-context]').forEach(function (input) { input.remove(); });
            cleanURL(location.href).searchParams.forEach(function (value, key) {
                var input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = value; input.setAttribute('data-start-context', ''); form.appendChild(input);
            });
            var modeValue = pudlLauncher.state(root).presentation;
            if (modeValue !== 'closed') {
                var mode = document.createElement('input'); mode.type = 'hidden'; mode.name = 'start-mode'; mode.value = modeValue; mode.setAttribute('data-start-context', ''); form.appendChild(mode);
            }
        }
        function syncURL(push) {
            var state = pudlStart.state(root), u = catalogURL(state.category, state.query);
            if (u.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', u);
            links();
        }
        function persist() {
            if (!preferencesReady || !window.pudlHost || !pudlHost.config) return;
            var state = pudlLauncher.state(root), value = { version: 2, presentation: state.presentation, width: state.width, height: state.height, paneSize: state.paneSize };
            saving = saving.then(function () { return pudlHost.config.set('site-launcher', value); }).then(function (problem) {
                if (problem) throw new Error(problem);
            }).catch(function () { window.yavcUtil.toast( 'Launcher preferences could not be saved.', true); });
        }
        function restore() {
            var u = new URL(location.href); restoring = true;
            pudlStart.setState(root, { query: (u.searchParams.get('start-q') || '').slice(0, 512), category: u.searchParams.get('start-category') || '' });
            pudlLauncher.present(root, presentation(u), { focus: false });
            var state = pudlLauncher.state(root);
            if (state.compact && !u.searchParams.has('start') && state.visible) pudlLauncher.close(root);
            restoring = false; syncURL(false);
        }
        root.addEventListener('pudl:start-change', function (e) { if (!restoring) syncURL(e.detail.reason === 'category'); });
        root.addEventListener('pudl:launcher-change', function (e) {
            if (restoring || e.detail.reason === 'init') return;
            syncURL(false); persist();
        });
        document.addEventListener('click', function (e) {
            if (!e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
            var a = e.target.closest('a[data-site-start-app],a[data-site-start-window],a[data-dialog]');
            if (!a || !root.contains(a)) return;
            // The window or dialog handler has accepted this original click.
            if (a.hasAttribute('data-win-open') && windows || a.hasAttribute('data-dialog') && document.getElementById(a.dataset.dialog) && new URL(a.href).origin === location.origin) pudlLauncher.activated(root, a);
        });
        window.addEventListener('popstate', restore);
        document.addEventListener('pudl:windows-change', links);
        pudlStart.setState(root, initialBrowse);
        restoring = false; syncURL(false);
        if (earlyTouched) persist();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
