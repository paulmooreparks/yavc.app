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
/* Pantry Raid, a PUDL applet package (../../README.md). A maze chase: a
   mouse eats every crumb in a pantry while four cats hunt it, and a bell
   sends the cats running for a few seconds. There are three pantries,
   drawn by hand, and the levels go round them in turn. Every one has the
   cats' den in the middle, with the mouse starting under it, a bell in
   each corner, and a passage through the side walls that comes out on
   the other side. The cats leave the den one at a time, hunt and go off
   to their corners by turns, and a cat that is caught slinks back to the
   den. The shell (../shared/splash-shell.js) gives it the canvas, the
   bar, the dialogs, the scores, the sound and the loop; this file is the
   game. */
(function () {
    'use strict';
    /* The shared modules are bundled in front of this file when the
       package is built (applet.json, "bundle"), so window.splash is here. */
    var T = 12, COLS = 21, ROWS = 25, TOP = 12, FOOT = 14;
    var W = COLS * T, H = TOP + ROWS * T + FOOT;
    var DIR = { left: { x: -1, y: 0, a: -Math.PI / 2 }, right: { x: 1, y: 0, a: Math.PI / 2 }, up: { x: 0, y: -1, a: 0 }, down: { x: 0, y: 1, a: Math.PI } };
    var DIRS = [DIR.up, DIR.left, DIR.down, DIR.right];
    /* The same in every pantry: where the mouse starts, the tile outside
       the den's door, the door, the three tiles of the den with its
       middle first, the corners the cats go off to, and the bells. The
       den is in the middle of the board. */
    var MX = (COLS - 1) / 2, MY = (ROWS - 1) / 2;
    var START = { x: MX, y: MY + 2 }, EXIT = { x: MX, y: MY - 2 }, DOOR = { x: MX, y: MY - 1 };
    var DEN = [{ x: MX, y: MY }, { x: MX - 1, y: MY }, { x: MX + 1, y: MY }];
    var CORNERS = [{ x: COLS - 2, y: 1 }, { x: 1, y: 1 }, { x: COLS - 2, y: ROWS - 2 }, { x: 1, y: ROWS - 2 }];
    var BELLS = [{ x: 1, y: 3 }, { x: COLS - 2, y: 3 }, { x: 1, y: ROWS - 4 }, { x: COLS - 2, y: ROWS - 4 }];
    /* The cats hunt for CHASE milliseconds, then go to their corners for
       SCATTER, and so on, starting with the corners. */
    var SCATTER = 5000, CHASE = 18000;
    /* The pantries: the left half of each and its middle column. The
       right half is the left one mirrored. The corridors run three tiles
       apart, so walls are two tiles thick and the ways across between
       two corridors are two tiles long; no crumb is left on its own in a
       nook, and a run along any corridor goes a good way before it has
       to turn. A # is wall, a dot is floor
       with a crumb, a space is floor of the passage through the side
       walls, where there are no crumbs and the cats are slow, a c is the
       den and a - is its door, which only the cats pass.
       ../../tools/test-pantry-maze.js checks that each is walled all
       round but for the passage, has no dead end, and has floor under
       the mouse, the bells and the cats' corners. */
    var PANTRIES = [[
        '###########',
        '#..........',
        '#.##.######',
        '#.##.######',
        '#..........',
        '#.##.##.###',
        '#.##.##.###',
        '#....##....',
        '####.##.###',
        '####.##.###',
        '####.......',
        '####.##.##-',
        '    .##.#cc',
        '####.##.###',
        '####.......',
        '####.##.###',
        '####.##.###',
        '#..........',
        '#.##.######',
        '#.##.######',
        '#....##....',
        '#.##.##.###',
        '#.##.##.###',
        '#..........',
        '###########'
    ], [
        '###########',
        '#..........',
        '#.##.##.###',
        '#.##.##.###',
        '#..........',
        '#.#####.###',
        '#.#####.###',
        '#..........',
        '####.##.##.',
        '####.##.##.',
        '####.......',
        '####.##.##-',
        '    .##.#cc',
        '####.##.###',
        '####.......',
        '####.##.###',
        '####.##.###',
        '#..........',
        '#.##.##.###',
        '#.##.##.###',
        '#..........',
        '#.#####.###',
        '#.#####.###',
        '#..........',
        '###########'
    ], [
        '###########',
        '#..........',
        '#.##.##.###',
        '#.##.##.###',
        '#.##.##.###',
        '#..........',
        '####.##.##.',
        '####.##.##.',
        '####.......',
        '####.##.###',
        '####.##....',
        '####.##.##-',
        '    .##.#cc',
        '####.##.###',
        '####.......',
        '####.##.###',
        '#..........',
        '#.##.##.###',
        '#.##.##.###',
        '#....##....',
        '#.##.##.###',
        '#.##.##.###',
        '#.##.##.###',
        '#..........',
        '###########'
    ]];

    function sprite(id, rows) { return { id: id, w: rows[0].length, h: rows.length, rows: rows }; }
    /* The mouse from above, nose up; it is turned to face the way it runs. */
    var MOUSE = [
        sprite('pm1', ['....X....', '...XXX...', '.X.XXX.X.', 'XXXXXXXXX', 'XX.XXX.XX', '.XXXXXXX.', '.XXXXXXX.', '.XXXXXXX.', '..XXXXX..', '....X....', '...X.....']),
        sprite('pm2', ['....X....', '...XXX...', '.X.XXX.X.', 'XXXXXXXXX', 'XX.XXX.XX', '.XXXXXXX.', '.XXXXXXX.', '.XXXXXXX.', '..XXXXX..', '....X....', '.....X...'])
    ];
    var CAT = sprite('pc', ['X.........X', 'XX.......XX', 'XXX.....XXX', 'XXXXXXXXXXX', 'XXXXXXXXXXX', 'XX..XXX..XX', 'XX..XXX..XX', 'XXXXX.XXXXX', 'XXXXXXXXXXX', '.XXXXXXXXX.']);
    /* A caught cat on its way back to the den: only its eyes. */
    var EYES = sprite('pe', ['XX...XX', 'XX...XX']);
    var BELL = sprite('pb', ['...X...', '..XXX..', '.XXXXX.', '.XXXXX.', '.XXXXX.', 'XXXXXXX', '...X...']);
    var CHEESE = sprite('pz', ['......XXX', '....XXXXX', '..XXXXXXX', 'XXXXXXXXX', 'X.XXX.XXX', 'XXXXXXX.X', 'XXXXXXXXX']);
    var HELP =
        '<p>Eat every crumb in the pantry and keep away from the four cats. They come out of their den in the middle one at a time and hunt you, each in its own way, and every so often they give up for a few seconds and go off to their own corners. Ring one of the bells in the corners and the cats run from you for a few seconds; catch one while it runs and it slinks back to the den.</p>' +
        '<p>The passage through the side walls comes out on the other side, and the cats are slow in it. A piece of cheese appears under the den once half the crumbs are gone. There are three pantries, which take turns, and the cats get faster every level. You have three mice, and another every 5,000 points.</p>' +
        '<dl class="splash-keys">' +
          '<dt>Arrows or W A S D</dt><dd>Turn; the mouse keeps running until a wall stops it</dd>' +
          '<dt>P or Esc</dt><dd>Pause and resume</dd>' +
          '<dt>Enter</dt><dd>Start a game</dd>' +
        '</dl>' +
        '<p>On a touch screen, the buttons under the game do the same. The game pauses when it loses the keyboard.</p>';

    /* A column, brought back onto the board from past either side, for
       the passage through the side walls. */
    function wrap(x) { return (x + COLS) % COLS; }
    /* A level's maze, as COLS by ROWS tiles. open is the floor the mouse
       runs on (1) or not (0), crumbs the floor that starts with a crumb,
       den the den (2) and its door (1), and slow the floor where the cats
       are slow. The levels go round the pantries in turn. */
    function makeMaze(level) {
        var rows = PANTRIES[(level - 1) % PANTRIES.length], n = COLS * ROWS, mid = (COLS - 1) / 2;
        var open = new Uint8Array(n), crumbs = new Uint8Array(n), den = new Uint8Array(n), slow = new Uint8Array(n);
        for (var y = 0; y < ROWS; y++) {
            for (var x = 0; x <= mid; x++) {
                var ch = rows[y].charAt(x), tiles = [y * COLS + x, y * COLS + (COLS - 1 - x)];
                for (var k = 0; k < 2; k++) {
                    var i = tiles[k];
                    if (ch === '.') { open[i] = 1; crumbs[i] = 1; }
                    else if (ch === ' ') { open[i] = 1; slow[i] = 1; }
                    else if (ch === 'c') { den[i] = 2; }
                    else if (ch === '-') { den[i] = 1; }
                }
            }
        }
        function inside(y) { return y >= 0 && y < ROWS; }
        return {
            open: open, crumbs: crumbs, den: den, slow: slow,
            isOpen: function (x, y) { return inside(y) && open[y * COLS + wrap(x)] === 1; },
            inDen: function (x, y) { return inside(y) && den[y * COLS + wrap(x)] > 0; },
            isSlow: function (x, y) { return inside(y) && slow[y * COLS + wrap(x)] === 1; }
        };
    }
    /* How many tiles each tile is from the middle of the den, by the
       floor, the door and the den: the way home for a caught cat. */
    function homeward(maze) {
        var far = new Int16Array(COLS * ROWS).fill(9999), queue = [DEN[0]];
        far[DEN[0].y * COLS + DEN[0].x] = 0;
        for (var n = 0; n < queue.length; n++) {
            var t = queue[n], d = far[t.y * COLS + t.x];
            for (var k = 0; k < DIRS.length; k++) {
                var x = wrap(t.x + DIRS[k].x), y = t.y + DIRS[k].y;
                if ((maze.isOpen(x, y) || maze.inDen(x, y)) && far[y * COLS + x] > d + 1) { far[y * COLS + x] = d + 1; queue.push({ x: x, y: y }); }
            }
        }
        return far;
    }
    /* For the checks that need no browser (../../tools/test-pantry-maze.js). */
    window.splash.pantry = {
        maze: makeMaze, homeward: homeward, pantries: PANTRIES.length, cols: COLS, rows: ROWS,
        start: START, exit: EXIT, door: DOOR, den: DEN, corners: CORNERS, bells: BELLS
    };

    var source = new URL(document.currentScript.src);
    async function init(root, opts) {
        var library = new URL('grid-motion.js', source); library.search = source.search;
        await window.yavcUtil.loadScript(library.href);
        var motion = window.yavcPantryMotion.create(COLS, DIR), timing = window.yavcPantryMotion.timer(step);
        opts = opts || {};
        var shell = null, S = null, ctx = null, C = null;
        var maze = makeMaze(1), home = homeward(maze), mazeImg = null, crumbs = new Uint8Array(COLS * ROWS), left = 0, total = 0;
        var bells = [], cheese = null, cheeseDone = false, toast = null;
        var mouse = { x: START.x, y: START.y, p: 0, dir: null, face: DIR.up }, want = null, cats = [];
        var phase = 0, scatter = true, combo = 0, clock = 0, munch = 0;

        /* The first cat stands outside the door and the others wait in
           the den, each a while longer than the one before. A cat is in
           the den, leaving it, hunting, or going home. */
        function place() {
            mouse = { x: START.x, y: START.y, p: 0, dir: null, face: DIR.up };
            want = DIR.left; mouse.dir = DIR.left; mouse.face = DIR.left;
            timing.reset(); phase = 0; scatter = true; combo = 0;
            cats = CORNERS.map(function (corner, i) {
                var at = i === 0 ? EXIT : DEN[i - 1];
                var c = { kind: i, corner: corner, x: at.x, y: at.y, p: 0, dir: null, mode: 'den', wait: i === 0 ? 800 : 500 + i * 3500, scared: 0 };
                c.can = function (x, y) { return maze.isOpen(x, y) || ((c.mode === 'leave' || c.mode === 'home') && maze.inDen(x, y)); };
                return c;
            });
        }
        function startWave(level) {
            maze = makeMaze(level); home = homeward(maze); mazeImg = null;
            crumbs = new Uint8Array(maze.crumbs);
            crumbs[START.y * COLS + START.x] = 0;
            BELLS.forEach(function (t) { crumbs[t.y * COLS + t.x] = 0; });
            total = 0;
            for (var i = 0; i < crumbs.length; i++) { total += crumbs[i]; }
            left = total;
            bells = BELLS.map(function (b) { return { x: b.x, y: b.y, on: true }; });
            cheese = null; cheeseDone = false; toast = null;
            place();
        }

        var advance = motion.advance;
        function opposite(d) { return d === DIR.left ? DIR.right : d === DIR.right ? DIR.left : d === DIR.up ? DIR.down : DIR.up; }
        var reverse = motion.reverse, at = motion.position;

        function chooseMouse(m) {
            if (want && maze.isOpen(m.x + want.x, m.y + want.y)) { return want; }
            if (m.dir && maze.isOpen(m.x + m.dir.x, m.y + m.dir.y)) { return m.dir; }
            return null;
        }
        function ring() {
            shell.addScore(50);
            combo = 0;
            var time = Math.max(2500, 7000 - (S.level - 1) * 500);
            cats.forEach(function (c) { if (c.mode === 'hunt') { c.scared = time; reverse(c); } });
            shell.beep(1300, 260, 'triangle', 0.06, 900);
        }
        function arrive(m) {
            var i = m.y * COLS + m.x;
            if (crumbs[i]) {
                crumbs[i] = 0; left--;
                shell.addScore(10);
                munch ^= 1;
                shell.beep(munch ? 520 : 440, 40, 'square', 0.03);
                if (!cheeseDone && left <= total / 2) { cheeseDone = true; cheese = { t: 10000 }; }
            }
            bells.forEach(function (b) { if (b.on && b.x === m.x && b.y === m.y) { b.on = false; ring(); } });
            if (cheese && m.x === START.x && m.y === START.y) {
                var points = Math.min(500, 100 * S.level);
                shell.addScore(points);
                toast = { text: String(points), x: START.x, y: START.y, t: 900 };
                cheese = null;
                shell.beep(700, 200, 'triangle', 0.06, 1400);
            }
        }

        /* Where a hunting cat is heading. The first goes for the mouse, the
           second for the corridor ahead of it, the third only when the
           mouse comes near, and the fourth stands guard over the nearest
           bell that is left. */
        function target(c) {
            if (c.kind === 1) { return { x: mouse.x + mouse.face.x * 4, y: mouse.y + mouse.face.y * 4 }; }
            if (c.kind === 3) {
                var best = null, far = 1e9;
                bells.forEach(function (b) {
                    var d = (b.x - c.x) * (b.x - c.x) + (b.y - c.y) * (b.y - c.y);
                    if (b.on && d < far && d > 4) { far = d; best = b; }
                });
                if (best) { return best; }
            }
            return mouse;
        }
        function chooseCat(c) {
            if (c.mode === 'den') { return null; }
            /* Out of the den: to its middle, then up through the door. */
            if (c.mode === 'leave') { return c.x < EXIT.x ? DIR.right : c.x > EXIT.x ? DIR.left : DIR.up; }
            /* Home: always to the tile that is nearer the den. */
            if (c.mode === 'home') {
                var back = null, near = home[c.y * COLS + c.x];
                DIRS.forEach(function (d) {
                    var x = wrap(c.x + d.x), y = c.y + d.y;
                    if (c.can(x, y) && home[y * COLS + x] < near) { near = home[y * COLS + x]; back = d; }
                });
                return back;
            }
            var ways = DIRS.filter(function (d) { return maze.isOpen(c.x + d.x, c.y + d.y) && !(c.dir && d === opposite(c.dir)); });
            if (!ways.length) { ways = DIRS.filter(function (d) { return maze.isOpen(c.x + d.x, c.y + d.y); }); }
            if (!ways.length) { return null; }
            var close = (mouse.x - c.x) * (mouse.x - c.x) + (mouse.y - c.y) * (mouse.y - c.y) < 36;
            if (c.scared > 0 || (!scatter && c.kind === 2 && !close)) { return ways[Math.floor(Math.random() * ways.length)]; }
            var t = scatter ? c.corner : target(c), best = ways[0], least = 1e9;
            ways.forEach(function (d) {
                var dx = c.x + d.x - t.x, dy = c.y + d.y - t.y, far = dx * dx + dy * dy;
                if (far < least) { least = far; best = d; }
            });
            return best;
        }
        function arriveCat(c) {
            if (c.mode === 'leave' && c.x === EXIT.x && c.y === EXIT.y) { c.mode = 'hunt'; }
            else if (c.mode === 'home' && c.x === DEN[0].x && c.y === DEN[0].y) { c.mode = 'den'; c.wait = 2500; c.dir = null; }
        }

        function step(dt) {
            clock += dt; phase += dt;
            /* The cats turn round when they change between hunting and
               going to their corners, which is the mouse's warning. */
            var now = phase % (SCATTER + CHASE) < SCATTER;
            if (now !== scatter) { scatter = now; cats.forEach(function (c) { if (c.mode === 'hunt' && c.scared <= 0) { reverse(c); } }); }
            advance(mouse, 6.6 * dt / 1000, chooseMouse, arrive, maze.isOpen);
            if (mouse.dir) { mouse.face = mouse.dir; }
            if (left <= 0) { shell.beep(660, 500, 'triangle', 0.06, 1320); shell.cleared(1500); return false; }

            var speed = Math.min(6, 4.6 + (S.level - 1) * 0.2), caught = false, m = at(mouse);
            cats.forEach(function (c) {
                if (c.mode === 'den') {
                    c.wait -= dt;
                    if (c.wait <= 0) { c.mode = c.x === EXIT.x && c.y === EXIT.y ? 'hunt' : 'leave'; }
                    return;
                }
                c.scared = c.mode === 'hunt' ? Math.max(0, c.scared - dt) : 0;
                var v = c.mode === 'home' ? 11 : c.mode === 'leave' || c.scared > 0 ? 3 : maze.isSlow(c.x, c.y) ? speed * 0.55 : speed;
                advance(c, v * dt / 1000, chooseCat, arriveCat, c.can);
                if (c.mode !== 'hunt') { return; }
                var p = at(c), dx = Math.abs(p.x - m.x), dy = p.y - m.y;
                dx = Math.min(dx, COLS - dx);
                if (dx * dx + dy * dy > 0.4) { return; }
                if (c.scared > 0) {
                    combo++;
                    shell.addScore(150 * combo);
                    toast = { text: String(150 * combo), x: p.x, y: p.y, t: 900 };
                    c.mode = 'home'; c.scared = 0;
                    shell.beep(300, 220, 'sawtooth', 0.05, 1200);
                } else { caught = true; }
            });
            if (caught) { shell.die(1300); shell.beep(500, 600, 'sawtooth', 0.05, 60); return false; }
            if (cheese) { cheese.t -= dt; if (cheese.t <= 0) { cheese = null; } }
        }

        function buildMaze() {
            var c = document.createElement('canvas');
            c.width = W; c.height = ROWS * T;
            var g = c.getContext('2d');
            /* The walls are hollow shelves with rounded ends. The shape of
               the walls is drawn twice, once in the wall colour and once a
               little smaller in the colour of the floor, which leaves a line
               round every wall. A wall tile is drawn as its middle, an arm
               to each side where the next tile is wall too, and a corner
               where the two tiles beside the corner and the one across it
               are all wall. A corner of the middle with no wall on either
               side of it is rounded. */
            function wall(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS && !maze.open[y * COLS + x] && !maze.den[y * COLS + x]; }
            function shape(M, R) {
                var MID = T - 2 * M;
                for (var y = 0; y < ROWS; y++) {
                    for (var x = 0; x < COLS; x++) {
                        if (!wall(x, y)) { continue; }
                        for (var j = -1; j <= 1; j++) {
                            for (var i = -1; i <= 1; i++) {
                                if (!wall(x + i, y) || !wall(x, y + j) || !wall(x + i, y + j)) { continue; }
                                var rx = x * T + (i < 0 ? 0 : i > 0 ? T - M : M), ry = y * T + (j < 0 ? 0 : j > 0 ? T - M : M);
                                if (i || j || !g.roundRect) { g.fillRect(rx, ry, i ? M : MID, j ? M : MID); continue; }
                                var up = wall(x, y - 1), down = wall(x, y + 1), left = wall(x - 1, y), right = wall(x + 1, y);
                                g.beginPath();
                                g.roundRect(rx, ry, MID, MID, [!up && !left ? R : 0, !up && !right ? R : 0, !down && !right ? R : 0, !down && !left ? R : 0]);
                                g.fill();
                            }
                        }
                    }
                }
            }
            g.fillStyle = C.accent; shape(2, 4);
            g.fillStyle = C.bg; shape(4, 2);
            /* The den's door, a thin bar between the ends of its wall. */
            g.fillStyle = C.warn;
            g.fillRect(DOOR.x * T - 2, DOOR.y * T + T / 2 - 1, T + 4, 2);
            mazeImg = c;
        }
        function px(x) { return Math.round(x * T + T / 2); }
        function py(y) { return Math.round(TOP + y * T + T / 2); }
        /* Draws something at a place across the board, and again at the
           other side when it is in the passage through the side walls. */
        function across(x, fn) {
            fn(px(x));
            if (x < 0.5) { fn(px(x + COLS)); }
            if (x > COLS - 1.5) { fn(px(x - COLS)); }
        }
        function pad(n) { return ('00000' + n).slice(-5); }
        function banner(str, colour, sub) {
            /* Across the middle of the board, over the den. */
            var top = TOP + (MY - 1) * T;
            ctx.fillStyle = C.bg;
            ctx.fillRect(0, top, W, sub ? 46 : 30);
            shell.text(str, W / 2, top + 8, colour, 2, 'center');
            if (sub) { shell.text(sub, W / 2, top + 30, C.muted, 1, 'center'); }
        }
        var COAT = ['danger', 'warn', 'positive', 'accent'];
        function draw() {
            var text = shell.text, image = shell.image, mode = S.mode;
            text('SCORE ' + pad(S.score), 4, 2, C.fg);
            text('HI ' + pad(S.hi), W - 4, 2, C.muted, 1, 'right');
            if (mode === 'ready') {
                text('PANTRY RAID', W / 2, 80, C.fg, 2, 'center');
                text('ENTER OR NEW GAME TO PLAY', W / 2, 104, C.muted, 1, 'center');
                ctx.drawImage(image(MOUSE[0], C.fg), 62, 140); text('EATS THE CRUMBS', 82, 142, C.muted);
                ctx.drawImage(image(CAT, C.danger), 61, 162); text('EATS THE MOUSE', 82, 164, C.muted);
                ctx.drawImage(image(BELL, C.warn), 63, 186); text('SCARES THE CATS', 82, 186, C.muted);
                ctx.drawImage(image(CHEESE, C.warn), 62, 208); text('IS WORTH A DETOUR', 82, 208, C.muted);
                return;
            }
            if (!mazeImg) { buildMaze(); }
            ctx.drawImage(mazeImg, 0, TOP);
            ctx.fillStyle = C.fg;
            for (var y = 0; y < ROWS; y++) {
                for (var x = 0; x < COLS; x++) { if (crumbs[y * COLS + x]) { ctx.fillRect(px(x) - 1, py(y) - 1, 2, 2); } }
            }
            var blink = Math.floor(clock / 250) % 2 === 0 || mode !== 'playing';
            bells.forEach(function (b) { if (b.on && blink) { ctx.drawImage(image(BELL, C.warn), px(b.x) - 3, py(b.y) - 3); } });
            if (cheese && (cheese.t > 2500 || blink)) { ctx.drawImage(image(CHEESE, C.warn), px(START.x) - 4, py(START.y) - 3); }
            cats.forEach(function (c) {
                var p = at(c), colour = C[COAT[c.kind]];
                if (c.mode === 'home') { across(p.x, function (sx) { ctx.drawImage(image(EYES, C.fg), sx - 3, py(p.y) - 1); }); return; }
                if (c.scared > 0) { colour = c.scared < 1500 && Math.floor(clock / 150) % 2 ? C.fg : C.muted; }
                across(p.x, function (sx) { ctx.drawImage(image(CAT, colour), sx - 5, py(p.y) - 5); });
            });
            if (mode !== 'dying' || Math.floor(S.timer / 120) % 2) {
                var m = at(mouse);
                across(m.x, function (sx) {
                    ctx.save();
                    ctx.translate(sx, py(m.y));
                    ctx.rotate(mouse.face.a);
                    ctx.drawImage(image(MOUSE[mouse.dir ? Math.floor(clock / 120) % 2 : 0], C.fg), -4, -5);
                    ctx.restore();
                });
            }
            if (toast) { text(toast.text, px(toast.x), py(toast.y) - 12, C.warn, 1, 'center'); }
            for (var l = 0; l < Math.min(S.lives - 1, 5); l++) { ctx.drawImage(image(MOUSE[0], C.fg), 4 + l * 13, H - FOOT + 2); }
            text('LEVEL ' + S.level, W - 4, H - FOOT + 4, C.muted, 1, 'right');
            if (mode === 'paused') { banner('PAUSED', C.fg); }
            else if (mode === 'over') { banner('GAME OVER', C.danger, 'ENTER OR NEW GAME TO PLAY AGAIN'); }
            else if (mode === 'cleared') { banner('PANTRY EMPTIED', C.fg); }
        }

        shell = window.splash.shell(root, opts, {
            game: 'pantry', title: 'Pantry Raid', width: W, height: H, help: HELP,
            pad: ['left', 'up', 'down', 'right'], extraLifeEvery: 5000,
            newGame: startWave, newWave: startWave, respawn: place,
            update: timing.run, draw: draw,
            press: function (name) {
                if (!DIR[name]) { return; }
                want = DIR[name];
                if (mouse.dir && want === opposite(mouse.dir)) { reverse(mouse); mouse.face = mouse.dir; }
            },
            after: function (dt) { if (toast) { toast.t -= dt; if (toast.t <= 0) { toast = null; } } },
            busy: function () { return !!toast; },
            recolour: function () { if (S) { C = S.colours; } mazeImg = null; }
        });
        S = shell.state; ctx = S.ctx; C = S.colours;
        current = function () { return { maze: maze, mouse: mouse, cats: cats, bells: bells, crumbs: crumbs, scatter: scatter, left: left }; };
        shell.draw();
        return shell.instance;
    }
    /* The game most lately started, as it stands, for the checks that
       need no browser (../../tools/test-pantry-play.js). */
    var current = null;
    window.splash.pantry.game = function () { return current ? current() : null; };

    window.pudlApplets.register('pantry', { init: init });
})();
