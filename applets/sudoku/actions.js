/* Sudoku's actions (js/actions/sudoku.json), run by the action broker
   (js/applet-actions.js) without Sudoku's window. The search is the
   applet's (js/sudoku.js, solution()), stopping at a second solution,
   with the emptiest-choice cell tried first, which keeps a hard puzzle
   from taking seconds. */
(function () {
    'use strict';

    function solve(input) {
        var grid = input.puzzle.split('').map(function (c) { return c === '.' ? 0 : +c; });
        var rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
        function box(i) { return Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor(i % 9 / 3); }
        /* Clues that already repeat a number have no solution. */
        for (var i = 0; i < 81; i++) {
            var n = grid[i];
            if (!n) { continue; }
            var bit = 1 << n, r = Math.floor(i / 9), c = i % 9, b = box(i);
            if ((rows[r] | cols[c] | boxes[b]) & bit) { return { output: { solutions: 'none', solution: null } }; }
            rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        }
        var found = null, count = 0;
        function search() {
            if (count > 1) { return; }
            var best = -1, bestFree = 0, bestCount = 10;
            for (var j = 0; j < 81; j++) {
                if (grid[j]) { continue; }
                var free = ~(rows[Math.floor(j / 9)] | cols[j % 9] | boxes[box(j)]) & 0x3fe, k = 0;
                for (var f = free; f; f &= f - 1) { k++; }
                if (k < bestCount) { best = j; bestFree = free; bestCount = k; if (!k) { return; } }
            }
            if (best < 0) {
                count++;
                if (count === 1) { found = grid.join(''); }
                return;
            }
            var br = Math.floor(best / 9), bc = best % 9, bb = box(best);
            for (var d = 1; d <= 9 && count <= 1; d++) {
                var m = 1 << d;
                if (!(bestFree & m)) { continue; }
                grid[best] = d; rows[br] |= m; cols[bc] |= m; boxes[bb] |= m;
                search();
                grid[best] = 0; rows[br] &= ~m; cols[bc] &= ~m; boxes[bb] &= ~m;
            }
        }
        search();
        return { output: { solutions: count === 0 ? 'none' : count === 1 ? 'one' : 'many', solution: count === 1 ? found : null } };
    }

    /* The actions on the board the reader is watching are the running
       applet's (sudoku.js attaches them while a window is open); these
       hand each call on, opening Sudoku first when new asks for a game and
       no window is open. */
    var ID = 'parks.sudoku', DIFFICULTIES = ['easy', 'medium', 'hard', 'veryhard'];
    function open() { return window.pudlApplets.attached(ID, 0); }
    function closed() { return new Error('Sudoku is not open on this desktop: new opens it with a fresh game.'); }
    function newGame(input, ctx) {
        var difficulty = DIFFICULTIES.indexOf(input.difficulty) >= 0 ? input.difficulty : 'medium';
        return open().then(function (h) {
            if (h) { return h['new@1']({ difficulty: difficulty }); }
            ctx.open('sudoku', { path: difficulty });
            return window.pudlApplets.attached(ID, 8000).then(function (opened) {
                if (!opened) { throw new Error('Sudoku did not open on this desktop; open it here, then ask again.'); }
                return opened['board@1']({});
            });
        });
    }
    function board(input) { return open().then(function (h) { if (!h) { throw closed(); } return h['board@1'](input); }); }
    function enter(input) { return open().then(function (h) { if (!h) { throw closed(); } return h['enter@1'](input); }); }

    window.pudlApplets.provide(ID, { 'solve@1': solve, 'new@1': newGame, 'board@1': board, 'enter@1': enter });
})();
