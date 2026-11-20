// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../applets/pantry/pantry.js', import.meta.url), 'utf8');
const motion = fs.readFileSync(new URL('../applets/pantry/grid-motion.js', import.meta.url), 'utf8');
async function fixture(level = 1) {
    let app, controls, deaths = 0, clears = 0, context;
    const state = { level, score: 0, mode: 'playing', colours: {}, ctx: {} };
    const shell = { state, draw() {}, beep() {}, addScore(n) { state.score += n; }, die() { deaths++; state.mode = 'dying'; }, cleared() { clears++; state.mode = 'cleared'; }, instance: {} };
    const window = {
        splash: { input: {}, scores: {}, font: {}, shell(root, opts, game) { controls = game; return shell; } },
        pudlApplets: { register(name, definition) { app = definition; } },
        yavcUtil: { async loadScript() { vm.runInContext(motion, context); } }
    };
    context = vm.createContext({ window, URL, document: { currentScript: { src: 'http://pantry.localhost/applets/pantry/pantry.js' } } });
    vm.runInContext(source, context); await app.init({}, {}); controls.newGame(level);
    const game = () => window.splash.pantry.game();
    game().cats.forEach(cat => { cat.mode = 'den'; cat.wait = Infinity; });
    return { game, controls, state, api: window.splash.pantry, deaths: () => deaths, clears: () => clears };
}
function run(f, ms, frame = 10) { for (let elapsed = 0; elapsed < ms; elapsed += frame) f.controls.update(Math.min(frame, ms - elapsed)); }
function location(f) { const m = f.game().mouse; return { x: m.x + (m.dir ? m.dir.x * m.p : 0), y: m.y + (m.dir ? m.dir.y * m.p : 0) }; }

test('all three Pantry Raid mazes keep their own dimensions, den, bells and reachable crumbs', async () => {
    for (let level = 1; level <= 3; level++) {
        const f = await fixture(level), { maze, crumbs, bells } = f.game(), { cols, rows, start } = f.api;
        assert.equal(cols, 21); assert.equal(rows, 25); assert.equal(bells.length, 4);
        const seen = new Set([start.x + ',' + start.y]), queue = [start];
        for (const p of queue) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const x = (p.x + dx + cols) % cols, y = p.y + dy, key = x + ',' + y;
            if (maze.isOpen(x, y) && !seen.has(key)) { seen.add(key); queue.push({ x, y }); }
        }
        crumbs.forEach((crumb, i) => { if (crumb) assert.ok(seen.has(i % cols + ',' + Math.floor(i / cols))); });
        assert.equal(maze.isOpen(f.api.door.x, f.api.door.y), false);
        assert.equal(maze.inDen(f.api.den[0].x, f.api.den[0].y), true);
    }
});
test('the mouse runs smoothly, eats each crumb once and stops at a wall', async () => {
    const f = await fixture(); run(f, 2000);
    assert.equal(f.game().mouse.x, 4); assert.equal(f.game().mouse.y, 14); assert.equal(f.game().mouse.p, 0);
    assert.equal(f.state.score, 60); run(f, 1000); assert.equal(f.state.score, 60);
});
test('a requested turn waits for the junction while the mouse keeps running', async () => {
    const f = await fixture(); f.controls.press('up'); run(f, 100);
    assert.equal(f.game().mouse.y, 14); assert.ok(location(f).x < 10);
    run(f, 1000); assert.equal(f.game().mouse.x, 7); assert.ok(location(f).y < 14);
});
test('a reversal between tiles preserves position and takes effect immediately', async () => {
    const f = await fixture(); run(f, 60); const before = location(f); f.controls.press('right'); const after = location(f);
    assert.ok(Math.abs(before.x - after.x) < 1e-9); assert.equal(before.y, after.y);
    run(f, 100); assert.ok(location(f).x > before.x);
});
test('both side passages wrap without losing sub-tile progress', async () => {
    for (const [x, direction, end] of [[0, 'left', 20], [20, 'right', 0]]) {
        const f = await fixture(); Object.assign(f.game().mouse, { x, y: 12, p: 0, dir: null }); f.controls.press(direction); run(f, 160);
        assert.equal(f.game().mouse.x, end); assert.equal(f.game().mouse.y, 12); assert.ok(Math.abs(f.game().mouse.p - 0.056) < 1e-9);
    }
});
test('rendering frame sizes produce the same simulation result', async () => {
    const a = await fixture(), b = await fixture(), c = await fixture();
    run(a, 337, 10); run(b, 337, 50); run(c, 337, 1000 / 60);
    assert.ok(Math.abs(location(a).x - location(b).x) < 1e-9); assert.ok(Math.abs(location(a).x - location(c).x) < 1e-9);
    assert.equal(a.state.score, b.state.score); assert.equal(a.state.score, c.state.score);
});
test('a bell scares the cats using Pantry Raid scoring and a capture returns a cat to the den', async () => {
    const f = await fixture(); Object.assign(f.game().mouse, { x: 1, y: 4, p: 0, dir: null }); f.controls.press('up');
    const cat = f.game().cats[0]; Object.assign(cat, { x: 19, y: 23, p: 0, dir: null, mode: 'hunt' });
    run(f, 160); assert.equal(f.state.score, 50); assert.ok(cat.scared > 0);
    Object.assign(cat, f.game().mouse, { mode: 'hunt', scared: 1000 }); f.controls.update(10);
    assert.equal(cat.mode, 'home'); assert.equal(f.state.score, 200);
});
test('a lethal collision stops the frame once and respawn retains eaten crumbs', async () => {
    const f = await fixture(); run(f, 200); const left = f.game().left;
    Object.assign(f.game().cats[0], f.game().mouse, { mode: 'hunt', scared: 0 }); f.controls.update(50);
    assert.equal(f.deaths(), 1); f.controls.respawn(); assert.equal(f.game().left, left);
});
test('the last crumb clears once and a new level selects the next original pantry', async () => {
    const f = await fixture(); const crumbs = f.game().crumbs; crumbs.fill(0);
    // Eat every remaining real crumb by visiting its preceding open neighbour.
    f.controls.newGame(1); f.game().cats.length = 0;
    for (const [i, value] of [...f.game().crumbs.entries()]) {
        if (!value) continue;
        const x = i % 21, y = Math.floor(i / 21);
        const neighbours = [['left', 1, 0], ['right', -1, 0], ['up', 0, 1], ['down', 0, -1]];
        const [name, dx, dy] = neighbours.find(([, dx, dy]) => f.game().maze.isOpen(x + dx, y + dy));
        Object.assign(f.game().mouse, { x: x + dx, y: y + dy, p: 0, dir: null }); f.controls.press(name); run(f, 160);
    }
    assert.equal(f.clears(), 1); assert.equal(f.game().left, 0);
    f.state.level = 2; f.controls.newWave(2); assert.ok(f.game().left > 0);
});
