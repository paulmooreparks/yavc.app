/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* JSON Canvas edits and gesture geometry. The input is never changed. Every
   result passes the same reader as a file before it can replace the text. */
(function (root) {
    'use strict';
    var J = typeof module === 'object' && module.exports ? require('../diagram-kit/jcanvas.js') : root.yavcCanvas;
    function copy(v) { return JSON.parse(JSON.stringify(v)); }
    function node(doc, id) { return doc.nodes.find(function (n) { return n.id === id; }); }
    function integer(v) { if (!Number.isSafeInteger(v)) { throw new Error('Give a whole number within the safe numeric range.'); } return v; }
    function idMaker(doc) {
        var taken = new Set(doc.nodes.concat(doc.edges).map(function (n) { return n.id; })), next = Object.create(null);
        return function (prefix) {
            var i = next[prefix] || 1, id = prefix;
            while (taken.has(id)) { id = prefix + '-' + (++i); }
            next[prefix] = i; taken.add(id); return id;
        };
    }
    function inside(n, g) { return n.id !== g.id && n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height; }
    function members(doc, id) {
        var g = node(doc, id);
        return g && g.type === 'group' ? doc.nodes.filter(function (n) { return inside(n, g); }).map(function (n) { return n.id; }) : [];
    }
    function checked(doc) {
        var text = J.write(doc), got = J.read(text), problem = got.problems.find(function (p) { return !p.warning; });
        if (!got.doc || problem) { throw new Error(problem ? problem.message : 'The canvas is invalid.'); }
        return { doc: got.doc, text: text };
    }
    /* Snapping uses screen distance, converted by the view to file units.
       Shape guides win over the grid when they are within that distance. */
    function snap(box, nodes, ignore, tolerance, off, resize) {
        var b = Object.assign({}, box), guides = [];
        if (off) { return { box: b, guides: guides }; }
        [['x', 'width'], ['y', 'height']].forEach(function (axis) {
            var a = axis[0], size = axis[1], factors = resize ? [1] : [0, 0.5, 1], best = null;
            nodes.forEach(function (n) {
                if (ignore.indexOf(n.id) >= 0) { return; }
                [0, 0.5, 1].forEach(function (f) {
                    var at = n[a] + n[size] * f;
                    factors.forEach(function (q) {
                        var d = at - (b[a] + b[size] * q);
                        if (Math.abs(d) <= tolerance && (!best || Math.abs(d) < Math.abs(best.d))) { best = { d: d, at: at }; }
                    });
                });
            });
            if (resize) { b[size] = Math.max(1, Math.round(b[size] + (best ? best.d : Math.round((b[a] + b[size]) / 8) * 8 - b[a] - b[size]))); }
            else { b[a] = Math.round(best ? b[a] + best.d : Math.round(b[a] / 8) * 8); }
            if (best) { guides.push({ axis: a, at: best.at }); }
        });
        return { box: b, guides: guides };
    }
    function resize(box, handle, dx, dy, ratio) {
        var b = Object.assign({}, box), west = handle.indexOf('w') >= 0, north = handle.indexOf('n') >= 0;
        if (/[ew]/.test(handle)) { b.width = Math.max(1, Math.round(box.width + (west ? -dx : dx))); }
        if (/[ns]/.test(handle)) { b.height = Math.max(1, Math.round(box.height + (north ? -dy : dy))); }
        if (ratio && box.width > 0 && box.height > 0) {
            var r = box.width / box.height;
            if (!/[ew]/.test(handle) || (/[ns]/.test(handle) && Math.abs(dy / box.height) > Math.abs(dx / box.width))) { b.width = Math.max(1, Math.round(b.height * r)); }
            else { b.height = Math.max(1, Math.round(b.width / r)); }
        }
        b.x = west ? box.x + box.width - b.width : box.x;
        b.y = north ? box.y + box.height - b.height : box.y;
        return b;
    }
    function edit(source, req) {
        var doc = copy(source), key = req.key || '', n = node(doc, key), e = doc.edges.find(function (x) { return x.id === key; }), item = req.kind === 'edge' ? e : req.kind === 'node' ? n : n || e;
        var freeId = idMaker(doc);
        function needNode() { if (!n || req.kind === 'edge') { throw new Error('Select a node first.'); } }
        function needItem() { if (!item) { throw new Error('That node or connector is no longer here.'); } }
        if (req.op === 'move') {
            needNode();
            var dx = integer(req.dx), dy = integer(req.dy), moving = [key].concat(members(doc, key));
            doc.nodes.forEach(function (x) { if (moving.indexOf(x.id) >= 0) { x.x = integer(Math.round(x.x + dx)); x.y = integer(Math.round(x.y + dy)); } });
        } else if (req.op === 'resize') {
            needNode();
            ['x', 'y', 'width', 'height'].forEach(function (k) { if (req[k] != null) { n[k] = integer(req[k]); } });
            if (n.width < 1 || n.height < 1) { throw new Error('A resized node must be at least one pixel wide and high.'); }
        } else if (req.op === 'create') {
            var type = req.type || 'text';
            n = { id: freeId(type === 'group' ? 'group' : 'node'), type: type, x: integer(req.x == null ? 0 : req.x), y: integer(req.y == null ? 0 : req.y), width: 180, height: 80 };
            if (type === 'group') { n.label = 'Group'; n.width = 400; n.height = 240; }
            else if (type === 'text') { n.text = req.text == null ? 'New shape' : req.text; n.yavc = { shape: req.shape || 'rectangle' }; }
            else { throw new Error('New nodes must be text nodes or groups.'); }
            if (type === 'group') { doc.nodes.unshift(n); } else { doc.nodes.push(n); }
            key = n.id;
        } else if (req.op === 'connect') {
            if (!node(doc, req.from) || !node(doc, req.to)) { throw new Error('Choose two nodes for the connector.'); }
            e = { id: freeId('edge'), fromNode: req.from, toNode: req.to, fromSide: req.fromSide || 'right', toSide: req.toSide || 'left', toEnd: 'arrow' };
            doc.edges.push(e); key = e.id;
        } else if (req.op === 'set') {
            needItem();
            var property = req.property, allowed = item === n ? ['text', 'label', 'color', 'shape', 'line', 'lineWidth'] : ['label', 'color', 'route', 'fromHead', 'toHead', 'fromSide', 'toSide', 'line', 'lineWidth'];
            if (allowed.indexOf(property) < 0 || (property === 'text' && n.type !== 'text') || (property === 'shape' && n.type !== 'text')) { throw new Error('That property cannot be changed on this item.'); }
            var target = ['shape', 'route', 'fromHead', 'toHead', 'line', 'lineWidth'].indexOf(property) >= 0 ? (item.yavc || (item.yavc = {})) : item;
            if (req.value === null || (req.value === '' && property !== 'text')) { delete target[property]; } else { target[property] = req.value; }
        } else if (req.op === 'delete') {
            needItem();
            if (item === n) {
                doc.nodes = doc.nodes.filter(function (x) { return x.id !== key; });
                doc.edges = doc.edges.filter(function (x) { return x.fromNode !== key && x.toNode !== key; });
            } else { doc.edges = doc.edges.filter(function (x) { return x.id !== key; }); }
            key = '';
        } else if (req.op === 'order') {
            needNode();
            var at = doc.nodes.indexOf(n), to = Math.max(0, Math.min(doc.nodes.length - 1, at + (req.direction === 'back' ? -1 : 1)));
            doc.nodes.splice(at, 1); doc.nodes.splice(to, 0, n);
        } else if (req.op === 'duplicate' || req.op === 'paste') {
            if (req.op === 'duplicate') { needNode(); }
            var fragment = req.op === 'paste' ? J.read(req.text) : { doc: fragmentOf(doc, key, req.kind) };
            if (!fragment.doc || (fragment.problems || []).some(function (p) { return !p.warning; })) { throw new Error('The clipboard does not hold a valid canvas selection.'); }
            var part = copy(fragment.doc), map = Object.create(null), offset = req.offset == null ? 24 : integer(req.offset);
            if (doc.nodes.length + doc.edges.length + part.nodes.length + part.edges.length > J.LIMITS.items) { throw new Error('Pasting would exceed the ' + J.LIMITS.items + ' node and connector limit.'); }
            part.nodes.forEach(function (x) {
                var old = x.id; x.id = freeId('node'); map[old] = x.id;
                x.x = integer(x.x + offset); x.y = integer(x.y + offset); doc.nodes.push(x);
            });
            part.edges.forEach(function (x) {
                if (!map[x.fromNode] || !map[x.toNode]) { return; }
                x.id = freeId('edge'); x.fromNode = map[x.fromNode]; x.toNode = map[x.toNode]; doc.edges.push(x);
            });
            key = part.nodes.length ? part.nodes[0].id : '';
        } else { throw new Error('Unknown canvas operation.'); }
        var result = checked(doc); result.key = key; return result;
    }
    function fragmentOf(doc, key, kind) {
        var ids = kind === 'edge' ? [] : [key].concat(members(doc, key));
        return copy({ nodes: doc.nodes.filter(function (n) { return ids.indexOf(n.id) >= 0; }), edges: doc.edges.filter(function (e) { return ids.indexOf(e.fromNode) >= 0 && ids.indexOf(e.toNode) >= 0; }) });
    }
    var api = Object.freeze({ edit: edit, snap: snap, resize: resize, members: members, fragment: fragmentOf });
    if (typeof module === 'object' && module.exports) { module.exports = api; } else { root.yavcCanvasModel = api; }
})(typeof window !== 'undefined' ? window : this);
