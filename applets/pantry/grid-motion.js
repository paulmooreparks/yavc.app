/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Continuous tile motion and fixed simulation steps, independent of rendering. */
(function (host) {
    'use strict';
    function create(columns, directions) {
        function wrap(x) { return (x + columns) % columns; }
        function opposite(direction) {
            return Object.values(directions).find(function (d) { return d.x === -direction.x && d.y === -direction.y; });
        }
        function position(actor) {
            var d = actor.dir;
            return { x: actor.x + (d ? d.x * actor.p : 0), y: actor.y + (d ? d.y * actor.p : 0) };
        }
        function reverse(actor) {
            if (!actor.dir) { return; }
            if (actor.p > 0) {
                actor.x = wrap(actor.x + actor.dir.x); actor.y += actor.dir.y; actor.p = 1 - actor.p;
            }
            actor.dir = opposite(actor.dir);
        }
        function advance(actor, distance, choose, arrive, can) {
            for (var guard = 0; distance > 0 && guard < 12; guard++) {
                if (actor.p === 0) {
                    actor.dir = choose(actor);
                    if (actor.dir && !can(actor.x + actor.dir.x, actor.y + actor.dir.y)) { actor.dir = null; }
                }
                if (!actor.dir) { return; }
                var step = Math.min(distance, 1 - actor.p);
                actor.p += step; distance -= step;
                if (actor.p > 0.999999) {
                    actor.x = wrap(actor.x + actor.dir.x); actor.y += actor.dir.y; actor.p = 0;
                    if (arrive && arrive(actor) === false) { return; }
                }
            }
        }
        return { advance: advance, reverse: reverse, position: position };
    }
    function timer(step) {
        var pending = 0;
        return {
            reset: function () { pending = 0; },
            run: function (ms) {
                pending += Math.max(0, Math.min(ms, 100));
                while (pending + 1e-9 >= 10) {
                    pending -= 10;
                    if (step(10) === false) { pending = 0; break; }
                }
            }
        };
    }
    var api = { create: create, timer: timer };
    if (typeof module === 'object' && module.exports) { module.exports = api; }
    else { host.yavcPantryMotion = api; }
})(typeof window === 'object' ? window : globalThis);
