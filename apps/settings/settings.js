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

    var esc = window.yavcUtil.esc;
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
              '<p class="card-desc">Files you make, in the editor, the terminal or a game\'s saves, are kept in this browser alone, under the address you made them at, and this site never sees them. The desktop and each application\'s own address keep separate files. Clearing this browser\'s site data removes them, so download anything you want to keep.</p>' +
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
            '</section>' +
            '<section class="card" data-agents>' +
              '<h2 class="card-title">Agents</h2>' +
              '<p class="card-desc">An AI agent can drive the applications here, through the site\'s MCP endpoint, as you: it runs on a page you have open, with your files and your state, and the page asks you before it does anything its token does not already allow. Make a token for each agent and give it to the agent; it is shown once. <a href="' + esc((window.pcPublicOrigin || '') + '/agents') + '">How agents use this site</a>.</p>' +
              '<ul class="row-list" data-token-list aria-label="Tokens"></ul>' +
              '<p class="card-desc" data-token-none>No agent is paired.</p>' +
              '<div class="settings-actions"><button type="button" class="btn btn-primary" commandfor="yavc-token-' + n + '" command="show-modal">Make a token…</button></div>' +
              '<pre class="settings-token" data-token-shown hidden tabindex="0"></pre>' +
              '<p class="settings-status" data-token-status role="status"></p>' +
              '<dialog class="dialog" id="yavc-token-' + n + '" aria-labelledby="yavc-token-title-' + n + '">' +
                '<form method="dialog" data-token-form>' +
                  '<h3 class="dialog-title" id="yavc-token-title-' + n + '">Make a token for an agent</h3>' +
                  '<div class="dialog-body">' +
                    '<div class="form-group"><label class="form-label" for="yavc-token-name-' + n + '">The agent\'s name</label>' +
                      '<input class="form-input" id="yavc-token-name-' + n + '" name="name" required maxlength="64" autocomplete="off" placeholder="Claude">' +
                      '<p class="form-help">Shown to you when the agent asks to do something.</p></div>' +
                    '<fieldset class="form-fieldset"><legend>What it may do without asking</legend>' +
                      '<label class="check"><input type="checkbox" name="grant" value="files.read"> Read your files</label>' +
                      '<label class="check"><input type="checkbox" name="grant" value="files.write"> Change your files</label>' +
                      '<label class="check"><input type="checkbox" name="grant" value="window.open"> Open windows</label>' +
                      '<label class="check"><input type="checkbox" name="grant" value="attention.request"> Ask you questions</label>' +
                      '<p class="form-help">For anything else it needs, the page asks you each time.</p></fieldset>' +
                  '</div>' +
                  '<div class="dialog-actions"><button class="btn" type="button" data-token-cancel>Cancel</button><button class="btn btn-primary" value="make">Make the token</button></div>' +
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
        /* === Agents ====================================================== */

        var tokenList = root.querySelector('[data-token-list]'), tokenNone = root.querySelector('[data-token-none]'), tokenShown = root.querySelector('[data-token-shown]'), tokenStatus = root.querySelector('[data-token-status]');
        var tokenDialog = root.querySelector('#yavc-token-' + n), tokenForm = root.querySelector('[data-token-form]');
        var WORDS = { 'files.read': 'read files', 'files.write': 'change files', 'window.open': 'open windows', 'attention.request': 'ask questions' };
        function drawTokens(tokens) {
            tokenList.replaceChildren();
            tokenNone.hidden = tokens.length > 0;
            tokens.forEach(function (t) {
                var li = document.createElement('li');
                li.className = 'md-row settings-token-row';
                var when = new Date(t.created);
                var may = (t.grant || []).map(function (g) { return WORDS[g] || g; }).join(', ');
                li.innerHTML = '<span class="settings-token-name">' + esc(t.name) + '</span>' +
                    '<span class="settings-token-meta">' + (may ? 'May ' + esc(may) + ' unasked. ' : 'Asks before everything. ') + 'Made ' + esc(when.toLocaleDateString()) + (t.used ? ', last used ' + esc(new Date(t.used).toLocaleString()) : ', not used yet') + '.</span>' +
                    '<button type="button" class="btn btn-danger btn-sm" data-revoke="' + esc(t.id) + '">Revoke</button>';
                tokenList.appendChild(li);
            });
        }
        function loadTokens() {
            return window.fetch('/agent/tokens', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : { tokens: [] }; })
                .then(function (d) { drawTokens(d.tokens || []); }).catch(function () { drawTokens([]); });
        }
        loadTokens();
        tokenForm.querySelector('[data-token-cancel]').addEventListener('click', function () { tokenDialog.close('cancel'); });
        tokenDialog.addEventListener('close', function () {
            if (tokenDialog.returnValue !== 'make') { return; }
            var name = tokenForm.elements.name.value.trim();
            var grant = Array.prototype.filter.call(tokenForm.querySelectorAll('[name="grant"]'), function (c) { return c.checked; }).map(function (c) { return c.value; });
            tokenForm.reset();
            window.fetch('/agent/tokens', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, grant: grant }) })
                .then(function (r) { if (!r.ok) { return r.text().then(function (t) { throw new Error(t.trim() || ('HTTP ' + r.status)); }); } return r.json(); })
                .then(function (t) {
                    tokenShown.hidden = false;
                    tokenShown.textContent = t.token;
                    tokenStatus.textContent = 'The token for ' + t.name + '. Copy it now; it is not shown again. Give it to the agent as a bearer token for ' + ((document.querySelector('meta[name="pc-public-origin"]') || {}).content || location.origin).replace(/\/$/, '') + '/mcp.';
                    tokenShown.focus();
                    if (window.yavcBridge) { window.yavcBridge.connect(); }
                    return loadTokens();
                })
                .catch(function (err) { tokenStatus.textContent = err.message; });
        });
        root.addEventListener('click', function (e) {
            var b = e.target.closest('[data-revoke]');
            if (!b) { return; }
            window.fetch('/agent/tokens/' + encodeURIComponent(b.getAttribute('data-revoke')), { method: 'DELETE', credentials: 'same-origin' })
                .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } tokenStatus.textContent = 'Revoked.'; tokenShown.hidden = true; return loadTokens(); })
                .catch(function () { tokenStatus.textContent = 'That could not be done just now.'; });
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
