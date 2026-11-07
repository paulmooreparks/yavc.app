/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Versioned host extension; see docs/content-resource-contract.md. */
(function (global) {
    'use strict';
    var MAX_TEXT = 4 * 1024 * 1024;
    function token(value, name) {
        if (typeof value !== 'string' || !value.length || value.length > 4096) throw new TypeError('Invalid resource ' + name + '.');
        return value;
    }
    function text(value) {
        if (typeof value !== 'string' || value.length > MAX_TEXT) throw new TypeError('Resource text exceeds the supported limit.');
        return value;
    }
    function snapshot(value, resource, submitted) {
        if (!value || typeof value !== 'object' || value.resource !== resource) throw new TypeError('The host returned a different resource.');
        return Object.freeze({ resource: token(resource, 'identity'), revision: token(value.revision, 'revision'), text: submitted === undefined ? text(value.text) : text(submitted), writable: value.writable === true });
    }
    function create(host) {
        if (!host || host.version !== 1 || typeof host.read !== 'function') throw new TypeError('Resource host version 1 with read is required.');
        // Only snapshots issued by this client can authorize its writes.
        var issued = new WeakSet();
        function remember(value) { issued.add(value); return value; }
        return Object.freeze({
            read: async function (resource) {
                token(resource, 'identity');
                return remember(snapshot(await host.read({ resource: resource }), resource));
            },
            canWrite: function (value) { return !!value && issued.has(value) && value.writable && typeof host.write === 'function'; },
            baseline: function (value) {
                if (!value || !issued.has(value)) throw new Error('The baseline was not issued by this resource client.');
                return Object.freeze({ resource: value.resource, revision: value.revision });
            },
            write: async function (value, content) {
                if (!value || !issued.has(value) || !value.writable || typeof host.write !== 'function') throw new Error('This resource cannot be saved by this host.');
                var submitted = text(content), expected = value.revision;
                var result = await host.write({ resource: value.resource, expectedRevision: expected, text: submitted });
                var accepted = snapshot(result, value.resource, submitted);
                if (accepted.revision === expected && submitted !== value.text) throw new Error('The host did not advance the resource revision.');
                return remember(accepted);
            }
        });
    }
    var api = Object.freeze({ create: create, maxText: MAX_TEXT });
    if (typeof module === 'object' && module.exports) module.exports = api;
    else global.yavcContentResources = api;
})(typeof window === 'undefined' ? null : window);
