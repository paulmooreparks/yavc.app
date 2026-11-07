/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Host-owned resource selection and transactional VFS commits. */
(function () {
    'use strict';
    function create(F, FB) {
        function guest(node) { return !!(node && node.home && !node.server && !node.settings); }
        function destination(resource) {
            if (typeof resource !== 'string') throw new Error('A resource identity is required.');
            var split = F.splitPath(resource), parent = F.resolve(null, split.dir);
            if (!guest(parent) || !parent.children || !F.validName(split.base)) throw new Error('Choose a destination in your guest home directory.');
            return F.displayPath(parent).replace(/\/$/, '') + '/' + split.base;
        }
        return Object.freeze({ version: 1,
            read: async function (request) {
                var resource = request.resource; await F.sync();
                var node = F.resolve(null, resource);
                if (!node || node.children || !F.isText(node)) throw new Error('The text resource does not exist.');
                if (guest(node)) return Object.assign({}, await F.contentResources.read({ resource: F.displayPath(node) }), { resource: resource });
                var text = await F.read(node);
                if (typeof text !== 'string' || text.length > 4 * 1024 * 1024) throw new Error('The resource exceeds the supported text limit.');
                var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
                return { resource: resource, revision: 'readonly:' + Array.from(new Uint8Array(digest), function (byte) { return byte.toString(16).padStart(2, '0'); }).join(''), text: text, name: node.name, writable: false };
            },
            write: async function (request) {
                request = { resource: request.resource, expectedRevision: request.expectedRevision, text: request.text }; await F.sync();
                var node = F.resolve(null, request.resource);
                if (!guest(node) || node.children) throw new Error('This resource is read-only or no longer exists.');
                return Object.assign({}, await F.contentResources.write({ resource: F.displayPath(node), expectedRevision: request.expectedRevision, text: request.text }), { resource: request.resource });
            },
            create: async function (request) {
                request = { resource: request.resource, text: request.text }; await F.sync();
                return Object.assign({}, await F.contentResources.create({ resource: destination(request.resource), text: request.text }), { resource: request.resource });
            },
            saveAs: async function (request, context) {
                request = { name: request.name, sourceResource: request.sourceResource, text: request.text };
                if (F.mounted) throw new Error('The server mount does not support conditional Save As.');
                if (typeof request.text !== 'string' || request.text.length > F.limits.file) throw new Error('The document exceeds the text file limit.');
                if (typeof request.name !== 'string' || !request.name || request.name.length > 255) throw new Error('A suggested file name is required.');
                if (context && context.signal && context.signal.aborted) return null;
                var start = '~', accepted = null, pending = null;
                if (typeof request.sourceResource === 'string' && request.sourceResource.startsWith('~/')) {
                    var parent = F.splitPath(request.sourceResource).dir, folder = F.resolve(F.home(), parent);
                    if (folder && folder.children && !folder.settings && !folder.server) start = parent;
                }
                var selected = await FB.pick(F, { mode: 'save', title: 'Save As', name: request.name, start: start, host: context && context.host,
                    conditional: true, computer: false, signal: context && context.signal,
                    canSaveIn: function (dir) { return dir && dir.home && !dir.server && !dir.settings ? null : 'Choose a folder in your guest home directory.'; },
                    commit: async function (choice) {
                        if (context && context.signal && context.signal.aborted) return false;
                        var change = { resource: choice.path, text: request.text, expectedRevision: choice.expectedRevision };
                        pending = choice.expectedRevision === null ? F.contentResources.create(change, context) : F.contentResources.write(change, context);
                        try { accepted = await pending; } finally { pending = null; }
                        return true;
                    }
                });
                if (!selected && pending) { await pending; return accepted; }
                return selected ? accepted : null;
            }
        });
    }
    window.yavcResourceHost = Object.freeze({ create: create });
})();
