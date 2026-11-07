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
