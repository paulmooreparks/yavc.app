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
    function snapshot(value, resource, submitted, fallbackName) {
        if (!value || typeof value !== 'object' || value.resource !== resource) throw new TypeError('The host returned a different resource.');
        var result = { resource: token(resource, 'identity'), revision: token(value.revision, 'revision'), text: submitted === undefined ? text(value.text) : text(submitted), writable: value.writable === true };
        var name = value.name === undefined ? fallbackName : value.name;
        if (name != null) { if (typeof name !== 'string' || !name || name.length > 255 || /[\x00-\x1f\x7f]/.test(name)) throw new TypeError('Invalid resource display name.'); result.name = name; }
        return Object.freeze(result);
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
            canSaveAs: function () { return typeof host.saveAs === 'function'; },
            canCreate: function () { return typeof host.create === 'function'; },
            create: async function (resource, content) {
                if (typeof host.create !== 'function') throw new Error('This host cannot create a resource at an explicit destination.');
                token(resource, 'identity'); var submitted = text(content);
                return remember(snapshot(await host.create({ resource: resource, text: submitted }), resource, submitted));
            },
            saveAs: async function (options, content, context) {
                if (typeof host.saveAs !== 'function') throw new Error('This resource host does not offer Save As.');
                var submitted = text(content), name = options && options.name;
                if (typeof name !== 'string' || !name || name.length > 255 || /[\x00-\x1f\x7f]/.test(name)) throw new TypeError('Invalid suggested file name.');
                var source = options.sourceResource == null ? null : token(options.sourceResource, 'identity');
                var result = await host.saveAs({ name: name, sourceResource: source, text: submitted }, context);
                if (result == null) return null;
                var accepted = snapshot(result, token(result.resource, 'identity'), submitted);
                if (!accepted.name) throw new Error('Save As did not acknowledge a display name.');
                return remember(accepted);
            },
            baseline: function (value) {
                if (!value || !issued.has(value)) throw new Error('The baseline was not issued by this resource client.');
                return Object.freeze({ resource: value.resource, revision: value.revision });
            },
            write: async function (value, content) {
                if (!value || !issued.has(value) || !value.writable || typeof host.write !== 'function') throw new Error('This resource cannot be saved by this host.');
                var submitted = text(content), expected = value.revision;
                var result = await host.write({ resource: value.resource, expectedRevision: expected, text: submitted });
                var accepted = snapshot(result, value.resource, submitted, value.name);
                if (accepted.revision === expected && submitted !== value.text) throw new Error('The host did not advance the resource revision.');
                return remember(accepted);
            }
        });
    }
    var api = Object.freeze({ create: create, maxText: MAX_TEXT });
    if (typeof module === 'object' && module.exports) module.exports = api;
    else global.yavcContentResources = api;
})(typeof window === 'undefined' ? null : window);
