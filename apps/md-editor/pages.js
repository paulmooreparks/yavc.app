/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Physical page settings and measured source-free pagination. */
(function () {
    'use strict';
    var GAP = 24, LIMIT = 1000;
    function paper(value) {
        var name = String(value || 'a4').toLowerCase();
        if (name === 'ledger') { name = 'tabloid'; }
        return window.yavcPaperSizes.find(function (item) { return item.id === name || item.pwg === name; });
    }
    function length(value) {
        var m = /^(\d+(?:\.\d+)?)\s*(pt|in|cm|mm|px)?$/.exec(String(value).trim());
        if (!m) { throw new Error('Page lengths use pt, in, cm, mm or px.'); }
        return +m[1] * ({ pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: 0.75 }[m[2] || 'pt']);
    }
    function settings(front) {
        var stock = paper(front.page), size = stock ? [length(stock.width + stock.unit), length(stock.height + stock.unit)] : null;
        if (!size) {
            var custom = /^(\d+(?:\.\d+)?\s*(?:pt|in|cm|mm|px))\s*[x×]\s*(\d+(?:\.\d+)?\s*(?:pt|in|cm|mm|px))$/i.exec(String(front.page || ''));
            if (!custom) { throw new Error('Choose a standard paper size or two lengths such as 210mm x 297mm.'); }
            size = [length(custom[1]), length(custom[2])];
        }
        size = size.slice();
        if (front.orientation && !/^(portrait|landscape)$/.test(front.orientation)) { throw Object.assign(new Error('Page orientation is portrait or landscape.'), { field: 'orientation' }); }
        var landscape = front.orientation ? front.orientation === 'landscape' : size[0] > size[1];
        size.sort(function (a, b) { return a - b; }); if (landscape) { size.reverse(); }
        if (Math.min.apply(null, size) < 72 || Math.max.apply(null, size) > 8640) { throw new Error('Page dimensions must be between 1 and 120 inches.'); }
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
    // Input units exclude existing widgets. A unit is a line or an atomic block.
    function plan(blocks, page) {
        var d = dimensions(page), gaps = [], sheet = 0, added = 0, oversized = false, ends = [], references = [], noteProblem = '';
        var hasNotes=blocks.footnotes&&blocks.footnotes.length||blocks.some(function(block){return block.references&&block.references.length;});
        var notes = hasNotes && window.yavcPageFootnotes ? window.yavcPageFootnotes.create(blocks,d) : null;
        // Resolve keep chains once, so a long run of headings stays linear.
        for(var i=blocks.length-1;i>=0;i--){
            ends[i]=blocks[i].keepNext&&i+1<blocks.length&&!blocks[i+1].breakBefore&&!blocks[i+1].control?ends[i+1]:i;
            if(notes){var following=ends[i]>i?references[i+1]:new Set(),own=blocks[i].references||[];references[i]=own.every(function(label){return following.has(label);})?following:new Set(Array.from(following).concat(own));}
        }
        blocks.forEach(function (block, index) {
            var top = block.top + added, start = sheet * (d.height + GAP), used = top - start;
            var last=blocks[ends[index]],group=last.top+last.height-block.top,height=group<=d.content+.5?Math.max(block.height,group):block.height;
            var noteProposal=notes?notes.proposal(height>block.height?references[index]:new Set(block.references||[])):null;
            if (index && (block.breakBefore || (used > .5 && used + height + (noteProposal?noteProposal.height:0) > d.content + .5))) {
                var space = d.height + GAP - used;
                gaps.push({ index: index, pos: block.pos, height: Math.max(0, space) });
                added += Math.max(0, space); sheet++;
                if(notes){notes.next();noteProposal=notes.proposal(height>block.height?references[index]:new Set(block.references||[]));}
            }
            if(notes){
                if(height>block.height&&height+noteProposal.height>d.content+.5){height=block.height;noteProposal=notes.proposal(new Set(block.references||[]));}
                if(block.height+noteProposal.height>d.content+.5){oversized=true;noteProblem='A footnote leaves too little space for its reference on the page. Shorten the note or enlarge the page.';}
                notes.commit(noteProposal);
            }
            if (block.height > d.content + .5) { oversized = true; }
            if (sheet >= LIMIT) { throw new Error('Document view is limited to 1,000 pages.'); }
        });
        var result={ gaps: gaps, count: sheet + 1, oversized: oversized };
        if(notes){result.footnotes=notes.placements();result.problem=notes.problem()||noteProblem;}
        if(blocks.noteProblem)result.problem=blocks.noteProblem;
        return result;
    }
    function blocksOf(dom, positions, position) {
        var host = dom.closest('.doc-paginated'), scale = host ? Number(host.style.zoom) || 1 : 1;
        var top = dom.getBoundingClientRect().top, blocks = [], sourceIndex = 0;
        var gaps = Array.from(dom.querySelectorAll('.doc-page-gap')).map(function (node) { var r = node.getBoundingClientRect(); return { bottom: r.bottom, height: r.height / scale }; });
        var noteNodes=Array.from(dom.children).filter(function(node){return node.matches('aside.doc-footnote[data-footnote]')&&Number(node.getAttribute('data-footnote-number'))>0;}),noteOffsets=noteNodes.filter(function(node){return getComputedStyle(node).position!=='absolute';}).map(function(node){var rect=node.getBoundingClientRect();return {bottom:rect.bottom,height:rect.height/scale};}),offsets=gaps.concat(noteOffsets);
        if(Array.from(dom.querySelectorAll('aside.doc-footnote[data-footnote]')).some(function(node){return Number(node.getAttribute('data-footnote-number'))>0&&node.parentNode!==dom;}))blocks.noteProblem='Document page footnotes require top-level definitions. Move the definition outside its quotation or list, or edit it in Visual or Text view.';
        function clean(y) { return (y - top) / scale - offsets.reduce(function (sum, gap) { return sum + (gap.bottom <= y + .5 ? gap.height : 0); }, 0); }
        blocks.footnotes=noteNodes.map(function(node){return {label:node.getAttribute('data-footnote'),number:Number(node.getAttribute('data-footnote-number')),node:node,height:node.getBoundingClientRect().height/scale,pos:position?position(node.parentNode,Array.prototype.indexOf.call(node.parentNode.childNodes,node)):0,to:position?position(node.parentNode,Array.prototype.indexOf.call(node.parentNode.childNodes,node)+1):0,references:window.yavcPageFootnotes.references(node)};});
        function emit(node, suppliedPosition) {
            if (node.classList.contains('doc-page-gap')) return;
            if(noteNodes.indexOf(node)>=0)return;
            var rect = node.getBoundingClientRect(), css = getComputedStyle(node), content=node;
            while(content.matches('.doc-block,.pm-source,.dinah-src,.dinah-block')&&content.childElementCount===1)content=content.firstElementChild;
            var contentCSS=getComputedStyle(content),previous=blocks[blocks.length-1];
            var container = content.matches('ul,ol,blockquote,.pm-task-body,table,thead,tbody') || content.matches('li') && !!content.querySelector(':scope > p,:scope > ul,:scope > ol,:scope > blockquote,:scope > .pm-task-body');
            if (!node.matches('.pm-source') && !/^(avoid|avoid-page)$/.test(contentCSS.breakInside) && container) {
                var firstBlock = blocks.length;
                Array.from(content.children).forEach(function (child) {
                    var before = position ? position(child.parentNode, Array.prototype.indexOf.call(child.parentNode.childNodes, child)) : 0;
                    emit(child, before);
                });
                if (blocks.length > firstBlock) {
                    blocks[firstBlock].breakBefore = blocks[firstBlock].breakBefore || /^(page|always)$/.test(contentCSS.breakBefore);
                    var lastBlock = blocks[blocks.length - 1];
                    lastBlock.keepNext = lastBlock.keepNext || /^(avoid|avoid-page)$/.test(contentCSS.breakAfter);
                    lastBlock.breakAfter = lastBlock.breakAfter || /^(page|always)$/.test(contentCSS.breakAfter);
                }
                return;
            }
            var gapNode = node.parentElement && node.parentElement.matches('li') && node.parentElement.firstElementChild === node ? node.parentElement : node;
            if (gapNode !== node && position) suppliedPosition = position(gapNode.parentNode, Array.prototype.indexOf.call(gapNode.parentNode.childNodes, gapNode));
            var block = { node: gapNode, pos: suppliedPosition, top: clean(rect.top), row: node.tagName === 'TR', columns: node.cells ? node.cells.length : 0,
                height: clean(rect.bottom) - clean(rect.top) + Math.max(0, parseFloat(css.marginBottom) || 0),
                references:node.matches('aside.doc-footnote')?[]:window.yavcPageFootnotes?window.yavcPageFootnotes.references(node):[],
                keepNext:/^(avoid|avoid-page)$/.test(css.breakAfter)||/^(avoid|avoid-page)$/.test(contentCSS.breakAfter)||node.tagName==='TR'&&!!node.querySelector('th'),
                breakAfter:/^(page|always)$/.test(css.breakAfter)||/^(page|always)$/.test(contentCSS.breakAfter),
                control:node.matches('.sc-page-break')||!!node.querySelector('.sc-page-break'),
                breakBefore: /^(page|always)$/.test(css.breakBefore)||/^(page|always)$/.test(contentCSS.breakBefore)||!!(previous&&(previous.control||previous.breakAfter)) };
            var lines = window.yavcPageLines && window.yavcPageLines.measure(content, top, scale, offsets, position);
            if (lines) {
                var lineReferences=lines.map(function(){return [];});
                content.querySelectorAll('.doc-footnote-ref[data-footnote-ref]').forEach(function(ref){var rect=ref.getBoundingClientRect(),middle=clean((rect.top+rect.bottom)/2),index=0;while(index+1<lines.length&&lines[index+1].top<=middle)index++;lineReferences[index].push(ref.getAttribute('data-footnote-ref'));});
                lines.forEach(function (line, i) {
                    blocks.push(Object.assign({}, block, line, { references:lineReferences[i],anchor: i ? line.anchor : null, pos: i ? line.pos : block.pos,
                        breakBefore: i === 0 && block.breakBefore, breakAfter: i === lines.length - 1 && block.breakAfter,
                        keepNext: i < line.orphans - 1 || i >= lines.length - line.widows && i < lines.length - 1 || i === lines.length - 1 && block.keepNext }));
                });
            } else blocks.push(block);
        }
        Array.from(dom.children).forEach(function (node) { if (node.classList.contains('doc-page-gap')) return; emit(node, positions ? positions[sourceIndex] : 0); sourceIndex++; });
        return blocks;
    }
    function spacer(height, inline, block) {
        var list = block && block.node.parentElement && block.node.parentElement.matches('ul,ol');
        var node = document.createElement(inline ? 'span' : block && block.row ? 'tr' : list ? 'li' : 'div'); node.className = 'doc-page-gap' + (inline ? ' doc-page-gap-inline' : ''); node.style.height = height + 'px';
        if (block && block.row) { var cell = document.createElement('td'); cell.colSpan = block.columns; node.append(cell); }
        node.setAttribute('aria-hidden', 'true'); node.contentEditable = 'false'; return node;
    }
    function preview(o) {
        var alive = true, raf = 0, signature = '';
        function schedule() {
            if (!alive || raf) { return; }
            raf = requestAnimationFrame(function () {
                raf = 0; var page = o.settings();
                if (!alive || !page || !o.flow.isConnected || !o.flow.getBoundingClientRect().width) { return; }
                try {
                    // Preview source wrappers do not participate in physical layout.
                    Array.from(o.flow.querySelectorAll('.dinah-src[data-start]')).reverse().forEach(function (node) { node.replaceWith.apply(node, Array.from(node.childNodes)); });
                    var blocks = blocksOf(o.flow), layout = plan(blocks, page), next = JSON.stringify([page, layout.gaps, layout.count, layout.oversized,layout.footnotes,layout.problem]);
                    var d = surface(o.host, page); o.host.style.minHeight = (layout.count * (d.height + GAP) - GAP) + 'px'; o.host.setAttribute('data-page-count', layout.count);
                    o.changed(layout);
                    if (next !== signature) {
                        o.flow.querySelectorAll('.doc-page-gap').forEach(function (node) { node.remove(); }); o.flow.normalize();
                        blocks = blocksOf(o.flow); layout = plan(blocks, page);
                        if (window.yavcDocumentSettings) { window.yavcDocumentSettings.decorate(o.host, page, layout.count); }
                        signature = JSON.stringify([page, layout.gaps, layout.count, layout.oversized,layout.footnotes,layout.problem]);
                        layout.gaps.slice().reverse().forEach(function (gap) { var block = blocks[gap.index]; window.yavcPageLines.insert(o.flow, block, spacer(gap.height, !!block.anchor, block)); });
                        (layout.footnotes||[]).forEach(function(note){var node=blocks.footnotes.find(function(item){return item.label===note.label;}).node;node.classList.add('doc-footnote-paged');node.style.top=note.top+'px';node.style.width='100%';});
                    }
                } catch (err) { o.problem(err.message); }
            });
        }
        var ro = new ResizeObserver(schedule); ro.observe(o.flow);
        o.flow.addEventListener('load', schedule, true); document.fonts.addEventListener('loadingdone', schedule); schedule();
        return { refresh: function () { signature = ''; schedule(); }, destroy: function () { alive = false; cancelAnimationFrame(raf); ro.disconnect(); o.flow.removeEventListener('load', schedule, true); document.fonts.removeEventListener('loadingdone', schedule); } };
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
                    var blocks = blocksOf(v.dom, positions, function (node, offset) { return v.posAtDOM(node, offset); }), layout = plan(blocks, page);
                    var next = JSON.stringify([page, layout.gaps, layout.count, layout.oversized,layout.footnotes,layout.problem]);
                    o.page.style.minHeight = (layout.count * (d.height + GAP) - GAP) + 'px';
                    o.page.setAttribute('data-page-count', layout.count);
                    if (o.paginated) { o.paginated(layout); }
                    if (next !== signature) {
                        signature = next;
                        if (window.yavcDocumentSettings) { window.yavcDocumentSettings.decorate(o.page, page, layout.count); }
                        var widgets = layout.gaps.map(function (gap) { return PM.Decoration.widget(gap.pos, function () { return spacer(gap.height, !!blocks[gap.index].anchor, blocks[gap.index]); }, { side: -1, key: gap.pos + ':' + gap.height, ignoreSelection: true }); });
                        (layout.footnotes||[]).forEach(function(note){widgets.push(PM.Decoration.node(note.pos,note.to,{class:'doc-footnote-paged',style:'top:'+note.top+'px;width:100%;'}));});
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
    window.yavcDocumentPages = { paper: '--doc-size:11pt;--doc-ink:#202124;--doc-muted:#555555;--doc-accent:#2355a0;--doc-page:#ffffff;--doc-rule:#cfd4da;--doc-code:#e4e7eb;--doc-warning:#b86e1c;--doc-danger:#b42318;--doc-positive:#2e7d4f;', lookup: paper, length: length, settings: settings, properties: properties, dimensions: dimensions, surface: surface, plan: plan, blocks: blocksOf, spacer: spacer, preview: preview, plugin: plugin };
})();
