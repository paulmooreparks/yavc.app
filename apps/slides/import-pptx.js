/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* A PowerPoint file as a deck (docs/slides-design.md, decision 14): the
   .pptx is a zip of Office Open XML, read with JSZip (vendor/jszip-3.10.1,
   MIT) and the browser's XML parser. Each slide's placeholders and text
   boxes become Markdown: the title placeholder a heading, body text
   paragraphs and lists with their levels and emphasis, tables as tables,
   two bodies side by side as columns, the notes page as {{notes}}. A
   picture is kept as a note of its name, since a deck is a text file and
   the home folder keeps text (DESIGN.md, decision 11).

     yavcSlidesImport.pptx(arrayBuffer, ctx) -> Promise<{ text, title, slides, pictures }> */
(function () {
    'use strict';
    if (window.yavcSlidesImport) { return; }

    var NS = {
        a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
        p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
        r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        rel: 'http://schemas.openxmlformats.org/package/2006/relationships'
    };
    function parse(xml) { return new DOMParser().parseFromString(xml, 'application/xml'); }
    function all(node, ns, name) { return node ? Array.prototype.slice.call(node.getElementsByTagNameNS(NS[ns], name)) : []; }
    function first(node, ns, name) { return all(node, ns, name)[0] || null; }
    function children(node, ns, name) { return Array.prototype.filter.call(node.childNodes, function (c) { return c.nodeType === 1 && c.namespaceURI === NS[ns] && c.localName === name; }); }

    /* A part's text, counted as it is decompressed through JSZip's
       documented stream, and stopped at a limit: a file a few kilobytes
       long can hold gigabytes once inflated (security review, 2026-11-03).
       budget is shared by every part one import reads. */
    var PART_MAX = 16 * 1024 * 1024, TOTAL_MAX = 64 * 1024 * 1024, SLIDES_MAX = 1000;
    function text(f, budget) {
        return new Promise(function (resolve, reject) {
            var chunks = [], n = 0, stopped = false, stream = f.internalStream('uint8array');
            stream.on('data', function (c) {
                if (stopped) { return; }
                n += c.length; budget.used += c.length;
                if (n > PART_MAX || budget.used > TOTAL_MAX) {
                    stopped = true; stream.pause();
                    reject(new Error('this file is far larger inside than a presentation can be, so it was not read'));
                    return;
                }
                chunks.push(c);
            }).on('error', function (err) { if (!stopped) { stopped = true; reject(err); } })
              .on('end', function () {
                if (stopped) { return; }
                var all = new Uint8Array(n), at = 0;
                chunks.forEach(function (c) { all.set(c, at); at += c.length; });
                resolve(new TextDecoder('utf-8').decode(all));
            }).resume();
        });
    }
    function rels(zip, partPath, budget) {
        var dir = partPath.replace(/[^/]*$/, ''), name = partPath.replace(/^.*\//, '');
        var relPath = dir + '_rels/' + name + '.rels';
        var f = zip.file(relPath);
        if (!f) { return Promise.resolve({}); }
        return text(f, budget).then(function (xml) {
            var doc = parse(xml), out = {};
            all(doc, 'rel', 'Relationship').forEach(function (r) {
                var target = r.getAttribute('Target'), mode = r.getAttribute('TargetMode');
                out[r.getAttribute('Id')] = { type: r.getAttribute('Type'), target: mode === 'External' ? target : resolve(dir, target), external: mode === 'External' };
            });
            return out;
        });
    }
    function resolve(dir, target) {
        var parts = (dir + target).split('/'), out = [];
        parts.forEach(function (p) { if (p === '..') { out.pop(); } else if (p && p !== '.') { out.push(p); } });
        return out.join('/');
    }

    /* A body's words alone, for a title, which carries no emphasis. */
    function plainText(txBody) {
        return children(txBody, 'a', 'p').map(function (p) { return all(p, 'a', 't').map(function (t) { return t.textContent; }).join('').trim(); }).filter(Boolean).join(' ');
    }
    function esc(s) { return String(s).replace(/([\\`*_\[\]#])/g, '\\$1').replace(/\{\{/g, '\\{\\{'); }

    /* A paragraph's Markdown, with its runs' emphasis and links. */
    function runText(p, links) {
        var out = '';
        Array.prototype.forEach.call(p.childNodes, function (c) {
            if (c.nodeType !== 1) { return; }
            if (c.localName === 'br') { out += '  \n'; return; }
            if (c.localName === 'r' || c.localName === 'fld') {
                var t = first(c, 'a', 't'), text = t ? t.textContent : '';
                if (!text) { return; }
                var pr = first(c, 'a', 'rPr'), bold = pr && pr.getAttribute('b') === '1', italic = pr && pr.getAttribute('i') === '1';
                var link = pr ? first(pr, 'a', 'hlinkClick') : null, href = link ? (links[link.getAttributeNS(NS.r, 'id')] || {}).target : null;
                var s = esc(text);
                if (s.trim()) {
                    var lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0], core = s.trim();
                    if (bold && italic) { core = '***' + core + '***'; } else if (bold) { core = '**' + core + '**'; } else if (italic) { core = '*' + core + '*'; }
                    if (href) { core = '[' + core + '](' + href + ')'; }
                    s = lead + core + trail;
                }
                out += s;
            }
        });
        return out;
    }

    /* A text body as Markdown lines: bullets by level, numbers, plain
       paragraphs. A body placeholder's paragraphs are bulleted unless
       they say otherwise; a title's and a text box's are not. */
    /* A paragraph that is one link to a hosted video is the video. */
    var VIDEO = /^\[([^\]]*)\]\((https?:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\/[^\s)]+)\)$/;
    function bodyMarkdown(txBody, links, bulleted) {
        var lines = [], lastBlank = true;
        children(txBody, 'a', 'p').forEach(function (p) {
            var text = runText(p, links).replace(/\s+$/, '');
            var vm = VIDEO.exec(text.trim());
            if (vm) { text = '{{video:' + vm[2] + (vm[1] ? ' title="' + vm[1].replace(/"/g, '') + '"' : '') + '}}'; bulleted = false; }
            var pPr = first(p, 'a', 'pPr'), lvl = pPr ? parseInt(pPr.getAttribute('lvl') || '0', 10) : 0;
            var none = pPr && first(pPr, 'a', 'buNone'), auto = pPr && first(pPr, 'a', 'buAutoNum'), chr = pPr && (first(pPr, 'a', 'buChar') || first(pPr, 'a', 'buFont'));
            var bullet = !none && (bulleted || !!chr || !!auto);
            if (!text.trim()) { if (!lastBlank) { lines.push(''); lastBlank = true; } return; }
            if (bullet) { lines.push('  '.repeat(lvl) + (auto ? '1. ' : '- ') + text.trim()); lastBlank = false; }
            else { if (!lastBlank) { lines.push(''); } lines.push(text.trim()); lines.push(''); lastBlank = true; }
        });
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
    }

    function tableMarkdown(tbl, links) {
        var rows = all(tbl, 'a', 'tr').map(function (tr) {
            return children(tr, 'a', 'tc').map(function (tc) {
                var body = first(tc, 'a', 'txBody');
                return body ? children(body, 'a', 'p').map(function (p) { return runText(p, links).trim(); }).join(' ').replace(/\|/g, '\\|') : '';
            });
        });
        if (!rows.length) { return ''; }
        var n = Math.max.apply(null, rows.map(function (r) { return r.length; }));
        var line = function (r) { while (r.length < n) { r.push(''); } return '| ' + r.join(' | ') + ' |'; };
        return [line(rows[0]), '| ' + rows[0].map(function () { return '---'; }).join(' | ') + ' |'].concat(rows.slice(1).map(line)).join('\n');
    }

    function phType(sp) {
        var ph = first(sp, 'p', 'ph');
        return ph ? (ph.getAttribute('type') || 'body') : null;
    }
    function offsetOf(sp) {
        var off = first(sp, 'a', 'off');
        return off ? { x: +off.getAttribute('x') || 0, y: +off.getAttribute('y') || 0 } : { x: 0, y: 0 };
    }

    async function pptx(buffer, ctx) {
        await ctx.loadScript(ctx.here + 'vendor/jszip-3.10.1/jszip.min.js' + ctx.stamp);
        var zip = await window.JSZip.loadAsync(buffer);
        var presFile = zip.file('ppt/presentation.xml');
        if (!presFile) { throw new Error('this is not a PowerPoint file: it has no presentation inside'); }
        var budget = { used: 0 };
        var pres = parse(await text(presFile, budget));
        var presRels = await rels(zip, 'ppt/presentation.xml', budget);
        var size = first(pres, 'p', 'sldSz');
        var ratio = size ? (+size.getAttribute('cx') / +size.getAttribute('cy')) : 16 / 9;
        var ids = all(pres, 'p', 'sldId').map(function (s) { return s.getAttributeNS(NS.r, 'id'); });
        if (ids.length > SLIDES_MAX) { throw new Error('this presentation has ' + ids.length + ' slides, more than the ' + SLIDES_MAX + ' a deck can take'); }
        var slides = [], pictures = 0, title = '';

        for (var i = 0; i < ids.length; i++) {
            var part = (presRels[ids[i]] || {}).target;
            var f = part && zip.file(part);
            if (!f) { continue; }
            var doc = parse(await text(f, budget)), links = await rels(zip, part, budget);
            var tree = first(doc, 'p', 'spTree');
            var titleText = '', subtitle = '', bodies = [], extras = [], notes = '';
            var shapes = tree ? Array.prototype.filter.call(tree.childNodes, function (c) { return c.nodeType === 1; }) : [];
            shapes.forEach(function (sp) {
                if (sp.localName === 'sp') {
                    var type = phType(sp), txBody = first(sp, 'p', 'txBody');
                    if (!txBody) { return; }
                    if (type === 'title' || type === 'ctrTitle') { titleText = plainText(txBody); return; }
                    if (type === 'subTitle') { subtitle = bodyMarkdown(txBody, links, false); return; }
                    if (type === 'sldNum' || type === 'dt' || type === 'ftr') { return; }
                    var md = bodyMarkdown(txBody, links, type === 'body' || type === 'obj');
                    if (md) { bodies.push({ text: md, x: offsetOf(sp).x, y: offsetOf(sp).y, placeholder: !!type, lines: children(txBody, 'a', 'p').length }); }
                } else if (sp.localName === 'graphicFrame') {
                    var tbl = first(sp, 'a', 'tbl');
                    if (tbl) { extras.push(tableMarkdown(tbl, links)); } else { extras.push('_[A chart or diagram from the original.]_'); }
                } else if (sp.localName === 'pic') {
                    var name = (first(sp, 'p', 'cNvPr') || {}).getAttribute ? first(sp, 'p', 'cNvPr').getAttribute('descr') || first(sp, 'p', 'cNvPr').getAttribute('name') : 'picture';
                    pictures++;
                    extras.push('_[Picture: ' + esc(name || 'picture') + ']_');
                } else if (sp.localName === 'grpSp') {
                    all(sp, 'p', 'txBody').forEach(function (tb) { var md = bodyMarkdown(tb, links, false); if (md) { bodies.push({ text: md, x: 0, placeholder: false }); } });
                }
            });
            for (var id in links) {
                if (links[id].type && /notesSlide$/.test(links[id].type)) {
                    var nf = zip.file(links[id].target);
                    if (nf) {
                        var ndoc = parse(await text(nf, budget));
                        all(ndoc, 'p', 'sp').forEach(function (sp) {
                            if (phType(sp) === 'body') { var tb = first(sp, 'p', 'txBody'); if (tb) { notes = bodyMarkdown(tb, links, false); } }
                        });
                    }
                }
            }
            /* A file from a tool that writes text boxes rather than
               placeholders: the topmost short one-line box is the title. */
            if (!titleText && bodies.length) {
                bodies.sort(function (a, b) { return a.y - b.y; });
                var top = bodies[0], plain = top.text.replace(/\*/g, '').replace(/\\([\\`*_\[\]#])/g, '$1');
                if (top.lines === 1 && plain.length <= 90 && plain.indexOf('\n') < 0) { titleText = plain; bodies.shift(); }
            }
            var layout = 'content', parts = [];
            var placeholders = bodies.filter(function (b) { return b.placeholder; });
            if (i === 0 && !bodies.length) { layout = 'title'; if (!title) { title = titleText; } }
            else if (!bodies.length && !extras.length && titleText) { layout = 'section'; }
            if (layout === 'title') {
                parts.push('# ' + (titleText || 'Untitled'));
                if (subtitle) { parts.push('## ' + subtitle.replace(/\n+/g, ' ')); }
            } else {
                if (titleText) { parts.push('## ' + titleText); }
                if (subtitle) { parts.push(subtitle); }
                if (placeholders.length === 2 && bodies.length === 2) {
                    layout = 'two-column';
                    bodies.sort(function (a, b) { return a.x - b.x; });
                    parts.push('{{columns}}\n' + bodies[0].text + '\n\n{{column}}\n\n' + bodies[1].text + '\n{{/columns}}');
                } else {
                    bodies.forEach(function (b) { parts.push(b.text); });
                }
                extras.forEach(function (e) { parts.push(e); });
            }
            var text = '{{slide' + (layout !== 'content' ? ':layout=' + layout : '') + '}}\n' + parts.join('\n\n') + '\n';
            if (notes) { text += '\n{{notes}}\n' + notes + '\n{{/notes}}\n'; }
            slides.push(text);
            if (!title && titleText) { title = titleText; }
        }
        if (!slides.length) { throw new Error('the file has no slides'); }
        var front = '---\ntitle: ' + (title || 'An imported deck').replace(/\n/g, ' ') + '\nsize: ' + (Math.abs(ratio - 4 / 3) < 0.05 ? '4:3' : '16:9') + '\n---\n';
        return { text: front + slides.join('\n---\n\n'), title: title, slides: slides.length, pictures: pictures };
    }

    window.yavcSlidesImport = Object.freeze({ pptx: pptx });
})();
