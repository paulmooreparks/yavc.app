/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Settings' actions (actions.json): read and set the appearance, through
   the page's own appearance commands (static/desktop.js), which keep each
   choice in the engine under the session. Forgetting what the site keeps
   is not an action: it is the person's alone, in the panel. */
(function () {
    'use strict';

    function lists() {
        var node = document.getElementById('yavc-appearance'), data = {};
        if (node) { try { data = JSON.parse(node.textContent) || {}; } catch (err) { data = {}; } }
        return { skins: data.skins || [], palettes: data.palettes || [] };
    }
    function current() {
        var app = window.yavcAppearance;
        if (!app) { throw new Error('this page keeps no appearance'); }
        return app.get();
    }
    function known(list, id, what) {
        if (!list.some(function (e) { return e.id === id; })) { throw new Error('there is no ' + what + ' called ' + id); }
    }

    window.pudlApplets.provide('yavc.settings', {
        'appearance@1': function () {
            var l = lists();
            return Promise.resolve({ output: Object.assign(current(), { skins: l.skins, palettes: l.palettes }) });
        },
        'set-appearance@1': function (input) {
            var l = lists(), app = window.yavcAppearance, steps = Promise.resolve();
            current();
            if (input.skin != null) { known(l.skins, input.skin, 'skin'); }
            if (input.palette != null) { known(l.palettes, input.palette, 'colour theme'); }
            ['mode', 'skin', 'palette'].forEach(function (k) {
                if (input[k] != null) { steps = steps.then(function () { return app.set(k, input[k]); }); }
            });
            return steps.then(function () { return { output: current() }; });
        }
    });
})();
