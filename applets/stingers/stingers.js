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
/* Stingers, a PUDL applet package (../../README.md). A formation shooter:
   a nest of wasps flies in by squads and settles into ranks above the
   ship, then they peel off alone or in twos and threes and dive at it,
   shooting as they come. A wasp shot in its dive is worth double, a queen
   takes two hits, and the honey a queen drops gives the ship rapid fire
   for a while. A queen can also stop above the ship and let down a snare:
   a ship caught in it is carried up to the ranks, and shooting that queen
   brings it back to fly beside the next ship, two ships firing as one.
   Every fourth wave is a bonus wave, where the wasps fly past without
   shooting. The shell (../shared/splash-shell.js) gives it the canvas,
   the bar, the dialogs, the scores, the sound and the loop; this file is
   the game. */
(function () {
    'use strict';
    /* The shared modules are bundled in front of this file when the
       package is built (applet.json, "bundle"), so window.splash is here. */
    var W = 224, H = 256, PLAYER_Y = 228, MID = W / 2;
    /* A wasp turns in a circle of this many pixels, flying in and diving,
       at any speed: the paths are drawn for these circles, so a faster
       wave flies the same curves sooner instead of missing its points.
       A point of a path is given up after GIVE_UP milliseconds. */
    var FLY_R = 27, DIVE_R = 30, GIVE_UP = 3000;
    /* The snare: how high the queen stops, how long the threads take to
       come down and how long they stay, half their width at the ship, and
       how near the middle of them the ship must be to be caught. */
    var HOVER_Y = 150, SNARE_WARM = 500, SNARE_MS = 2700, SNARE_HALF = 22, SNARE_CATCH = 15;
    /* Twin ships stand this far apart, left edge to left edge. */
    var SHIP_GAP = 14, BONUS_EVERY = 4;

    function sprite(id, rows) { return { id: id, w: rows[0].length, h: rows.length, rows: rows }; }
    var DRONE = { points: 10, hp: 1, colour: 'fg', frames: [
        sprite('wd1', ['X..XXX..X', 'XX.XXX.XX', 'XXXXXXXXX', '.XXXXXXX.', '...XXX...', '..XX.XX..', '..XXXXX..', '...X.X...']),
        sprite('wd2', ['...XXX...', '...XXX...', 'XXXXXXXXX', 'XXXXXXXXX', 'XX.XXX.XX', 'X.XX.XX.X', '..XXXXX..', '...X.X...'])
    ] };
    var SOLDIER = { points: 20, hp: 1, colour: 'positive', frames: [
        sprite('ws1', ['X...XXX...X', 'XX.XXXXX.XX', 'XXXX.X.XXXX', '.XXXXXXXXX.', '..XXXXXXX..', '...XX.XX...', '..XX...XX..', '..X.....X..']),
        sprite('ws2', ['....XXX....', '...XXXXX...', 'XXXX.X.XXXX', 'XXXXXXXXXXX', 'XXXXXXXXXXX', 'X..XX.XX..X', '..XX...XX..', '...X...X...'])
    ] };
    var QUEEN = { points: 50, hp: 2, colour: 'warn', frames: [
        sprite('wq1', ['..X.......X..', '...X.XXX.X...', 'XX.XXXXXXX.XX', 'XXXXXX.XXXXXX', 'XXXXXXXXXXXXX', '.XXXXXXXXXXX.', '...XXXXXXX...', '..XXX.X.XXX..', '..XX.XXX.XX..', '...X.....X...']),
        sprite('wq2', ['...X.....X...', '...X.XXX.X...', '...XXXXXXX...', 'XXXXXX.XXXXXX', 'XXXXXXXXXXXXX', 'XXXXXXXXXXXXX', 'XX.XXXXXXX.XX', '..XXX.X.XXX..', '..XX.XXX.XX..', '..X.......X..'])
    ] };
    var SHIP = sprite('wp', ['......X......', '......X......', '.....XXX.....', '.....XXX.....', 'X...XXXXX...X', 'X..XXXXXXX..X', 'XXXXXXXXXXXXX', 'XXX.XXXXX.XXX', 'X....X.X....X']);
    var SHIP_BOOM = [
        sprite('wx1', ['..X.....X....', '......X....X.', '.X..X.....X..', '....XX.X.....', 'X..XXXXX..X..', '..XXXXXXXX...', '.XXXXXXXXXXX.', 'XXX.XXXXX.XXX', 'X....X.X....X']),
        sprite('wx2', ['....X.....X..', '.X.....X.....', '...X.....X..X', 'X.....XX.....', '..X..XXXX..X.', '...XXXXXXX...', '.XXXXXXXXXX..', 'XXX.XXXXX.XXX', 'X....X.X....X'])
    ];
    var BOOM = sprite('wb', ['X...X...X', '.X..X..X.', '..X...X..', '.........', 'XX.....XX', '.........', '..X...X..', '.X..X..X.', 'X...X...X']);
    var HONEY = sprite('wh', ['..X..', '..X..', '.XXX.', 'XXXXX', 'XXXXX', '.XXX.']);
    var RANKS = [{ type: QUEEN, n: 3 }, { type: SOLDIER, n: 6 }, { type: SOLDIER, n: 8 }, { type: DRONE, n: 9 }, { type: DRONE, n: 10 }];
    var HELP =
        '<p>Shoot the whole nest. The wasps fly in by squads and settle into ranks, then dive at you alone or two and three together, shooting as they come. A wasp hit in its dive is worth double. A queen takes two hits and drops honey, and catching the honey gives you rapid fire.</p>' +
        '<p>Now and then a queen stops above you and lets down a snare of honey threads. A ship caught in it is carried up to the ranks, and you play on with your next ship. Shoot that queen and the ship comes down to fly beside yours, so that you fire two shots for one. Shoot the ship itself and it is gone. A hit on twin ships costs one of the two. A queen sets no snare while you are on your last ship.</p>' +
        '<p>Every fourth wave is a bonus wave. Forty wasps fly past in flights without shooting, each one you hit is worth 100 more when the wave ends, and all forty are worth 5,000. Each wave dives more often and faster. You have three ships, and another every 4,000 points. When the game is over it tells you how many of your shots hit.</p>' +
        '<dl class="splash-keys">' +
          '<dt>← → or A D</dt><dd>Move</dd>' +
          '<dt>Space or X</dt><dd>Fire, two shots at a time; hold it down with rapid fire</dd>' +
          '<dt>P or Esc</dt><dd>Pause and resume</dd>' +
          '<dt>Enter</dt><dd>Start a game</dd>' +
        '</dl>' +
        '<p>On a touch screen, the buttons under the game do the same. The game pauses when it loses the keyboard.</p>';

    /* Flying is turning towards a point no faster than a turn rate
       allows, at a steady speed, which is what makes the curves. */
    function steer(e, tx, ty, speed, turn, dt) {
        var diff = Math.atan2(ty - e.y, tx - e.x) - e.ang;
        while (diff > Math.PI) { diff -= 2 * Math.PI; }
        while (diff < -Math.PI) { diff += 2 * Math.PI; }
        var most = turn * dt / 1000;
        e.ang += Math.max(-most, Math.min(most, diff));
        e.x += Math.cos(e.ang) * speed * dt / 1000;
        e.y += Math.sin(e.ang) * speed * dt / 1000;
    }
    /* Flies e towards the next point of its path and says when the path
       is done. A point is given up after a while, so that a wasp that
       cannot turn tightly enough to reach one does not circle it. */
    function follow(e, speed, turn, dt) {
        var p = e.path[e.wp];
        steer(e, p.x, p.y, speed, turn, dt);
        e.wpT += dt;
        var dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < 256 || e.wpT > GIVE_UP) { e.wp++; e.wpT = 0; }
        return e.wp >= e.path.length;
    }
    function flySpeed(level) { return Math.min(170, 120 + level * 4); }
    function diveSpeed(level) { return Math.min(190, 125 + level * 5); }
    /* The first point of a path that leaves the ranks, for a wasp that
       starts out flying up the screen: a quarter of a turn away, so the
       wasp passes through it. The wasp turns away from where it is going
       and loops round to come down across the screen; where that loop
       would cross the side of the screen, it turns the other way. */
    function peel(x, y, aim) {
        var k = aim < x ? 1 : -1;
        if (x + k * 2 * DIVE_R < 8 || x + k * 2 * DIVE_R > W - 8) { k = -k; }
        return { x: x + k * DIVE_R, y: y - DIVE_R };
    }
    /* The path of a dive from a place in the ranks: the turn, a point
       just above where the ship was, and off the bottom, flying on the
       way the wasp was going or hooking back where flying on would cross
       the side of the screen. */
    function divePath(x, y, aim) {
        var s = aim < x ? -1 : 1, out = aim + s * 34;
        if (out < 16 || out > W - 16) { out = aim - s * 34; }
        return [peel(x, y, aim), { x: aim, y: PLAYER_Y - 36 }, { x: out, y: H + 20 }];
    }
    /* The path of a queen going to set a snare: the turn, and the place
       above the ship where she stops. */
    function snarePath(x, y, over) { return [peel(x, y, over), { x: over, y: HOVER_Y }]; }

    /* The ways across the screen in a bonus wave, for a wasp coming from
       the left: where it starts, which way it faces, and the points it
       flies through, as so many pixels right of the middle and down from
       the top. The last point of each is off the screen. A wasp coming
       from the right flies the same way mirrored. */
    var PASSES = [
        { from: [86, -12], facing: 'down', via: [[80, 140], [0, 196], [-80, 140], [-86, -26]] },
        { from: [-40, -12], facing: 'down', via: [[64, 110], [20, 180], [-70, 140], [-138, 70]] },
        { from: [-124, 70], facing: 'in', via: [[-30, 84], [52, 130], [0, 182], [-52, 130], [0, 80], [138, 50]] },
        { from: [-124, 180], facing: 'in', via: [[-56, 120], [0, 176], [56, 110], [138, 170]] }
    ];
    function pass(n, s) {
        var p = PASSES[n];
        return {
            x: MID + s * p.from[0], y: p.from[1], ang: p.facing === 'down' ? Math.PI / 2 : s > 0 ? 0 : Math.PI,
            path: p.via.map(function (v) { return { x: MID + s * v[0], y: v[1] }; })
        };
    }
    /* The flights of a bonus wave, eight wasps each: all from one side,
       or four from each side at once. */
    var FLIGHTS = [
        { type: DRONE, pass: 0, both: true }, { type: SOLDIER, pass: 1, side: 1 }, { type: DRONE, pass: 2, both: true },
        { type: SOLDIER, pass: 1, side: -1 }, { type: QUEEN, pass: 3, both: true }
    ];

    /* For the checks that need no browser (../../tools/test-stingers-dive.js
       and test-stingers-play.js): the paths and the flying, and the game
       most lately started, as it stands. */
    var current = null;
    window.splash.stingers = {
        width: W, height: H, shipY: PLAYER_Y, hoverY: HOVER_Y, turn: DIVE_R, flyTurn: FLY_R, giveUp: GIVE_UP, bonusEvery: BONUS_EVERY,
        follow: follow, flySpeed: flySpeed, diveSpeed: diveSpeed, divePath: divePath, snarePath: snarePath, passes: PASSES.length, pass: pass,
        rows: RANKS.map(function (rank, r) { return 34 + r * 15; }),
        game: function () { return current ? current() : null; }
    };

    function init(root, opts) {
        var shell = null, S = null, ctx = null, C = null;
        var enemies = [], shots = [], bullets = [], booms = [], stars = [], pending = [], honey = null, toast = null;
        var player = { x: MID - 6 }, clock = 0, anim = 0, waveClock = 0, diveTimer = 0, snareTimer = 0, rapid = 0, cool = 0, shield = 0;
        /* twin: two ships side by side. rescued: a freed ship on its way
           down. taking: a ship being lifted by a snare, and by which
           queen. bonus: this wave is a bonus wave, and tally is how it
           ended. stats count the shots of the whole game. */
        var twin = false, rescued = null, taking = null, bonus = false, tally = null, said = false, killed = false;
        var stats = { shots: 0, hits: 0 };

        for (var i = 0; i < 28; i++) { stars.push({ x: Math.floor(Math.random() * W), y: Math.random() * H, v: 8 + Math.random() * 22 }); }

        function wasp(type, delay) {
            return { type: type, sx: 0, sy: 0, x: 0, y: -20, ang: 0, state: 'wait', delay: delay, path: null, wp: 0, wpT: 0,
                hp: type.hp, alive: true, shot: false, shots: 0, fireT: 0, side: 1, top: true, held: false, phase: '', over: 0, cast: 0, pass: null };
        }
        function ranks() {
            var list = [];
            RANKS.forEach(function (rank, r) {
                for (var n = 0; n < rank.n; n++) {
                    var e = wasp(rank.type, 0);
                    e.sx = MID + (n - (rank.n - 1) / 2) * 18; e.sy = 34 + r * 15;
                    list.push(e);
                }
            });
            /* Squads of six, a moment apart, from the top and from the
               sides by turns, and from the left and the right by pairs. */
            list.forEach(function (e, n) {
                var squad = Math.floor(n / 6);
                e.delay = 600 + squad * 1700 + (n % 6) * 150;
                e.side = squad % 4 < 2 ? 1 : -1;
                e.top = squad % 2 === 0;
            });
            return list;
        }
        function swarm() {
            var list = [];
            FLIGHTS.forEach(function (f, n) {
                for (var m = 0; m < 8; m++) {
                    var e = wasp(f.type, 1400 + n * 3800 + (f.both ? Math.floor(m / 2) : m) * 170);
                    e.hp = 1; e.pass = pass(f.pass, f.both ? (m % 2 ? -1 : 1) : f.side);
                    list.push(e);
                }
            });
            return list;
        }
        function wide() { return twin ? SHIP_GAP + SHIP.w : SHIP.w; }
        function centre() { return player.x + wide() / 2; }
        function ships() {
            var list = [{ x: player.x, y: PLAYER_Y, w: SHIP.w, h: SHIP.h }];
            if (twin) { list.push({ x: player.x + SHIP_GAP, y: PLAYER_Y, w: SHIP.w, h: SHIP.h }); }
            return list;
        }

        function startWave(level) {
            bonus = level % BONUS_EVERY === 0; tally = null; said = false; waveClock = 0;
            enemies = bonus ? swarm() : ranks();
            shots = []; bullets = []; booms = []; pending = []; honey = null; toast = null; taking = null;
            player.x = MID - wide() / 2; diveTimer = 1500; snareTimer = 9000 + Math.random() * 6000; rapid = 0; cool = 0; shield = 0;
        }
        function startGame(level) {
            twin = false; rescued = null; stats = { shots: 0, hits: 0 };
            startWave(level);
        }
        function respawn() {
            player.x = MID - 6; shots = []; bullets = []; pending = []; honey = null; rapid = 0; shield = 0;
            /* The queen that took the ship carries it back to her place. */
            if (taking) { taking.q.held = true; taking.q.state = 'return'; taking = null; }
            enemies.forEach(function (e) { if (e.alive && (e.state === 'dive' || e.state === 'snare')) { home(e); } });
        }

        /* Where an enemy's place in the ranks is now: the ranks sway from
           side to side and breathe in and out. */
        function slot(e) {
            return { x: MID + (e.sx - MID) * (1 + 0.05 * Math.sin(clock / 770)) + 10 * Math.sin(clock / 1430), y: e.sy };
        }
        /* A wasp that has left the screen comes back in at the top, above
           its own place in the ranks, and drops into it. */
        function home(e) { e.x = slot(e).x; e.y = -12; e.state = 'return'; }
        function enter(e) {
            var s = e.side;
            if (e.top) {
                e.x = MID - s * 30; e.y = -10; e.ang = Math.PI / 2;
                e.path = [{ x: MID + s * 70, y: 110 }, { x: MID + s * 40, y: 170 }, { x: MID - s * 30, y: 150 }];
            } else {
                e.x = MID - s * (MID + 12); e.y = 190; e.ang = s > 0 ? 0 : Math.PI;
                e.path = [{ x: MID - s * 20, y: 170 }, { x: MID + s * 50, y: 130 }, { x: MID, y: 100 }];
            }
            e.state = 'enter'; e.wp = 0; e.wpT = 0;
        }
        /* A dive at the ship, or at a place beside it for a wasp flying
           in a group. */
        function launch(e, beside) {
            e.state = 'dive'; e.ang = -Math.PI / 2; e.wp = 0; e.wpT = 0;
            e.path = divePath(e.x, e.y, Math.max(20, Math.min(W - 20, centre() + beside)));
            e.shots = Math.min(3, 1 + Math.floor(S.level / 3)); e.fireT = 500;
            shell.beep(900, 350, 'sawtooth', 0.03, 300);
        }
        /* A wasp dives, and often one or two of its nearest neighbours
           in the ranks follow it a moment later, to either side. */
        function group(leader, formed) {
            function far(e) { return (e.sx - leader.sx) * (e.sx - leader.sx) + (e.sy - leader.sy) * (e.sy - leader.sy); }
            var near = formed.filter(function (e) { return e !== leader && far(e) <= 1600; }).sort(function (a, b) { return far(a) - far(b); });
            var more = (Math.random() < Math.min(0.75, 0.3 + S.level * 0.05) ? 1 : 0) + (S.level >= 3 && Math.random() < 0.35 ? 1 : 0);
            launch(leader, 0);
            for (var n = 0; n < more && n < near.length; n++) { pending.push({ e: near[n], t: 220 * (n + 1), beside: n ? 18 : -18 }); }
        }
        function snare(q) {
            q.over = Math.max(30, Math.min(W - 30, centre()));
            q.state = 'snare'; q.phase = 'down'; q.cast = 0; q.ang = -Math.PI / 2; q.wp = 0; q.wpT = 0;
            q.path = snarePath(q.x, q.y, q.over);
            shell.beep(500, 600, 'triangle', 0.04, 200);
        }
        /* The snare has the ship. The shell counts a ship lost while the
           ship is lifted to the queen (after, below), and respawn sends
           her back to her place with it. */
        function take(q) {
            taking = { q: q, x: player.x, t: 0 };
            bullets = []; shots = []; pending = [];
            shell.die(1500);
            shell.say('A ship is taken.');
            shell.beep(300, 1200, 'triangle', 0.05, 1200);
        }
        /* Where the ship a queen holds is drawn, by its top left corner:
           above her in the ranks, and behind her when she flies. */
        function heldAt(e) {
            if (e.state === 'dive') { return { x: e.x - Math.cos(e.ang) * 13 - 6, y: e.y - Math.sin(e.ang) * 13 - 4 }; }
            return { x: e.x - 6, y: e.y - 16 };
        }
        function shoot(e) {
            var dx = centre() - e.x, dy = PLAYER_Y - e.y, speed = Math.min(150, 95 + S.level * 5);
            dx = Math.max(-dy / 2, Math.min(dy / 2, dx));
            var len = Math.sqrt(dx * dx + dy * dy);
            bullets.push({ x: e.x, y: e.y + 4, vx: dx / len * speed, vy: dy / len * speed });
        }
        function box(e) { var f = e.type.frames[0]; return { x: e.x - f.w / 2, y: e.y - f.h / 2, w: f.w, h: f.h }; }
        function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
        function fire() {
            var n = twin ? 2 : 1;
            if (S.mode !== 'playing' || shots.length >= (rapid > 0 ? 4 : 2) * n) { return; }
            for (var k = 0; k < n; k++) { shots.push({ x: Math.round(player.x + 6 + k * SHIP_GAP), y: PLAYER_Y - 5 }); }
            stats.shots += n;
            cool = 140;
            shell.beep(1040, 70, 'square', 0.03, 520);
        }
        function strike(e) {
            stats.hits++;
            e.hp--;
            if (e.hp > 0) { shell.beep(420, 80, 'square', 0.04); return; }
            e.alive = false; e.shot = true;
            var formed = e.state === 'form', points = e.type.points * (formed || bonus ? 1 : 2);
            shell.addScore(points);
            booms.push({ x: e.x - 4, y: e.y - 4, t: 250 });
            if (!formed && !bonus) { toast = { text: String(points), x: e.x, y: e.y - 14, t: 700 }; }
            if (e.held) {
                var p = heldAt(e);
                e.held = false;
                rescued = { x: p.x, y: p.y };
                shell.addScore(250);
                toast = { text: 'RESCUED', x: Math.max(24, Math.min(W - 24, e.x)), y: Math.max(16, e.y - 14), t: 1100 };
                shell.say('The ship is free and coming down to join you.');
                shell.beep(500, 400, 'triangle', 0.06, 1300);
                return;
            }
            if (e.type === QUEEN && !bonus && !honey && rapid <= 0) { honey = { x: e.x, y: e.y }; }
            shell.beep(240, 130, 'square', 0.05, 70);
        }
        /* Something has touched the ships at r. A single ship is lost
           with a life; of twin ships, the one touched is lost and the
           other flies on, safe for a moment. Says whether r touched. */
        function harm(r) {
            if (shield > 0) { return false; }
            var list = ships();
            for (var n = 0; n < list.length; n++) {
                if (!hit(r, list[n])) { continue; }
                if (!twin) { killed = true; return true; }
                booms.push({ x: list[n].x + 2, y: PLAYER_Y, t: 300 });
                twin = false; shield = 700;
                if (n === 0) { player.x += SHIP_GAP; }
                shell.say('One of the two ships is lost.');
                shell.beep(200, 300, 'sawtooth', 0.06, 60);
                return true;
            }
            return false;
        }
        function die() {
            bullets = []; shots = []; pending = [];
            shell.die(1300);
            shell.beep(180, 500, 'sawtooth', 0.06, 40);
        }
        function finishBonus() {
            var got = enemies.filter(function (e) { return e.shot; }).length;
            tally = { hits: got, of: enemies.length, points: got * 100 + (got === enemies.length ? 5000 : 0) };
            shell.addScore(tally.points);
            shell.cleared(3600);
            shell.say('Bonus wave: ' + got + ' of ' + enemies.length + ' hit, ' + tally.points + ' points.');
            shell.beep(660, 500, 'triangle', 0.06, 1320);
        }

        function update(dt, held) {
            clock += dt; waveClock += dt; killed = false;
            if (!said) { said = true; if (bonus) { shell.say('Wave ' + S.level + ', a bonus wave'); } }
            var move = 110 * dt / 1000;
            if (held.left) { player.x = Math.max(6, player.x - move); }
            if (held.right) { player.x = Math.min(W - 6 - wide(), player.x + move); }
            stars.forEach(function (s) { s.y += s.v * dt / 1000; if (s.y > H) { s.y = 0; s.x = Math.floor(Math.random() * W); } });
            cool -= dt; shield = Math.max(0, shield - dt);
            if (rapid > 0) {
                rapid -= dt;
                if (held.fire && cool <= 0) { fire(); }
                if (rapid <= 0) { shell.say('Wave ' + S.level); }
            }

            shots = shots.filter(function (s) {
                s.y -= 330 * dt / 1000;
                if (s.y < 14) { return false; }
                var r = { x: s.x, y: s.y, w: 1, h: 5 }, n, e;
                for (n = 0; n < enemies.length; n++) {
                    e = enemies[n];
                    if (e.alive && e.state !== 'wait' && hit(r, box(e))) { strike(e); return false; }
                }
                /* A shot that gets past a queen to the ship she holds. */
                for (n = 0; n < enemies.length; n++) {
                    e = enemies[n];
                    if (!e.alive || !e.held) { continue; }
                    var p = heldAt(e);
                    if (hit(r, { x: p.x, y: p.y, w: SHIP.w, h: SHIP.h })) {
                        e.held = false;
                        booms.push({ x: p.x + 2, y: p.y, t: 300 });
                        shell.say('You shot the taken ship.');
                        shell.beep(180, 400, 'sawtooth', 0.06, 50);
                        return false;
                    }
                }
                return true;
            });
            /* A freed ship comes down beside the ship and joins it. */
            if (rescued) {
                var to = player.x + (player.x + SHIP_GAP + SHIP.w > W - 6 ? -SHIP_GAP : SHIP_GAP), most = 90 * dt / 1000;
                rescued.x += Math.max(-most, Math.min(most, to - rescued.x));
                rescued.y += 70 * dt / 1000;
                if (rescued.y >= PLAYER_Y) {
                    if (twin) { shell.addScore(1000); }
                    else {
                        if (rescued.x < player.x) { player.x -= SHIP_GAP; }
                        twin = true;
                        player.x = Math.max(6, Math.min(W - 6 - wide(), player.x));
                        shell.say('Twin ships');
                    }
                    rescued = null;
                    shell.beep(700, 300, 'triangle', 0.06, 1400);
                }
            }

            var live = enemies.filter(function (e) { return e.alive; });
            var fly = flySpeed(S.level), dive = diveSpeed(S.level), settled = true, diving = 0;
            live.forEach(function (e) {
                var p;
                if (e.state === 'wait') {
                    settled = false; e.delay -= dt;
                    if (e.delay > 0) { return; }
                    if (!e.pass) { enter(e); return; }
                    e.x = e.pass.x; e.y = e.pass.y; e.ang = e.pass.ang; e.path = e.pass.path; e.wp = 0; e.wpT = 0; e.state = 'pass';
                    return;
                }
                if (e.state === 'pass') { settled = false; if (follow(e, fly, fly / FLY_R, dt)) { e.alive = false; } return; }
                if (e.state === 'enter') { settled = false; if (follow(e, fly, fly / FLY_R, dt)) { e.state = 'settle'; } return; }
                if (e.state === 'settle' || e.state === 'return') {
                    if (e.state === 'settle') { settled = false; }
                    p = slot(e);
                    var dx = p.x - e.x, dy = p.y - e.y, far = Math.sqrt(dx * dx + dy * dy), step = 140 * dt / 1000;
                    if (far <= step) { e.x = p.x; e.y = p.y; e.state = 'form'; }
                    else { e.x += dx / far * step; e.y += dy / far * step; }
                    return;
                }
                if (e.state === 'form') { p = slot(e); e.x = p.x; e.y = p.y; return; }
                diving++;
                if (e.state === 'snare') {
                    if (e.phase === 'down') { if (follow(e, dive, dive / DIVE_R, dt)) { e.phase = 'cast'; e.cast = 0; } return; }
                    /* She holds still over the place and the threads come
                       down; then she gives up and dives on. */
                    var ease = Math.min(1, dt / 150);
                    e.x += (e.over - e.x) * ease; e.y += (HOVER_Y - e.y) * ease;
                    e.cast += dt;
                    if (e.cast > SNARE_WARM && !twin && shield <= 0 && Math.abs(centre() - e.x) < SNARE_CATCH) { take(e); }
                    else if (e.cast > SNARE_MS) { e.state = 'dive'; e.ang = Math.PI / 2; e.wp = 0; e.wpT = 0; e.path = [{ x: e.x, y: H + 20 }]; e.shots = 0; }
                    return;
                }
                e.fireT -= dt;
                if (e.shots > 0 && e.fireT <= 0 && e.wp >= 1 && e.y > 50 && e.y < PLAYER_Y - 60) { shoot(e); e.shots--; e.fireT = 450; }
                if (follow(e, dive, dive / DIVE_R, dt) || e.y > H + 10) { home(e); }
                else { harm(box(e)); }
            });
            if (taking) { return; }

            pending = pending.filter(function (w) {
                w.t -= dt;
                if (w.t > 0) { return true; }
                if (w.e.alive && w.e.state === 'form') { launch(w.e, w.beside); }
                return false;
            });
            if (settled && !bonus && live.length) {
                diveTimer -= dt; snareTimer -= dt;
                var formed = live.filter(function (e) { return e.state === 'form'; });
                var queens = formed.filter(function (e) { return e.type === QUEEN; });
                var free = !twin && !rescued && S.lives > 1 && !live.some(function (e) { return e.held || e.state === 'snare'; });
                if (snareTimer <= 0 && !(free && queens.length)) { snareTimer = 5000; }
                if (snareTimer <= 0) {
                    snareTimer = 14000 + Math.random() * 8000;
                    snare(queens[Math.floor(Math.random() * queens.length)]);
                } else if (diveTimer <= 0 && formed.length && diving < Math.min(5, 2 + Math.floor(S.level / 3))) {
                    diveTimer = live.length <= 4 ? 500 : Math.max(700, 2300 - S.level * 130);
                    group(formed[Math.floor(Math.random() * formed.length)], formed);
                }
            }

            bullets = bullets.filter(function (b) {
                b.x += b.vx * dt / 1000; b.y += b.vy * dt / 1000;
                if (harm({ x: b.x - 1, y: b.y, w: 2, h: 4 })) { return false; }
                return b.y < H;
            });
            if (honey) {
                honey.y += 60 * dt / 1000;
                var jar = { x: honey.x - 2, y: honey.y, w: 5, h: 6 };
                if (ships().some(function (s) { return hit(jar, s); })) {
                    honey = null; rapid = 8000;
                    shell.say('Rapid fire');
                    shell.beep(600, 250, 'triangle', 0.06, 1500);
                } else if (honey.y > H) { honey = null; }
            }
            if (killed) { die(); return; }
            /* The wave is over when the last wasp is gone and no freed
               ship is still on its way down. */
            if (!live.length && !rescued) { if (bonus) { finishBonus(); } else { shell.cleared(1500); } }
        }

        function pad(n) { return ('00000' + n).slice(-5); }
        /* The snare: threads of honey that widen on their way down and
           ripple as they hang. */
        function drawSnare(e) {
            var top = e.y + 6, full = PLAYER_Y + SHIP.h - top, depth = full * Math.min(1, e.cast / SNARE_WARM);
            ctx.fillStyle = C.warn;
            for (var n = -2; n <= 2; n++) {
                for (var d = (anim / 40 + (n + 2) * 1.5) % 4; d < depth; d += 4) {
                    var half = 3 + (SNARE_HALF - 3) * d / full;
                    ctx.fillRect(Math.round(e.x + n / 2 * half + Math.sin(d / 7 + anim / 130 + n) * 1.5), Math.round(top + d), 1, 2);
                }
            }
        }
        function draw() {
            var text = shell.text, image = shell.image, mode = S.mode, frame = Math.floor(clock / 400) % 2, p;
            ctx.fillStyle = C.muted;
            stars.forEach(function (s) { ctx.fillRect(s.x, Math.round(s.y), 1, 1); });
            text('SCORE ' + pad(S.score), 8, 5, C.fg);
            text('HI ' + pad(S.hi), MID, 5, C.muted, 1, 'center');
            for (var l = 0; l < Math.min(S.lives - 1, 4); l++) { ctx.drawImage(image(SHIP, C.accent), W - 8 - (l + 1) * 16, 3); }
            if (mode === 'ready') {
                text('STINGERS', MID, 46, C.fg, 2, 'center');
                text('ENTER OR NEW GAME TO PLAY', MID, 70, C.muted, 1, 'center');
                ctx.drawImage(image(QUEEN.frames[0], C.warn), 62, 93); text('= 50, TWO HITS', 84, 94, C.muted);
                ctx.drawImage(image(SOLDIER.frames[0], C.positive), 63, 110); text('= 20 POINTS', 84, 110, C.muted);
                ctx.drawImage(image(DRONE.frames[0], C.fg), 64, 126); text('= 10 POINTS', 84, 126, C.muted);
                ctx.drawImage(image(HONEY, C.warn), 66, 143); text('= RAPID FIRE', 84, 142, C.muted);
                text('DOUBLE FOR A WASP IN ITS DIVE', MID, 166, C.muted, 1, 'center');
                text('KEEP OUT OF THE SNARE OF A QUEEN', MID, 182, C.muted, 1, 'center');
                text('FREE A TAKEN SHIP FOR TWIN FIRE', MID, 194, C.muted, 1, 'center');
                return;
            }
            text('WAVE ' + S.level, W - 6, 246, C.muted, 1, 'right');
            enemies.forEach(function (e) {
                if (!e.alive || e.state === 'wait') { return; }
                var spr = e.type.frames[e.state === 'form' ? frame : Math.floor(clock / 120) % 2];
                var colour = e.type === QUEEN && e.hp < e.type.hp && !bonus ? C.danger : C[e.type.colour];
                if (e.state === 'snare' && e.phase === 'cast') { drawSnare(e); }
                if (e.held) { p = heldAt(e); ctx.drawImage(image(SHIP, C.danger), Math.round(p.x), Math.round(p.y)); }
                ctx.drawImage(image(spr, colour), Math.round(e.x - spr.w / 2), Math.round(e.y - spr.h / 2));
            });
            booms.forEach(function (b) { ctx.drawImage(image(BOOM, C.fg), Math.round(b.x), Math.round(b.y)); });
            if (toast) { text(toast.text, Math.round(toast.x), Math.round(toast.y), C.warn, 1, 'center'); }
            if (honey) { ctx.drawImage(image(HONEY, C.warn), Math.round(honey.x - 2), Math.round(honey.y)); }
            ctx.fillStyle = rapid > 0 ? C.warn : C.accent;
            shots.forEach(function (s) { ctx.fillRect(s.x, Math.round(s.y), 1, 5); });
            ctx.fillStyle = C.danger;
            bullets.forEach(function (b) { ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y), 2, 4); });
            if (rescued) { ctx.drawImage(image(SHIP, Math.floor(anim / 150) % 2 ? C.accent : C.fg), Math.round(rescued.x), Math.round(rescued.y)); }
            if (taking) {
                /* The ship on its way up the threads to the queen. */
                var k = Math.min(1, taking.t / 1100), end = heldAt(taking.q);
                ctx.drawImage(image(SHIP, Math.floor(anim / 100) % 2 ? C.danger : C.accent),
                    Math.round(taking.x + (end.x - taking.x) * k), Math.round(PLAYER_Y + (end.y - PLAYER_Y) * k));
            } else if (mode === 'dying') {
                ctx.drawImage(image(SHIP_BOOM[Math.floor(S.timer / 150) % 2], C.danger), Math.round(player.x), PLAYER_Y);
            } else if (mode !== 'over' && !(shield > 0 && Math.floor(anim / 80) % 2)) {
                ships().forEach(function (s) { ctx.drawImage(image(SHIP, C.accent), Math.round(s.x), PLAYER_Y); });
            }
            if (mode === 'paused') { text('PAUSED', MID, 130, C.fg, 2, 'center'); }
            else if (mode === 'over') {
                text('GAME OVER', MID, 108, C.danger, 2, 'center');
                text(stats.hits + ' OF ' + stats.shots + ' SHOTS HIT', MID, 132, C.fg, 1, 'center');
                text('ACCURACY ' + (stats.shots ? Math.round(100 * stats.hits / stats.shots) : 0) + ' PERCENT', MID, 144, C.fg, 1, 'center');
                text('ENTER OR NEW GAME TO PLAY AGAIN', MID, 164, C.muted, 1, 'center');
            } else if (mode === 'cleared' && tally) {
                text(tally.hits === tally.of ? 'EVERY ONE' : 'BONUS WAVE', MID, 108, C.fg, 2, 'center');
                text(tally.hits + ' OF ' + tally.of + ' HIT', MID, 132, C.fg, 1, 'center');
                text('BONUS ' + tally.points, MID, 144, C.warn, 1, 'center');
            } else if (mode === 'cleared') { text('WAVE ' + S.level + ' CLEARED', MID, 130, C.fg, 2, 'center'); }
            else if (bonus && waveClock < 1800) {
                text('BONUS WAVE', MID, 108, C.fg, 2, 'center');
                text('THEY DO NOT SHOOT', MID, 132, C.muted, 1, 'center');
            }
        }

        shell = window.splash.shell(root, opts, {
            game: 'stingers', title: 'Stingers', width: W, height: H, help: HELP,
            pad: ['left', 'right', { name: 'fire', label: 'Fire' }], extraLifeEvery: 4000,
            newGame: startGame, newWave: startWave, respawn: respawn,
            update: update, draw: draw,
            press: function (name) { if (name === 'fire') { fire(); } },
            after: function (dt) {
                anim += dt;
                if (taking) { taking.t += dt; }
                booms = booms.filter(function (b) { b.t -= dt; return b.t > 0; });
                if (toast) { toast.t -= dt; if (toast.t <= 0) { toast = null; } }
            },
            busy: function () { return booms.length > 0 || !!toast; },
            recolour: function () { if (S) { C = S.colours; } }
        });
        S = shell.state; ctx = S.ctx; C = S.colours;
        current = function () {
            return { enemies: enemies, shots: shots, bullets: bullets, pending: pending, player: player, twin: twin, rescued: rescued,
                taking: taking, bonus: bonus, tally: tally, stats: stats, honey: honey };
        };
        shell.draw();
        return shell.instance;
    }

    window.pudlApplets.register('stingers', { init: init });
})();
