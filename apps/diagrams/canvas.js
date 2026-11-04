/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* The visual editor's canvas (docs/diagrams-design.md, milestone D3): a
   layer over a D2 drawing that knows where each shape and connection is,
   from the engine's compile (shapes and connections, in the drawing's own
   pixels; decision 4), so a click or a key can select one. The drawing
   itself stays an image (decision 10); this layer is the site's own SVG,
   made from numbers and keys, and draws only the selection, as PUDL's
   focus ring.

     yavcDiagramCanvas.attach(place, host) -> canvas
       host.selected(key, how)   a shape or connection was selected, or null;
                                 how is 'pointer' or 'key'
       host.activate(key)        Enter or a double click on one
       host.pick(key)            a click while the host is choosing a shape,
                                 such as the other end of a connection;
                                 return true to take it
     canvas.show(out)            the compile's answer, after a drawing
     canvas.select(key)          select one, or null for none
     canvas.selected()           the key selected, or null
     canvas.keys()               the keys in drawing order
     canvas.destroy() */
(function () {
    'use strict';
    if (window.yavcDiagramCanvas) { return; }
    var NS = 'http://www.w3.org/2000/svg';

    function attach(place, host) {
        var layer = document.createElementNS(NS, 'svg'), out = null, sel = null, order = [];
        layer.setAttribute('class', 'dg-layer');
        layer.setAttribute('aria-hidden', 'true');
        place.classList.add('dg-editable');

        /* The layer covers the picture exactly, wherever the picture is
           drawn and at whatever size, since the drawing scales to fit. */
        function fitLayer() {
            var img = place.querySelector(':scope > img.sc-diagram-image');
            if (!img || !out) { layer.style.display = 'none'; return; }
            var pr = place.getBoundingClientRect(), ir = img.getBoundingClientRect();
            layer.style.display = '';
            layer.style.left = (ir.left - pr.left + place.scrollLeft) + 'px';
            layer.style.top = (ir.top - pr.top + place.scrollTop) + 'px';
            layer.style.width = ir.width + 'px';
            layer.style.height = ir.height + 'px';
            if (img.nextSibling !== layer) { img.after(layer); }
        }
        var ro = 'ResizeObserver' in window ? new ResizeObserver(fitLayer) : null;
        if (ro) { ro.observe(place); }
        /* The D2 client draws the picture again by itself when the site's
           mode or colours change (d2.js redrawAll), replacing what the place
           holds; the layout is the same, so the layer goes straight back. */
        var mo = new MutationObserver(function () { if (out && !layer.isConnected) { fitLayer(); } });
        mo.observe(place, { childList: true });

        function el(name, attrs) {
            var e = document.createElementNS(NS, name);
            Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
            return e;
        }
        function show(o) {
            out = o;
            layer.replaceChildren();
            order = [];
            if (!out || !out.width) { fitLayer(); return; }
            layer.setAttribute('viewBox', '0 0 ' + out.width + ' ' + out.height);
            layer.setAttribute('preserveAspectRatio', 'none');
            /* Containers come first in D2's list, so a shape inside one is
               drawn later and takes a click before its container does. */
            (out.shapes || []).forEach(function (s) {
                var r = el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: 4, 'class': 'dg-hit dg-hit-shape' });
                r.__key = s.id;
                layer.appendChild(r);
                order.push(s.id);
            });
            (out.connections || []).forEach(function (c) {
                var pts = c.points.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
                var g = el('g', { 'class': 'dg-hit dg-hit-line' });
                g.appendChild(el('polyline', { points: pts, 'class': 'dg-hit-wide' }));
                g.appendChild(el('polyline', { points: pts, 'class': 'dg-hit-thin' }));
                g.__key = c.id;
                layer.appendChild(g);
                order.push(c.id);
            });
            if (sel && order.indexOf(sel) < 0) { sel = null; host.selected(null, 'redraw'); }
            mark();
            fitLayer();
        }
        function mark() {
            Array.prototype.forEach.call(layer.children, function (e) { e.classList.toggle('is-selected', e.__key === sel); });
        }
        function select(key, how) {
            key = key && order.indexOf(key) >= 0 ? key : null;
            if (key === sel) { return; }
            sel = key;
            mark();
            if (how) { host.selected(sel, how); }
        }
        function hitOf(target) {
            for (var e = target; e && e !== layer; e = e.parentNode) { if (e.__key) { return e.__key; } }
            return null;
        }
        layer.addEventListener('click', function (e) {
            var key = hitOf(e.target);
            if (key && host.pick && host.pick(key)) { return; }
            select(key, 'pointer');
        });
        layer.addEventListener('dblclick', function (e) {
            var key = hitOf(e.target);
            if (key) { select(key, 'pointer'); host.activate(key); }
        });
        /* Keys, on the drawing's pane: the arrows and Home and End move the
           selection through the shapes and connections in drawing order,
           Enter activates it, and Escape clears it. Delete and the rest are
           the host's commands. */
        function onKey(e) {
            if (!out || e.altKey || e.ctrlKey || e.metaKey) { return false; }
            var i = order.indexOf(sel), n = order.length;
            if (!n) { return false; }
            var to = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { to = order[(i + 1) % n]; }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { to = order[(i - 1 + n) % n]; }
            else if (e.key === 'Home') { to = order[0]; }
            else if (e.key === 'End') { to = order[n - 1]; }
            else if (e.key === 'Enter' && sel) { host.activate(sel); return true; }
            else if (e.key === 'Escape' && sel) { select(null, 'key'); return true; }
            if (to == null) { return false; }
            select(to, 'key');
            return true;
        }
        layer.style.display = 'none';
        place.appendChild(layer);
        return {
            show: show, fit: fitLayer, onKey: onKey,
            select: function (key) { select(key, null); },
            selected: function () { return sel; },
            keys: function () { return order.slice(); },
            destroy: function () { if (ro) { ro.disconnect(); } mo.disconnect(); layer.remove(); place.classList.remove('dg-editable'); }
        };
    }

    window.yavcDiagramCanvas = Object.freeze({ attach: attach });
})();
