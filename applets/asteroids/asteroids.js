/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The games' controls: the keys held and pressed, read from the applet's
   own root so a game in one window never takes keys from another, and a
   touch pad of buttons drawn when the pointer is a finger. A game asks
   splash.input(root, { press, release, away, pad }) and reads held[name]
   each frame; press and release get the name of a control as it goes down
   and up; away is called when the keyboard leaves the game or the page is
   hidden, which is when a game pauses. The names are left, right, up,
   down, fire, alt, pause and start. */
(function () {
    'use strict';
    window.splash = window.splash || {};
    if (window.splash.input) { return; }

    var KEYS = {
        ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
        Space: 'fire', KeyX: 'fire', KeyZ: 'alt', ShiftLeft: 'alt', ShiftRight: 'alt',
        KeyP: 'pause', Escape: 'pause', Enter: 'start'
    };
    var GLYPHS = { left: '◀', right: '▶', up: '▲', down: '▼', fire: '●', alt: '✦', pause: '‖', start: '▶▶' };

    function input(root, opts) {
        opts = opts || {};
        var held = {};
        function down(e) {
            if (e.target.closest('dialog[open],input,textarea,select,[contenteditable="true"]')) { clear(); return; }
            var n = KEYS[e.code];
            if (!n) { return; }
            e.preventDefault();
            if (e.repeat) { return; }
            held[n] = true;
            if (opts.press) { opts.press(n); }
        }
        function up(e) {
            if (e.target.closest('dialog[open],input,textarea,select,[contenteditable="true"]')) { clear(); return; }
            var n = KEYS[e.code];
            if (!n) { return; }
            e.preventDefault();
            held[n] = false;
            if (opts.release) { opts.release(n); }
        }
        function clear() { Object.keys(held).forEach(function (k) { held[k] = false; }); }
        function away() { clear(); if (opts.away) { opts.away(); } }
        function focusOut(e) { if (!e.relatedTarget || !root.contains(e.relatedTarget)) { away(); } }
        function hidden() { if (document.hidden) { away(); } }
        root.addEventListener('keydown', down);
        root.addEventListener('keyup', up);
        root.addEventListener('focusout', focusOut);
        window.addEventListener('blur', away);
        document.addEventListener('visibilitychange', hidden);

        /* The pad: a button for each control the game lists, held while
           pressed. It shows itself when the pointer is a finger. */
        var pad = null, coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
        function showPad() { root.classList.toggle('splash-touch', !!(coarse && coarse.matches)); }
        if (opts.pad && opts.pad.length) {
            pad = document.createElement('div');
            pad.className = 'splash-pad';
            pad.setAttribute('role', 'group');
            pad.setAttribute('aria-label', 'Controls');
            opts.pad.forEach(function (p) {
                var name = typeof p === 'string' ? p : p.name, label = typeof p === 'string' ? p : (p.label || p.name);
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn splash-pad-btn';
                b.setAttribute('data-key', name);
                b.setAttribute('aria-label', label);
                b.textContent = (typeof p === 'object' && p.glyph) || GLYPHS[name] || label;
                function start(e) { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); held[name] = true; if (opts.press) { opts.press(name); } }
                function stop(e) { if (!held[name]) { return; } held[name] = false; if (opts.release) { opts.release(name); } }
                b.addEventListener('pointerdown', start);
                b.addEventListener('pointerup', stop);
                b.addEventListener('pointercancel', stop);
                b.addEventListener('lostpointercapture', stop);
                pad.appendChild(b);
            });
            showPad();
            if (coarse && coarse.addEventListener) { coarse.addEventListener('change', showPad); }
        }

        return {
            held: held,
            pad: pad,
            destroy: function () {
                root.removeEventListener('keydown', down);
                root.removeEventListener('keyup', up);
                root.removeEventListener('focusout', focusOut);
                window.removeEventListener('blur', away);
                document.removeEventListener('visibilitychange', hidden);
                if (coarse && coarse.removeEventListener) { coarse.removeEventListener('change', showPad); }
                if (pad && pad.parentNode) { pad.parentNode.removeChild(pad); }
            }
        };
    }

    window.splash.input = input;
})();

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

/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* A five-by-seven pixel font for the games' screens, as square as the
   invaders: capitals, digits and a little punctuation, each as rows of
   pixels. splash.font.glyph(ch) gives a sprite { id, w, h, rows } or
   null, and splash.font.sprite(id, rows) makes one the same way. */
(function () {
    'use strict';
    window.splash = window.splash || {};
    if (window.splash.font) { return; }

    var FONT = {
        A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'], B: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
        C: ['.XXXX', 'X....', 'X....', 'X....', 'X....', 'X....', '.XXXX'], D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
        E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'], F: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
        G: ['.XXXX', 'X....', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXXX'], H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
        I: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'], J: ['....X', '....X', '....X', '....X', 'X...X', 'X...X', '.XXX.'],
        K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'], L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
        M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X', 'X...X', 'X...X'], N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
        O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'], P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
        Q: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X..X.', '.XX.X'], R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
        S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'], T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
        U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'], V: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
        W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'], X: ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
        Y: ['X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..'], Z: ['XXXXX', '....X', '...X.', '..X..', '.X...', 'X....', 'XXXXX'],
        0: ['.XXX.', 'X...X', 'X..XX', 'X.X.X', 'XX..X', 'X...X', '.XXX.'], 1: ['..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
        2: ['.XXX.', 'X...X', '....X', '...X.', '..X..', '.X...', 'XXXXX'], 3: ['XXXXX', '...X.', '..X..', '...X.', '....X', 'X...X', '.XXX.'],
        4: ['...X.', '..XX.', '.X.X.', 'X..X.', 'XXXXX', '...X.', '...X.'], 5: ['XXXXX', 'X....', 'XXXX.', '....X', '....X', 'X...X', '.XXX.'],
        6: ['..XX.', '.X...', 'X....', 'XXXX.', 'X...X', 'X...X', '.XXX.'], 7: ['XXXXX', '....X', '...X.', '..X..', '.X...', '.X...', '.X...'],
        8: ['.XXX.', 'X...X', 'X...X', '.XXX.', 'X...X', 'X...X', '.XXX.'], 9: ['.XXX.', 'X...X', 'X...X', '.XXXX', '....X', '...X.', '.XX..'],
        '=': ['.....', '.....', 'XXXXX', '.....', 'XXXXX', '.....', '.....'], '?': ['.XXX.', 'X...X', '....X', '...X.', '..X..', '.....', '..X..'],
        '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..X..'], ',': ['.....', '.....', '.....', '.....', '.....', '..X..', '.X...'],
        ':': ['.....', '..X..', '.....', '.....', '.....', '..X..', '.....'], '-': ['.....', '.....', '.....', 'XXXXX', '.....', '.....', '.....'],
        '!': ['..X..', '..X..', '..X..', '..X..', '..X..', '.....', '..X..'],
        ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
    };
    function sprite(id, rows) { return { id: id, w: rows[0].length, h: rows.length, rows: rows }; }
    var glyphs = {};
    Object.keys(FONT).forEach(function (k) { glyphs[k] = sprite('f' + k, FONT[k]); });

    window.splash.font = { glyph: function (ch) { return glyphs[ch] || null; }, sprite: sprite };
})();

/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* What every game in the collection has in common, built once: the canvas
   and the bar of buttons under it, the status line, the High scores and
   Help dialogs, the scores file, the sound setting and the beeps, the
   frame loop, pausing when the keyboard leaves, the theme's colours, the
   pixel font, the Game and Help menus, and the PUDL applet instance. A
   game asks

     var shell = splash.shell(root, opts, {
       game: 'invaders', title: 'Space Invaders', width: 224, height: 256,
       help: '<p>…</p>', pad: ['left', 'right', 'fire'], crisp: false,
       newGame: function (level) { … },      starts a game at a level
       update: function (dt, held) { … },    a frame's worth of play, in ms
       draw: function (ctx) { … },           the whole screen
       press: function (name) { … },         a control going down, after
                                             the shell's own (start, pause)
       busy: function () { return false; }   whether something still moves
                                             while the game is not playing
     });

   and gets back an object whose instance is what init returns to PUDL,
   with the shell's state: mode (ready, playing, paused, dying, cleared,
   over), score, hi, lives, level, and timer for the dying and cleared
   pauses, and its helpers: setMode(m), say(text), addScore(n),
   gameOver(), die(ms), cleared(ms), beep(freq, ms, type, gain, to),
   colours, image(sprite, colour), text(s, x, y, colour, scale, align),
   loop(). With crisp true the canvas's own size follows the size it is
   shown at, for a game of lines; the game draws in its own width and
   height either way. The shell marks the root with data-splash-state,
   -score, -level and -lives for whoever watches. */
(function () {
    'use strict';
    window.splash = window.splash || {};
    if (window.splash.shell) { return; }

    function shell(root, opts, g) {
        var host = window.pudlHost || {};
        var uid = 'splash-' + Math.random().toString(36).slice(2, 8);
        var W = g.width, H = g.height;
        root.classList.add('splash', 'splash-' + g.game);
        if (!root.hasAttribute('tabindex')) { root.tabIndex = 0; }
        root.innerHTML =
            '<div class="splash-stage"><canvas width="' + W + '" height="' + H + '" aria-label="' + g.title + ': the game"></canvas></div>' +
            '<div class="splash-bar">' +
              '<button type="button" class="btn btn-primary" data-action="start">New game</button>' +
              '<button type="button" class="btn" data-action="pause" disabled>Pause</button>' +
              '<button type="button" class="btn" data-action="scores">High scores</button>' +
              '<button type="button" class="btn" data-action="help">Help</button>' +
              '<span class="splash-status" data-role="status" role="status" aria-live="polite">Ready</span>' +
            '</div>' +
            '<dialog class="dialog" data-role="scores-dialog" aria-labelledby="' + uid + '-scores">' +
              '<h3 class="dialog-title" id="' + uid + '-scores">High scores</h3>' +
              '<div class="dialog-body" data-role="scores-body"></div>' +
              '<div class="dialog-actions"><button type="button" class="btn btn-primary" data-action="close-scores">Close</button></div>' +
            '</dialog>' +
            '<dialog class="dialog" data-role="help-dialog" aria-labelledby="' + uid + '-help">' +
              '<h3 class="dialog-title" id="' + uid + '-help">' + g.title + '</h3>' +
              '<div class="dialog-body">' + g.help + '</div>' +
              '<div class="dialog-actions"><button type="button" class="btn btn-primary" data-action="close-help">Close</button></div>' +
            '</dialog>';
        var el = {
            canvas: root.querySelector('canvas'), pause: root.querySelector('[data-action="pause"]'),
            status: root.querySelector('[data-role="status"]'),
            scores: root.querySelector('[data-role="scores-dialog"]'), scoresBody: root.querySelector('[data-role="scores-body"]'),
            help: root.querySelector('[data-role="help-dialog"]')
        };
        var ctx = el.canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        var s = {
            mode: 'ready', score: 0, hi: 0, lives: 3, level: 1, timer: 0,
            colours: {}, input: null, scores: null, sound: { on: true }, ctx: ctx, canvas: el.canvas, root: root, host: host
        };

        /* === Colours and pictures =========================================== */
        var cache = {};
        function readColours() {
            var cs = getComputedStyle(root);
            function t(name, fallback) { var v = cs.getPropertyValue(name).trim(); return v || fallback; }
            s.colours = {
                bg: t('--surface-alt', '#111418'), fg: t('--text', '#e8e8e8'), accent: t('--accent', '#4a90e2'),
                positive: t('--positive', '#2e7d32'), danger: t('--danger', '#c62828'), warn: t('--warn', '#f9a825'),
                muted: t('--text-muted', '#9a9a9a'), mono: t('--mono', 'monospace')
            };
            cache = {};
            if (g.recolour) { g.recolour(); }
        }
        function image(spr, colour) {
            var key = spr.id + '|' + colour;
            if (cache[key]) { return cache[key]; }
            var c = document.createElement('canvas');
            c.width = spr.w; c.height = spr.h;
            var x2 = c.getContext('2d');
            x2.fillStyle = colour;
            for (var y = 0; y < spr.h; y++) { for (var x = 0; x < spr.w; x++) { if (spr.rows[y][x] === 'X') { x2.fillRect(x, y, 1, 1); } } }
            cache[key] = c;
            return c;
        }
        /* Words in the pixel font, upper case, scale pixels big, with y the
           top of the letters and x the left, middle or right by align. */
        function text(str, x, y, colour, scale, align) {
            str = String(str).toUpperCase();
            scale = scale || 1;
            var step = 6 * scale, width = str.length * step - scale;
            var left = align === 'center' ? Math.round(x - width / 2) : align === 'right' ? Math.round(x - width) : Math.round(x);
            for (var i = 0; i < str.length; i++) {
                var gl = window.splash.font.glyph(str[i]);
                if (!gl) { continue; }
                ctx.drawImage(image(gl, colour), 0, 0, gl.w, gl.h, left + i * step, Math.round(y), gl.w * scale, gl.h * scale);
            }
        }

        /* A game of lines draws at the size it is shown, so its lines stay
           sharp; the game still thinks in its own width and height. */
        var observer = null;
        function fitCanvas() {
            var r = el.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
            var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
            if (el.canvas.width !== w || el.canvas.height !== h) { el.canvas.width = w; el.canvas.height = h; }
            draw();
        }
        if (g.crisp && window.ResizeObserver) {
            observer = new ResizeObserver(function () { fitCanvas(); });
            observer.observe(el.canvas);
        }

        /* === State ========================================================== */
        function tell() {
            root.setAttribute('data-splash-state', s.mode);
            root.setAttribute('data-splash-score', String(s.score));
            root.setAttribute('data-splash-level', String(s.level));
            root.setAttribute('data-splash-lives', String(s.lives));
        }
        function setMode(m) {
            s.mode = m;
            el.pause.disabled = !(m === 'playing' || m === 'paused');
            el.pause.textContent = m === 'paused' ? 'Resume' : 'Pause';
            tell();
            loop();
        }
        function say(t) { el.status.textContent = t; }
        function newGame(level) {
            s.score = 0; s.lives = 3; s.level = Math.max(1, Math.min(99, level || 1)); s.extraGiven = 0;
            g.newGame(s.level);
            setMode('playing');
            say('Wave ' + s.level);
            root.focus({ preventScroll: true });
        }
        function togglePause() {
            if (s.mode === 'playing') { setMode('paused'); say('Paused'); }
            else if (s.mode === 'paused') { setMode('playing'); say('Wave ' + s.level); root.focus({ preventScroll: true }); }
        }
        function addScore(n) {
            s.score += n;
            if (s.score > s.hi) { s.hi = s.score; }
            var every = g.extraLifeEvery || 0;
            if (every && Math.floor(s.score / every) > (s.extraGiven || 0)) { s.extraGiven = Math.floor(s.score / every); s.lives++; say('An extra life.'); }
            tell();
        }
        function die(ms) { setMode('dying'); s.timer = ms; }
        function cleared(ms) { setMode('cleared'); s.timer = ms; say('Wave ' + s.level + ' cleared'); }
        function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
        function gameOver() {
            setMode('over');
            say('Game over: ' + s.score + ' points.');
            if (s.scores && s.score > 0) {
                s.scores.record(s.score, s.level).then(function (r) {
                    if (r.error) { say('Game over: ' + s.score + ' points. The score could not be kept: ' + r.error); }
                    else if (r.rank) { say('Game over: ' + s.score + ' points, your ' + ordinal(r.rank) + ' best.'); }
                }).catch(function () { });
            }
        }

        /* === The frame loop ================================================= */
        var raf = null, last = 0;
        function moving() { return s.mode === 'playing' || s.mode === 'dying' || s.mode === 'cleared' || (g.busy && g.busy()); }
        function step(dt) {
            if (s.mode === 'dying') {
                s.timer -= dt;
                if (s.timer <= 0) {
                    s.lives--; tell();
                    if (s.lives <= 0) { gameOver(); return; }
                    if (g.respawn) { g.respawn(); }
                    setMode('playing');
                }
                return;
            }
            if (s.mode === 'cleared') {
                s.timer -= dt;
                if (s.timer <= 0) { s.level++; g.newWave(s.level); setMode('playing'); say('Wave ' + s.level); }
                return;
            }
            if (s.mode === 'playing') { g.update(dt, s.input ? s.input.held : {}); }
        }
        function draw() {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            if (g.crisp) { ctx.scale(el.canvas.width / W, el.canvas.height / H); }
            ctx.fillStyle = s.colours.bg;
            ctx.fillRect(0, 0, W, H);
            g.draw(ctx);
        }
        function tick(t) {
            raf = null;
            var dt = last ? Math.min(50, t - last) : 0;
            last = t;
            step(dt);
            if (g.after) { g.after(dt); }
            draw();
            if (moving()) { raf = requestAnimationFrame(tick); } else { last = 0; }
        }
        function loop() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }

        /* === Sound ========================================================== */
        var audio = null;
        function beep(freq, ms, type, gain, to) {
            if (!s.sound.on) { return; }
            try {
                audio = audio || new (window.AudioContext || window.webkitAudioContext)();
                if (audio.state === 'suspended') { audio.resume(); }
                var o = audio.createOscillator(), gn = audio.createGain(), now = audio.currentTime;
                o.type = type || 'square';
                o.frequency.setValueAtTime(freq, now);
                if (to) { o.frequency.exponentialRampToValueAtTime(to, now + ms / 1000); }
                gn.gain.setValueAtTime(gain || 0.04, now);
                gn.gain.exponentialRampToValueAtTime(0.0005, now + ms / 1000);
                o.connect(gn); gn.connect(audio.destination);
                o.start(now); o.stop(now + ms / 1000 + 0.01);
            } catch (err) { s.sound.on = false; }
        }
        var soundKey = 'splash-' + g.game + '-sound';
        function loadSound() {
            if (host.config) { host.config.load(g.game, { sound: true }).then(function (c) { s.sound.on = c.sound !== false; }).catch(function () { }); }
            else { try { s.sound.on = localStorage.getItem(soundKey) !== 'off'; } catch (err) { } }
        }
        function toggleSound() {
            s.sound.on = !s.sound.on;
            if (host.config) { host.config.set(g.game, { sound: s.sound.on }).catch(function () { }); }
            else { try { localStorage.setItem(soundKey, s.sound.on ? 'on' : 'off'); } catch (err) { } }
        }

        /* === Dialogs ======================================================== */
        function openScores() {
            var list = s.scores ? s.scores.list() : Promise.resolve([]);
            list.then(function (l) {
                var where = s.scores ? s.scores.where : 'this browser';
                if (!l.length) { el.scoresBody.innerHTML = '<p>No scores yet. The ten best games are kept in ' + where + '.</p>'; }
                else {
                    var today = new Date().toISOString().slice(0, 10);
                    el.scoresBody.innerHTML = '<table class="splash-scores"><thead><tr><th>#</th><th>Score</th><th>Wave</th><th>Date</th></tr></thead><tbody>' +
                        l.map(function (e, i) { return '<tr' + (s.mode === 'over' && e.score === s.score && e.date === today ? ' class="splash-mine"' : '') + '><td>' + (i + 1) + '</td><td>' + e.score + '</td><td>' + e.level + '</td><td>' + e.date + '</td></tr>'; }).join('') +
                        '</tbody></table><p class="form-help">Kept in ' + where + '.</p>';
                }
                if (!el.scores.open) { el.scores.showModal(); }
            }).catch(function () { });
        }
        function openHelp() { if (!el.help.open) { el.help.showModal(); } }

        /* === Wiring ========================================================= */
        function onClick(e) {
            var b = e.target.closest('[data-action]');
            if (!b || !root.contains(b)) { return; }
            switch (b.getAttribute('data-action')) {
                case 'start': newGame(1); break;
                case 'pause': togglePause(); break;
                case 'scores': openScores(); break;
                case 'help': openHelp(); break;
                case 'close-scores': el.scores.close(); root.focus({ preventScroll: true }); break;
                case 'close-help': el.help.close(); root.focus({ preventScroll: true }); break;
            }
        }
        root.addEventListener('click', onClick);
        function onTheme() { readColours(); draw(); }
        document.addEventListener('pudl:theme-change', onTheme);
        var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        if (mql && mql.addEventListener) { mql.addEventListener('change', onTheme); }

        function levelAsked(st) {
            if (!st) { return null; }
            var v = new URLSearchParams(String(st).replace(/^\?/, '')).get('level');
            return v && /^[1-9][0-9]?$/.test(v) ? +v : null;
        }

        readColours();
        tell();
        s.input = window.splash.input(root, {
            press: function (name) {
                if (name === 'start') { if (s.mode === 'ready' || s.mode === 'over') { newGame(1); } else if (s.mode === 'paused') { togglePause(); } return; }
                if (name === 'pause') { togglePause(); return; }
                if ((s.mode === 'ready' || s.mode === 'over') && name === 'fire') { newGame(1); return; }
                if (g.press) { g.press(name); }
            },
            release: function (name) { if (g.release) { g.release(name); } },
            away: function () { if (s.mode === 'playing') { togglePause(); } },
            pad: g.pad || []
        });
        if (s.input.pad) { root.insertBefore(s.input.pad, el.scores); }
        s.scores = window.splash.scores(host, g.game);
        s.scores.best().then(function (b) { s.hi = b; draw(); }).catch(function () { });
        loadSound();
        /* No drawing yet: the game draws once it holds the shell, and a
           crisp canvas is drawn when its observer first reports its size. */
        var asked = levelAsked(opts.state);
        if (asked) { newGame(asked); }

        var api = {
            state: s, W: W, H: H, el: el,
            setMode: setMode, say: say, addScore: addScore, die: die, cleared: cleared, gameOver: gameOver,
            beep: beep, image: image, text: text, draw: draw, loop: loop, newGame: newGame,
            instance: {
                state: function () { return null; },
                setState: function (st) { var lv = levelAsked(st); if (lv) { newGame(lv); } },
                menus: function () {
                    var items = [
                        { label: 'New game', run: function () { newGame(1); } },
                        { label: s.mode === 'paused' ? 'Resume' : 'Pause', disabled: !(s.mode === 'playing' || s.mode === 'paused'), run: togglePause },
                        '-',
                        { label: 'High scores…', run: openScores },
                        { label: 'Sound', checked: s.sound.on, run: toggleSound }
                    ];
                    return { titles: [{ label: g.title, items: host.identity ? host.identity(root, items) : items }], into: { help: [{ label: g.title + ' help', run: openHelp }] } };
                },
                destroy: function () {
                    if (raf) { cancelAnimationFrame(raf); raf = null; }
                    if (observer) { observer.disconnect(); }
                    root.removeEventListener('click', onClick);
                    document.removeEventListener('pudl:theme-change', onTheme);
                    if (mql && mql.removeEventListener) { mql.removeEventListener('change', onTheme); }
                    if (s.input) { s.input.destroy(); }
                    if (audio) { try { audio.close(); } catch (err) { } }
                    if (g.destroy) { g.destroy(); }
                }
            }
        };
        return api;
    }

    window.splash.shell = shell;
})();

/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Asteroids, a PUDL applet package (../../README.md). The 1979 game, in
   lines on a screen of 640 by 480: the ship turns, thrusts and drifts,
   wrapping at the edges; the rocks break into halves and then into
   pieces; saucers cross now and then and shoot, the small one aiming. The
   shell (../shared/splash-shell.js), bundled in front of this file when
   the package is built, gives it the canvas, the bar, the dialogs, the
   scores, the sound and the loop; this file is the game. */
(function () {
    'use strict';
    var W = 640, H = 480;
    var TURN = 3.8, THRUST = 240, DRAG = 0.55, TOP_SPEED = 420;
    var SHIP_R = 11, BULLET_SPEED = 500, BULLET_LIFE = 1100, BULLETS = 4;
    var SIZES = { 3: { r: 42, points: 20, speed: [30, 70] }, 2: { r: 22, points: 50, speed: [60, 110] }, 1: { r: 11, points: 100, speed: [90, 160] } };
    var HELP =
        '<p>Break the rocks into pieces and the pieces into dust, while the ship drifts where its thrust took it, and keep clear of the saucers: the big one shoots anywhere, the small one shoots at you. Hyperspace takes you somewhere else, which may be worse. A new ship every 10,000 points.</p>' +
        '<dl class="splash-keys">' +
          '<dt>← → or A D</dt><dd>Turn</dd>' +
          '<dt>↑ or W</dt><dd>Thrust</dd>' +
          '<dt>Space or X</dt><dd>Fire</dd>' +
          '<dt>↓, S, Z or Shift</dt><dd>Hyperspace</dd>' +
          '<dt>P or Esc</dt><dd>Pause and resume</dd>' +
          '<dt>Enter</dt><dd>Start a game</dd>' +
        '</dl>' +
        '<p>On a touch screen, the buttons under the game do the same. The game pauses when it loses the keyboard.</p>';

    function rand(a, b) { return a + Math.random() * (b - a); }
    function wrap(o, margin) {
        margin = margin || 0;
        if (o.x < -margin) { o.x += W + 2 * margin; } else if (o.x > W + margin) { o.x -= W + 2 * margin; }
        if (o.y < -margin) { o.y += H + 2 * margin; } else if (o.y > H + margin) { o.y -= H + 2 * margin; }
    }
    function near(a, b, d) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy < d * d; }

    function init(root, opts) {
        var shell = null, S = null, ctx = null, C = null;
        var ship = null, bullets = [], rocks = [], saucer = null, saucerShots = [], saucerTimer = 0, saucerBlip = 0;
        var bits = [], hyper = 0, beat = 0, beatTimer = 0, respawnWait = 0, thrustTone = 0;

        /* A rock: a jagged ring of the size's radius, turning as it goes. */
        function rock(size, x, y) {
            var d = SIZES[size], n = 11, shape = [];
            for (var i = 0; i < n; i++) { shape.push({ a: i / n * Math.PI * 2, r: d.r * rand(0.72, 1.18) }); }
            var a = rand(0, Math.PI * 2), v = rand(d.speed[0], d.speed[1]) + Math.min(S.level - 1, 8) * 6;
            return { size: size, r: d.r, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: 0, spin: rand(-1.2, 1.2), shape: shape };
        }
        function newShip() { return { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, thrusting: false }; }
        function startWave(level) {
            rocks = []; bullets = []; saucer = null; saucerShots = []; bits = []; hyper = 0;
            ship = newShip();
            var count = 4 + Math.min(level - 1, 6);
            for (var i = 0; i < count; i++) {
                var x, y;
                do { x = rand(0, W); y = rand(0, H); } while (near({ x: x, y: y }, ship, 150));
                rocks.push(rock(3, x, y));
            }
            saucerTimer = rand(12000, 20000);
            beat = 0; beatTimer = 0;
        }
        function respawn() { ship = newShip(); hyper = 0; bullets = []; saucerShots = []; respawnWait = 0; }

        function explode(x, y, n, colour, speed) {
            for (var i = 0; i < n; i++) {
                var a = rand(0, Math.PI * 2), v = rand(speed * 0.3, speed);
                bits.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: rand(0, Math.PI * 2), spin: rand(-6, 6), len: rand(3, 9), t: rand(500, 1100), colour: colour });
            }
        }
        function fire() {
            if (S.mode !== 'playing' || !ship || hyper > 0 || bullets.length >= BULLETS) { return; }
            bullets.push({ x: ship.x + Math.cos(ship.a) * SHIP_R, y: ship.y + Math.sin(ship.a) * SHIP_R,
                vx: ship.vx + Math.cos(ship.a) * BULLET_SPEED, vy: ship.vy + Math.sin(ship.a) * BULLET_SPEED, t: BULLET_LIFE });
            shell.beep(1100, 70, 'square', 0.03, 500);
        }
        function hyperspace() {
            if (S.mode !== 'playing' || !ship || hyper > 0) { return; }
            hyper = 900;
            shell.beep(300, 300, 'sawtooth', 0.03, 1800);
        }
        function breakRock(r, index) {
            rocks.splice(index, 1);
            shell.addScore(SIZES[r.size].points);
            explode(r.x, r.y, 6, C.fg, 60);
            shell.beep(r.size === 3 ? 80 : r.size === 2 ? 140 : 220, 180, 'square', 0.05, 30);
            if (r.size > 1) { rocks.push(rock(r.size - 1, r.x, r.y), rock(r.size - 1, r.x, r.y)); }
        }
        function die() {
            explode(ship.x, ship.y, 10, C.danger, 90);
            ship = null;
            shell.die(1800);
            shell.beep(150, 500, 'sawtooth', 0.05, 30);
        }
        function hitsRock(p, pad) {
            for (var i = 0; i < rocks.length; i++) { if (near(p, rocks[i], rocks[i].r * 0.9 + (pad || 0))) { return i; } }
            return -1;
        }

        function update(dt, held) {
            var sec = dt / 1000;
            if (ship) {
                if (hyper > 0) {
                    hyper -= dt;
                    if (hyper <= 0) {
                        hyper = 0;
                        ship.x = rand(40, W - 40); ship.y = rand(40, H - 40); ship.vx = 0; ship.vy = 0;
                        if (Math.random() < 1 / 6) { die(); return; }
                    }
                } else {
                    if (held.left) { ship.a -= TURN * sec; }
                    if (held.right) { ship.a += TURN * sec; }
                    ship.thrusting = !!held.up;
                    if (ship.thrusting) {
                        ship.vx += Math.cos(ship.a) * THRUST * sec;
                        ship.vy += Math.sin(ship.a) * THRUST * sec;
                        var v = Math.hypot(ship.vx, ship.vy);
                        if (v > TOP_SPEED) { ship.vx *= TOP_SPEED / v; ship.vy *= TOP_SPEED / v; }
                        thrustTone -= dt;
                        if (thrustTone <= 0) { thrustTone = 90; shell.beep(55, 100, 'sawtooth', 0.02); }
                    }
                    var drag = Math.pow(DRAG, sec);
                    ship.vx *= drag; ship.vy *= drag;
                    ship.x += ship.vx * sec; ship.y += ship.vy * sec;
                    wrap(ship, SHIP_R);
                    if (hitsRock(ship, SHIP_R * 0.7) >= 0) { die(); return; }
                    if (saucer && near(ship, saucer, saucer.r + SHIP_R * 0.7)) { saucer = null; die(); return; }
                }
            }

            bullets = bullets.filter(function (b) {
                b.t -= dt;
                b.x += b.vx * sec; b.y += b.vy * sec;
                wrap(b, 2);
                var i = hitsRock(b, 1);
                if (i >= 0) { breakRock(rocks[i], i); return false; }
                if (saucer && near(b, saucer, saucer.r)) {
                    shell.addScore(saucer.points);
                    explode(saucer.x, saucer.y, 8, C.warn, 70);
                    shell.beep(90, 250, 'square', 0.05, 30);
                    saucer = null; saucerTimer = rand(10000, 18000);
                    return false;
                }
                return b.t > 0;
            });

            rocks.forEach(function (r) { r.x += r.vx * sec; r.y += r.vy * sec; r.rot += r.spin * sec; wrap(r, r.r); });

            if (saucer) {
                saucer.x += saucer.vx * sec; saucer.y += saucer.vy * sec;
                saucer.turn -= dt;
                if (saucer.turn <= 0) { saucer.turn = rand(800, 2000); saucer.vy = [-60, 0, 60][Math.floor(Math.random() * 3)]; }
                if (saucer.y < 20 || saucer.y > H - 20) { saucer.vy = -saucer.vy; }
                saucer.fire -= dt;
                if (saucer.fire <= 0 && ship && hyper <= 0) {
                    saucer.fire = saucer.small ? rand(900, 1400) : rand(1200, 2000);
                    var aim = saucer.small ? Math.atan2(ship.y - saucer.y, ship.x - saucer.x) + rand(-0.25, 0.25) * Math.max(0.2, 1 - S.score / 40000) : rand(0, Math.PI * 2);
                    saucerShots.push({ x: saucer.x, y: saucer.y, vx: Math.cos(aim) * 320, vy: Math.sin(aim) * 320, t: 1400 });
                    shell.beep(700, 60, 'square', 0.03, 300);
                }
                saucerBlip -= dt;
                if (saucerBlip <= 0) { saucerBlip = 160; shell.beep(saucer.small ? 520 : 380, 120, 'square', 0.015, saucer.small ? 640 : 460); }
                var gone = saucer.vx > 0 ? saucer.x > W + saucer.r : saucer.x < -saucer.r;
                if (gone) { saucer = null; saucerTimer = rand(10000, 18000); }
            } else {
                saucerTimer -= dt;
                if (saucerTimer <= 0 && rocks.length) {
                    var small = S.score >= 10000 ? Math.random() < 0.7 : Math.random() < 0.25, d = Math.random() < 0.5 ? 1 : -1;
                    saucer = { x: d > 0 ? -20 : W + 20, y: rand(60, H - 60), vx: d * (small ? 150 : 100), vy: 0, r: small ? 9 : 16, small: small, points: small ? 1000 : 200, turn: 1000, fire: 800 };
                    saucerBlip = 0;
                }
            }
            saucerShots = saucerShots.filter(function (b) {
                b.t -= dt;
                b.x += b.vx * sec; b.y += b.vy * sec;
                wrap(b, 2);
                var i = hitsRock(b, 1);
                if (i >= 0) { var r = rocks[i]; rocks.splice(i, 1); explode(r.x, r.y, 4, C.fg, 50); if (r.size > 1) { rocks.push(rock(r.size - 1, r.x, r.y), rock(r.size - 1, r.x, r.y)); } return false; }
                if (ship && hyper <= 0 && near(b, ship, SHIP_R * 0.8)) { die(); return false; }
                return b.t > 0;
            });
            if (S.mode !== 'playing') { return; }

            /* The heartbeat quickens as the wave goes on. */
            beatTimer -= dt;
            if (beatTimer <= 0) { beatTimer = Math.max(300, 1000 - (S.level - 1) * 60 - (16 - Math.min(rocks.length, 16)) * 25); shell.beep(beat ? 50 : 60, 120, 'square', 0.03); beat ^= 1; }

            if (!rocks.length && !saucer) { shell.cleared(2000); }
        }

        /* After a death the ship comes back when the middle is clear, or
           after three seconds whatever is there. */
        function respawnWhenClear() {
            var centre = { x: W / 2, y: H / 2 };
            var clear = !rocks.some(function (r) { return near(centre, r, r.r + 90); }) && !(saucer && near(centre, saucer, 120));
            if (clear || respawnWait > 3000) { respawn(); return true; }
            return false;
        }

        /* === Drawing ======================================================== */
        function poly(points, colour, close) {
            ctx.strokeStyle = colour;
            ctx.beginPath();
            points.forEach(function (p, i) { if (i) { ctx.lineTo(p.x, p.y); } else { ctx.moveTo(p.x, p.y); } });
            if (close !== false) { ctx.closePath(); }
            ctx.stroke();
        }
        function shipPoints(s, scale) {
            var k = scale || 1, c = Math.cos(s.a), n = Math.sin(s.a), r = SHIP_R * k;
            function at(fx, fy) { return { x: s.x + (c * fx - n * fy) * r, y: s.y + (n * fx + c * fy) * r }; }
            return [at(1, 0), at(-0.8, 0.7), at(-0.5, 0), at(-0.8, -0.7)];
        }
        function drawRock(r) {
            poly(r.shape.map(function (p) { return { x: r.x + Math.cos(p.a + r.rot) * p.r, y: r.y + Math.sin(p.a + r.rot) * p.r }; }), C.fg);
        }
        function drawSaucer(sc) {
            var r = sc.r;
            poly([{ x: sc.x - r, y: sc.y }, { x: sc.x - r * 0.45, y: sc.y - r * 0.4 }, { x: sc.x + r * 0.45, y: sc.y - r * 0.4 }, { x: sc.x + r, y: sc.y },
                { x: sc.x + r * 0.45, y: sc.y + r * 0.45 }, { x: sc.x - r * 0.45, y: sc.y + r * 0.45 }], C.warn);
            poly([{ x: sc.x - r, y: sc.y }, { x: sc.x + r, y: sc.y }], C.warn, false);
            poly([{ x: sc.x - r * 0.3, y: sc.y - r * 0.4 }, { x: sc.x - r * 0.2, y: sc.y - r * 0.8 }, { x: sc.x + r * 0.2, y: sc.y - r * 0.8 }, { x: sc.x + r * 0.3, y: sc.y - r * 0.4 }], C.warn, false);
        }
        function draw() {
            var text = shell.text, mode = S.mode;
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            text(String(S.score), 16, 10, C.fg, 2);
            text('HI ' + S.hi, W / 2, 10, C.muted, 2, 'center');
            for (var l = 0; l < Math.min(S.lives, 6); l++) { poly(shipPoints({ x: 24 + l * 22, y: 44, a: -Math.PI / 2 }, 0.8), C.accent); }
            rocks.forEach(drawRock);
            if (saucer) { drawSaucer(saucer); }
            ctx.fillStyle = C.fg;
            bullets.forEach(function (b) { ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3); });
            ctx.fillStyle = C.warn;
            saucerShots.forEach(function (b) { ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3); });
            bits.forEach(function (b) {
                var c = Math.cos(b.a) * b.len / 2, n = Math.sin(b.a) * b.len / 2;
                poly([{ x: b.x - c, y: b.y - n }, { x: b.x + c, y: b.y + n }], b.colour, false);
            });
            if (ship && hyper <= 0 && mode !== 'ready' && mode !== 'over') {
                poly(shipPoints(ship), C.accent);
                if (ship.thrusting && Math.floor(Date.now() / 60) % 2) {
                    var c = Math.cos(ship.a), n = Math.sin(ship.a);
                    poly([{ x: ship.x - c * SHIP_R * 0.6 - n * 4, y: ship.y - n * SHIP_R * 0.6 + c * 4 }, { x: ship.x - c * SHIP_R * 1.5, y: ship.y - n * SHIP_R * 1.5 },
                        { x: ship.x - c * SHIP_R * 0.6 + n * 4, y: ship.y - n * SHIP_R * 0.6 - c * 4 }], C.warn, false);
                }
            }
            if (mode === 'ready') {
                text('ASTEROIDS', W / 2, 150, C.fg, 4, 'center');
                text('ENTER OR NEW GAME TO PLAY', W / 2, 200, C.muted, 2, 'center');
                text('TURN  THRUST  FIRE  HYPERSPACE', W / 2, 240, C.muted, 2, 'center');
            } else if (mode === 'paused') {
                text('PAUSED', W / 2, 220, C.fg, 4, 'center');
            } else if (mode === 'over') {
                text('GAME OVER', W / 2, 200, C.danger, 4, 'center');
                text('ENTER OR NEW GAME TO PLAY AGAIN', W / 2, 250, C.muted, 2, 'center');
            } else if (mode === 'cleared') {
                text('WAVE ' + S.level + ' CLEARED', W / 2, 220, C.fg, 4, 'center');
            }
        }

        shell = window.splash.shell(root, opts, {
            game: 'asteroids', title: 'Asteroids', width: W, height: H, help: HELP, crisp: true,
            pad: ['left', 'right', { name: 'up', label: 'Thrust' }, { name: 'fire', label: 'Fire' }, { name: 'alt', label: 'Hyperspace' }],
            extraLifeEvery: 10000,
            newGame: startWave, newWave: startWave,
            respawn: respawn,
            update: update, draw: draw,
            press: function (name) { if (name === 'fire') { fire(); } else if (name === 'alt' || name === 'down') { hyperspace(); } },
            after: function (dt) {
                var sec = dt / 1000;
                bits = bits.filter(function (b) { b.t -= dt; b.x += b.vx * sec; b.y += b.vy * sec; b.a += b.spin * sec; return b.t > 0; });
                /* Rocks keep drifting while the ship is gone, and the ship
                   comes back only when the middle is clear. */
                if (S.mode === 'dying') {
                    rocks.forEach(function (r) { r.x += r.vx * sec; r.y += r.vy * sec; r.rot += r.spin * sec; wrap(r, r.r); });
                    if (S.timer <= dt && S.lives > 1 && !respawnWhenClear()) { S.timer += dt; respawnWait += dt; }
                }
            },
            busy: function () { return bits.length > 0; }
        });
        S = shell.state; ctx = S.ctx; C = S.colours;
        startWave(1); ship = null; rocks.forEach(function (r) { r.vx *= 0.5; r.vy *= 0.5; });
        shell.draw();
        return shell.instance;
    }

    window.pudlApplets.register('asteroids', { init: init });
})();
