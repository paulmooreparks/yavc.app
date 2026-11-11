// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// A host's page makes a picture of a diagram from its text with no applet
// on the page: yavc-util.js and diagram-kit/picture.js from the package, and
// nothing else of ours until a kind of diagram asks for its engine.
//   node scripts/test-diagram-picture.cjs <extracted package> [engines]
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path'), zlib = require('node:zlib'), pw = require('playwright');
const artifact = path.resolve(process.argv[2]), prefix = '/some-host/package/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), sum = Buffer.alloc(4); length.writeUInt32BE(data.length);
    let crc = 0xffffffff; for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; } sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, sum]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A host with no applet</title></head><body><h1>A host with no applet</h1>' +
    '<script src="' + prefix + 'support/yavc-util.js"></script><script src="' + prefix + 'content/diagram-kit/picture.js"></script></body></html>';
const CANVAS = JSON.stringify({ yavc: { version: 1 }, nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 80, text: 'Registration' },
    { id: 'b', type: 'text', x: 320, y: 0, width: 200, height: 80, text: 'Payment' },
    { id: 'p', type: 'file', x: 0, y: 140, width: 64, height: 64, file: 'icons/cash.png' }
], edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: 'Total' }] });
(async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8')), allowed = new Set(manifest.files.map(item => item.path));
    assert.ok(allowed.has('content/diagram-kit/picture.js'), 'The package must have the picture function.');
    const server = http.createServer(async (req, res) => { try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/host.html') { res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'"); return res.end(page); }
        if (url.pathname === '/files/icons/cash.png') { res.setHeader('Content-Type', 'image/png'); return res.end(png); }
        if (!url.pathname.startsWith(prefix)) return res.writeHead(404).end();
        const name = decodeURIComponent(url.pathname.slice(prefix.length)); if (!allowed.has(name)) return res.writeHead(404).end();
        res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
        res.end(await fs.readFile(path.join(artifact, name)));
    } catch (error) { res.writeHead(500).end(error.message); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try { for (const engine of process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit']) {
        const browser = await pw[engine].launch({ headless: true });
        try {
            const p = await browser.newPage(), errors = [], asked = []; p.on('pageerror', e => errors.push(e.message)); p.setDefaultTimeout(60000);
            p.on('request', r => asked.push(new URL(r.url()).pathname));
            await p.goto('http://127.0.0.1:' + server.address().port + '/host.html');
            await p.waitForFunction(() => window.yavcDiagramPicture);
            assert.deepEqual(await p.evaluate(() => ['plan.canvas', 'a/b.D2', 'x.mmd', 'x.mermaid', 'x.png', ''].map(yavcDiagramPicture.kindOf)), ['canvas', 'd2', 'mermaid', 'mermaid', null, null]);
            // A canvas, with a picture read through the reader the host gives.
            const canvas = await p.evaluate(async text => {
                const paths = [], out = await yavcDiagramPicture.draw({ kind: 'canvas', text: text, pictures: async function (path) { paths.push(path); return { url: '/files/' + path }; } });
                const doc = new DOMParser().parseFromString(out.svg, 'image/svg+xml');
                return { format: out.format, width: out.width, height: out.height, root: doc.documentElement.nodeName, bad: !!doc.querySelector('parsererror'), text: doc.documentElement.textContent, image: !!doc.querySelector('image'), script: !!doc.querySelector('script,foreignObject'), paths: paths, problems: out.problems };
            }, CANVAS);
            assert.equal(canvas.format, 'svg'); assert.equal(canvas.root, 'svg'); assert.equal(canvas.bad, false); assert.match(canvas.text, /Registration[\s\S]*Payment/);
            assert.ok(canvas.width > 500 && canvas.height > 200); assert.equal(canvas.image, true, 'The picture node must be in the drawing.'); assert.equal(canvas.script, false);
            assert.deepEqual(canvas.paths, ['icons/cash.png']); assert.deepEqual(canvas.problems, []);
            // A label whose box is exactly as wide as its letters is drawn whole, because the page measures the text, and a family that is not a CSS identifier still reaches the browser.
            const fitted = await p.evaluate(async () => {
                const rule = document.createElement('canvas').getContext('2d');
                rule.font = "700 19px '7 Segment Display', 'Inter', system-ui, sans-serif";
                const width = Math.ceil(rule.measureText('Subtotal').width), text = JSON.stringify({ yavc: { version: 1 }, nodes: [{ id: 't', type: 'text', x: 0, y: 0, width: width, height: 26, text: 'Subtotal', yavc: { shape: 'text', padding: 0, fontSize: 19, fontWeight: 700, fontFamily: '7 Segment Display', lineHeight: 1.17 } }], edges: [] });
                const out = await yavcDiagramPicture.draw({ kind: 'canvas', text: text }), doc = new DOMParser().parseFromString(out.svg, 'image/svg+xml'), holder = document.createElement('div');
                holder.innerHTML = out.svg; document.body.append(holder); const shown = getComputedStyle(holder.querySelector('text')).fontFamily; holder.remove();
                const m = rule.measureText('Hg'), known = typeof m.fontBoundingBoxAscent === 'number', up = Math.round(m.fontBoundingBoxAscent), down = Math.round(m.fontBoundingBoxDescent), line = 19 * 1.17;
                return { lines: Array.from(doc.querySelectorAll('tspan')).map(node => node.textContent), shown: shown, width: width, y: Number(doc.querySelector('text').getAttribute('y')), want: known ? Number(((line - (up + down)) / 2 + up).toFixed(1)) : null };
            });
            assert.deepEqual(fitted.lines, ['Subtotal'], 'width ' + fitted.width); assert.match(fitted.shown, /7 Segment Display/);
            // The baseline is placed from the font's own ascent and descent, which every engine tested gives.
            assert.notEqual(fitted.want, null); assert.equal(Number((fitted.y - 24).toFixed(1)), fitted.want, 'The picture has a margin of 24 around the canvas.');
            // A picture kept in the canvas file is drawn from the file, and the host is not asked for it.
            const kept = await p.evaluate(async () => {
                const asked = [], text = JSON.stringify({ yavc: { version: 1 }, nodes: [{ id: 'p', type: 'file', x: 0, y: 0, width: 32, height: 32, file: 'thumb.png', yavc: { picture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', radiusCorners: [6, 0, 6, 0], strokeColor: '#333333', outlinePosition: 'inside', lineWidth: 1 } }], edges: [] });
                const out = await yavcDiagramPicture.draw({ kind: 'canvas', text: text, pictures: async function (path) { asked.push(path); return null; } }), doc = new DOMParser().parseFromString(out.svg, 'image/svg+xml');
                const made = await yavcDiagramPicture.draw({ kind: 'canvas', text: text, format: 'png', scale: 1 });
                return { image: !!doc.querySelector('image'), path: !!doc.querySelector('g[data-node="p"] path'), asked: asked, problems: out.problems, png: made.blob.size > 100 };
            });
            assert.deepEqual(kept, { image: true, path: true, asked: [], problems: [], png: true });
            // Without a reader the canvas is still drawn, and it says the picture is missing.
            const bare = await p.evaluate(async text => { const out = await yavcDiagramPicture.draw({ kind: 'canvas', text: text }); return { image: /<image[\s>]/.test(out.svg), problems: out.problems }; }, CANVAS);
            assert.equal(bare.image, false); assert.equal(bare.problems.length, 1);
            // A PNG of the same canvas at twice its size.
            const raster = await p.evaluate(async text => {
                const out = await yavcDiagramPicture.draw({ kind: 'canvas', text: text, format: 'png', scale: 2 }), bytes = new Uint8Array(await out.blob.arrayBuffer());
                return { format: out.format, type: out.blob.type, width: out.width, height: out.height, magic: Array.from(bytes.slice(0, 4)), size: bytes.length };
            }, CANVAS);
            assert.equal(raster.format, 'png'); assert.equal(raster.type, 'image/png'); assert.deepEqual(raster.magic, [137, 80, 78, 71]);
            assert.equal(raster.width, canvas.width * 2); assert.equal(raster.height, canvas.height * 2); assert.ok(raster.size > 500);
            // D2 and Mermaid, each through its own engine, loaded when asked for.
            assert.ok(!asked.some(name => /yavc-d2\.wasm|mermaid/.test(name)), 'No engine is fetched before a diagram of its kind is asked for.');
            const d2 = await p.evaluate(async () => { const out = await yavcDiagramPicture.draw({ kind: 'd2', text: 'till -> drawer: opens\n' }); return { width: out.width, height: out.height, svg: /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(out.svg), words: /till/.test(out.svg) && /drawer/.test(out.svg) }; });
            assert.ok(d2.svg && d2.words && d2.width > 20 && d2.height > 20);
            const mermaid = await p.evaluate(async () => {
                const out = await yavcDiagramPicture.draw({ kind: 'mermaid', text: 'flowchart LR\n  scan[Scan item] --> pay[Take payment]\n' }), doc = new DOMParser().parseFromString(out.svg, 'image/svg+xml');
                return { width: out.width, height: out.height, bad: !!doc.querySelector('parsererror'), words: /Scan item/.test(doc.documentElement.textContent) && /Take payment/.test(doc.documentElement.textContent), script: !!doc.querySelector('script'), left: document.querySelectorAll('body > div').length };
            });
            assert.equal(mermaid.bad, false); assert.ok(mermaid.words && mermaid.width > 50 && mermaid.height > 20); assert.equal(mermaid.script, false); assert.equal(mermaid.left, 0, 'Nothing is left on the host\'s page.');
            // Both as PNG too. Mermaid writes its labels as HTML inside the drawing, which some browsers will not turn into a PNG; then the refusal says to ask for SVG.
            const rasters = await p.evaluate(async () => {
                const out = [];
                for (const request of [{ kind: 'd2', text: 'till -> drawer\n' }, { kind: 'mermaid', text: 'flowchart LR\n  scan[Scan item] --> pay[Take payment]\n' }]) {
                    out.push(await yavcDiagramPicture.draw(Object.assign({ format: 'png', scale: 1 }, request)).then(async made => Array.from(new Uint8Array(await made.blob.arrayBuffer()).slice(0, 4)).join(','), error => error.message));
                }
                return out;
            });
            assert.equal(rasters[0], '137,80,78,71'); assert.ok(rasters[1] === '137,80,78,71' || /Ask for SVG/.test(rasters[1]), rasters[1]);
            if (process.env.YAVC_SHOTS) console.log(engine + ' Mermaid as PNG: ' + rasters[1]);
            // Mistakes reject with words a person can act on, and a cancelled request stops.
            const refused = await p.evaluate(async () => {
                const tries = [{ kind: 'canvas', text: '{nope' }, { kind: 'd2', text: 'a -> {' }, { kind: 'mermaid', text: 'flowchart LR\n  a[[[' }, { kind: 'visio', text: 'x' }, { kind: 'canvas', text: '{"nodes":[],"edges":[]}', format: 'jpg' }, { kind: 'canvas', text: '{"nodes":[],"edges":[]}', format: 'png', scale: 9 }, { kind: 'canvas' }], out = [];
                for (const request of tries) out.push(await yavcDiagramPicture.draw(request).then(() => 'drawn', error => error.message));
                const stop = new AbortController(); stop.abort();
                out.push(await yavcDiagramPicture.draw({ kind: 'canvas', text: '{"nodes":[],"edges":[]}', signal: stop.signal }).then(() => 'drawn', error => error.name));
                return out;
            });
            assert.ok(refused.slice(0, 7).every(message => message !== 'drawn' && message.length > 8), JSON.stringify(refused)); assert.equal(refused[7], 'AbortError');
            assert.deepEqual(errors, []);
            console.log(engine + ': a page with no applet draws a canvas with its picture, a D2 and a Mermaid diagram as SVG, a canvas as PNG, and refuses mistakes');
        } finally { await browser.close(); }
    } } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
