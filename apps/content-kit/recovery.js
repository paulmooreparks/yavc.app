/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Original revision baselines for host-owned recovery; no storage access. */
(function (global) {
    'use strict';
    var MAX_TEXT = 4 * 1024 * 1024, MAX_TOTAL = 8 * 1024 * 1024;
    function token(value) {
        if (typeof value !== 'string' || !value || value.length > 4096) throw new Error('Invalid recovery resource token.');
        return value;
    }
    function baseline(value, resource) {
        if (value == null) return null;
        if (value.version !== 1 || token(value.resource) !== resource) throw new Error('The recovery baseline belongs to another resource or version.');
        return Object.freeze({ version: 1, resource: resource, revision: token(value.revision) });
    }
    function validate(value) {
        if (value == null) return;
        if (!value || typeof value !== 'object' || (value.version !== undefined && value.version !== 2) || !Array.isArray(value.tabs) || value.tabs.length > 512) throw new Error('This recovery snapshot has an unsupported format. It has been retained.');
        if (value.active !== undefined && (!Number.isInteger(value.active) || value.active < -1 || value.active >= Math.max(1, value.tabs.length))) throw new Error('The recovery selection is invalid.');
        var total = 0;
        value.tabs.forEach(function (tab) {
            if (!tab || typeof tab !== 'object') throw new Error('The recovery tab is invalid.');
            if (tab.path != null) token(tab.path);
            if (tab.name != null && (typeof tab.name !== 'string' || !tab.name || tab.name.length > 255 || /[\x00-\x1f\x7f]/.test(tab.name))) throw new Error('The recovered display name is invalid.');
            if (tab.text != null && (typeof tab.text !== 'string' || tab.text.length > MAX_TEXT)) throw new Error('The recovered draft exceeds its text limit.');
            total += tab.text ? tab.text.length : 0;
            if (total > MAX_TOTAL) throw new Error('The recovery snapshot exceeds its text limit.');
            baseline(tab.baseline, tab.path);
        });
    }
    function capture(client, snapshot, retained) {
        if (snapshot) {
            var issued = client.baseline(snapshot);
            return Object.freeze({ version: 1, resource: issued.resource, revision: issued.revision });
        }
        return retained ? baseline(retained, retained.resource) : null;
    }
    async function restore(client, resource, retained, draft) {
        token(resource);
        var original = baseline(retained, resource), modified = draft != null;
        if (modified && (typeof draft !== 'string' || draft.length > MAX_TEXT)) throw new Error('The recovered draft exceeds its text limit.');
        // An old draft without a revision cannot acquire today's baseline.
        if (modified && !original) return { snapshot: null, baseline: null, text: draft, modified: true, conflict: 'unknown' };
        var current;
        try { current = await client.read(resource); }
        catch (err) {
            if (!modified) throw err;
            return { snapshot: null, baseline: original, text: draft, modified: true, conflict: 'unavailable' };
        }
        if (modified && current.revision !== original.revision) return { snapshot: null, baseline: original, text: draft, modified: true, conflict: 'changed' };
        return { snapshot: current, baseline: original, text: modified ? draft : current.text, modified: modified, conflict: null };
    }
    var api = Object.freeze({ version: 1, validate: validate, baseline: baseline, capture: capture, restore: restore });
    if (typeof module === 'object' && module.exports) module.exports = api;
    else global.yavcContentRecovery = api;
})(typeof window === 'undefined' ? null : window);
