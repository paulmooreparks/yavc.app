/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Applet continuity, kept by the engine (DESIGN.md, decision 2). The page
   is drawn with the session's state in #yavc-state, so pudl:applet-state
   can hand a starting applet its state at once, and pudl:applet-change
   sends each change to the engine, which keeps it under the session, so
   the same game is on the desktop and on the applet's own subdomain.

   The applets with continuity are the installed packages that ask for it,
   which the registry (/applets/registry.js) adds. An instance goes by the
   applet's name, or name:<window key> for a numbered window. A mount
   keeping its state in the page's query (data-applet-param) is the URL's
   business, not this. Load before pudl-applets.js. */
(function () {
    'use strict';
    if (window.yavcContinuity) { return; }

    var names = {};
    var kept = {};
    var node = document.getElementById('yavc-state');
    if (node) { try { kept = JSON.parse(node.textContent) || {}; } catch (err) { kept = {}; } }

    function instanceKey(mount, name) {
        var win = mount.closest && mount.closest('.win[data-win]');
        var key = win ? win.getAttribute('data-win') : name;
        return key && key !== name ? name + ':' + key : name;
    }

    document.addEventListener('pudl:applet-state', function (e) {
        /* A one-shot hand-off: an applet opening another instance of
           itself elsewhere (Conway's "Open this board", the terminal's
           open) leaves the state here for the new instance, which takes
           it once. */
        var handoff = window.pcAppletHandoff, inst0 = e.detail && (e.detail.instance || e.detail.name);
        if (handoff && inst0 && Object.prototype.hasOwnProperty.call(handoff, inst0)) {
            e.detail.state = handoff[inst0];
            delete handoff[inst0];
            return;
        }
        /* An applet a page embeds with a starting state ({{applet:name
           state=...}}) opens on it. */
        var initial = e.target && e.target.getAttribute && e.target.getAttribute('data-applet-initial');
        if (initial && e.detail && e.detail.state == null) { e.detail.state = initial; return; }
        var name = e.detail && e.detail.name;
        if (!name || !names[name] || (e.detail && e.detail.param)) { return; }
        var inst = e.detail.instance && e.detail.instance !== name ? name + ':' + e.detail.instance : name;
        if (Object.prototype.hasOwnProperty.call(kept, inst)) { e.detail.state = kept[inst]; }
    });

    var timers = {};
    function send(key, state) {
        /* An applet announces its state as it starts; what the engine
           already has need not go back to it. */
        if (Object.prototype.hasOwnProperty.call(kept, key) && kept[key] === state) { return; }
        kept[key] = state;
        clearTimeout(timers[key]);
        timers[key] = setTimeout(function () {
            delete timers[key];
            var f = window.pudlHost && window.pudlHost.fetch ? window.pudlHost.fetch : window.fetch;
            f('/state/' + encodeURIComponent(key), { method: 'PUT', body: state == null ? '' : String(state),
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }, keepalive: true }).catch(function () { });
        }, 400);
    }

    document.addEventListener('pudl:applet-change', function (e) {
        var mount = e.target;
        if (!mount.getAttribute) { return; }
        var name = mount.getAttribute('data-applet');
        if (!name || !names[name] || mount.hasAttribute('data-applet-param')) { return; }
        send(instanceKey(mount, name), e.detail ? e.detail.state : null);
    });

    window.yavcContinuity = { add: function (name) { if (name) { names[name] = true; } } };
})();
