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
/* Space Invaders, a PUDL applet package (../../README.md). The 1978 game:
   fifty-five invaders march across a canvas of 224 by 256 pixels, dropping
   a row and speeding up as their number falls, while the cannon shoots
   from behind four shields that crumble under fire. The shell
   (../shared/splash-shell.js) gives it the canvas, the bar, the dialogs,
   the scores, the sound and the loop; this file is the game. */
(function () {
    'use strict';
    /* The shared modules are bundled in front of this file when the
       package is built (applet.json, "bundle"), so window.splash is here. */
    var W = 224, H = 256;
    var PLAYER_Y = 216, SHIELD_Y = 184, GROUND_Y = 247;

    function sprite(id, rows) { return { id: id, w: rows[0].length, h: rows.length, rows: rows }; }
    var SQUID = [
        sprite('sa', ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '..X..X..', '.X.XX.X.', 'X.X..X.X']),
        sprite('sb', ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X.XX.X.', 'X......X', '.X....X.'])
    ];
    var CRAB = [
        sprite('ca', ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...']),
        sprite('cb', ['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXX.XXX.XXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.'])
    ];
    var OCTOPUS = [
        sprite('oa', ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXX..XX..XXX', 'XXXXXXXXXXXX', '...XX..XX...', '..XX.XX.XX..', 'XX........XX']),
        sprite('ob', ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXX..XX..XXX', 'XXXXXXXXXXXX', '..XXX..XXX..', '.XX..XX..XX.', '..XX....XX..'])
    ];
    var PLAYER = sprite('pl', ['......X......', '.....XXX.....', '.....XXX.....', '.XXXXXXXXXXX.', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX']);
    var UFO = sprite('uf', ['.....XXXXXX.....', '...XXXXXXXXXX...', '..XXXXXXXXXXXX..', '.XX.XX.XX.XX.XX.', 'XXXXXXXXXXXXXXXX', '...XXX....XXX...', '....X......X....']);
    var BOOM = sprite('bm', ['.X..X...X..X.', '..X..X.X..X..', '...X.....X...', 'XX.........XX', '...X.....X...', '..X..X.X..X..', '.X..X...X..X.']);
    var PLAYER_BOOM = [
        sprite('pa', ['....X........', '.X.......X...', '...X..X......', 'X......X.X..X', '..X.XXXX.....', '...XXXXXXX...', '.XXXXXXXXXXX.']),
        sprite('pb', ['........X....', '...X.....X...', '......X..X...', '.X.X......X.X', '.....XXXX.X..', '...XXXXXXX...', '.XXXXXXXXXXX.'])
    ];
    var SHIELD = sprite('sh', [
        '....XXXXXXXXXXXXXX....', '...XXXXXXXXXXXXXXXX...', '..XXXXXXXXXXXXXXXXXX..', '.XXXXXXXXXXXXXXXXXXXX.',
        'XXXXXXXXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXXXXXXXX',
        'XXXXXXXXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXXXXXXXX',
        'XXXXXXXX......XXXXXXXX', 'XXXXXXX........XXXXXXX', 'XXXXXX..........XXXXXX', 'XXXXXX..........XXXXXX'
    ]);
    var TYPES = [
        { frames: SQUID, points: 30 },
        { frames: CRAB, points: 20 },
        { frames: CRAB, points: 20 },
        { frames: OCTOPUS, points: 10 },
        { frames: OCTOPUS, points: 10 }
    ];
    var MARCH = [110, 98, 87, 78];
    var HELP =
        '<p>Shoot the invaders before they reach the ground. Each wave starts lower and marches faster as its numbers fall. A saucer now and then is worth more. You have three cannons, and a fourth at 1,500 points.</p>' +
        '<dl class="splash-keys">' +
          '<dt>← → or A D</dt><dd>Move</dd>' +
          '<dt>Space or X</dt><dd>Fire</dd>' +
          '<dt>P or Esc</dt><dd>Pause and resume</dd>' +
          '<dt>Enter</dt><dd>Start a game</dd>' +
        '</dl>' +
        '<p>On a touch screen, the buttons under the game do the same. The game pauses when it loses the keyboard.</p>';

    function init(root, opts) {
        var shell = null, S = null, ctx = null, C = null;
        var aliens = [], fx = 0, fy = 0, dir = 1, frame = 0, stepTimer = 0, marchNote = 0;
        var player = { x: (W - PLAYER.w) / 2, w: PLAYER.w }, shot = null, bombs = [], bombTimer = 0;
        var ufo = null, ufoTimer = 0, ufoBlip = 0, toast = null, booms = [], shields = [];

        function newShields() {
            return [32, 80, 128, 176].map(function (x) {
                var mask = new Uint8Array(SHIELD.w * SHIELD.h);
                for (var y = 0; y < SHIELD.h; y++) { for (var i = 0; i < SHIELD.w; i++) { mask[y * SHIELD.w + i] = SHIELD.rows[y][i] === 'X' ? 1 : 0; } }
                return { x: x, y: SHIELD_Y, w: SHIELD.w, h: SHIELD.h, mask: mask, img: null, dirty: true };
            });
        }
        function startWave(level) {
            aliens = [];
            for (var row = 0; row < 5; row++) {
                for (var col = 0; col < 11; col++) {
                    var t = TYPES[row], w = t.frames[0].w;
                    aliens.push({ type: t, col: col, row: row, ax: col * 16 + Math.floor((16 - w) / 2), ay: row * 16, w: w, h: 8, alive: true });
                }
            }
            fx = 24; fy = 40 + Math.min(level - 1, 6) * 8; dir = 1; frame = 0; stepTimer = 0;
            shot = null; bombs = []; bombTimer = 1500; ufo = null; ufoTimer = 15000 + Math.random() * 10000; booms = []; toast = null;
            player.x = (W - PLAYER.w) / 2;
            shields = newShields();
        }
        function alive() { return aliens.filter(function (a) { return a.alive; }); }
        function stepInterval() { return Math.max(35, 25 + alive().length * 12); }
        function fire() {
            if (S.mode !== 'playing' || shot) { return; }
            shot = { x: Math.round(player.x + player.w / 2), y: PLAYER_Y - 4 };
            shell.beep(880, 80, 'sawtooth', 0.04, 220);
        }
        function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
        function shieldHit(s, px, py, blast) {
            var lx = Math.floor(px - s.x), ly = Math.floor(py - s.y);
            if (lx < 0 || ly < 0 || lx >= s.w || ly >= s.h || !s.mask[ly * s.w + lx]) { return false; }
            for (var dy = -blast; dy <= blast; dy++) {
                for (var dx = -blast - 1; dx <= blast + 1; dx++) {
                    var x = lx + dx, y = ly + dy;
                    if (x < 0 || y < 0 || x >= s.w || y >= s.h) { continue; }
                    if (Math.abs(dx) + Math.abs(dy) <= blast + 1 || Math.random() < 0.4) { s.mask[y * s.w + x] = 0; }
                }
            }
            s.dirty = true;
            return true;
        }
        function die() {
            bombs = []; shot = null;
            shell.die(1200);
            shell.beep(160, 400, 'square', 0.05, 40);
        }

        function update(dt, held) {
            var move = 90 * dt / 1000;
            if (held.left) { player.x = Math.max(8, player.x - move); }
            if (held.right) { player.x = Math.min(W - 8 - player.w, player.x + move); }

            if (shot) {
                shot.y -= 240 * dt / 1000;
                var sr = { x: shot.x, y: shot.y, w: 1, h: 4 };
                var target = null;
                for (var i = 0; i < aliens.length && !target; i++) {
                    var a = aliens[i];
                    if (a.alive && hit(sr, { x: fx + a.ax, y: fy + a.ay, w: a.w, h: a.h })) { target = a; }
                }
                if (target) {
                    target.alive = false;
                    booms.push({ x: fx + target.ax + (target.w - BOOM.w) / 2, y: fy + target.ay, t: 250, spr: BOOM, colour: C.fg });
                    shell.addScore(target.type.points);
                    shot = null;
                    shell.beep(200, 120, 'square', 0.05, 60);
                    if (!alive().length) { shell.cleared(1500); return; }
                } else if (ufo && hit(sr, { x: ufo.x, y: ufo.y, w: UFO.w, h: UFO.h })) {
                    shell.addScore(ufo.points);
                    toast = { text: String(ufo.points), x: ufo.x, y: ufo.y, t: 1000 };
                    ufo = null; shot = null;
                    shell.beep(1200, 200, 'square', 0.05, 300);
                } else if (shields.some(function (s) { return shieldHit(s, shot.x, shot.y, 1); })) {
                    shot = null;
                } else if (shot.y < 20) {
                    booms.push({ x: shot.x - 3, y: 16, t: 200, spr: BOOM, colour: C.danger });
                    shot = null;
                }
            }

            stepTimer += dt;
            var interval = stepInterval();
            if (stepTimer >= interval) {
                stepTimer = 0;
                var live = alive(), left = W, right = 0;
                live.forEach(function (a) { left = Math.min(left, fx + a.ax); right = Math.max(right, fx + a.ax + a.w); });
                if ((dir > 0 && right + 2 > W - 8) || (dir < 0 && left - 2 < 8)) { fy += 8; dir = -dir; }
                else { fx += dir * 2; }
                frame ^= 1;
                shell.beep(MARCH[marchNote], 60, 'square', 0.03);
                marchNote = (marchNote + 1) % MARCH.length;
                live.forEach(function (a) { shields.forEach(function (s) { if (hit({ x: fx + a.ax, y: fy + a.ay, w: a.w, h: a.h }, s)) { s.mask.fill(0); s.dirty = true; } }); });
                if (live.some(function (a) { return fy + a.ay + a.h >= PLAYER_Y; })) { S.lives = 1; die(); return; }
            }

            bombTimer -= dt;
            if (bombTimer <= 0) {
                bombTimer = (1400 - Math.min(S.level, 10) * 80) * (0.6 + Math.random() * 0.8);
                var most = Math.min(3, 1 + Math.floor(S.level / 2));
                if (bombs.length < most) {
                    var cols = {};
                    alive().forEach(function (a) { if (!cols[a.col] || a.row > cols[a.col].row) { cols[a.col] = a; } });
                    var keys = Object.keys(cols);
                    if (keys.length) {
                        var from = cols[keys[Math.floor(Math.random() * keys.length)]];
                        bombs.push({ x: fx + from.ax + Math.floor(from.w / 2), y: fy + from.ay + from.h, w: 2, h: 6, wiggle: 0 });
                    }
                }
            }
            var fall = (80 + Math.min(S.level, 10) * 8) * dt / 1000, killed = false;
            bombs = bombs.filter(function (b) {
                b.y += fall; b.wiggle += dt;
                if (shields.some(function (s) { return shieldHit(s, b.x, b.y + b.h, 1); })) { return false; }
                if (!killed && hit(b, { x: player.x, y: PLAYER_Y, w: player.w, h: PLAYER.h })) { killed = true; return false; }
                return b.y < GROUND_Y - 1;
            });
            if (killed) { die(); return; }

            if (ufo) {
                ufo.x += ufo.dir * 40 * dt / 1000;
                ufoBlip -= dt;
                if (ufoBlip <= 0) { ufoBlip = 300; shell.beep(620, 90, 'square', 0.02, 820); }
                if (ufo.x < -UFO.w || ufo.x > W) { ufo = null; ufoTimer = 15000 + Math.random() * 10000; }
            } else {
                ufoTimer -= dt;
                if (ufoTimer <= 0 && alive().length >= 8) {
                    var d = Math.random() < 0.5 ? 1 : -1;
                    ufo = { x: d > 0 ? -UFO.w : W, y: 24, dir: d, points: [50, 100, 150, 300][Math.floor(Math.random() * 4)] };
                    ufoBlip = 0;
                }
            }
        }

        function pad(n) { return ('0000' + n).slice(-4); }
        function draw() {
            var text = shell.text, image = shell.image, mode = S.mode;
            text('SCORE ' + pad(S.score), 8, 5, C.fg);
            text('HI ' + pad(S.hi), W / 2, 5, C.muted, 1, 'center');
            for (var l = 0; l < Math.min(S.lives - 1, 5); l++) { ctx.drawImage(image(PLAYER, C.accent), W - 8 - (l + 1) * 16, 4); }
            ctx.fillStyle = C.positive;
            ctx.fillRect(8, GROUND_Y, W - 16, 1);
            shields.forEach(function (s) {
                if (s.dirty || !s.img) {
                    var c = s.img || document.createElement('canvas');
                    c.width = s.w; c.height = s.h;
                    var g = c.getContext('2d');
                    g.clearRect(0, 0, s.w, s.h);
                    g.fillStyle = C.positive;
                    for (var y = 0; y < s.h; y++) { for (var x = 0; x < s.w; x++) { if (s.mask[y * s.w + x]) { g.fillRect(x, y, 1, 1); } } }
                    s.img = c; s.dirty = false;
                }
                ctx.drawImage(s.img, s.x, s.y);
            });
            aliens.forEach(function (a) { if (a.alive) { ctx.drawImage(image(a.type.frames[frame], C.fg), fx + a.ax, fy + a.ay); } });
            booms.forEach(function (b) { ctx.drawImage(image(b.spr, b.colour), Math.round(b.x), Math.round(b.y)); });
            if (ufo) { ctx.drawImage(image(UFO, C.warn), Math.round(ufo.x), ufo.y); }
            if (toast) { text(toast.text, Math.round(toast.x + UFO.w / 2), toast.y, C.warn, 1, 'center'); }
            if (shot) { ctx.fillStyle = C.accent; ctx.fillRect(shot.x, Math.round(shot.y), 1, 4); }
            ctx.fillStyle = C.danger;
            bombs.forEach(function (b) { var z = Math.floor(b.wiggle / 100) % 2; ctx.fillRect(Math.round(b.x) + z, Math.round(b.y), 1, 3); ctx.fillRect(Math.round(b.x) + 1 - z, Math.round(b.y) + 3, 1, 3); });
            if (mode === 'dying') { ctx.drawImage(image(PLAYER_BOOM[Math.floor(S.timer / 150) % 2], C.danger), Math.round(player.x), PLAYER_Y + 1); }
            else if (mode !== 'ready' && mode !== 'over') { ctx.drawImage(image(PLAYER, C.accent), Math.round(player.x), PLAYER_Y); }
            if (mode === 'ready') {
                /* The title and the table end above the shields at 184. */
                text('SPACE INVADERS', W / 2, 52, C.fg, 2, 'center');
                text('ENTER OR NEW GAME TO PLAY', W / 2, 76, C.muted, 1, 'center');
                ctx.drawImage(image(SQUID[0], C.fg), 76, 100); text('= 30 POINTS', 96, 100, C.muted);
                ctx.drawImage(image(CRAB[0], C.fg), 74, 116); text('= 20 POINTS', 96, 116, C.muted);
                ctx.drawImage(image(OCTOPUS[0], C.fg), 74, 132); text('= 10 POINTS', 96, 132, C.muted);
                ctx.drawImage(image(UFO, C.warn), 72, 148); text('= ? MYSTERY', 96, 148, C.muted);
            } else if (mode === 'paused') {
                text('PAUSED', W / 2, 116, C.fg, 2, 'center');
            } else if (mode === 'over') {
                text('GAME OVER', W / 2, 108, C.danger, 2, 'center');
                text('ENTER OR NEW GAME TO PLAY AGAIN', W / 2, 132, C.muted, 1, 'center');
            } else if (mode === 'cleared') {
                text('WAVE ' + S.level + ' CLEARED', W / 2, 116, C.fg, 2, 'center');
            }
        }

        shields = newShields();
        shell = window.splash.shell(root, opts, {
            game: 'invaders', title: 'Space Invaders', width: W, height: H, help: HELP,
            pad: ['left', 'right', { name: 'fire', label: 'Fire' }], extraLifeEvery: 1500,
            newGame: startWave, newWave: startWave,
            respawn: function () { player.x = (W - PLAYER.w) / 2; },
            update: update, draw: draw,
            press: function (name) { if (name === 'fire') { fire(); } },
            after: function (dt) {
                booms = booms.filter(function (b) { b.t -= dt; return b.t > 0; });
                if (toast) { toast.t -= dt; if (toast.t <= 0) { toast = null; } }
            },
            busy: function () { return booms.length > 0 || !!toast; },
            recolour: function () { shields.forEach(function (s) { s.dirty = true; }); }
        });
        S = shell.state; ctx = S.ctx; C = S.colours;
        shell.draw();
        return shell.instance;
    }

    window.pudlApplets.register('invaders', { init: init });
})();
