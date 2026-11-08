/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Host-owned selection and durable import for document dependency fields. */
(function () {
    'use strict';
    async function choose(request) {
        var U = window.yavcUtil;
        function current() { return !(request.signal && request.signal.aborted) && (!request.current || request.current()); }
        var parts = await Promise.all([U.siteFs(), U.loadGlobal(U.versioned('/static/filebrowser.js'), 'pcFileBrowser')]);
        if (!current()) return null;
        var F = parts[0], FB = parts[1], selected = null;
        if (request.kind === 'folder') {
            var directory = await FB.pick(F,{mode:'folder',title:'Choose a Folder',okLabel:'Choose Folder',start:request.start || '~',signal:request.signal,host:request.host});
            return directory && current() ? directory.path : null;
        }
        var accept = Array.isArray(request.accept) ? request.accept : String(request.accept || '').split(',').filter(Boolean);
        await FB.pick(F, { mode: 'open', title: request.title || 'Choose a File', host: request.host, start: request.start || '~', accept: accept, computer: true, signal: request.signal,
            commit: async function (choice) {
                if (!current()) return false;
                if (choice.path) { selected = choice.path; return true; }
                if (!choice.file) return false;
                var file = choice.file, imported = null;
                if(request.maxBytes!=null && (!Number.isSafeInteger(request.maxBytes)||request.maxBytes<1))throw new Error('The file size limit is invalid.');
                if(file.size>Math.min(request.maxBytes || 8*1024*1024,8*1024*1024))throw new Error('Choose a smaller file. This field accepts at most '+Math.min(request.maxBytes || 8*1024*1024,8*1024*1024)+' bytes.');
                await FB.pick(F, { mode: 'save', title: 'Import ' + file.name, host: request.host, start: '~', name: file.name, okLabel: 'Import', createOnly: true, signal: request.signal,
                    commit: async function (destination) {
                        if (!current()) return false;
                        var result = await F.importFile(destination.dir, new File([file], destination.name, {type:file.type}), {signal:request.signal,current:current});
                        if (result.error) throw new Error(result.error);
                        imported = F.displayPath(result.node); return true;
                    }
                });
                if (!imported || !current()) return false;
                selected = imported; return true;
            }
        });
        return current() ? selected : null;
    }
    window.yavcFileFields = Object.freeze({version:1,choose:choose});
})();
