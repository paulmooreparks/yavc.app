/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Plausible Analytics' start, as their snippet writes it, from a file so
   the page runs no inline script (internal/web/headers.go). The address
   and the referrer each visit sends lose their query and fragment first:
   those can hold a file's path or a command line (?file=, ?run=), which
   stay in the browser (security review, 2026-11-03; DESIGN.md, decision
   6; the privacy page). */
window.plausible = window.plausible || function () { (plausible.q = plausible.q || []).push(arguments); };
plausible.init = plausible.init || function (i) { plausible.o = i || {}; };
(function () {
    function bare(u) {
        if (!u) { return u; }
        try { var x = new URL(u); x.search = ''; x.hash = ''; return x.href; } catch (err) { return u; }
    }
    plausible.init({
        transformRequest: function (payload) {
            payload.u = bare(payload.u);
            if (payload.r) {
                try { if (new URL(payload.r).hostname.replace(/^[^.]+\.(?=yavc\.app$)/, '') === location.hostname.replace(/^[^.]+\.(?=yavc\.app$)/, '')) { payload.r = bare(payload.r); } } catch (err) { /* leave it */ }
            }
            return payload;
        }
    });
})();
