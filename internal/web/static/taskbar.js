/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* PUDL owns pins and menus; the host owns catalog identity and preferences. */
(function () {
    'use strict';
    function start() {
        var layer = document.querySelector('body.desktop [data-win-layer]');
        if (!layer || !window.pudlWindows || !window.pudlHost) return;
        var catalog = new Map(), saving = Promise.resolve(), ready = false;
        document.querySelectorAll('#site-start [data-start-item] a[data-site-start-app]').forEach(function (link) {
            var id = link.dataset.siteStartApp, picture = link.querySelector('img'), label = link.querySelector('.start-name');
            if (/^[A-Za-z0-9_-]+$/.test(id) && label) catalog.set(id, { id: id, kind: 'applet', label: label.textContent.trim(), glyph: 'app', icon: picture ? picture.src : undefined, command: true });
        });
        var providers = [{ id: 'applications', resolve: async function (request) {
            return catalog.has(request.id) ? { status: 'available', destination: Object.assign({}, catalog.get(request.id)) } : { status: 'unavailable' };
        } }];
        function strings(values, order) { return Array.isArray(values) ? values.filter(function (value) { return typeof value === 'string' && (order ? /^(?:(?:pin|group):)?[A-Za-z0-9_-]+$/ : /^[A-Za-z0-9_-]+$/).test(value); }) : []; }
        function preferences(value) {
            var result = { pins: strings(value.pins, false), order: strings(value.order, true), references: Array.isArray(value.references) ? value.references.filter(function (item) {
                return item && typeof item.id === 'string' && typeof item.provider === 'string' && /^[A-Za-z0-9_-]+$/.test(item.id) && /^[A-Za-z0-9_-]+$/.test(item.provider);
            }).map(function (item) { return { id: item.id, provider: item.provider }; }) : [] };
            result.pins.forEach(function (id) { if (catalog.has(id) && !result.references.some(function (item) { return item.id === id; })) result.references.push({ id: id, provider: 'applications' }); });
            return result;
        }
        function configure(value) { pudlWindows.configureTaskbar(Object.assign({ providers: providers, scope: 'desktop:' + location.origin }, preferences(value))); }
        layer.addEventListener('pudl:taskbar-change', function (e) {
            if (!ready) return;
            var value = Object.assign({ version: 1 }, preferences(e.detail));
            saving = saving.then(function () { return pudlHost.config.set('desktop-taskbar', value); }).then(function (problem) { if (problem) throw new Error(problem); }).catch(function () {
                window.yavcUtil.toast( 'Taskbar pins could not be saved.', true);
            });
        });
        layer.addEventListener('pudl:taskbar-activate', function (e) {
            if (!catalog.has(e.detail.id)) return;
            e.preventDefault();
            e.detail.waitUntil((async function () {
                var result = await pudlWindows.open(e.detail.id, e.detail.opener);
                if (result.status !== 'opened' && result.status !== 'existing') throw result.error || new Error('The application window could not open.');
                await pudlApplets.start(result.key);
                if (!result.window || !result.window.isConnected || result.window.querySelector('[data-applet-state="error"]')) throw new Error('The application could not start.');
            })());
        });
        layer.addEventListener('pudl:taskbar-activation-end', function (e) { if (e.detail.status === 'failed') window.yavcUtil.toast( 'The pinned application could not open. Try again.', true); });
        pudlHost.config.load('desktop-taskbar', { version: 1, pins: [], order: [], references: [] }).then(function (value) {
            if (value.version !== 1) { window.yavcUtil.notice(document.querySelector('.site-header'), 'Taskbar preferences use an unsupported version.', 'warn'); return; }
            configure(value); ready = true;
            pudlHost.config.onChange('desktop-taskbar', function (next) { if (next.version === 1) configure(next); });
        }).catch(function () { window.yavcUtil.toast( 'Taskbar preferences could not be loaded.', true); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
