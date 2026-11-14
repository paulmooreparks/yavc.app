/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Settings files: each applet's settings, and the desktop's, kept as JSON
   in ~/.config/<name>.json. On the public site the engine keeps them under
   the reader's session, which every address of the site shares, and the
   site file system shows them as the files of ~/.config (static/sitefs.js;
   DESIGN.md, decision 22), so a setting chosen on the desktop holds on every
   standalone page. A settings file reads like an ordinary file, so it can be
   read and edited in the terminal or the Editor too.

     pcConfig.load(name, defaults)  resolves to the settings, the file's
                                     values over the defaults
     pcConfig.get(name)             the settings as last loaded
     pcConfig.set(name, changes)    merges the changes in and saves; resolves
                                     to an error message or null
     pcConfig.onChange(name, fn)    fn(settings) whenever they change, here,
                                     in another window of this page, or in
                                     another tab; returns an unsubscribe

   An applet owns its settings and draws its own controls for them; this
   only keeps the files. Load with defer, after js/applets.js. */
(function () {
    'use strict';
    if (window.pcConfig) { return; }

    /* The site file system (static/yavc-util.js), watched once it is here. */
    function fs() {
        return window.yavcUtil.siteFs().then(function (F) { watch(); return F; });
    }

    /* name -> { defaults, values, text, listeners: [] }, with no prototype,
       so a setting called "constructor" is a setting like any other. */
    var entries = Object.create(null);

    /* A settings name becomes a file name under ~/.config, and applets
       choose it, so it must be a plain word: no slash or dot that could
       lead out of the folder, and never something that is not a string
       (a page element once became "[object HTMLDivElement].json"). */
    var NAME = /^[a-z][a-z0-9-]{0,63}$/;
    function pathOf(name) {
        if (typeof name !== 'string' || !NAME.test(name)) { throw new TypeError('a settings name is a word of lowercase letters, digits and -, starting with a letter'); }
        return '~/.config/' + name + '.json';
    }
    function plain(obj) { return !!obj && typeof obj === 'object' && !Array.isArray(obj); }

    /* Settings come from a file anyone could have edited, so only a
       setting's own name is copied: never __proto__, constructor or
       prototype, which would change what every setting inherits (security
       review, 2026-11-03). */
    var UNSAFE = ['__proto__', 'constructor', 'prototype'];
    function own(obj) {
        var out = {};
        Object.keys(obj || {}).forEach(function (k) { if (UNSAFE.indexOf(k) < 0) { out[k] = obj[k]; } });
        return out;
    }
    function merged(e) { return Object.assign({}, own(e.defaults), own(e.values)); }

    async function readValues(F, name) {
        var n = F.resolve(F.home(), pathOf(name));
        if (!n || n.children) { return { text: null, values: {} }; }
        var text = await F.read(n);
        var obj = null;
        try { obj = JSON.parse(text); } catch (err) { obj = null; }
        return { text: text, values: obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {} };
    }

    function tell(name) {
        var e = entries[name];
        if (!e) { return; }
        /* Each listener gets its own copy, so one that changes what it was
           given can't change what another holds. */
        e.listeners.slice().forEach(function (fn) { try { fn(merged(e),own(e.values)); } catch (err) { if (window.console) { console.error(err); } } });
    }

    /* A change to ~ may be a settings file changed elsewhere: in another
       tab, or by hand in the Editor. Each loaded file is read again, and
       its listeners told if its text changed. */
    var watching = false;
    /* Reads a settings file again and tells its listeners if its text changed. A read begun before a save here, or during one, would
       bring back the text the save replaced, so it counts only if no save began while it ran. A change that arrives while a save is
       under way, or whose read is thrown away for that reason, is not lost: it is marked, and the file is read again when the last
       save is done (DESIGN.md, decision 193; Barcode Tool does the same, decision 161). */
    async function refresh(name) {
        var e0 = entries[name], version = e0 ? e0.version : 0;
        if (!e0) { return; }
        if (e0.saving) { e0.changed = true; return; }
        var got = await readValues(window.pcSiteFs, name).catch(function () { return null; });
        var e = entries[name];
        if (!got || !e || !e.loaded) { return; }
        if (e.saving || e.version !== version) { e.changed = true; return; }
        if (got.text === e.text) { return; }
        e.text = got.text;
        e.values = got.values;
        tell(name);
    }
    /* Called as a save ends: a change marked while it ran is read now. */
    function saved(name, e) {
        if (!e.saving && e.changed) { e.changed = false; refresh(name); }
    }
    function watch() {
        if (watching) { return; }
        watching = true;
        window.pcSiteFs.onChange(function () { Object.keys(entries).forEach(refresh); });
    }

    async function load(name, defaults) {
        pathOf(name);
        var F = await fs();
        var e = entry(name);
        e.defaults = Object.assign({}, own(e.defaults), own(defaults));
        if (!e.loaded) {
            var got = await readValues(F, name);
            if (!e.loaded) { e.values = got.values; e.text = got.text; e.loaded = true; }
        }
        return merged(e);
    }

    function entry(name) {
        return entries[name] || (entries[name] = { defaults: {}, values: {}, text: undefined, loaded: false, listeners: [], version: 0, saving: 0, queue: null });
    }

    function get(name) { var e = typeof name === 'string' ? entries[name] : null; return e ? merged(e) : {}; }

    /* Saves of one file go one at a time, each after the last has
       finished, so two changes made in quick succession don't both write
       the file at once and collide; each merges into what the last wrote. */
    async function set(name, changes) {
        pathOf(name);
        if (!plain(changes)) { throw new TypeError('settings changes are an object of names and values'); }
        var F = await fs();
        var e = entry(name);
        if (!e.loaded) { await load(name, {}); }
        e.version++;
        e.saving++;
        var turn = (e.queue || Promise.resolve()).then(function () { return save(F, name, e, changes); });
        e.queue = turn.catch(function () { });
        try { return await turn; }
        finally { e.saving--; saved(name, e); }
    }

    async function save(F, name, e, changes) {
        var values = Object.assign({}, own(e.values), own(changes));
        var text = JSON.stringify(values, null, 2) + '\n';
        var dir = F.resolve(F.home(), '~/.config');
        if (!dir) {
            var made = await F.mkdir(F.home(), '~/.config', true);
            if (made) { return made; }
        }
        /* The text is known before the write reports, so the change event
           the write raises finds nothing new to tell. */
        var before = e.text;
        e.text = text;
        e.values = values;
        var res = await F.write(F.home(), pathOf(name), text, false);
        if (res.error) {
            e.text = before;
            var got = await readValues(F, name).catch(function () { return null; });
            if (got) { e.values = got.values; e.text = got.text; }
            tell(name);
            return res.error;
        }
        tell(name);
        return null;
    }

    async function adopt(name, defaults, marker) {
        pathOf(name);if(!plain(defaults))throw new TypeError('Migration defaults must be an object.');
        var F=await fs(),e=entry(name);if(!e.loaded)await load(name,{});e.version++;e.saving++;
        var turn=(e.queue || Promise.resolve()).then(async function () {var text=await F.adoptSettings(name,own(defaults),marker);e.text=text;e.values=own(JSON.parse(text));tell(name);return merged(e);});
        e.queue=turn.catch(function () {});try{return await turn;}finally{e.saving--;saved(name,e);}
    }

    function onChange(name, fn) {
        pathOf(name);
        var e = entry(name);
        if (!e.loaded) { load(name, {}).catch(function () { }); }
        e.listeners.push(fn);
        return function () {
            var l = entries[name] ? entries[name].listeners : [];
            var i = l.indexOf(fn);
            if (i >= 0) { l.splice(i, 1); }
        };
    }

    window.pcConfig = { load: load, stored:async function (name) {await load(name,{});return own(entry(name).values);}, get: get, set: set, adopt: adopt, onChange: onChange };
})();
