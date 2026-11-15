// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Reads a PDF's Info dictionary, page count and size, and the text of its pages in bands (the running header at the top, the body, the running footer at the bottom, found by where the text is drawn),
// with the pdf-lib the content package vendors. The fonts are subsets, so each text run is glyph ids, and the font's ToUnicode CMap maps them back (the array form
// and the plain form of bfrange). After the Yavc.App Tester's read-pdf.cjs, which found how.
//   const { readPdf } = require('./pdf-reader.cjs'); const result = await readPdf(bytes, '<package folder>');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
let lib = null;
function pdfLib(artifact) {
    if (lib) return lib;
    const src = fs.readFileSync(path.join(path.resolve(artifact), 'content', 'md-editor', 'vendor', 'pdf-lib-1.17.1', 'pdf-lib.min.js'), 'utf8');
    const sandbox = { console, TextEncoder, TextDecoder, setTimeout, clearTimeout, Uint8Array, Buffer }; sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox); vm.runInContext(src, sandbox); return (lib = sandbox.PDFLib);
}
function cmap(text) {
    const map = new Map();
    for (const m of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(p[1], 16), String.fromCharCode(parseInt(p[2], 16)));
    for (const m of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
        const body = m[1];
        for (const p of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([^\]]*)\]/g)) { let id = parseInt(p[1], 16); for (const q of p[3].matchAll(/<([0-9a-fA-F]+)>/g)) map.set(id++, String.fromCharCode(parseInt(q[1], 16))); }
        for (const p of body.replace(/\[[^\]]*\]/g, '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) { const a = parseInt(p[1], 16), z = parseInt(p[2], 16), base = parseInt(p[3], 16); for (let i = a; i <= z; i++) map.set(i, String.fromCharCode(base + i - a)); }
    }
    return map;
}
async function readPdf(bytes, artifact) {
    const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, decodePDFRawStream } = pdfLib(artifact);
    const bytesOf = (pdf, obj) => { const s = obj instanceof PDFRef ? pdf.context.lookup(obj) : obj; return Buffer.from(decodePDFRawStream(s).decode()); };
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false }), total = pdf.getPageCount(), size = pdf.getPage(0).getSize(), pages = [];
    for (let n = 1; n <= total; n++) {
        const page = pdf.getPage(n - 1), fonts = page.node.Resources().lookup(PDFName.of('Font'), PDFDict), maps = {};
        for (const [name, ref] of fonts.entries()) { const font = pdf.context.lookup(ref, PDFDict), tu = font && font.get(PDFName.of('ToUnicode')); if (tu) maps[name.decodeText()] = cmap(bytesOf(pdf, tu).toString('latin1')); }
        const contents = page.node.Contents(), refs = contents instanceof PDFArray ? contents.asArray() : [contents]; let s = ''; for (const r of refs) s += bytesOf(pdf, r).toString('latin1') + '\n';
        const runs = [];
        for (const m of s.matchAll(/BT\s+([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+) Tm\s+\/(\S+) [\d.]+ Tf\s+([\s\S]*?)\s+ET/g)) {
            const x = Number(m[5]), y = Number(m[6]), map = maps[m[7]]; let t = '';
            for (const h of m[8].matchAll(/<([0-9a-fA-F]+)>/g)) for (let i = 0; i + 3 <= h[1].length; i += 4) { const id = parseInt(h[1].slice(i, i + 4), 16); t += map && map.get(id) !== undefined ? map.get(id) : '?'; }
            runs.push({ x, y, t });
        }
        const lines = new Map(); for (const r of runs) { const k = Math.round(r.y); (lines.get(k) || lines.set(k, []).get(k)).push(r); }
        const text = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([y, rs]) => ({ y, text: rs.sort((a, b) => a.x - b.x).map(r => r.t).join('').replace(/\s+/g, ' ').trim() })).filter(l => l.text);
        const H = size.height;
        // The page is drawn bottom-up here, so a large y is the top: the running header is the top band, the running footer the bottom band, inside the margins.
        const top = text.filter(l => l.y > H * 0.925), bottom = text.filter(l => l.y < H * 0.075);
        pages.push({ header: top.map(l => l.text).join(' | '), footer: bottom.map(l => l.text).join(' | '), body: text.filter(l => l.y >= H * 0.075 && l.y <= H * 0.925).sort((a, b) => b.y - a.y).map(l => l.text), lines: text });
    }
    return { info: { title: pdf.getTitle(), author: pdf.getAuthor(), subject: pdf.getSubject(), keywords: pdf.getKeywords(), creator: pdf.getCreator(), producer: pdf.getProducer(), creationDate: pdf.getCreationDate(), modificationDate: pdf.getModificationDate() }, pageCount: total, size, pages };
}
module.exports = { readPdf };
