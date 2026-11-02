/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The page's end of the agent relay (docs/agents-design.md, decisions 4
   and 7). When the person has paired an agent, the page keeps an event
   stream from the engine open; an invoke event is run through the page's
   action broker (pudl-actions.js), as the agent, with the grant its token
   holds, and each change of the record is posted back; a cancel event
   stops one. The page also tells the engine when it is in front, so an
   agent's work lands on the page the person is looking at. Load with
   defer, after pudl-actions.js and site-actions.js. */
(function () {
    'use strict';
    if (window.yavcBridge) { return; }

    var PAGE = (function () { var b = new Uint8Array(12); crypto.getRandomValues(b); return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); })();
    var source = null, wanted = false, backoff = 1000;
    var reported = {};
    /* The broker's id for each invocation the engine sent, by the engine's. */
    var local = {};

    function site() {
        var node = document.getElementById('yavc-appearance'), data = {};
        if (node) { try { data = JSON.parse(node.textContent) || {}; } catch (err) { data = {}; } }
        return data;
    }

    function post(path, body) {
        return window.fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (r) { if (!r.ok) { throw new Error(path + ' answered ' + r.status); } });
    }

    function b64(data) {
        var bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        var s = '';
        for (var i = 0; i < bytes.length; i += 0x8000) { s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); }
        return btoa(s);
    }

    function report(view, final, local) {
        var key = view.id + '@' + view.version + (final ? 'f' : '');
        if (reported[key]) { return Promise.resolve(); }
        reported[key] = true;
        var body = { id: view.id, view: view };
        if (final && view.artifacts && view.artifacts.length && window.pudlApplets.artifact) {
            body.artifacts = view.artifacts.map(function (d) {
                try { var a = window.pudlApplets.artifact(d.id); return { key: d.id.slice((local || view.id).length + 1), name: a.name, mime: a.mime, data: b64(a.data) }; }
                catch (err) { return null; }
            }).filter(Boolean);
        }
        return post('/agent/report', body).catch(function (err) { console.warn('yavc bridge: ' + err.message); });
    }

    function run(inv) {
        var A = window.pudlApplets;
        if (!A || !A.invoke) { return report({ id: inv.id, action: inv.action, status: 'failed', error: 'this page has no action broker', version: 0 }, true); }
        var opts = { owner: inv.owner || { kind: 'agent' }, grant: inv.grant || [] };
        if (inv.runMs) { opts.runMs = inv.runMs; }
        function as(view) { return Object.assign({}, view, { id: inv.id }); }
        return A.invoke(inv.action, inv.input || {}, opts).then(function (view) {
            local[inv.id] = view.id;
            if (view.status === 'done' || view.status === 'failed' || view.status === 'cancelled') { return report(as(view), true, view.id); }
            return report(as(view), false).then(function () { return A.wait(view.id); }).then(function (v) { return report(as(v), true, view.id); });
        }).catch(function (err) {
            return report({ id: inv.id, action: inv.action, owner: opts.owner, status: 'failed', error: err && err.message || String(err), version: 0, input: inv.input || {}, artifacts: [] }, true);
        });
    }

    document.addEventListener('pudl:applet-invocation', function (e) {
        var v = e.detail;
        if (v && v.owner && v.owner.kind === 'agent' && v.status === 'waiting') {
            for (var k in local) { if (local[k] === v.id) { report(Object.assign({}, v, { id: k }), false); } }
        }
    });

    function connect() {
        wanted = true;
        if (source || !('EventSource' in window)) { return; }
        source = new EventSource('/agent/stream?page=' + PAGE);
        source.addEventListener('invoke', function (e) {
            var inv = null;
            try { inv = JSON.parse(e.data); } catch (err) { return; }
            if (inv && inv.id && inv.action) { run(inv); }
        });
        source.addEventListener('cancel', function (e) {
            try { var c = JSON.parse(e.data); var id = local[c.id] || c.id; if (window.pudlApplets && window.pudlApplets.cancel) { window.pudlApplets.cancel(id); } } catch (err) { }
        });
        source.onopen = function () { backoff = 1000; if (!document.hidden) { front(); } };
        source.onerror = function () {
            /* The browser reconnects an open stream itself; a refused one
               (no session) is tried again later, more slowly each time. */
            if (source && source.readyState === EventSource.CLOSED) {
                source = null;
                if (wanted) { setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 60000); }
            }
        };
    }
    function disconnect() { wanted = false; if (source) { source.close(); source = null; } }

    function front() { if (source) { post('/agent/front', { page: PAGE }).catch(function () { }); } }
    window.addEventListener('focus', front);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { front(); } });

    window.yavcBridge = { connect: connect, disconnect: disconnect, page: PAGE, connected: function () { return !!source && source.readyState === EventSource.OPEN; } };

    if ((site().agents || 0) > 0) { connect(); }
})();
