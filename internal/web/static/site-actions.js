/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* What yavc.app adds to PUDL's applet actions (pudl-actions.js): the
   site's own two capabilities, files.read and files.write, with the file
   service an action that declares one is handed, and the host's confirm,
   which asks the person before a caller runs an action needing more than
   it was granted. From parkscomputing.com's js/site-actions.js. Load with
   defer, after pudl-actions.js and host.js.

   A handler given files gets, on the site's file system (static/sitefs.js,
   the reader's ~ in this browser; DESIGN.md decision 11):

     files.stat(path)    an entry, or null    { name, path, kind, size?, modified? }
     files.list(path)    a directory's entries
     files.read(path)    a file's text
   and with files.write as well:
     files.write(path, text, append)  the written file's entry
     files.mkdir(path, parents)       true

   The host's own commands act for the person at the page and pass
   grant: "all"; an agent relayed by the engine (static/bridge.js) holds
   the grant its token was made with, and for the rest the person is
   asked here (docs/agents-design.md, decision 6). */
(function () {
    'use strict';
    var A = window.pudlApplets;
    if (!A || !A.capability) { return; }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('could not load ' + src)); };
            document.head.appendChild(s);
        });
    }

    var fsReady = null;
    function siteFs() {
        if (!fsReady) {
            fsReady = (window.pcSiteFs ? Promise.resolve() : loadScript(window.pcSiteFsSrc || '/static/sitefs.js'))
                .then(function () { return window.pcSiteFs.load(); })
                .then(function () { return window.pcSiteFs; }, function (err) { fsReady = null; throw err; });
        }
        return fsReady;
    }

    function filesService(writable) {
        function node(F, path) {
            var n = F.resolve(F.home(), String(path));
            if (!n) { throw new Error(path + ': no such file or directory'); }
            return n;
        }
        function entry(F, n) {
            var r = F.realOf(n), e = { name: n.name, path: F.displayPath(r), kind: F.kindOf(n) };
            var size = F.size(n);
            if (size != null) { e.size = size; }
            if (r.mtime) { e.modified = new Date(+r.mtime).toISOString(); }
            return e;
        }
        var s = {
            stat: function (path) { return siteFs().then(function (F) { var n = F.resolve(F.home(), String(path)); return n ? entry(F, n) : null; }); },
            list: function (path) {
                return siteFs().then(function (F) {
                    var n = F.realOf(node(F, path));
                    if (!n.children) { throw new Error(path + ': not a directory'); }
                    return n.children.map(function (c) { return entry(F, c); });
                });
            },
            read: function (path) {
                return siteFs().then(function (F) {
                    var n = node(F, path);
                    if (F.realOf(n).children) { throw new Error(path + ': is a directory'); }
                    return F.read(n);
                });
            }
        };
        if (writable) {
            s.write = function (path, text, append) {
                return siteFs().then(function (F) { return F.write(F.home(), String(path), String(text), !!append); }).then(function (res) {
                    if (res.error) { throw new Error(res.error); }
                    return entry(window.pcSiteFs, res.node);
                });
            };
            s.mkdir = function (path, parents) {
                return siteFs().then(function (F) { return F.mkdir(F.home(), String(path), !!parents); }).then(function (err) {
                    if (err) { throw new Error(err); }
                    return true;
                });
            };
        }
        return Object.freeze(s);
    }

    /* PUDL hands each service once, the first capability to give it
       winning, so an action that writes declares files.write alone: its
       service reads as well. */
    A.capability('files.read', function () { return { files: filesService(false) }; });
    A.capability('files.write', function () { return { files: filesService(true) }; });

    /* === The person's say ================================================ */

    var WORDS = {
        'files.read': 'read your files', 'files.write': 'change your files', 'window.open': 'open windows',
        'attention.request': 'ask you questions', 'notification.post': 'post notices', 'artifact.create': 'make files for you'
    };
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function ownerName(owner) {
        owner = owner || {};
        if (owner.kind === 'agent') { return owner.name ? 'The agent ' + owner.name : 'An agent'; }
        if (owner.kind === 'page') { return 'This page'; }
        return 'A ' + (owner.kind || 'caller');
    }
    /* What the person allowed for the rest of this page: by caller, by
       capability, by action and, for an action given a path, by folder, so
       "allow while this page is open" for one action in one folder is not
       every action needing that capability anywhere (security review,
       2026-11-03). */
    var allowed = {};
    function ownerKey(owner) { owner = owner || {}; return (owner.kind || 'caller') + ':' + (owner.id || owner.name || ''); }
    function folderOf(path) { var p = String(path || ''); var i = p.lastIndexOf('/'); return i > 0 ? p.slice(0, i) : (p.indexOf('~') === 0 ? '~' : ''); }
    function grantKey(cap, ref, input) { return cap + '|' + ref + '|' + folderOf(input && input.path); }

    /* PUDL's confirm hook is given the action and what it lacks, not its
       input, so the input of each invocation waiting to be asked about is
       kept here by action, from the broker's two ways in. (PUDL should pass
       the input to confirm itself; docs/review.md lists it upstream.) */
    var waiting = {};
    ['invoke', 'run'].forEach(function (verb) {
        var inner = A[verb];
        if (typeof inner !== 'function') { return; }
        A[verb] = function (ref, input) {
            var list = waiting[ref] = waiting[ref] || [], entry = { input: input };
            list.push(entry);
            var drop = function () { var i = list.indexOf(entry); if (i >= 0) { list.splice(i, 1); } };
            var p;
            try { p = inner.apply(A, arguments); } catch (err) { drop(); throw err; }
            Promise.resolve(p).then(drop, drop);
            return p;
        };
    });
    function inputOf(ref) { var list = waiting[ref]; return list && list.length ? list[0].input : null; }

    /* Writes that change what runs later, a dotfile such as ~/.profile or a
       script in ~/bin, and any command line, are asked about every time. */
    function alwaysAsk(input) {
        if (!input) { return false; }
        if (input.command != null) { return true; }
        var p = String(input.path || '');
        return /(^|\/)\.[^/]/.test(p) || /^~\/bin(\/|$)/.test(p);
    }
    /* What the action is about to touch, from its input, in a few lines. */
    function inputLines(input) {
        if (!input || typeof input !== 'object') { return ''; }
        var rows = [];
        if (input.path != null) { rows.push(['File', String(input.path)]); }
        if (input.command != null) { rows.push(['Command', String(input.command)]); }
        Object.keys(input).forEach(function (k) {
            if (k === 'path' || k === 'command' || rows.length >= 6) { return; }
            var v = input[k], t = typeof v === 'string' ? v : JSON.stringify(v);
            if (t == null) { return; }
            rows.push([k, t.length > 160 ? t.slice(0, 160) + '… (' + t.length + ' characters)' : t]);
        });
        if (!rows.length) { return ''; }
        return '<dl class="yavc-allow-input">' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd><code>' + esc(r[1]) + '</code></dd>'; }).join('') + '</dl>';
    }

    var asking = Promise.resolve();
    A.confirm = function (q) {
        var key = ownerKey(q.owner), have = allowed[key] || {}, input = inputOf(q.action.ref);
        var missing = (q.missing || []).filter(function (c) { return alwaysAsk(input) || !have[grantKey(c, q.action.ref, input)]; });
        if (!missing.length) { return Promise.resolve(true); }
        var turn = asking.then(function () { return ask(q, missing, key, input); });
        asking = turn.catch(function () { });
        return turn;
    };

    function ask(q, missing, key, input) {
        return new Promise(function (resolve) {
            var dlg = document.createElement('dialog'), id = 'yavc-allow-' + Date.now(), standing = !alwaysAsk(input);
            dlg.className = 'dialog yavc-allow';
            dlg.setAttribute('aria-labelledby', id + '-title');
            dlg.innerHTML =
                '<form method="dialog">' +
                  '<h3 class="dialog-title" id="' + id + '-title">' + esc(ownerName(q.owner)) + ' asks: ' + esc(q.action.title || q.action.ref) + '</h3>' +
                  '<div class="dialog-body">' +
                    (q.action.description ? '<p>' + esc(q.action.description) + '</p>' : '') +
                    inputLines(input) +
                    '<p>To do it, it would ' + esc(missing.map(function (c) { return WORDS[c] || c; }).join(' and ')) + '.</p>' +
                    (standing ? '' : '<p class="form-help">This changes what runs later, so it is asked about every time.</p>') +
                  '</div>' +
                  '<div class="dialog-actions">' +
                    '<button type="button" class="btn" data-answer="no">Refuse</button>' +
                    (standing ? '<button type="submit" class="btn" value="page" disabled>Allow while this page is open</button>' : '') +
                    '<button type="submit" class="btn btn-primary" value="once" disabled>Allow once</button>' +
                  '</div>' +
                '</form>';
            dlg.querySelector('[data-answer="no"]').addEventListener('click', function () { dlg.close('no'); });
            dlg.addEventListener('close', function () {
                var v = dlg.returnValue;
                dlg.remove();
                if (v === 'page' && standing) { allowed[key] = allowed[key] || {}; missing.forEach(function (c) { allowed[key][grantKey(c, q.action.ref, input)] = true; }); }
                resolve(v === 'page' || v === 'once');
            });
            document.body.appendChild(dlg);
            dlg.showModal();
            /* The allowing buttons wake after a moment, so a click meant for
               what was under the pointer as the dialog opened is not taken
               as an answer. Refuse is ready at once. */
            setTimeout(function () { dlg.querySelectorAll('button[disabled]').forEach(function (b) { b.disabled = false; }); }, 700);
        });
    }
})();
