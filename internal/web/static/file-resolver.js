/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Pure file-opening plans. This module never reads, opens or executes a resource. */
(function (global) {
    'use strict';
    var INTENTS = ['edit', 'view', 'import', 'insert', 'compare', 'run', 'browse'];
    function fail(message) { throw new Error(message); }
    function object(value, fields, label) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid ' + label + '.');
        Object.keys(value).forEach(function (key) { if (!fields.includes(key)) fail('Unknown ' + label + ' field: ' + key); });
    }
    function id(value) { if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) fail('Invalid catalog identifier.'); return value; }
    function list(value, label, max) { if (!Array.isArray(value) || value.length > max) fail('Invalid ' + label + ' list.'); return value; }
    function unique(items, key, label) { var seen = new Set(); items.forEach(function (item) { var k = key(item); if (seen.has(k)) fail('Duplicate ' + label + ': ' + k); seen.add(k); }); }
    function match(value) {
        object(value, ['suffix', 'name', 'mime'], 'filename match');
        var keys = Object.keys(value); if (keys.length !== 1) fail('A rule requires one suffix, exact name or MIME match.');
        var key = keys[0], text = value[key];
        if (typeof text !== 'string' || !text || text.length > 255 || /[\x00-\x1f\x7f/\\]/.test(text) && key !== 'mime') fail('Invalid rule match.');
        if (key === 'suffix' && !/^\.[a-z0-9][a-z0-9._+-]{0,63}$/i.test(text)) fail('Invalid filename suffix.');
        if (key === 'mime' && !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(text)) fail('Invalid MIME match.');
        return { key: key, value: text.toLowerCase() };
    }
    function create(input) {
        var catalog = JSON.parse(JSON.stringify(input));
        object(catalog, ['version', 'types', 'handlers', 'associations'], 'file catalog');
        if (catalog.version !== 1 && catalog.version !== 2) fail('Unsupported file catalog version.');
        list(catalog.types, 'type', 128).forEach(function (type) { object(type, ['id', 'text', 'matches'], 'type'); id(type.id); if (typeof type.text !== 'boolean') fail('A type must declare whether it is text.'); list(type.matches || [], 'native match', 128).forEach(match); });
        unique(catalog.types, function (t) { return t.id; }, 'type');
        var types = new Map(catalog.types.map(function (t) { return [t.id, t]; }));
        var nativeMatches = [];
        catalog.types.forEach(function (type) { (type.matches || []).forEach(function (m) { nativeMatches.push({ type: type.id, match: m }); }); });
        unique(nativeMatches, function (r) { var m = match(r.match); return m.key + ':' + m.value; }, 'native type match');
        list(catalog.handlers, 'handler', 128).forEach(function (handler) {
            object(handler, catalog.version===2 ? ['applet', 'operation', 'kind', 'formats','dispatch'] : ['applet', 'operation', 'kind', 'formats'], 'handler'); id(handler.applet); id(handler.operation); id(handler.kind);
            if(handler.dispatch){object(handler.dispatch,['command'],'dispatch');id(handler.dispatch.command);Object.freeze(handler.dispatch);}
            list(handler.formats, 'format', 128).forEach(function (format) {
                object(format, ['type', 'intents', 'views', 'defaultView'], 'format');
                if (!types.has(format.type)) fail('Unknown handler type.');
                if (!list(format.intents, 'intent', 7).length || format.intents.some(function (intent) { return !INTENTS.includes(intent); })) fail('Invalid handler intent.');
                if (!list(format.views, 'view', 16).length) fail('A handler needs a view.');
                format.views.forEach(id); unique(format.views, function (v) { return v; }, 'view');
                if (!format.views.includes(format.defaultView)) fail('Unsupported default view.');
            });
        });
        var capabilities = [];
        catalog.handlers.forEach(function (handler) { handler.formats.forEach(function (format) { format.intents.forEach(function (intent) { capabilities.push({ handler: handler, format: format, intent: intent }); }); }); });
        unique(capabilities, function (c) { return c.handler.applet + ':' + c.format.type + ':' + c.intent; }, 'handler capability');
        function rules(value, user) {
            list(value, 'association', 256).forEach(function (rule) {
                object(rule, ['id', 'match', 'type', 'applet', 'operation', 'view'], 'association');
                id(rule.id); id(rule.applet); id(rule.operation); id(rule.view); match(rule.match);
                if (!types.has(rule.type)) fail('Unknown association type.');
                if (!capabilities.some(function (c) { return c.handler.applet === rule.applet && c.handler.operation === rule.operation && c.format.type === rule.type && c.format.views.includes(rule.view); })) fail('An association cannot invent a handler capability.');
            });
            unique(value, function (r) { return r.id; }, 'association id');
            unique(value, function (r) { var m = match(r.match); return m.key + ':' + m.value; }, user ? 'user match' : 'shipped match');
            return value;
        }
        rules(catalog.associations, false);
        function preferences(input) {
            var value = JSON.parse(JSON.stringify(input)); object(value, ['version', 'rules'], 'file preferences');
            if (value.version !== 1) fail('Unsupported file preferences version. The saved configuration has been retained.');
            return rules(value.rules, true);
        }
        function winner(rules, name, mime, tier) {
            var candidates = rules.filter(function (rule) { var m = match(rule.match); return tier === 'mime' ? m.key === 'mime' && m.value === mime : m.key === 'name' ? m.value === name : m.key === 'suffix' && name.endsWith(m.value); });
            candidates.sort(function (a, b) { var x = match(a.match), y = match(b.match); return (y.key === 'name' ? 1000 : y.value.length) - (x.key === 'name' ? 1000 : x.value.length); });
            return candidates[0] || null;
        }
        function resolve(request, options) {
            options = options || {};
            object(options, ['installed', 'preferences'], 'resolution options');
            object(request, ['name', 'mime', 'verifiedText', 'intent', 'applet', 'view', 'readable', 'writable'], 'file request');
            if (typeof request.name !== 'string' || !request.name || request.name.length > 255 || /[\x00-\x1f\x7f/\\]/.test(request.name)) fail('A display filename is required.');
            if (request.verifiedText !== undefined && typeof request.verifiedText !== 'boolean') fail('Text verification must be a boolean.');
            ['readable', 'writable'].forEach(function (key) { if (request[key] !== undefined && typeof request[key] !== 'boolean') fail('Resource access flags must be boolean.'); });
            if (request.mime !== undefined && (typeof request.mime !== 'string' || request.mime.length > 255)) fail('Invalid MIME hint.');
            var intent = request.intent || 'edit'; if (!INTENTS.includes(intent)) fail('Unknown file-opening intent.');
            if (request.applet != null) id(request.applet); if (request.view != null) id(request.view);
            var installed = list(options.installed || [], 'installed applet', 512); installed.forEach(id);
            var user = options.preferences ? preferences(options.preferences) : [], name = request.name.toLowerCase();
            var mime = typeof request.mime === 'string' ? request.mime.split(';')[0].trim().toLowerCase() : '';
            var rule = winner(user, name, mime, 'filename') || winner(catalog.associations, name, mime, 'filename') || winner(user, name, mime, 'mime') || winner(catalog.associations, name, mime, 'mime');
            // A routing preference cannot reinterpret a known native deck/container as ordinary prose.
            var nativeRule = winner(nativeMatches, name, mime, 'filename');
            var type = nativeRule ? types.get(nativeRule.type) : rule ? types.get(rule.type) : request.verifiedText === true ? types.get('text') : null;
            var base = { intent: intent, type: type ? type.id : null, rule: rule ? rule.id : null };
            if (request.readable === false) return Object.freeze(Object.assign(base, { status: 'access-denied', reason: 'The host has not granted access to this resource.', alternatives: [] }));
            var candidates = capabilities.filter(function (c) { return type && c.format.type === type.id && c.intent === intent && installed.includes(c.handler.applet) && !(type.text && request.verifiedText === false); });
            function plan(c, view, why) { return Object.freeze(Object.assign({ applet: c.handler.applet, operation: c.handler.operation, kind: c.handler.kind, view: view || c.format.defaultView, supportedViews: Object.freeze(c.format.views.slice()), intent: intent, type: type.id, rule: base.rule, requiredRead: type.text ? 'text' : 'bytes', readOnly: request.writable !== true, reason: why },c.handler.dispatch ? {dispatch:c.handler.dispatch} : {})); }
            var alternatives = candidates.map(function (c) { return plan(c, null, 'An available handler for this content type.'); });
            var applet = request.applet || (rule && rule.applet) || (type && type.id === 'text' ? 'editor' : null);
            var selected = candidates.find(function (c) { return c.handler.applet === applet && (request.applet || !rule || c.handler.operation === rule.operation); });
            var view = request.view || (request.applet ? null : rule && rule.view);
            if (selected && (!view || selected.format.views.includes(view))) return Object.freeze(Object.assign(base, { status: 'resolved', plan: plan(selected, view, request.applet ? 'Explicit applet choice.' : rule ? 'Matched association ' + rule.id + '.' : 'Verified text fallback.'), alternatives: alternatives }));
            return Object.freeze(Object.assign(base, { status: alternatives.length ? 'choice' : 'unsupported', preferred: applet, reason: request.applet ? 'The explicit applet or view does not support this content and intent.' : applet ? 'The preferred handler is unavailable for this content and intent.' : 'No available handler matches. Download or choose a supported handler.', alternatives: alternatives }));
        }
        return Object.freeze({ version: 1, validatePreferences: function (value) { preferences(value); }, resolve: resolve });
    }
    var api = Object.freeze({ create: create });
    if (typeof module === 'object' && module.exports) module.exports = api; else global.yavcFileResolver = api;
})(typeof window === 'undefined' ? null : window);
