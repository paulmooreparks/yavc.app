/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Host-owned resource selection and transactional VFS commits. */
(function () {
    'use strict';
    function create(F, FB) {
        return Object.freeze({ version: 1, read: F.contentResources.read, write: F.contentResources.write, create: F.contentResources.create,
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
