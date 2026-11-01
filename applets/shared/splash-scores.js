/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The games' high scores: the ten best of each game, in one file in the
   reader's home directory, ~/.splash/scores.json, through the host's file
   service, so they live wherever the host keeps ~; a host with no file
   service keeps them in this browser's storage. A game asks
   splash.scores(pudlHost, 'invaders') and gets list(), best() and
   record(score, level), which resolves to the entry's rank, 1 for the
   best, or null when it did not make the ten. */
(function () {
    'use strict';
    window.splash = window.splash || {};
    if (window.splash.scores) { return; }

    var FILE = '~/.splash/scores.json', KEY = 'splash-scores', MAX = 10;

    function parse(text) {
        try { var v = text ? JSON.parse(text) : {}; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
        catch (err) { return {}; }
    }

    function scores(host, game) {
        var fs = host && host.fs;
        function readAll() {
            if (fs) { return fs.readText(FILE).then(parse, function () { return {}; }); }
            try { return Promise.resolve(parse(localStorage.getItem(KEY))); } catch (err) { return Promise.resolve({}); }
        }
        function writeAll(all) {
            var text = JSON.stringify(all);
            if (fs) { return fs.writeText(FILE, text).then(function (err) { return err || null; }, function (e) { return String(e && e.message || e); }); }
            try { localStorage.setItem(KEY, text); return Promise.resolve(null); } catch (err) { return Promise.resolve(String(err && err.message || err)); }
        }
        function list() { return readAll().then(function (all) { return Array.isArray(all[game]) ? all[game].slice() : []; }); }
        return {
            where: fs ? FILE : 'this browser',
            list: list,
            best: function () { return list().then(function (l) { return l.length ? l[0].score : 0; }); },
            record: function (score, level) {
                return readAll().then(function (all) {
                    var l = Array.isArray(all[game]) ? all[game].slice() : [];
                    var entry = { score: score, level: level, date: new Date().toISOString().slice(0, 10) };
                    l.push(entry);
                    l.sort(function (a, b) { return b.score - a.score; });
                    l = l.slice(0, MAX);
                    var rank = l.indexOf(entry);
                    all[game] = l;
                    return writeAll(all).then(function (err) { return { rank: rank < 0 ? null : rank + 1, list: l, error: err }; });
                });
            }
        };
    }

    window.splash.scores = scores;
})();
