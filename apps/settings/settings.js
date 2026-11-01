/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Settings, as an applet, so it opens as a window beside the others and is
   an ordinary entry in the Applets menu. It is a PUDL settings panel of
   cards. The first offers the reader's three appearance choices, as Dinah
   Desktop lays them out: the mode, light, dark or following the system;
   the skin, from the PUDL release's own catalogue; and the colour theme.
   Each choice is set through PUDL and kept by the engine under the
   session, which the site's desktop.js does (window.yavcAppearance), so
   the choice follows the reader to every subdomain. The second card says
   what the site keeps and forgets it, after a confirming dialog. */
(function () {
    'use strict';
    var count = 0;

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function lists() {
        var node = document.getElementById('yavc-appearance');
        var data = { skins: [], palettes: [], retention: '' };
        if (node) { try { data = JSON.parse(node.textContent) || data; } catch (err) { } }
        return data;
    }
    function options(list, chosen) {
        return list.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === chosen ? ' selected' : '') + '>' + esc(e.label) + '</option>'; }).join('');
    }

    function init(root, opts) {
        var n = ++count;
        var app = window.yavcAppearance;
        var current = app ? app.get() : { mode: 'system', skin: 'standard', palette: 'standard' };
        var data = lists();
        var kept = data.retention ? ' A session unseen for ' + esc(data.retention) + ' is removed.' : '';
        root.classList.add('yavc-settings', 'settings-panel');
        root.innerHTML =
            '<section class="card">' +
              '<h2 class="card-title">Appearance</h2>' +
              '<fieldset class="form-fieldset">' +
                '<legend>Mode</legend>' +
                '<div class="seg" role="group" aria-label="Mode">' +
                  '<button type="button" data-mode="light">Light</button>' +
                  '<button type="button" data-mode="dark">Dark</button>' +
                  '<button type="button" data-mode="system">Follow the system</button>' +
                '</div>' +
              '</fieldset>' +
              '<div class="form-group">' +
                '<label class="form-label" for="yavc-set-skin-' + n + '">Skin</label>' +
                '<span class="form-select-wrap"><select class="form-select" id="yavc-set-skin-' + n + '" data-skin>' + options(data.skins, current.skin) + '</select></span>' +
                '<p class="form-help">The shape and depth of every control, from the PUDL release installed on this site.</p>' +
              '</div>' +
              '<div class="form-group">' +
                '<label class="form-label" for="yavc-set-palette-' + n + '">Colours</label>' +
                '<span class="form-select-wrap"><select class="form-select" id="yavc-set-palette-' + n + '" data-palette>' + options(data.palettes, current.palette) + '</select></span>' +
                '<p class="form-help">A colour theme goes with any skin, in light and dark.</p>' +
              '</div>' +
            '</section>' +
            '<section class="card">' +
              '<h2 class="card-title">What this site keeps</h2>' +
              '<p class="card-desc">Your appearance choices and each application\'s state, such as a game in progress, are kept on this site under an anonymous session, so the same game is on the desktop and on the application\'s own address. Nothing in it identifies you.' + kept + '</p>' +
              '<p class="card-desc">Files you make, in the editor, the terminal or a game's saves, are kept in this browser alone, under the address you made them at, and this site never sees them. The desktop and each application's own address keep separate files. Clearing this browser's site data removes them, so download anything you want to keep.</p>' +
              '<div class="settings-actions"><button type="button" class="btn btn-danger" commandfor="yavc-forget-' + n + '" command="show-modal">Forget everything this site keeps for me…</button></div>' +
              '<p class="settings-status" data-status role="status"></p>' +
              '<dialog class="dialog" id="yavc-forget-' + n + '" aria-labelledby="yavc-forget-title-' + n + '">' +
                '<h3 class="dialog-title" id="yavc-forget-title-' + n + '">Forget everything this site keeps for you?</h3>' +
                '<p class="dialog-body">Your appearance choices and every application\'s state go, and the page starts afresh. Nothing can bring them back.</p>' +
                '<form class="dialog-actions" method="dialog">' +
                  '<button class="btn" value="keep" autofocus>Keep them</button>' +
                  '<button class="btn btn-danger" value="forget">Forget them</button>' +
                '</form>' +
              '</dialog>' +
            '</section>';

        function mark() {
            var a = app ? app.get() : current;
            root.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === a.mode ? 'true' : 'false'); });
            var skin = root.querySelector('[data-skin]'), palette = root.querySelector('[data-palette]');
            if (skin) { skin.value = a.skin; }
            if (palette) { palette.value = a.palette; }
        }
        mark();
        root.addEventListener('click', function (e) {
            var b = e.target.closest('[data-mode]');
            if (b && app) { app.set('mode', b.getAttribute('data-mode')); mark(); }
        });
        root.addEventListener('change', function (e) {
            if (!app) { return; }
            if (e.target.matches('[data-skin]')) { app.set('skin', e.target.value); }
            if (e.target.matches('[data-palette]')) { app.set('palette', e.target.value); }
            mark();
        });
        var dialog = root.querySelector('dialog'), status = root.querySelector('[data-status]');
        dialog.addEventListener('close', function () {
            if (dialog.returnValue !== 'forget') { return; }
            window.fetch('/session', { method: 'DELETE', credentials: 'same-origin' }).then(function (r) {
                if (!r.ok) { throw new Error('HTTP ' + r.status); }
                status.textContent = 'Forgotten. The page will reload.';
                setTimeout(function () { location.reload(); }, 800);
            }).catch(function () {
                status.textContent = 'That could not be done just now.';
            });
        });
        function onTheme() { mark(); }
        document.addEventListener('pudl:theme-change', onTheme);
        document.addEventListener('pudl:skin-change', onTheme);
        document.addEventListener('yavc:palette-change', onTheme);

        return {
            menus: function () {
                return { titles: [{ label: 'Settings', items: window.pudlHost ? window.pudlHost.identity(root, []) : [] }] };
            },
            destroy: function () {
                document.removeEventListener('pudl:theme-change', onTheme);
                document.removeEventListener('pudl:skin-change', onTheme);
                document.removeEventListener('yavc:palette-change', onTheme);
            }
        };
    }

    window.pudlApplets.register('settings', { init: init });
})();
