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
