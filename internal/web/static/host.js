/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* What yavc.app gives an installed applet package (pudl-host-kit.js, from
   the pudl-applet-packages repo): the kit's menu helpers, where applet
   pages and PUDL are, this tab's snapshots, and each applet's settings,
   kept by the engine under the reader's session (DESIGN.md, decision 2).
   The file service comes with the virtual file system in a later
   milestone. Loads after the kit and before the packages' registry. */
(function () {
    'use strict';
    if (!window.pudlHostKit) { return; }

    /* Settings, per applet: a JSON object the engine keeps. load() reads
       them once; get and set work on the copy and set sends the whole. */
    function configFor() {
        var cache = {};
        var listeners = [];
        var node = document.getElementById('yavc-config');
        if (node) { try { cache = JSON.parse(node.textContent) || {}; } catch (err) { cache = {}; } }
        function nameOf(root) { return root && root.getAttribute ? root.getAttribute('data-applet') : null; }
        function parsed(name) {
            if (typeof cache[name] === 'string') { try { cache[name] = JSON.parse(cache[name]) || {}; } catch (err) { cache[name] = {}; } }
            return cache[name] || (cache[name] = {});
        }
        return {
            load: function (root) { return Promise.resolve(parsed(nameOf(root))); },
            get: function (root, key, fallback) { var c = parsed(nameOf(root)); return Object.prototype.hasOwnProperty.call(c, key) ? c[key] : fallback; },
            set: function (root, key, value) {
                var name = nameOf(root), c = parsed(name);
                if (value === undefined) { delete c[key]; } else { c[key] = value; }
                listeners.forEach(function (fn) { try { fn(name, key, value); } catch (err) { } });
                return window.fetch('/config/' + encodeURIComponent(name), { method: 'PUT', body: JSON.stringify(c),
                    headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }).then(function () { });
            },
            onChange: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) { listeners.splice(i, 1); } }; }
        };
    }

    window.pudlHost = window.pudlHostKit.host({
        pages: '/', pudl: '/pudl/',
        snapshot: window.yavcSnapshot || null,
        config: configFor(),
        services: {}
    });
})();
