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
