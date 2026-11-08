/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The host owns addresses/preferences. PUDL owns launcher presentation. */
(function () {
    'use strict';
    function start() {
        var root = document.getElementById('site-start'), layout = document.getElementById('site-launcher-layout'), pane = document.getElementById('site-launcher-slot');
        if (!root || !layout || !pane || !window.pudlLauncher) return;
        var restoring = true, touched = false, settingsReady = false, saving = Promise.resolve();
        var desktop = document.body.classList.contains('desktop'), windows = !!document.querySelector('[data-win-layer]');
        var fields = ['start', 'start-mode', 'start-category', 'start-q'];
        function opener(visible) { return window.pudlMenubar ? pudlMenubar.launcherButton(visible ? { visible: true } : undefined) : document.querySelector('[data-menubar-fallback]'); }
        if (!pudlLauncher.enhance(root, { pane: pane, layout: layout, invoker: function () { return opener(false); }, anchor: function () { return opener(true); }, placement: 'below' })) return;
        // Resolve the current visible opener when the menubar folds during use.
        root.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing || e.target.closest('[popover]:popover-open') !== root) return;
            e.preventDefault(); e.stopPropagation(); pudlLauncher.close(root);
        }, true);
        function cleanURL(value) { var u = new URL(value); fields.forEach(function (key) { u.searchParams.delete(key); }); return u; }
        function catalogURL(category, query) {
            var u = cleanURL(location.href), state = pudlLauncher.state(root);
            if (category) u.searchParams.set('start-category', category);
            if (query) u.searchParams.set('start-q', query);
            if (state.presentation === 'popup') u.searchParams.set('start', '1');
            else if (state.pinned) { u.searchParams.set('start-mode', state.presentation); if (state.presentation === 'pane') u.searchParams.set('start', '1'); }
            return u;
        }
        function windowURL(key, base) {
            var u = new URL(base), current = cleanURL(location.href); u.search = current.search;
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
            var presentation = pudlLauncher.state(root).presentation;
            if (presentation === 'pane' || presentation === 'collapsed') {
                var mode = document.createElement('input'); mode.type = 'hidden'; mode.name = 'start-mode'; mode.value = presentation; mode.setAttribute('data-start-context', ''); form.appendChild(mode);
            }
        }
        function syncURL(push) {
            var state = pudlStart.state(root), u = catalogURL(state.category, state.query);
            if (u.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', u);
            links();
        }
        function persist() {
            if (!settingsReady || !window.pudlHost) return;
            var state = pudlLauncher.state(root), value = { pinned: state.pinned, collapsed: state.presentation === 'collapsed', width: state.width, height: state.height };
            saving = saving.then(function () { return pudlHost.config.set('site-launcher', value); }).then(function (problem) {
                if (problem) throw new Error(problem);
            }).catch(function () { window.yavcUtil.toast( 'Launcher preferences could not be saved.', true); });
        }
        function restore(preferences) {
            var u = new URL(location.href), mode = u.searchParams.get('start-mode'); restoring = true;
            pudlStart.setState(root, { query: (u.searchParams.get('start-q') || '').slice(0, 512), category: u.searchParams.get('start-category') || '' });
            if (preferences) {
                var size = {};
                ['width', 'height'].forEach(function (key) { var v = preferences[key]; if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10000) size[key] = v; });
                pudlLauncher.resize(root, size);
            }
            var presentation = mode === 'pane' || mode === 'collapsed' ? mode : u.searchParams.get('start') === '1' ? 'popup' : preferences && preferences.pinned === true ? (preferences.collapsed === true ? 'collapsed' : 'pane') : 'closed';
            pudlLauncher.present(root, presentation, { focus: presentation === 'popup' });
            restoring = false; syncURL(false);
        }
        root.addEventListener('pudl:start-change', function (e) { if (!restoring) syncURL(e.detail.reason === 'category'); });
        root.addEventListener('pudl:launcher-change', function (e) {
            if (restoring || e.detail.reason === 'init') return;
            touched = true; syncURL(false); persist();
        });
        root.addEventListener('click', function (e) {
            if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
            var a = e.target.closest('a[data-site-start-app],a[data-site-start-window],a[data-dialog]');
            if (!a) return;
            if (pudlLauncher.state(root).presentation === 'popup') {
                var u = new URL(location.href); u.searchParams.delete('start'); u.searchParams.delete('start-mode'); history.replaceState(history.state, '', u);
            }
            // Window and dialog handlers prevent native navigation later in bubbling.
            if (a.hasAttribute('data-win-open') && windows || a.hasAttribute('data-dialog') && document.getElementById(a.dataset.dialog) && new URL(a.href).origin === location.origin) pudlLauncher.activated(root, a);
        }, true);
        window.addEventListener('popstate', function () { restore(null); });
        document.addEventListener('pudl:windows-change', links);
        restore(null);
        if (window.pudlHost && pudlHost.config) {
            pudlHost.config.load('site-launcher', {}).then(function (prefs) { settingsReady = true; if (!touched) restore(prefs); else persist(); }).catch(function () {
                window.yavcUtil.toast( 'Launcher preferences could not be loaded.', true);
            });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
