/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Physical page settings and measured, block-boundary pagination. */
(function () {
    'use strict';
    var GAP = 24, LIMIT = 1000;
    function length(value) {
        var m = /^(\d+(?:\.\d+)?)\s*(pt|in|cm|mm|px)?$/.exec(String(value).trim());
        if (!m) { throw new Error('Page lengths use pt, in, cm, mm or px.'); }
        return +m[1] * ({ pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: 0.75 }[m[2] || 'pt']);
    }
    function settings(front) {
        var sizes = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008] }, size = sizes[String(front.page || 'a4').toLowerCase()];
        if (!size) {
            var custom = /^(\d+(?:\.\d+)?\s*(?:pt|in|cm|mm|px))\s*[x×]\s*(\d+(?:\.\d+)?\s*(?:pt|in|cm|mm|px))$/i.exec(String(front.page || ''));
            if (!custom) { throw new Error('Page size is a4, letter, legal or two lengths such as 210mm x 297mm.'); }
            size = [length(custom[1]), length(custom[2])];
        }
        size = size.slice();
        if (front.orientation && !/^(portrait|landscape)$/.test(front.orientation)) { throw Object.assign(new Error('Page orientation is portrait or landscape.'), { field: 'orientation' }); }
        if (front.orientation === 'landscape') { size.reverse(); }
        if (Math.min.apply(null, size) < 144 || Math.max.apply(null, size) > 2880) { throw new Error('Page dimensions must be between 2 and 40 inches.'); }
        var values;
        try { values = String(front.margins || '1in').trim().split(/\s+/).map(length); }
        catch (err) { err.field = 'margins'; throw err; }
        if (values.length > 4) { throw Object.assign(new Error('Margins contain one to four lengths.'), { field: 'margins' }); }
        var top = values[0], right = values[1] == null ? top : values[1], bottom = values[2] == null ? top : values[2], left = values[3] == null ? right : values[3];
        if (size[0] - left - right < 72 || size[1] - top - bottom < 72) { throw Object.assign(new Error('Page margins leave too little space for content.'), { field: 'margins' }); }
        return { width: size[0], height: size[1], margins: [left, top, right, bottom] };
    }
    function properties(front) {
        if (front.problem) { throw new Error(front.problem); }
        var props = {};
        (front.entries || []).forEach(function (entry) {
            if (['page', 'orientation', 'margins'].indexOf(entry.key) >= 0) {
                if (entry.kind === 'complex') { throw new Error('Page settings must be plain values.'); }
                props[entry.key] = entry.value;
            }
        });
        return props;
    }
    function dimensions(page) {
        return { width: page.width / .75, height: page.height / .75, left: page.margins[0] / .75, top: page.margins[1] / .75,
            right: page.margins[2] / .75, bottom: page.margins[3] / .75, content: (page.height - page.margins[1] - page.margins[3]) / .75 };
    }
    function surface(host, page) {
        var d = dimensions(page);
        host.classList.add('doc-paginated');
        Object.entries({ width: d.width, height: d.height, left: d.left, top: d.top, right: d.right, bottom: d.bottom, gap: GAP }).forEach(function (pair) {
            host.style.setProperty('--sheet-' + pair[0], pair[1] + 'px');
        });
        return d;
    }
    // The input positions exclude existing page widgets. Each block stays intact.
    function plan(blocks, page) {
        var d = dimensions(page), gaps = [], sheet = 0, added = 0, oversized = false;
        blocks.forEach(function (block, index) {
            var top = block.top + added, start = sheet * (d.height + GAP), used = top - start;
            if (index && (block.breakBefore || (used > .5 && used + block.height > d.content + .5))) {
                var space = d.height + GAP - used;
                gaps.push({ index: index, pos: block.pos, height: Math.max(0, space) });
                added += Math.max(0, space); sheet++;
            }
            if (block.height > d.content + .5) { oversized = true; }
            if (sheet >= LIMIT) { throw new Error('Document view is limited to 1,000 pages.'); }
        });
        return { gaps: gaps, count: sheet + 1, oversized: oversized };
    }
    function blocksOf(dom, positions) {
        var offset = 0, top = dom.getBoundingClientRect().top, blocks = [];
        Array.from(dom.children).forEach(function (node) {
            if (node.classList.contains('doc-page-gap')) { offset += node.getBoundingClientRect().height; return; }
            var rect = node.getBoundingClientRect(), css = getComputedStyle(node);
            blocks.push({ node: node, pos: positions ? positions[blocks.length] : 0, top: rect.top - top - offset,
                height: rect.height + Math.max(0, parseFloat(css.marginBottom) || 0),
                breakBefore: /^(page|always)$/.test(css.breakBefore) || !!(blocks.length && (blocks[blocks.length - 1].node.matches('.sc-page-break') || blocks[blocks.length - 1].node.querySelector('.sc-page-break') || /^(page|always)$/.test(getComputedStyle(blocks[blocks.length - 1].node).breakAfter))) });
        });
        return blocks;
    }
    function spacer(height) {
        var node = document.createElement('div'); node.className = 'doc-page-gap'; node.style.height = height + 'px';
        node.setAttribute('aria-hidden', 'true'); node.contentEditable = 'false'; return node;
    }
    function plugin(PM, o) {
        var key = new PM.PluginKey('document-pages'), signature = '', raf = 0, alive = true;
        function schedule(v) {
            if (raf || !alive) { return; }
            raf = requestAnimationFrame(function () {
                raf = 0; if (!alive || v.isDestroyed) { return; }
                var page = o.pagination && o.pagination();
                if (!page || !v.dom.isConnected) {
                    if (signature) { signature = ''; v.dispatch(v.state.tr.setMeta(key, PM.DecorationSet.empty).setMeta('addToHistory', false)); }
                    return;
                }
                if (!v.dom.getClientRects().length || v.dom.getBoundingClientRect().width === 0) { return; }
                try {
                    var d = surface(o.page, page), positions = []; v.state.doc.forEach(function (n, pos) { positions.push(pos); });
                    var blocks = blocksOf(v.dom, positions), layout = plan(blocks, page);
                    var next = JSON.stringify([page, layout.gaps, layout.count, layout.oversized]);
                    o.page.style.minHeight = (layout.count * (d.height + GAP) - GAP) + 'px';
                    o.page.setAttribute('data-page-count', layout.count);
                    if (o.paginated) { o.paginated(layout); }
                    if (next !== signature) {
                        signature = next;
                        var widgets = layout.gaps.map(function (gap) { return PM.Decoration.widget(gap.pos, function () { return spacer(gap.height); }, { side: -1, key: gap.pos + ':' + gap.height, ignoreSelection: true }); });
                        v.dispatch(v.state.tr.setMeta(key, PM.DecorationSet.create(v.state.doc, widgets)).setMeta('addToHistory', false));
                    }
                } catch (err) { if (o.paginationProblem) { o.paginationProblem(err.message); } }
            });
        }
        return new PM.Plugin({ key: key,
            state: { init: function () { return PM.DecorationSet.empty; }, apply: function (tr, value) { return tr.getMeta(key) || value.map(tr.mapping, tr.doc); } },
            props: { decorations: function (state) { return key.getState(state); } },
            view: function (v) {
                alive = true; signature = ''; var ro = new ResizeObserver(function () { schedule(v); }); ro.observe(v.dom);
                function loaded() { schedule(v); }
                v.dom.addEventListener('load', loaded, true); document.fonts.addEventListener('loadingdone', loaded); schedule(v);
                return { update: function () { schedule(v); }, destroy: function () { alive = false; cancelAnimationFrame(raf); raf = 0; ro.disconnect(); v.dom.removeEventListener('load', loaded, true); document.fonts.removeEventListener('loadingdone', loaded); } };
            }
        });
    }
    window.yavcDocumentPages = { paper: '--doc-size:11pt;--doc-ink:#202124;--doc-muted:#555555;--doc-accent:#2355a0;--doc-page:#ffffff;', settings: settings, properties: properties, dimensions: dimensions, surface: surface, plan: plan, blocks: blocksOf, spacer: spacer, plugin: plugin };
})();
