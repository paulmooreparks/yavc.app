/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The JSON Canvas hit layer and camera. Camera coordinates are file pixels;
   exports keep using the renderer's content bounds. A drag only previews,
   and pointerup submits one edit against the text it started on. */
(function () {
    'use strict';
    var NS = 'http://www.w3.org/2000/svg';
    function attach(place, stage, host) {
        var M = window.yavcCanvasModel, J = window.yavcCanvas, doc, out, picture, selection = null;
        var camera = null, scale = 1, autoFit = true, drag = null, space = false, destroyed = false;
        var layer = document.createElementNS(NS, 'svg'), grips = document.createElement('div');
        layer.setAttribute('class', 'dg-cv-layer'); layer.setAttribute('aria-hidden', 'true');
        grips.className = 'dg-cv-grips';
        place.classList.add('dg-cv-editor');
        function svg(name, attrs) {
            var e = document.createElementNS(NS, name);
            Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
            return e;
        }
        function selectedNode() { return selection && selection.kind === 'node' && doc.nodes.find(function (n) { return n.id === selection.id; }); }
        function point(e) {
            var r = place.getBoundingClientRect();
            return { x: camera.x + (e.clientX - r.left) / scale, y: camera.y + (e.clientY - r.top) / scale };
        }
        function view() {
            if (!out || !camera || !picture) { return; }
            var r = place.getBoundingClientRect();
            camera.w = r.width / scale; camera.h = r.height / scale;
            var vb = [camera.x - out.origin[0], camera.y - out.origin[1], camera.w, camera.h].join(' ');
            picture.setAttribute('viewBox', vb); layer.setAttribute('viewBox', vb);
            picture.setAttribute('preserveAspectRatio', 'none'); layer.setAttribute('preserveAspectRatio', 'none');
            mark();
        }
        function fit() {
            if (!out) { return; }
            var r = place.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) { return; }
            scale = Math.min(1, r.width / out.width, r.height / out.height);
            autoFit = true;
            camera = { x: out.origin[0] - (r.width / scale - out.width) / 2, y: out.origin[1] - (r.height / scale - out.height) / 2 };
            view();
        }
        function zoom(factor, at) {
            if (!camera) { return; }
            autoFit = false;
            var r = place.getBoundingClientRect();
            at = at || { x: r.width / 2, y: r.height / 2 };
            var x = camera.x + at.x / scale, y = camera.y + at.y / scale;
            scale = Math.min(4, Math.max(0.05, scale * factor));
            camera.x = x - at.x / scale; camera.y = y - at.y / scale; view();
        }
        function pan(dx, dy) { if (camera) { autoFit = false; camera.x += dx / scale; camera.y += dy / scale; view(); } }
        function select(s, how) {
            selection = s;
            mark(); host.selected(s, how || 'key');
        }
        function mark() {
            layer.querySelectorAll('.dg-cv-ring').forEach(function (e) { e.remove(); });
            grips.replaceChildren();
            if (!selection || !out) { return; }
            var n = selectedNode(), b = n && out.boxes.find(function (x) { return x.id === n.id; });
            if (!b) {
                var edge = out.edges.find(function (e) { return e.id === selection.id; });
                if (edge) { layer.appendChild(svg('path', { d: edge.d, 'class': 'dg-cv-ring dg-cv-line-ring' })); }
                return;
            }
            layer.appendChild(svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, 'class': 'dg-cv-ring' }));
            [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]].forEach(function (h) {
                grip(h[0], 'Resize ' + ({ n: 'Top', s: 'Bottom', e: 'Right', w: 'Left', nw: 'Top Left', ne: 'Top Right', sw: 'Bottom Left', se: 'Bottom Right' })[h[0]], n.x + n.width * h[1], n.y + n.height * h[2], 'resize');
            });
            [['top', 0.5, 0, 0, -22], ['right', 1, 0.5, 22, 0], ['bottom', 0.5, 1, 0, 22], ['left', 0, 0.5, -22, 0]].forEach(function (h) {
                grip(h[0], 'Connect from the ' + h[0].charAt(0).toUpperCase() + h[0].slice(1), n.x + n.width * h[1], n.y + n.height * h[2], 'connect', h[3], h[4]);
            });
        }
        function grip(value, label, x, y, kind, dx, dy) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'btn dg-cv-grip dg-cv-' + kind;
            b.tabIndex = -1; b.setAttribute('aria-label', label); b.dataset.grip = value; b.dataset.kind = kind;
            b.style.left = ((x - camera.x) * scale + (dx || 0)) + 'px'; b.style.top = ((y - camera.y) * scale + (dy || 0)) + 'px';
            if (kind === 'resize') { b.style.cursor = value + '-resize'; }
            grips.appendChild(b);
        }
        function show(d, o, pic) {
            cancel(); doc = d; out = o; picture = pic;
            place.append(layer, grips);
            layer.replaceChildren();
            /* Edges are drawn above nodes by the renderer, so their hits
               follow the node hits too. The selected node's grips sit above. */
            out.boxes.forEach(function (b) {
                var hit = svg('rect', { x: b.x, y: b.y, width: Math.max(b.w, 1), height: Math.max(b.h, 1), 'class': 'dg-cv-hit' });
                hit.dataset.id = b.id; hit.dataset.kind = 'node'; layer.appendChild(hit);
            });
            out.edges.forEach(function (e) {
                var hit = svg('path', { d: e.d, 'class': 'dg-cv-edge-hit' });
                hit.dataset.id = e.id; hit.dataset.kind = 'edge'; layer.appendChild(hit);
            });
            if (selection && !(selection.kind === 'node' ? doc.nodes : doc.edges).some(function (x) { return x.id === selection.id; })) { selection = null; host.selected(null, 'redraw'); }
            if (!camera) { fit(); } else { view(); }
        }
        function preview(box, guides) {
            layer.querySelectorAll('.dg-cv-preview, .dg-cv-guide').forEach(function (e) { e.remove(); });
            var n = selectedNode(), moving = drag.kind === 'move' ? M.members(doc, n.id) : [];
            [Object.assign({}, n, box)].concat(doc.nodes.filter(function (x) { return moving.indexOf(x.id) >= 0; }).map(function (x) { return Object.assign({}, x, { x: x.x + box.x - n.x, y: x.y + box.y - n.y }); })).forEach(function (x) {
                layer.appendChild(svg('rect', { x: x.x - out.origin[0], y: x.y - out.origin[1], width: x.width, height: x.height, 'class': 'dg-cv-preview' }));
            });
            guides.forEach(function (g) {
                var at = g.at - out.origin[g.axis === 'x' ? 0 : 1];
                layer.appendChild(svg('line', { x1: g.axis === 'x' ? at : camera.x - out.origin[0], x2: g.axis === 'x' ? at : camera.x + camera.w - out.origin[0], y1: g.axis === 'y' ? at : camera.y - out.origin[1], y2: g.axis === 'y' ? at : camera.y + camera.h - out.origin[1], 'class': 'dg-cv-guide' }));
            });
        }
        function down(e) {
            if (drag || !out || !camera || !host.enabled() || (e.button !== 0 && e.button !== 1)) { return; }
            var grip = e.target.closest('[data-grip]'), hit = e.target.closest('[data-id]'), p = point(e);
            stage.focus({ preventScroll: true });
            if (space || e.button === 1 || host.panTool()) { drag = { kind: 'pan', px: e.clientX, py: e.clientY, camera: Object.assign({}, camera) }; }
            else if (grip && selectedNode()) { drag = { kind: grip.dataset.kind, handle: grip.dataset.grip, node: Object.assign({}, selectedNode()), point: p }; }
            else if (host.tool()) { host.create(Math.round(p.x), Math.round(p.y)); e.preventDefault(); return; }
            else if (hit) {
                select({ kind: hit.dataset.kind, id: hit.dataset.id }, 'pointer');
                if (selection.kind === 'node') { drag = { kind: 'move', node: Object.assign({}, selectedNode()), point: p }; }
            } else { select(null, 'pointer'); }
            if (drag) {
                autoFit = false;
                e.preventDefault(); drag.pointer = e.pointerId; drag.text = host.text(); drag.px = e.clientX; drag.py = e.clientY;
                place.setPointerCapture(e.pointerId); place.classList.add('dg-cv-dragging');
            }
        }
        function move(e) {
            if (!drag || drag.pointer !== e.pointerId) { return; }
            if (drag.kind === 'pan') {
                camera.x = drag.camera.x - (e.clientX - drag.px) / scale; camera.y = drag.camera.y - (e.clientY - drag.py) / scale; view(); return;
            }
            if (host.text() !== drag.text || !host.enabled()) { cancel(); return; }
            var p = point(e), dx = Math.round(p.x - drag.point.x), dy = Math.round(p.y - drag.point.y);
            drag.moved = drag.moved || Math.hypot(e.clientX - drag.px, e.clientY - drag.py) >= 3;
            if (drag.kind === 'connect') {
                layer.querySelectorAll('.dg-cv-preview').forEach(function (x) { x.remove(); });
                layer.appendChild(svg('line', { x1: drag.point.x - out.origin[0], y1: drag.point.y - out.origin[1], x2: p.x - out.origin[0], y2: p.y - out.origin[1], 'class': 'dg-cv-preview' }));
                return;
            }
            var box = drag.kind === 'move' ? Object.assign({}, drag.node, { x: drag.node.x + dx, y: drag.node.y + dy }) : M.resize(drag.node, drag.handle, dx, dy, e.shiftKey);
            var snapped;
            if (drag.kind === 'resize') {
                /* Snap the edge under the pointer, then apply the aspect
                   ratio and its opposite anchor again. */
                var west = /w/.test(drag.handle), north = /n/.test(drag.handle);
                var tip = { x: west ? box.x : box.x + box.width, y: north ? box.y : box.y + box.height, width: 0, height: 0 };
                snapped = M.snap(tip, doc.nodes, [drag.node.id], 5 / scale, e.altKey);
                box = M.resize(drag.node, drag.handle, /[ew]/.test(drag.handle) ? snapped.box.x - (west ? drag.node.x : drag.node.x + drag.node.width) : 0, /[ns]/.test(drag.handle) ? snapped.box.y - (north ? drag.node.y : drag.node.y + drag.node.height) : 0, e.shiftKey);
            } else { snapped = M.snap(box, doc.nodes, [drag.node.id].concat(M.members(doc, drag.node.id)), 5 / scale, e.altKey); box = snapped.box; }
            drag.box = box; preview(box, e.shiftKey && drag.kind === 'resize' ? [] : snapped.guides);
        }
        function up(e) {
            if (!drag || drag.pointer !== e.pointerId) { return; }
            move(e);
            if (!drag) { return; }
            var d = drag, p = point(e), target;
            if (d.kind === 'connect') {
                var nodes = doc.nodes.slice().reverse();
                target = nodes.find(function (x) { return p.x >= x.x && p.x <= x.x + x.width && p.y >= x.y && p.y <= x.y + x.height && x.id !== d.node.id; });
            }
            cancel();
            if (host.text() !== d.text || !d.moved || !host.enabled()) { return; }
            if (d.kind === 'connect' && target) {
                var sides = [['left', Math.abs(p.x - target.x)], ['right', Math.abs(p.x - target.x - target.width)], ['top', Math.abs(p.y - target.y)], ['bottom', Math.abs(p.y - target.y - target.height)]];
                sides.sort(function (a, b) { return a[1] - b[1]; });
                host.edit({ op: 'connect', from: d.node.id, fromSide: d.handle, to: target.id, toSide: sides[0][0] }, d.text);
            } else if (d.box) {
                host.edit(d.kind === 'move' ? { op: 'move', key: d.node.id, dx: d.box.x - d.node.x, dy: d.box.y - d.node.y } : { op: 'resize', key: d.node.id, x: d.box.x, y: d.box.y, width: d.box.width, height: d.box.height }, d.text);
            }
        }
        function cancel() {
            var d = drag; drag = null;
            if (d && place.hasPointerCapture(d.pointer)) { place.releasePointerCapture(d.pointer); }
            place.classList.remove('dg-cv-dragging');
            layer.querySelectorAll('.dg-cv-preview, .dg-cv-guide').forEach(function (e) { e.remove(); });
        }
        function wheel(e) {
            if (!camera || !host.enabled()) { return; }
            e.preventDefault();
            if (drag) { cancel(); }
            if (e.ctrlKey || e.metaKey) { var r = place.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.002), { x: e.clientX - r.left, y: e.clientY - r.top }); }
            else { var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? place.clientHeight : 1; pan(e.deltaX * unit, e.deltaY * unit); }
        }
        function cycle(delta) {
            if (!doc) { return; }
            var items = doc.nodes.map(function (n) { return { kind: 'node', id: n.id }; }).concat(doc.edges.map(function (e) { return { kind: 'edge', id: e.id }; }));
            var i = items.findIndex(function (x) { return selection && x.kind === selection.kind && x.id === selection.id; }), next = i + delta;
            if (next < 0 || next >= items.length) { select(null); return false; }
            select(items[next]);
            var n = selectedNode();
            if (n) { camera.x = n.x + n.width / 2 - camera.w / 2; camera.y = n.y + n.height / 2 - camera.h / 2; view(); }
            return true;
        }
        function onKey(e) {
            if (e.key === 'Escape') { cancel(); select(null); return true; }
            if (e.key === 'Tab') { return cycle(e.shiftKey ? -1 : 1); }
            if (e.key === ' ') { space = true; e.preventDefault(); return true; }
            return false;
        }
        function keyup(e) { if (e.key === ' ') { space = false; } }
        function blur() { space = false; cancel(); }
        place.addEventListener('pointerdown', down); place.addEventListener('pointermove', move); place.addEventListener('pointerup', up);
        place.addEventListener('pointercancel', cancel); place.addEventListener('lostpointercapture', cancel); place.addEventListener('wheel', wheel, { passive: false });
        window.addEventListener('keyup', keyup); window.addEventListener('blur', blur);
        var ro = new ResizeObserver(function () { if (!destroyed) { cancel(); if (camera && !autoFit) { view(); } else { fit(); } } }); ro.observe(stage);
        return { show: show, selected: function () { return selection; }, select: select, cycle: cycle, onKey: onKey, fit: fit, zoom: zoom, actual: function () { zoom(1 / scale); }, pan: pan, cancel: cancel,
            centre: function () { return camera ? { x: Math.round(camera.x + camera.w / 2), y: Math.round(camera.y + camera.h / 2) } : { x: 0, y: 0 }; },
            destroy: function () {
                destroyed = true; cancel(); ro.disconnect(); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur);
                place.removeEventListener('pointerdown', down); place.removeEventListener('pointermove', move); place.removeEventListener('pointerup', up);
                place.removeEventListener('pointercancel', cancel); place.removeEventListener('lostpointercapture', cancel); place.removeEventListener('wheel', wheel);
                layer.remove(); grips.remove(); place.classList.remove('dg-cv-editor');
            } };
    }
    window.yavcCanvasView = Object.freeze({ attach: attach });
})();
