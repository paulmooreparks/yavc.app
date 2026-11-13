// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Draws pictures of diagrams from a built content package with no applet window, as a command-line consumer does (see
// docs/diagram-picture-contract.md). It serves the package and this folder's page, opens the page in a browser, asks it for pictures
// and checks what comes back. Only synthetic diagrams are used.
//
//   node examples/diagram-picture/driver.cjs <extracted package> [chromium firefox webkit]
//
// Playwright must be resolvable (NODE_PATH or an install beside the repository). The functions are exported so that
// scripts/test-diagram-picture-example.cjs can run the same checks as a package test.
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), zlib = require('node:zlib');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
// The policy the checks run under. A host with a tighter one has to allow no more than this.
const POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'";

function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), sum = Buffer.alloc(4); length.writeUInt32BE(data.length);
    let crc = 0xffffffff; for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; } sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, sum]);
}
// A 1 by 1 PNG, the picture a synthetic canvas names.
const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
const PIXEL = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);

const CANVAS = JSON.stringify({ yavc: { version: 1 }, nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 80, text: 'Registration' },
    { id: 'b', type: 'text', x: 320, y: 0, width: 200, height: 80, text: 'Payment' },
    { id: 'p', type: 'file', x: 0, y: 140, width: 64, height: 64, file: 'icons/cash.png' }
], edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: 'Total' }] });
const MERMAID = 'flowchart LR\n  scan[Scan item] --> pay[Take payment]\n  pay --> receipt[Print receipt]\n';

// What a PNG says about itself, read from its bytes.
function pngSize(base64) {
    const bytes = Buffer.from(base64, 'base64');
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'not a PNG');
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

// Counts what a drawing could leave behind, from a script that runs before the page's own: timers not yet run or cleared, intervals not
// cleared, workers not terminated, object URLs not revoked, and Worker and URL.createObjectURL calls made.
function tracker() {
    const timers = new Set(), intervals = new Set(), workers = new Set(), urls = new Set(), seen = { timers: 0, workers: 0, urls: 0 };
    const set = window.setTimeout, clear = window.clearTimeout, every = window.setInterval, stop = window.clearInterval;
    window.setTimeout = function (callback, delay, ...rest) {
        if (typeof callback !== 'function') { return set.call(window, callback, delay, ...rest); }
        seen.timers++;
        const id = set.call(window, function () { timers.delete(id); return callback.apply(this, arguments); }, delay, ...rest); timers.add(id); return id;
    };
    window.clearTimeout = function (id) { timers.delete(id); return clear.call(window, id); };
    window.setInterval = function (callback, delay, ...rest) { const id = every.call(window, callback, delay, ...rest); intervals.add(id); return id; };
    window.clearInterval = function (id) { intervals.delete(id); return stop.call(window, id); };
    if (window.Worker) {
        const Real = window.Worker;
        window.Worker = function (...args) {
            const worker = new Real(...args); workers.add(worker); seen.workers++;
            const end = worker.terminate.bind(worker); worker.terminate = function () { workers.delete(worker); return end(); };
            return worker;
        };
        window.Worker.prototype = Real.prototype;
    }
    const make = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = function (object) { const url = make(object); urls.add(url); seen.urls++; return url; };
    URL.revokeObjectURL = function (url) { urls.delete(url); return revoke(url); };
    window.hostResources = function () {
        return { timers: timers.size, intervals: intervals.size, workers: workers.size, objectUrls: urls.size, stages: document.querySelectorAll('body > div[aria-hidden="true"]').length, seen: Object.assign({}, seen) };
    };
}

async function serve(artifact) {
    const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8')), allowed = new Set(manifest.files.map(item => item.path)), asked = [];
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            asked.push(url.pathname);
            let file;
            if (url.pathname === '/' || url.pathname === '/index.html') { file = path.join(__dirname, 'index.html'); }
            else if (url.pathname === '/host.js') { file = path.join(__dirname, 'host.js'); }
            else if (url.pathname === '/pictures/cash.png') { res.setHeader('Content-Type', 'image/png'); return res.end(PIXEL); }
            else if (url.pathname.startsWith('/package/')) {
                const name = decodeURIComponent(url.pathname.slice('/package/'.length));
                if (!allowed.has(name)) { return res.writeHead(404).end(); }
                file = path.join(artifact, name);
            } else { return res.writeHead(404).end(); }
            res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
            // The policy is the page's. D2's worker is its own document and is served without one, since its layout evaluates strings.
            if (file.endsWith('index.html')) { res.setHeader('Content-Security-Policy', POLICY); }
            res.end(await fs.readFile(file));
        } catch (error) { res.writeHead(500).end(error.message); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { server, asked, port: server.address().port };
}

// Runs the checks in each browser and returns what it found, for a report or for a test to assert on.
async function run(artifact, engines, log = () => {}) {
    const pw = require('playwright'), report = {};
    artifact = path.resolve(artifact);
    const { server, asked, port } = await serve(artifact);
    try {
        for (const engine of engines) {
            const browser = await pw[engine].launch({ headless: true }), found = report[engine] = {};
            try {
                const page = await browser.newPage(), errors = []; page.setDefaultTimeout(60000);
                page.on('pageerror', e => errors.push(e.message));
                await page.addInitScript(tracker);
                await page.goto('http://127.0.0.1:' + port + '/');
                await page.waitForFunction(() => window.yavcDiagramPicture && window.hostDraw);
                await page.evaluate(() => { window.hostPictures = { 'icons/cash.png': '/pictures/cash.png' }; });
                const draw = spec => page.evaluate(spec => window.hostDraw(spec), spec);

                // A canvas with a picture the host supplied gives a PNG with its size.
                let from = asked.length;
                const canvas = await draw({ kind: 'canvas', text: CANVAS, format: 'png', scale: 1 });
                assert.equal(canvas.ok, true, engine + ': canvas: ' + canvas.message);
                found.canvas = Object.assign({ width: canvas.width, height: canvas.height, problems: canvas.problems }, pngSize(canvas.png));
                assert.equal(found.canvas.width, canvas.width); assert.equal(found.canvas.height, canvas.height); assert.deepEqual(canvas.problems, []);
                assert.ok(canvas.width > 500 && canvas.height > 200, engine + ': canvas size');
                found.canvasFiles = asked.slice(from).filter(name => name.startsWith('/package/') || name.startsWith('/pictures/'));

                // A Mermaid diagram gives a PNG with its size.
                from = asked.length;
                const mermaid = await draw({ kind: 'mermaid', text: MERMAID, format: 'png', scale: 1 });
                assert.equal(mermaid.ok, true, engine + ': mermaid: ' + mermaid.message);
                found.mermaid = Object.assign({ width: mermaid.width, height: mermaid.height, problems: mermaid.problems }, pngSize(mermaid.png));
                assert.equal(found.mermaid.width, mermaid.width); assert.equal(found.mermaid.height, mermaid.height);
                found.mermaidFiles = asked.slice(from).filter(name => name.startsWith('/package/'));

                // A D2 diagram, which needs no picture, gives a PNG too.
                from = asked.length;
                const d2 = await draw({ kind: 'd2', text: 'till -> drawer: opens\n', format: 'png', scale: 1 });
                assert.equal(d2.ok, true, engine + ': d2: ' + d2.message);
                found.d2 = Object.assign({ width: d2.width, height: d2.height, problems: d2.problems }, pngSize(d2.png));
                assert.equal(found.d2.width, d2.width); assert.equal(found.d2.height, d2.height);
                found.d2Files = asked.slice(from).filter(name => name.startsWith('/package/'));

                // A picture the host does not supply is a problem in the answer, and the drawing is still made.
                await page.evaluate(() => { window.hostPictures = {}; });
                const missing = await draw({ kind: 'canvas', text: CANVAS, format: 'png', scale: 1 });
                assert.equal(missing.ok, true, engine + ': missing picture drew nothing: ' + missing.message);
                assert.equal(missing.problems.length, 1, engine + ': missing picture: ' + JSON.stringify(missing.problems));
                found.missing = { problems: missing.problems, png: pngSize(missing.png).bytes > 0 };

                // A diagram that cannot be drawn rejects, with its mistake in words.
                found.invalid = {};
                for (const [kind, text] of [['canvas', '{nope'], ['d2', 'a -> {'], ['mermaid', 'flowchart LR\n  a[[[']]) {
                    const refused = await draw({ kind, text, format: 'png' });
                    assert.equal(refused.ok, false, engine + ': ' + kind + ' was drawn');
                    assert.ok(refused.message && refused.message.length > 8, engine + ': ' + kind + ' gave no words: ' + refused.message);
                    found.invalid[kind] = refused.message;
                }

                // A drawing that is stopped while Mermaid is making it rejects with AbortError, and leaves no timer, interval, worker or
                // object URL, and no hidden page it made, that was not there before. The count is taken before and at two later times, since
                // a timer may be one that has not yet run.
                // It is done on a page of its own, where Mermaid has not been loaded yet, so that the abort comes while the engine is still
                // being fetched and started, and then again on this page, where the engine is loaded and the drawing is quick.
                const fresh = await browser.newPage(); fresh.setDefaultTimeout(60000); fresh.on('pageerror', e => errors.push(e.message));
                await fresh.addInitScript(tracker);
                await fresh.goto('http://127.0.0.1:' + port + '/');
                await fresh.waitForFunction(() => window.yavcDiagramPicture && window.hostDraw);
                const before = await fresh.evaluate(() => window.hostResources());
                // The abort is given in the turn after the request, before the engine could have drawn anything.
                await fresh.evaluate(spec => { window.hostStart('stop', spec); window.hostAbort('stop'); }, { kind: 'mermaid', text: MERMAID, format: 'png', scale: 1 });
                const stopped = await fresh.evaluate(() => window.hostResult('stop'));
                const after = await fresh.evaluate(() => window.hostResources());
                await fresh.waitForTimeout(2000);
                const later = await fresh.evaluate(() => window.hostResources());
                found.abort = { name: stopped.name, ok: stopped.ok, before, after, later };
                assert.equal(stopped.ok, false, engine + ': an abort did not stop the drawing');
                assert.equal(stopped.name, 'AbortError', engine + ': ' + JSON.stringify(stopped));
                for (const [when, counts] of [['after', after], ['later', later]]) {
                    for (const key of ['timers', 'intervals', 'workers', 'objectUrls', 'stages']) {
                        assert.ok(counts[key] <= before[key], engine + ': ' + key + ' left ' + (counts[key] - before[key]) + ' behind ' + when + ' an abort: ' + JSON.stringify({ before, after, later }));
                    }
                }
                // The page can draw again after an abort.
                const again = await fresh.evaluate(spec => window.hostDraw(spec), { kind: 'mermaid', text: MERMAID, format: 'svg' });
                assert.equal(again.ok, true, engine + ': a drawing after an abort: ' + again.message);
                assert.deepEqual(errors, [], engine + ': the page raised errors');
                log(engine + ': ' + JSON.stringify(found));
            } finally { await browser.close(); }
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
    return report;
}

module.exports = { run, POLICY };

if (require.main === module) {
    if (!process.argv[2]) { console.error('usage: node driver.cjs <extracted package> [chromium firefox webkit]'); process.exit(2); }
    run(process.argv[2], process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit'], console.log)
        .then(() => console.log('done')).catch(error => { console.error(error); process.exitCode = 1; });
}
