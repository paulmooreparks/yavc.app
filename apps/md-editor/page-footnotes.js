/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Page-owned note reservations. References and definitions remain source nodes. */
(function () {
    'use strict';
    function create(blocks, dimensions) {
        var definitions = blocks.footnotes || [], notes = new Map(definitions.map(function (note) { return [note.label, note]; })), placed = new Set(), pages = [], page = [], reserved = 0, problem = '';
        if(definitions.length>256)throw new Error('Document view supports at most 256 footnote definitions.');
        function proposal(references) {
            var fresh = [], visited = new Set();
            function visit(label) {
                if (visited.has(label) || placed.has(label)) return;
                visited.add(label);
                var note = notes.get(label);
                if (!note) { problem = 'A footnote reference has no definition. Restore its definition or remove the reference.'; return; }
                fresh.push(note); (note.references || []).forEach(visit);
            }
            references.forEach(visit);
            return { notes: fresh, height: fresh.reduce(function (sum, note) { return sum + note.height + 8; }, reserved) };
        }
        function commit(value) { value.notes.forEach(function (note) { placed.add(note.label); page.push(note); }); reserved = value.height; }
        function next() { pages.push(page); page = []; reserved = 0; }
        function placements() {
            var result = [];
            pages.concat([page]).forEach(function (items, number) {
                var top = number * (dimensions.height + 24) + dimensions.content - items.reduce(function (sum, note) { return sum + note.height + 8; }, 0);
                items.forEach(function (note) { top += 8; result.push({ label: note.label, number: note.number, pos: note.pos, to: note.to, page: number + 1, top: top, height: note.height }); top += note.height; });
            });
            return result;
        }
        return { proposal: proposal, commit: commit, next: next, placements: placements, problem: function () { return problem; } };
    }
    function references(node) { return Array.from(node.querySelectorAll('.doc-footnote-ref[data-footnote-ref]')).map(function (ref) { return ref.getAttribute('data-footnote-ref'); }); }
    window.yavcPageFootnotes = Object.freeze({ create: create, references: references });
})();
