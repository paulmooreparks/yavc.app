/* PUDL theme studio (Architecture/applet-roadmap.md). The reader edits the
   tokens a PUDL theme may set (docs/CONTRACT.md in PUDL), for the light and
   the dark palette, watches PUDL's own components take them, reads the WCAG
   contrast of the pairings that carry text, and takes the result away as
   the CSS a project pastes in after pudl.css.

   The previews are a page of their own (theme-studio/preview.html) in two
   frames, one per palette. PUDL derives its other tokens (the raised
   gradient, the sunken field, the focus ring and the rest) on :root from
   the palette, so a palette set on an element inside this page would leave
   them behind; set on a document's root, it reaches all of them. PUDL's own
   values are read from the frames, so the studio starts from whichever
   release the site has pinned.

   The theme is written as both palettes in full, :root then
   [data-theme="dark"], as PUDL's contract says a theme sets them. The state
   holds only what differs from PUDL's, so the address stays short:
   "edit=dark&light=accent.3366cc~bg.fafafa&dark=...". */
(function () {
    'use strict';

    var SELF = document.currentScript && document.currentScript.src;
    /* The preview is the package's own page, which loads PUDL from where
       the host keeps it (pudlHost.pudl), with the studio's version. */
    function previewUrl() {
        var u = new URL('preview.html', SELF || location.href);
        u.search = (SELF ? new URL(SELF).search : '');
        u.searchParams.set('pudl', (window.pudlHost && window.pudlHost.pudl) || '/pudl/');
        return u.href;
    }

    var GROUPS = [
        { label: 'Page and text', tokens: [['bg', 'Page'], ['surface', 'Surface'], ['surface-alt', 'Raised surface'], ['text', 'Text'], ['text-muted', 'Muted text'], ['border', 'Border']] },
        { label: 'Accent and status', tokens: [['accent', 'Accent'], ['accent-hover', 'Accent under the pointer'], ['on-accent', 'Text on the accent'], ['warn', 'Warning'], ['danger', 'Danger'], ['danger-hover', 'Danger under the pointer'], ['positive', 'Positive']] },
        { label: 'Top bar', tokens: [['tb-bg', 'Top bar'], ['tb-fg', 'Top bar text']] },
        { label: 'Lighting', tokens: [['light', 'Light'], ['shade', 'Shade'], ['lit', 'Light on raised things', 'pct'], ['depth', 'Depth of shadows', 'pct']] }
    ];
    var TOKENS = [];
    GROUPS.forEach(function (g) { g.tokens.forEach(function (t) { TOKENS.push({ name: t[0], label: t[1], pct: t[2] === 'pct' }); }); });
    var BY_NAME = {};
    TOKENS.forEach(function (t) { BY_NAME[t.name] = t; });

    /* The pairings that carry text, each held to WCAG 2.2 AA's 4.5:1 for
       text of ordinary size. A colour is a token, or a mix of two as
       pudl.css mixes them: a status badge's words are 62% of its colour in
       the text colour, on a tint of the colour over the surface (pudl.css,
       .badge). */
    function badge(token, tint) { return [[token, 0.62, 'text'], [token, tint, 'surface']]; }
    var PAIRS = [
        ['text', 'bg', 'Text on the page'],
        ['text', 'surface', 'Text on a surface'],
        ['text', 'surface-alt', 'Text on a raised surface'],
        ['text-muted', 'bg', 'Muted text on the page'],
        ['text-muted', 'surface', 'Muted text on a surface'],
        ['accent', 'surface', 'Links on a surface'],
        ['on-accent', 'accent', 'Text on the accent'],
        ['danger', 'surface', 'Danger on a surface, as a button'],
        badge('positive', 0.22).concat('Positive badge'),
        badge('warn', 0.22).concat('Warning badge'),
        badge('danger', 0.18).concat('Danger badge'),
        ['tb-fg', 'tb-bg', 'Top bar text']
    ];
    var AA = 4.5;
    var PALETTES = [['light', 'Light'], ['dark', 'Dark']];
    var count = 0;

    /* How long a frame is given to show PUDL's values, and how often it is asked. */
    var READ_EVERY = 50, READ_TRIES = 100;

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    /* === Colour ========================================================== */

    /* Any CSS colour, as the browser resolves it, to #rrggbb; null when the
       browser cannot read it (an empty value, or one that is not a colour). */
    function toHex(doc, value) {
        var probe = doc.createElement('i');
        probe.style.color = value;
        if (!probe.style.color) { return null; }
        doc.body.appendChild(probe);
        var c = doc.defaultView.getComputedStyle(probe).color;
        probe.remove();
        var m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
        var rgb;
        if (m) { rgb = [+m[1], +m[2], +m[3]]; }
        else {
            m = c.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
            if (!m) { return null; }
            rgb = [m[1] * 255, m[2] * 255, m[3] * 255];
        }
        return '#' + rgb.map(function (n) { return ('0' + Math.round(Math.max(0, Math.min(255, n))).toString(16)).slice(-2); }).join('');
    }

    function luminance(hex) {
        var c = [1, 3, 5].map(function (i) {
            var v = parseInt(hex.substr(i, 2), 16) / 255;
            return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function contrast(a, b) {
        var la = luminance(a), lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    function isHex(s) { return /^#[0-9a-f]{6}$/i.test(s); }

    /* A token's colour, or [a, w, b]: w of a in b, as color-mix(in srgb)
       mixes them. */
    function colourOf(v, c) {
        if (typeof c === 'string') { return v[c]; }
        var a = v[c[0]], b = v[c[2]], w = c[1];
        return '#' + [1, 3, 5].map(function (i) {
            var x = w * parseInt(a.substr(i, 2), 16) + (1 - w) * parseInt(b.substr(i, 2), 16);
            return ('0' + Math.round(x).toString(16)).slice(-2);
        }).join('');
    }

    /* === State =========================================================== */

    function parseState(s) {
        var st = { edit: 'light', light: {}, dark: {} };
        var q = new URLSearchParams(String(s || '').replace(/^\?/, ''));
        if (q.get('edit') === 'dark') { st.edit = 'dark'; }
        ['light', 'dark'].forEach(function (p) {
            (q.get(p) || '').split('~').forEach(function (pair) {
                var i = pair.indexOf('.');
                if (i < 1) { return; }
                var name = pair.slice(0, i), v = pair.slice(i + 1), t = BY_NAME[name];
                if (!t) { return; }
                if (t.pct && /^\d{1,3}$/.test(v) && +v <= 100) { st[p][name] = +v; }
                else if (!t.pct && /^[0-9a-f]{6}$/i.test(v)) { st[p][name] = '#' + v.toLowerCase(); }
            });
        });
        return st;
    }
    function stateString(st) {
        var parts = [];
        if (st.edit === 'dark') { parts.push('edit=dark'); }
        ['light', 'dark'].forEach(function (p) {
            var list = Object.keys(st[p]).map(function (k) { return k + '.' + String(st[p][k]).replace(/^#/, ''); });
            if (list.length) { parts.push(p + '=' + list.join('~')); }
        });
        return parts.join('&');
    }

    /* === The applet ====================================================== */

    function init(root, opts) {
        opts = opts || {};
        var n = ++count;
        var ownUrl = !!opts.ownsUrl;
        var st = parseState(ownUrl && location.search ? location.search : (typeof opts.state === 'string' ? opts.state : ''));
        var defaults = { light: null, dark: null };
        var frames = {}, ready = false, gone = false, readTimers = [];

        root.classList.add('pc-theme-studio');
        root.innerHTML =
            '<div class="ts-layout"><div class="ts-controls">' +
            '<div class="seg ts-edit" role="group" aria-label="Palette to edit">' +
            PALETTES.map(function (p) { return '<button type="button" data-ts-edit="' + p[0] + '" aria-pressed="false">' + p[1] + '</button>'; }).join('') +
            '</div>' +
            GROUPS.map(function (g) {
                return '<fieldset class="form-fieldset ts-group"><legend>' + esc(g.label) + '</legend>' +
                    g.tokens.map(function (t) {
                        var id = 'ts-' + n + '-' + t[0];
                        if (t[2] === 'pct') {
                            return '<div class="ts-row"><label class="form-label" for="' + id + '">' + esc(t[1]) + '</label>' +
                                '<input type="range" class="form-range" id="' + id + '" min="0" max="100" data-ts-token="' + t[0] + '" />' +
                                '<span class="ts-pct"><output for="' + id + '" data-ts-out="' + t[0] + '"></output>%</span></div>';
                        }
                        return '<div class="ts-row"><label class="form-label" for="' + id + '">' + esc(t[1]) + '</label>' +
                            '<input type="color" id="' + id + '" data-ts-token="' + t[0] + '" />' +
                            '<input class="form-input ts-hex" data-ts-hex="' + t[0] + '" aria-label="' + esc(t[1]) + ', as hex" maxlength="7" spellcheck="false" autocomplete="off" />' +
                            '<code class="ts-name">--' + t[0] + '</code></div>';
                    }).join('') + '</fieldset>';
            }).join('') +
            '</div>' +
            '<div class="ts-main">' +
            '<div class="ts-previews">' +
            PALETTES.map(function (p) {
                return '<figure class="ts-preview"><figcaption>' + p[1] + '</figcaption>' +
                    '<iframe title="' + p[1] + ' palette preview" data-ts-frame="' + p[0] + '" src="' + esc(previewUrl()) + '"></iframe></figure>';
            }).join('') +
            '</div>' +
            '<div class="ts-checks">' +
            PALETTES.map(function (p) {
                return '<table class="ts-contrast" data-ts-table="' + p[0] + '"><caption>' + p[1] + ' palette contrast</caption>' +
                    '<thead><tr><th scope="col">Pairing</th><th scope="col">Ratio</th><th scope="col">WCAG AA</th></tr></thead><tbody></tbody></table>';
            }).join('') +
            '</div>' +
            '<div class="ts-css"><div class="ts-css-head"><h3>The theme</h3>' +
            '<button type="button" class="btn btn-sm" data-ts="copy">Copy the CSS</button>' +
            '<button type="button" class="btn btn-sm" data-ts="save">Save the CSS…</button></div>' +
            '<pre class="ts-css-text" tabindex="0"><code></code></pre></div>' +
            '<p class="ts-status" role="status" aria-live="polite"></p>' +
            '</div></div>' +
            '<input type="file" accept=".css,text/css" hidden data-ts="file" />' +
            '<dialog class="dialog ts-about" aria-labelledby="ts-about-' + n + '">' +
            '<h3 class="dialog-title" id="ts-about-' + n + '">About PUDL Theme Studio</h3>' +
            '<div class="dialog-body"><p>The theme studio edits the colours a PUDL theme may set, for the light palette and the dark one. ' +
            'The two previews are PUDL\'s own components, drawn by the release of PUDL this site uses, so what you see is what a project gets.</p>' +
            '<p>Under the previews, each pairing that carries text shows its contrast ratio against WCAG AA\'s 4.5:1. ' +
            'The theme is the CSS below them: paste it after pudl.css. The address keeps your changes, so a link to this page shares the theme.</p></div>' +
            '<div class="dialog-actions"><button type="button" class="btn btn-primary" data-ts="about-close">Close</button></div>' +
            '</dialog>';

        function q(sel) { return root.querySelector(sel); }
        var status = q('.ts-status'), cssText = q('.ts-css-text code'), about = q('.ts-about'), file = q('[data-ts="file"]');

        function values(p) {
            var v = {};
            TOKENS.forEach(function (t) { v[t.name] = st[p][t.name] != null ? st[p][t.name] : defaults[p][t.name]; });
            return v;
        }

        function block(sel, p) {
            var v = values(p);
            return sel + ' {\n' + TOKENS.map(function (t) { return '  --' + t.name + ': ' + (t.pct ? v[t.name] + '%' : v[t.name]) + ';'; }).join('\n') + '\n}';
        }
        function themeCss() {
            return '/* A PUDL theme, made with the theme studio at https://parkscomputing.com/page/theme-studio.\n' +
                '   Load it after pudl.css. */\n' + block(':root', 'light') + '\n\n' + block('[data-theme="dark"]', 'dark') + '\n';
        }

        /* === Drawing ===================================================== */

        function drawControls() {
            root.querySelectorAll('[data-ts-edit]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-ts-edit') === st.edit ? 'true' : 'false'); });
            var v = values(st.edit);
            TOKENS.forEach(function (t) {
                var input = q('[data-ts-token="' + t.name + '"]');
                if (t.pct) {
                    input.value = v[t.name];
                    /* The slider is PUDL's (0.74.0), which fills its track and
                       writes its number into the output; without PUDL's
                       fields script, the number is written here. */
                    if (window.pudlFields) { window.pudlFields.refresh(input); }
                    else { q('[data-ts-out="' + t.name + '"]').textContent = v[t.name]; }
                    return;
                }
                input.value = v[t.name];
                var hex = q('[data-ts-hex="' + t.name + '"]');
                if (document.activeElement !== hex) { hex.value = v[t.name]; }
                hex.removeAttribute('aria-invalid');
            });
        }

        function drawChecks() {
            PALETTES.forEach(function (p) {
                var v = values(p[0]);
                q('[data-ts-table="' + p[0] + '"] tbody').innerHTML = PAIRS.map(function (pair) {
                    var r = contrast(colourOf(v, pair[0]), colourOf(v, pair[1])), ok = r >= AA;
                    return '<tr><th scope="row">' + esc(pair[2]) + '</th><td>' + r.toFixed(2) + ':1</td>' +
                        '<td class="ts-verdict ' + (ok ? 'ts-pass' : 'ts-fail') + '"><span class="glyph" aria-hidden="true"></span>' + (ok ? 'Passes' : 'Fails') + '</td></tr>';
                }).join('');
            });
        }

        function paint() {
            var css = themeCss();
            Object.keys(frames).forEach(function (p) {
                var doc = frames[p].contentDocument, style = doc && doc.getElementById('theme');
                if (style) { style.textContent = css; }
            });
            cssText.textContent = css;
            drawChecks();
        }

        function draw() { if (ready) { drawControls(); paint(); } }

        var writeTimer = null;
        function commit() {
            var s = stateString(st);
            clearTimeout(writeTimer);
            writeTimer = setTimeout(function () {
                if (ownUrl) { history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash); }
                if (opts.changed) { opts.changed(s); }
            }, 250);
        }

        function set(name, value) {
            var t = BY_NAME[name];
            if (t.pct ? value === defaults[st.edit][name] : value.toLowerCase() === defaults[st.edit][name]) { delete st[st.edit][name]; }
            else { st[st.edit][name] = t.pct ? value : value.toLowerCase(); }
            draw();
            commit();
        }

        /* === The previews ================================================ */

        /* PUDL's own palette, read from a frame's root once it has loaded,
           with that frame's palette chosen and no theme written yet. It is
           kept only if every token was there to read: before pudl.css has
           applied the values are empty, and guessing them would paint the
           preview with a theme of guesses. Whether it was kept is returned. */
        function readDefaults(p, doc) {
            var cs = doc.defaultView.getComputedStyle(doc.documentElement), d = {}, whole = true;
            TOKENS.forEach(function (t) {
                var raw = cs.getPropertyValue('--' + t.name).trim();
                if (t.pct) {
                    var num = parseFloat(raw);
                    if (isNaN(num)) { whole = false; } else { d[t.name] = Math.round(num); }
                } else {
                    d[t.name] = raw ? toHex(doc, raw) : null;
                    if (!d[t.name]) { whole = false; }
                }
            });
            if (whole) { defaults[p] = d; }
            return whole;
        }

        var loaded = 0;
        root.querySelectorAll('[data-ts-frame]').forEach(function (f) {
            var p = f.getAttribute('data-ts-frame');
            frames[p] = f;

            function received() {
                if (++loaded === PALETTES.length && !ready) {
                    ready = true;
                    say('');
                    draw();
                    if (window.pudlMenubar) { window.pudlMenubar.refresh(); }
                } else if (ready) { paint(); }
            }

            /* Ask for PUDL's values until the frame has them, for a few seconds.
               A timer rather than an animation frame, which a frame that is not
               being drawn may never be given. */
            function read(doc, tries) {
                if (gone || f.contentDocument !== doc) { return; }
                if (readDefaults(p, doc)) { received(); return; }
                if (tries >= READ_TRIES) { say('The preview hasn\'t loaded PUDL yet.'); return; }
                readTimers.push(setTimeout(function () { read(doc, tries + 1); }, READ_EVERY));
            }

            f.addEventListener('load', function () {
                var doc = f.contentDocument;
                if (!doc) { return; }
                doc.documentElement.setAttribute('data-theme', p);
                doc.getElementById('theme').textContent = '';
                /* The sample's links are there to be seen, and go nowhere. */
                doc.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[href]')) { e.preventDefault(); } });
                read(doc, 0);
            });
        });

        /* === Commands ==================================================== */

        function say(msg) { status.textContent = msg; }

        function copyCss() {
            if (!navigator.clipboard) { say('This browser does not let the page copy.'); return; }
            navigator.clipboard.writeText(themeCss()).then(function () { say('Copied the theme\'s CSS.'); }, function () { say('The CSS could not be copied.'); });
        }

        async function saveCss() {
            var blob = new Blob([themeCss()], { type: 'text/css' });
            if (window.showSaveFilePicker) {
                try {
                    var h = await window.showSaveFilePicker({ suggestedName: 'theme.css', types: [{ description: 'CSS', accept: { 'text/css': ['.css'] } }] });
                    if(gone)return;
                    var w = await h.createWritable();
                    if(gone) {await w.abort();return;}
                    await w.write(blob);
                    await w.close();
                    if(!gone)say('Saved ' + h.name + '.');
                } catch (err) { if (err && err.name !== 'AbortError') { say('The theme could not be saved.'); } }
                return;
            }
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'theme.css';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        }

        /* A theme file's two palettes: the tokens the studio edits, from a
           block whose selector names the dark theme, and from one on :root,
           in any CSS colour the browser can read. */
        function openCss(text) {
            var doc = frames.light.contentDocument, found = 0;
            var next = { light: {}, dark: {} };
            var re = /([^{}]+)\{([^}]*)\}/g, m;
            while ((m = re.exec(text.replace(/\/\*[\s\S]*?\*\//g, '')))) {
                var p = /data-theme\s*=\s*["']?dark/.test(m[1]) ? 'dark' : /:root/.test(m[1]) ? 'light' : null;
                if (!p) { continue; }
                m[2].split(';').forEach(function (decl) {
                    var d = decl.match(/^\s*--([a-z-]+)\s*:\s*(.+?)\s*$/i);
                    var t = d && BY_NAME[d[1]];
                    if (!t) { return; }
                    var v = t.pct ? Math.round(parseFloat(d[2])) : toHex(doc, d[2]);
                    if (t.pct ? !(v >= 0 && v <= 100) : !v) { return; }
                    found++;
                    if (v !== defaults[p][t.name]) { next[p][t.name] = v; }
                });
            }
            if (!found) { say('That file holds none of the tokens a PUDL theme sets.'); return; }
            st.light = next.light;
            st.dark = next.dark;
            draw();
            commit();
            say('Opened a theme with ' + found + ' tokens.');
        }

        function reset(which) {
            (which === 'both' ? ['light', 'dark'] : [st.edit]).forEach(function (p) { st[p] = {}; });
            draw();
            commit();
            say(which === 'both' ? 'Both palettes are PUDL\'s again.' : 'The ' + st.edit + ' palette is PUDL\'s again.');
        }

        function edit(p) { st.edit = p; draw(); commit(); }

        function menus() {
            var changed = { light: Object.keys(st.light).length > 0, dark: Object.keys(st.dark).length > 0 };
            return {
                titles: [
                    { label: 'PUDL Theme Studio', items: window.pudlHost.identity(root, [{ label: 'About PUDL Theme Studio', run: function () { about.showModal(); } }]) },
                    {
                        id: 'file', label: 'File', items: [
                            { label: 'Open a theme…', run: function () { file.click(); }, disabled: !ready },
                            { label: 'Save the CSS…', run: saveCss, disabled: !ready },
                            '-',
                            { label: 'Copy the CSS', run: copyCss, disabled: !ready }
                        ]
                    },
                    {
                        label: 'Palette', items: PALETTES.map(function (p) {
                            return { label: 'Edit the ' + p[0] + ' palette', radio: 'palette', checked: st.edit === p[0], run: function () { edit(p[0]); } };
                        }).concat(['-',
                            { label: 'Reset this palette to PUDL\'s', disabled: !ready || !changed[st.edit], run: function () { reset('one'); } },
                            { label: 'Reset both palettes', disabled: !ready || !(changed.light || changed.dark), run: function () { reset('both'); } }
                        ])
                    }
                ]
            };
        }

        /* === Events ====================================================== */

        function onInput(e) {
            var t = e.target;
            if (!ready) { return; }
            if (t.hasAttribute('data-ts-token')) {
                var name = t.getAttribute('data-ts-token');
                set(name, BY_NAME[name].pct ? +t.value : t.value);
            } else if (t.hasAttribute('data-ts-hex')) {
                var v = t.value.trim();
                if (!/^#/.test(v)) { v = '#' + v; }
                if (isHex(v)) { t.removeAttribute('aria-invalid'); set(t.getAttribute('data-ts-hex'), v); }
                else { t.setAttribute('aria-invalid', 'true'); }
            }
        }
        function onClick(e) {
            var b = e.target.closest('button');
            if (!b || !root.contains(b)) { return; }
            if (b.hasAttribute('data-ts-edit')) { edit(b.getAttribute('data-ts-edit')); return; }
            var what = b.getAttribute('data-ts');
            if (what === 'copy') { copyCss(); }
            else if (what === 'save') { saveCss(); }
            else if (what === 'about-close') { about.close(); }
        }
        function onFile() {
            var f = file.files && file.files[0];
            if (!f) { return; }
            var original=JSON.stringify(st);
            f.text().then(function (text) {if(!gone && JSON.stringify(st)===original)openCss(text);}, function () { if(!gone)say('That file could not be read.'); });
            file.value = '';
        }
        /* A hex field the reader left half-typed goes back to the value. */
        function onBlur(e) { if (e.target.hasAttribute && e.target.hasAttribute('data-ts-hex')) { drawControls(); } }

        root.addEventListener('input', onInput);
        root.addEventListener('click', onClick);
        root.addEventListener('focusout', onBlur);
        file.addEventListener('change', onFile);

        return {
            menus: menus,
            state: function () { return stateString(st); },
            setState: function (s) {
                var next = parseState(s);
                st.edit = next.edit; st.light = next.light; st.dark = next.dark;
                draw();
            },
            destroy: function () {
                gone = true;
                clearTimeout(writeTimer);
                readTimers.forEach(clearTimeout);
                root.removeEventListener('input', onInput);
                root.removeEventListener('click', onClick);
                root.removeEventListener('focusout', onBlur);
                if (about.open) { about.close(); }
            }
        };
    }

    window.pudlApplets.register('theme-studio', { init: init });
})();
