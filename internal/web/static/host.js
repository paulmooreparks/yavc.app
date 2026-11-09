/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* What yavc.app gives an applet (pudl-host-kit.js, from the
   pudl-applet-packages repo): the kit's menu helpers, where applet pages
   and PUDL are, this tab's snapshots, each applet's settings and the file
   service, with the site's own Open and Save as dialogs. The settings and
   the files are the site file system's (static/sitefs.js and config.js,
   from parkscomputing.com), whose home for a reader is this browser's
   local storage (DESIGN.md, decision 11). The site's own applets, Files,
   the Editor and the Terminal, come from parkscomputing.com as they are
   and read the pc* globals that site gives them, which are set here from
   the same things. Loads after the kit and before the packages'
   registry. */
(function () {
    'use strict';
    if (!window.pudlHostKit) { return; }
    var kit = window.pudlHostKit;

    /* The site's shared scripts, at this build's version (written into
       this script's own address by the page). */
    var U = window.yavcUtil, versioned = U.versioned;
    window.yavcStaticVersion = U.version;
    window.pcSiteFsSrc = versioned('/static/sitefs.js');
    window.pcConfigSrc = versioned('/static/config.js');
    window.pcFileBrowserSrc = versioned('/static/filebrowser.js');
    window.pcFileBrowserCss = versioned('/static/filebrowser.css');
    window.pcSnapshot = window.yavcSnapshot || null;
    window.pcAppletIdentity = kit.identity;
    window.pcAppletAction = kit.action;
    /* The terminal's extra commands, beside it in its package. */
    window.pcTerminalCommands = ['/applets/terminal/terminal-text.js', '/applets/terminal/terminal-lua.js', '/applets/terminal/terminal-sh.js'];

    /* The site's shared scripts, each loaded once (static/yavc-util.js). */
    function siteFs() { return U.loadGlobal(window.pcSiteFsSrc, 'pcSiteFs'); }
    function config() { return U.loadGlobal(window.pcConfigSrc, 'pcConfig'); }
    function fileBrowser() { return U.loadGlobal(window.pcFileBrowserSrc, 'pcFileBrowser'); }
    var fs = U.siteFs;
    function withDialog() { return Promise.all([fs(), fileBrowser()]); }
    function isText(blob) { return /^text\/|json|xml|javascript/.test(blob.type || 'text/plain'); }
    var resourceAdapter = null;
    function resources() {
        if (!resourceAdapter) resourceAdapter = Promise.all([withDialog(), U.loadGlobal(versioned('/static/resource-host.js'), 'yavcResourceHost')]).then(function (parts) { return parts[1].create(parts[0][0], parts[0][1]); }).catch(function (err) { resourceAdapter = null; throw err; });
        return resourceAdapter;
    }
    var resolution = null, validAssociations = null;
    function fileResolver() {
        if (!resolution) resolution = Promise.all([U.loadGlobal(versioned('/static/file-resolver.js'), 'yavcFileResolver'),
            fetch(versioned('/static/content-handlers.json')).then(function (response) { if (!response.ok) throw new Error('The file capability catalog could not load.'); return response.json(); })])
            .then(function (parts) { return parts[0].create(parts[1]); }).catch(function (err) { resolution = null; throw err; });
        return resolution;
    }

    /* The applets with published actions, for find(). */
    var appletManifests = (function () {
        var loaded = null;
        return function () {
            if (loaded) { return loaded; }
            var defs = window.pudlApplets && window.pudlApplets.definitions ? window.pudlApplets.definitions() : {};
            loaded = Promise.all(Object.keys(defs).filter(function (n) { return defs[n].actions; }).map(function (n) {
                var d = defs[n], url = d.actions + (d.ver ? (d.actions.indexOf('?') < 0 ? '?' : '&') + 'v=' + encodeURIComponent(d.ver) : '');
                return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
                    if (!m || !m.actions) { return null; }
                    return { id: m.id || n, title: m.title || n, description: m.description || '', manifest: url,
                        actions: (m.actions || []).map(function (a) { return { ref: a.ref, title: a.title || a.ref, description: a.description || '' }; }) };
                }, function () { return null; });
            })).then(function (list) { return list.filter(Boolean).sort(function (a, b) { return a.title.localeCompare(b.title); }); });
            return loaded;
        };
    })();

    /* Keys go where the focus is, and PUDL binds an applet's shortcuts to
       its mount and what is inside it. Nothing may be focused, though: a
       window was clicked by its title, a show just ended, or the page has
       only just drawn. Then a key such as F5 or Ctrl+S reaches the browser
       instead of the applet the person is looking at. So the applet in the
       active window, or the one page of its own, takes the focus when it
       starts and when its window is pressed. (PUDL 0.96.7's dispatcher
       also sends a key pressed with nothing focused to the active window's
       applet, so the host no longer re-dispatches it.) */
    function mountInFront() {
        var win = document.querySelector('.win.active');
        var mount = win ? win.querySelector('[data-applet]') : null;
        if (!mount && !document.querySelector('.win-layer')) {
            var all = document.querySelectorAll('[data-applet]');
            if (all.length === 1) { mount = all[0]; }
        }
        return mount;
    }
    function unfocused() {
        var a = document.activeElement;
        return !a || a === document.body || a === document.documentElement || a.classList.contains('win');
    }
    function focusMount(mount) {
        if (!mount || !unfocused()) { return; }
        if (!mount.hasAttribute('tabindex')) { mount.tabIndex = -1; }
        try { mount.focus({ preventScroll: true }); } catch (err) { }
    }
    document.addEventListener('pudl:applet-start', function (e) {
        var mount = e.target;
        setTimeout(function () { if (mount === mountInFront()) { focusMount(mount); } }, 0);
    });
    document.addEventListener('mousedown', function (e) {
        var win = e.target.closest && e.target.closest('.win');
        if (!win) { return; }
        setTimeout(function () { if (win.classList.contains('active')) { focusMount(win.querySelector('[data-applet]')); } }, 0);
    });

    /* A dialog starts in the folder asked for when it exists, else in ~. */
    function startIn(F, want) { try { return want && F.resolve(F.home(), want) ? want : '~'; } catch (err) { return '~'; } }

    window.pudlHost = kit.host({
        commandToolbar: {
            attach: function (root, options) {
                var service=window.pudlHost.config;
                if(options.app==='docs')service=Object.assign({},service,{load:async function (name,defaults) {var original=window.pudlHost.config,all=await original.load(name,defaults);if(name!=='command-toolbars')return all;return original.adopt(name,{docs:all.editor || {version:1,visible:true,inRibbon:true,items:options.defaults.slice()}},'docsWorkspaceMigration');}});
                return window.yavcCommandToolbar.attach(root,Object.assign({},options,{config:service}));
            }
        },
        pages: '/', pudl: '/pudl/',
        contentBytes: {version:1,read:function (request,context) {return fs().then(function (F) {return F.contentBytes.read(request,context);});}},
        snapshot: window.pcSnapshot,
        documentWindows: window.yavcDocumentWindows,
        presentation: {version:1,presenterURL:function(request){
            if(request.application!=='slides')throw new Error('This application has no presenter page.');
            var url=new URL('/applet/slides',location.origin);url.searchParams.set('file',request.resource);url.searchParams.set('presenter','1');url.searchParams.set('presenter-channel',request.channel);return url.href;
        }},
        contentWorkspace: { version: 1,
            directory: function (resource) {var F=window.pcSiteFs;if(!F || typeof resource!=='string')return null;var node=F.resolve(null,resource);return node && !node.children ? F.splitPath(F.displayPath(node)).dir : null;},
            browser: function () { return withDialog().then(function (x) { return {F:x[0],FB:x[1]}; }); },
            split: {of:function (handle,change) {return window.pcSplit.of(handle,change);}},
            openPage: function (href) { if(!window.pudlWindows || !document.querySelector('[data-win-layer]'))return false;var url=new URL(href,location.href),match=url.origin===location.origin && /^\/page\/([A-Za-z0-9_-]+)$/.exec(url.pathname);if(!match)return false;var key=match[1],win=document.querySelector('.win[data-win="'+key+'"]');if(win && window.pudlWindows.state().open.indexOf(key)>=0){window.pudlWindows.raise(key);if(window.pcLoadWindow)window.pcLoadWindow(win,'',true).catch(function () {});}else window.pudlWindows.open(key);return true;},
            legacySession: {
                read: function (app) { return JSON.parse(localStorage.getItem('pc-'+app+'-session') || 'null'); },
                write: function (app, value) { if(value)localStorage.setItem('pc-'+app+'-session',JSON.stringify(value));else localStorage.removeItem('pc-'+app+'-session'); }
            },
            legacyWork: function (app, remove) {if(app!=='editor')return null;var value=JSON.parse(sessionStorage.getItem('pc-editor-work') || 'null');if(remove)sessionStorage.removeItem('pc-editor-work');return value;}
        },
        /* The host resolves handlers before invoking a distinct PUDL request verb. */
        fileResolution: { version: 1, resolve: async function (request) {
            var resolver = await fileResolver(), preferenceError = null;
            var preferences = await window.pudlHost.config.load('file-associations', { version: 1, rules: [] });
            try { resolver.validatePreferences(preferences); validAssociations = JSON.parse(JSON.stringify(preferences)); }
            catch (err) { preferenceError = err.message; }
            var installed = window.pudlApplets && window.pudlApplets.definitions ? Object.keys(window.pudlApplets.definitions()) : [];
            var result = resolver.resolve(request, { installed: installed, preferences: validAssociations || { version: 1, rules: [] } });
            return Object.assign({}, result, { preferenceError: preferenceError });
        }, open: async function (request, context) {
            function current(){if(context&&(context.signal&&context.signal.aborted||context.current&&!context.current()||context.host&&!context.host.isConnected))throw new DOMException('The file opening was cancelled.','AbortError');}
            current();
            var F=await fs(),node=F.resolve(F.home(),request.resource);
            current();
            if(!node || node.children)throw new Error('Choose a supported text file.');
            var real=F.realOf(node),path=F.displayPath(real);
            if(real.home&&!real.server&&!real.settings)await F.contentResources.read({resource:path});
            else if(!F.isText(real))throw new Error('Choose a supported text file.');
            var result=await window.pudlHost.fileResolution.resolve({name:real.name,intent:'edit',applet:request.applet,view:request.view,verifiedText:true,readable:true,writable:!!real.home});
            current();
            if(result.status!=='resolved')throw new Error(result.reason || 'No installed application supports this file.');
            if(!F.resolve(F.home(),path))throw new Error('The file is no longer available.');
            var plan=result.plan;
            if(plan.dispatch && window.pudlWindows && document.querySelector('[data-win-layer]')){
                var keys=window.pudlWindows.state().open.filter(function (key) {return key===plan.applet || new RegExp('^'+plan.applet+'-[2-9]$').test(key);});
                var opened=await window.pudlWindows.open(keys.length ? keys[keys.length-1] : plan.applet,context && context.host);
                if(opened.status!=='opened' && opened.status!=='existing')throw opened.error || new Error('The application could not open.');
                await window.pudlApplets.start(opened.key);
                current();
                if(!opened.window || !opened.window.isConnected || opened.window.querySelector('[data-applet-state="error"]'))throw new Error('The application could not start.');
                var mount=opened.window.querySelector('[data-applet="'+plan.applet+'"]');if(!mount)throw new Error('The application mount is unavailable.');
                var accepted=await window.pudlCommands.run(plan.dispatch.command,{resource:path,view:request.view,initialView:plan.view},mount);
                if(accepted===false)throw new Error('The file opening was cancelled or refused.');
                return result;
            }
            if(!window.pudlApplets.request(plan.operation,{path:path,kind:plan.kind,view:request.view,'initial-view':plan.view},context && context.host))throw new Error('The selected application is unavailable.');
            return result;
        } },
        fileFields: { version: 1, choose: async function (request) {
            var fields = await U.loadGlobal(versioned('/static/file-fields.js'), 'yavcFileFields');
            return fields.choose(request);
        } },
        /* Prepared for explicit capability adoption after the applet gates. */
        contentResourceAdapter: { version: 2,
            available: function () { return fs().then(function (F) { return !F.mounted; }); },
            read: function (request) { return resources().then(function (adapter) { return adapter.read(request); }); },
            write: function (request) { return resources().then(function (adapter) { return adapter.write(request); }); },
            create: function (request) { return resources().then(function (adapter) { return adapter.create(request); }); },
            saveAs: function (request, context) { return resources().then(function (adapter) { return adapter.saveAs(request, context); }); }
        },
        services: {},
        actions: {
            run: function (ref, input) {
                if (!window.pudlApplets || !window.pudlApplets.run) { return Promise.reject(new Error('the page has no action broker')); }
                return window.pudlApplets.run(ref, input, { owner: { kind: 'page' }, grant: 'all' }); // check-ignore(grant-all): an applet's own code in the page, which already holds the page's authority
            }
        },
        fs: {
            /* The site file system and its dialogs themselves, for a kit
               that browses and uploads on its own, such as the editing
               kit's picture dialog. */
            site: function () { return withDialog().then(function (x) { return { F: x[0], FB: x[1] }; }); },
            /* The site's own Open and Save as (static/filebrowser.js). */
            open: function (o) {
                o = o || {};
                return withDialog().then(function (x) {
                    var F = x[0], FB = x[1];
                    return FB.pick(F, {
                        mode: 'open', title: o.title, host: o.host, start: startIn(F, o.start), accept: o.accept || [], computer: true, signal:o.signal,
                        check: function (node) {
                            if (!F.isText(node)) { return node.name + ' isn\'t a text file.'; }
                            return o.check ? o.check(F.displayPath(node)) : null;
                        }
                    }).then(function (res) {
                        if (!res) { return null; }
                        if (res.file) { return res.file.text().then(function (text) { return { name: res.file.name, text: text }; }); }
                        return F.read(res.node).then(function (text) { return { path: res.path, name: res.node.name, text: text }; });
                    });
                });
            },
            save: function (o) {
                o = o || {};
                var blob = o.blob, text = isText(blob);
                return withDialog().then(function (x) {
                    var F = x[0], FB = x[1];
                    return FB.pick(F, {
                        mode: 'save', title: o.title, name: o.name, host: o.host, start: startIn(F, o.start), computer: true
                    }).then(function (res) {
                        if (!res) { return null; }
                        if (res.download) { return { download: res.download }; }
                        var refused = o.check && o.check(res.path);
                        if (refused) { throw new Error(refused); }
                        var written = text ? blob.text().then(function (t) { return F.write(null, res.path, t, false); })
                            : F.upload(res.dir, new File([blob], res.name, { type: blob.type }));
                        return written.then(function (out) {
                            if (out && out.error) { throw new Error(out.error); }
                            return { path: res.path };
                        });
                    });
                });
            },
            onChange: function (fn) {
                var off = null, gone = false;
                siteFs().then(function (f) { if (!gone) { off = f.onChange(function () { fn(); }); } });
                return function () { gone = true; if (off) { off(); } };
            },
            find: function (query, limit) {
                var words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean), max = limit || 40;
                return Promise.all([fs(), appletManifests()]).then(function (got) {
                    var F = got[0], out = [];
                    got[1].forEach(function (m) {
                        var text = (m.title + ' ' + m.id + ' ' + (m.description || '') + ' ' + m.actions.map(function (a) { return a.title + ' ' + a.ref; }).join(' ')).toLowerCase();
                        if (words.every(function (w) { return text.indexOf(w) >= 0; })) {
                            out.push({ path: m.id, name: m.title, kind: 'applet', description: m.description || m.actions.map(function (a) { return a.title; }).join(' · '), manifest: m.manifest });
                        }
                    });
                    var applets = out; out = [];
                    (function walk(n, depth) {
                        if (out.length >= max || depth > 12) { return; }
                        (n.children || []).forEach(function (c) {
                            var r = F.realOf(c), kind = F.kindOf(c), name = c.name || '';
                            if (name.charAt(0) === '.' && name !== '.config') { return; }
                            var text = (name + ' ' + (c.title || '')).toLowerCase();
                            if ((kind === 'file' || kind === 'page' || kind === 'script') && words.every(function (w) { return text.indexOf(w) >= 0; })) {
                                out.push({ path: F.displayPath(c), name: c.title || name, kind: kind === 'page' ? 'page' : 'file' });
                            }
                            if (r.children && out.length < max) { walk(r, depth + 1); }
                        });
                    })(F.root(), 0);
                    out.sort(function (a, b) { return (a.path.indexOf('~/') === 0 ? 0 : 1) - (b.path.indexOf('~/') === 0 ? 0 : 1) || a.path.localeCompare(b.path); });
                    return applets.concat(out).slice(0, max);
                });
            },
            readText: function (path) {
                return fs().then(function (f) { var n = f.resolve(null, path); return n && !n.children ? f.read(n) : null; });
            },
            writeText: function (path, text) {
                return fs().then(function (f) {
                    var sp = f.splitPath(path);
                    var made = sp.dir && !f.resolve(null, sp.dir) ? f.mkdir(null, sp.dir, true) : Promise.resolve(null);
                    return made.then(function (err) { return err ? err : f.write(null, path, text, false).then(function (r) { return r.error || null; }); });
                });
            },
            mkdir: function (path) { return fs().then(function (f) { return f.mkdir(null, path, true); }); }
        },
        config: {
            stored: function (name) {return config().then(function (c) {return c.stored(name);});},
            adopt: function (name, defaults, marker) {return config().then(function (c) {return c.adopt(name,defaults,marker);});},
            load: function (name, defaults) { return config().then(function (c) { return c.load(name, defaults); }); },
            get: function (name) { return window.pcConfig ? window.pcConfig.get(name) : null; },
            set: function (name, changes) { return config().then(function (c) { return c.set(name, changes); }); },
            onChange: function (name, fn) {
                var off = null, gone = false;
                config().then(function (c) { if (!gone) { off = c.onChange(name, fn); } });
                return function () { gone = true; if (off) { off(); } };
            }
        }
    });
})();
