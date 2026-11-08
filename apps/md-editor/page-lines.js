/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Measured paragraph boundaries. DOM ranges and widget anchors stay outside source. */
(function () {
    'use strict';
    var LIMIT = 20000;
    function lines(element, origin, scale, gaps, position) {
        if (!element.matches('p,li') || element.closest('.pm-source') || element.querySelector('img,svg,iframe,[contenteditable="false"]:not(.doc-page-gap)')) return null;
        var css = getComputedStyle(element);
        if (/^(avoid|avoid-page)$/.test(css.breakInside) || /^(pre|nowrap)$/.test(css.whiteSpace)) return null;
        function clean(y) { return (y - origin) / scale - gaps.reduce(function (sum, gap) { return sum + (gap.bottom <= y + .5 ? gap.height : 0); }, 0); }
        var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), text, rows = [], range = document.createRange();
        while ((text = walker.nextNode())) {
            if (!text.length || text.parentElement.closest('.doc-page-gap')) continue;
            range.selectNodeContents(text);
            var rects = Array.from(range.getClientRects()).filter(function (r) { return r.width > 0 && r.height > 0; });
            for (var rect of rects) {
                var top = clean(rect.top), bottom = clean(rect.bottom), previous = rows[rows.length - 1];
                if (previous && top < previous.bottom - .5) { previous.bottom = Math.max(previous.bottom, bottom); continue; }
                // Find the first character on this measured line. Character
                // ranges use UTF-16 DOM offsets, matching ProseMirror positions.
                var low = 0, high = text.length;
                while (low < high) {
                    var mid = Math.floor((low + high) / 2);
                    range.setStart(text, mid); range.setEnd(text, mid + 1);
                    if (range.getBoundingClientRect().top < rect.top - .5) low = mid + 1; else high = mid;
                }
                if (low === text.length) continue;
                // A range must never start between a Unicode surrogate pair.
                if (low && /[\uDC00-\uDFFF]/.test(text.data[low])) low--;
                rows.push({ anchor: text, offset: low, top: top, bottom: bottom, pos: position ? position(text, low) : 0 });
                if (rows.length > LIMIT) return null;
            }
        }
        if (rows.length < 2) return null;
        var box = element.getBoundingClientRect(), end = clean(box.bottom) + Math.max(0, parseFloat(css.marginBottom) || 0);
        rows.forEach(function (row, i) {
            row.top = i ? (rows[i - 1].bottom + row.top) / 2 : clean(box.top);
            row.height = Math.max(0, (i + 1 < rows.length ? (row.bottom + rows[i + 1].top) / 2 : end) - row.top);
            row.line = i; row.lines = rows.length;
            row.orphans = Math.max(1, Math.min(10, parseInt(css.orphans, 10) || 2));
            row.widows = Math.max(1, Math.min(10, parseInt(css.widows, 10) || 2));
        });
        return rows;
    }
    function insert(flow, block, gap) {
        if (!block.anchor) { block.node.parentNode.insertBefore(gap, block.node); return; }
        var range = document.createRange(); range.setStart(block.anchor, block.offset); range.collapse(true); range.insertNode(gap);
    }
    function fragment(flow, blocks, from, to) {
        var range = document.createRange(), first = blocks[from], last = blocks[to];
        if (first.anchor) range.setStart(first.anchor, first.offset); else range.setStartBefore(first.node);
        if (!last) range.setEnd(flow, flow.childNodes.length);
        else if (last.anchor) range.setEnd(last.anchor, last.offset); else range.setEndBefore(last.node);
        var ancestor = range.commonAncestorContainer, output = range.cloneContents();
        if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
        while (ancestor && ancestor !== flow) {
            var shell = ancestor.cloneNode(false); shell.removeAttribute('id'); shell.append(output); output = shell; ancestor = ancestor.parentElement;
        }
        // A continued ordered list retains its displayed item number.
        var start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer.childNodes[range.startOffset] || range.startContainer;
        var lists = [], continuedItems = [], branch = start;
        while (branch && branch !== flow) {
            if (branch.tagName === 'LI' && !(range.startContainer === branch.parentNode && branch.parentNode.childNodes[range.startOffset] === branch)) continuedItems.unshift(branch);
            if (branch.parentElement && branch.parentElement.tagName === 'OL') {
                var list = branch.parentElement, items = Array.from(list.children).filter(function (item) { return item.tagName === 'LI' && !item.classList.contains('doc-page-gap'); });
                lists.unshift((Number(list.getAttribute('start')) || 1) + Math.max(0, items.indexOf(branch)));
            }
            branch = branch.parentElement;
        }
        var continued = output.nodeType === Node.ELEMENT_NODE && output.tagName === 'OL' ? [output] : [];
        continued = continued.concat(Array.from(output.querySelectorAll('ol')));
        lists.forEach(function (number, i) { if (continued[i]) continued[i].setAttribute('start', number); });
        var itemClones = output.nodeType === Node.ELEMENT_NODE && output.tagName === 'LI' ? [output] : [];
        itemClones = itemClones.concat(Array.from(output.querySelectorAll('li')));
        continuedItems.forEach(function (_, i) { if (itemClones[i]) itemClones[i].classList.add('doc-list-continuation'); });
        function openEdge(container, side) {
            var tags = new Set(), source = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
            while (source && source !== flow) { tags.add(source.tagName); source = source.parentElement; }
            var edge = output;
            while (edge[side === 'start' ? 'firstChild' : 'lastChild']) edge = edge[side === 'start' ? 'firstChild' : 'lastChild'];
            while (edge) {
                if (edge.nodeType === Node.ELEMENT_NODE && tags.has(edge.tagName)) edge.classList.add('doc-fragment-open-' + side);
                if (edge === output) break;
                edge = edge.parentNode;
            }
        }
        openEdge(range.startContainer, 'start'); openEdge(range.endContainer, 'end');
        // A table fragment must retain the measured column widths. Letting a
        // shorter page choose new widths can rewrap cells after pagination.
        var sourceTables = Array.from(flow.querySelectorAll('table')).filter(function (table) { return range.intersectsNode(table); });
        var tableCopies = output.nodeType === Node.ELEMENT_NODE && output.tagName === 'TABLE' ? [output] : [];
        tableCopies = tableCopies.concat(Array.from(output.querySelectorAll('table')));
        tableCopies.forEach(function (table, i) {
            var original = sourceTables[i], row = original && original.rows[0];
            if (!row) return;
            var columns = document.createElement('colgroup'), host = flow.closest('.doc-paginated'), zoom = host ? Number(host.style.zoom) || 1 : 1;
            Array.from(row.cells).forEach(function (cell) { var column = document.createElement('col'); column.style.width = cell.getBoundingClientRect().width / zoom + 'px'; columns.append(column); });
            table.querySelectorAll(':scope > colgroup').forEach(function (group) { group.remove(); });
            table.prepend(columns); table.style.tableLayout = 'fixed'; table.style.width = original.getBoundingClientRect().width / zoom + 'px';
        });
        return output;
    }
    window.yavcPageLines = Object.freeze({ measure: lines, insert: insert, fragment: fragment });
})();
