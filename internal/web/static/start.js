/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Routing belongs to the host; Start owns catalog interaction. */
(function () {
    'use strict';
    var root = document.getElementById('site-start'), opener = document.getElementById('site-start-button');
    if (!root || !window.pudlStart || !pudlStart.enhance(root)) { return; }
    var restoring = false, desktop = root.dataset.siteStartDesktop === 'true';
    function queryURL(category, query) {
        var u = new URL(location.href); u.searchParams.set('start', '1');
        ['start-category', 'start-q'].forEach(function (k) { u.searchParams.delete(k); });
        if (category) { u.searchParams.set('start-category', category); }
        if (query) { u.searchParams.set('start-q', query); }
        return u;
    }
    function links() {
        var state = pudlStart.state(root);
        root.querySelector('[data-site-start-category]').value = state.category;
        root.querySelectorAll('[data-start-category-key]').forEach(function (a) { a.href = queryURL(a.dataset.startCategoryKey, state.query); });
        if (desktop) {
            root.querySelectorAll('[data-site-start-app]').forEach(function (a) {
                var u = new URL(a.href), current = new URL(location.href), key = a.dataset.siteStartApp;
                u.search = current.search;
                ['start', 'start-q', 'start-category'].forEach(function (k) { u.searchParams.delete(k); });
                var open = (u.searchParams.get('open') || '').split(',').filter(Boolean);
                if (open.indexOf(key) < 0) { open.push(key); }
                u.searchParams.set('open', open.join(',')); u.searchParams.set('top', key);
                var minimized = (u.searchParams.get('min') || '').split(',').filter(function (id) { return id && id !== key; });
                if (minimized.length) { u.searchParams.set('min', minimized.join(',')); } else { u.searchParams.delete('min'); }
                a.href = u;
            });
        }
    }
    function restore() {
        var u = new URL(location.href);
        restoring = true;
        pudlStart.setState(root, { query: (u.searchParams.get('start-q') || '').slice(0, 512), category: u.searchParams.get('start-category') || '' });
        if (u.searchParams.get('start') === '1') { pudlStart.open(root, opener); }
        else if (root.matches(':popover-open')) { pudlStart.close(root); }
        restoring = false; links();
    }
    root.addEventListener('pudl:start-change', function (e) {
        if (!restoring) {
            var u = queryURL(e.detail.category, e.detail.query);
            if (u.href !== location.href) { history[e.detail.reason === 'category' ? 'pushState' : 'replaceState'](null, '', u); }
        }
        links();
    });
    root.addEventListener('toggle', function () {
        var u = new URL(location.href);
        if (root.matches(':popover-open')) { u.searchParams.set('start', '1'); } else { u.searchParams.delete('start'); }
        if (u.href !== location.href) { history.replaceState(null, '', u); }
    });
    root.addEventListener('click', function (e) {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !e.target.closest('[data-site-start-app]')) { return; }
        var u = new URL(location.href); u.searchParams.delete('start'); history.replaceState(null, '', u);
        pudlStart.close(root);
    }, true);
    window.addEventListener('popstate', restore);
    document.addEventListener('pudl:windows-change', links);
    restore();
})();
