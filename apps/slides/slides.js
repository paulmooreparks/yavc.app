/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Slides: a slide deck from a Markdown file (docs/slides-design.md). A deck
   is one Markdown file in the reader's home, its slides separated by ---,
   each slide's settings in a {{slide}} line and its speaker notes in a
   {{notes}} container. The current slide is edited on its canvas as the
   Editor edits a page (the page view, from Dinah Desktop, page-view.js in
   the Editor's package), or as its Markdown in CodeMirror beside it, or
   both; the other slides are a filmstrip. The deck presents full screen
   with present.js, and a presenter window follows it through a
   BroadcastChannel. The Markdown engine (apps/md-engine) draws every
   slide here in the browser.

   State: file=<path>&slide=<n>; the request "present" opens a deck and
   presents it (present=1), or opens the presenter view (presenter=1). */
(function () {
    'use strict';

    var SELF_SRC = document.currentScript && document.currentScript.src;
    var HERE = (SELF_SRC || '/applets/slides/slides.js').split('?')[0].replace(/slides\.js$/, '');
    var STAMP = SELF_SRC && SELF_SRC.indexOf('?') >= 0 ? SELF_SRC.slice(SELF_SRC.indexOf('?')) : '';
    /* The editing kit (apps/md-editor): the page view, CodeMirror, Mermaid,
       the formats, Insert and the dialogs, shared with the Editor. */
    var KIT = '/applets/md-editor/';
    function kit() {
        if (window.yavcMdEditor) { return Promise.resolve(window.yavcMdEditor); }
        return loadScript(window.yavcUtil.versioned(KIT + 'kit.js')).then(function () { return window.yavcMdEditor; });
    }
    var LAYOUTS = [['content', 'Content'], ['title', 'Title'], ['section', 'Section'], ['two-column', 'Two Columns'], ['image', 'Picture'], ['quote', 'Quote'], ['blank', 'Blank']];
    var THEMES = [['plain', 'Plain, the Site\'s Own'], ['paper', 'Paper'], ['midnight', 'Midnight']];
    var SIZES = [['16:9', 'Widescreen, 16:9'], ['4:3', 'Standard, 4:3']];
    var TRANSITIONS = [['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide']];
    var FRONT = { title: '', author: '', theme: 'plain', size: '16:9', transition: 'fade' };
    /* The front matter's names the Deck menu sets, kept out of Properties. */
    var DECK_KEYS = ['theme', 'size', 'transition', 'ink', 'heading', 'muted', 'accent', 'background', 'stylesheet'];
    var SETTINGS = { view: 'visual', filmstrip: true, dock: 'left', float: null, presenterOnPresent: false };
    /* Where the canvas sits beside the Markdown: a side, or floating over it. */
    var DOCKS = [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom'], ['float', 'Floating']];
    var NEW_DECK = '---\ntitle: A new deck\nauthor: \ntheme: plain\nsize: 16:9\ntransition: fade\n---\n\n{{slide:layout=title}}\n# A new deck\n## What it is about\n\n---\n\n{{slide}}\n## The first point\n\n- One thing\n- Another\n- A third\n\n{{notes}}\nWhat to say here.\n{{/notes}}\n';
    var NEW_SLIDE = { content: '{{slide}}\n## A heading\n\nText.\n', title: '{{slide:layout=title}}\n# A title\n## A subtitle\n', section: '{{slide:layout=section}}\n## A section\n',
        'two-column': '{{slide:layout=two-column}}\n## Side by side\n\n{{columns}}\nLeft.\n\n{{column}}\n\nRight.\n{{/columns}}\n', image: '{{slide:layout=image}}\n## A picture\n\n{{figure:/static/icon.svg alt="What it shows"}}\n',
        quote: '{{slide:layout=quote}}\n> Something said.\n>\n> Who said it\n', blank: '{{slide:layout=blank}}\n' };
    var count = 0;

    var esc = window.yavcUtil.esc, loadScript = window.yavcUtil.loadScript;
    /* The Markdown engine, through its loader (apps/md-engine/loader.js),
       whose calls throw on the engine's errors. ENGINE is it once loaded. */
    var ENGINE = null;
    function engine() {
        return loadScript(window.yavcUtil.versioned('/applets/md-engine/loader.js')).then(function () { return window.yavcMdEngine(); })
            .then(function (m) { ENGINE = m; return m; });
    }
    function pageView() { return engine().then(kit).then(function (k) { return k.pageView(); }); }
    function codeMirror() { return kit().then(function (k) { return k.libs(); }); }

    /* === The deck ==================================================== */

    /* A deck's text: the front matter, then slides divided by --- lines
       outside fenced code. Each slide keeps its own text. */
    /* A deck's front matter is kept as it was written (frontText), and
       its properties as read (frontRead) beside the ones in use (front,
       with the defaults filled in). The Markdown engine reads it with a
       real YAML parser and writes back only what changed
       (internal/frontmatter; DESIGN.md, decision 17). Before the engine has
       loaded nothing is read (unread), and Slides reads every deck again
       once it has, so no second reading of YAML exists. */
    function readFront(frontText) {
        if (!ENGINE) { return { read: {}, problem: null, unread: true }; }
        var read = {}, f = ENGINE.front(frontText);
        (f.entries || []).forEach(function (e) { read[e.key] = e.value; });
        return { read: read, problem: f.problem || null };
    }
    function parseDeck(text) {
        var lines = text.replace(/\r\n/g, '\n').split('\n'), i = 0, frontText = '';
        if (lines[0] === '---') {
            var j = 1;
            while (j < lines.length && lines[j].replace(/[ \t]+$/, '') !== '---') { j++; }
            if (j < lines.length) {
                frontText = lines.slice(0, j + 1).join('\n') + '\n';
                i = j + 1;
            }
        }
        var got = readFront(frontText), front = Object.assign({}, FRONT, got.read);
        var slides = [], cur = [], fence = null;
        for (; i < lines.length; i++) {
            var l = lines[i], f = /^\s{0,3}(`{3,}|~{3,})/.exec(l);
            if (f) { if (!fence) { fence = f[1]; } else if (l.trim().indexOf(fence) === 0) { fence = null; } }
            if (!fence && /^\s{0,3}---\s*$/.test(l)) { slides.push(cur.join('\n')); cur = []; continue; }
            cur.push(l);
        }
        slides.push(cur.join('\n'));
        if (slides.length > 1 && slides[0].trim() === '') { slides.shift(); }
        return { front: front, frontRead: got.read, frontText: frontText, frontProblem: got.problem, frontUnread: !!got.unread, slides: slides.map(function (t) { return { text: t.replace(/^\n+/, '').replace(/\s+$/, '') + '\n' }; }) };
    }
    /* The changes to the front matter: each property now different from
       what was read, null for one taken out; a default never written
       stays unwritten. */
    function frontChanges(deck) {
        var set = {}, order = [], read = deck.frontRead || {};
        Object.keys(deck.front).forEach(function (k) {
            var v = deck.front[k] == null ? '' : String(deck.front[k]);
            if (!(k in read)) { if (v !== '' && v !== FRONT[k]) { set[k] = v; order.push(k); } return; }
            if (v !== read[k]) { set[k] = v === '' ? null : v; order.push(k); }
        });
        Object.keys(read).forEach(function (k) { if (!(k in deck.front)) { set[k] = null; order.push(k); } });
        return { set: set, order: order };
    }
    /* The front matter as it is to be written, the deck taking it as read. */
    function frontTextOf(deck) {
        var ch = frontChanges(deck);
        if (!ch.order.length) { return deck.frontText || ''; }
        if (!ENGINE || deck.frontProblem || deck.frontUnread) { return deck.frontText || ''; }
        var res;
        try { res = ENGINE.frontset({ text: deck.frontText || '', set: ch.set, order: ch.order }); } catch (err) { return deck.frontText || ''; }
        takeFront(deck, res.text);
        return deck.frontText;
    }
    function takeFront(deck, text) {
        text = text.replace(/\n+$/, '\n');
        if (!text.trim()) { text = ''; }
        var got = readFront(text);
        deck.frontText = text;
        deck.frontRead = got.read;
        deck.frontProblem = got.problem;
        deck.frontUnread = !!got.unread;
        deck.front = Object.assign({}, FRONT, got.read);
    }
    function serializeDeck(deck) {
        var front = frontTextOf(deck);
        return (front ? front + '\n' : '') + deck.slides.map(function (s) { return s.text.replace(/\s+$/, ''); }).join('\n\n---\n\n') + '\n';
    }
    /* A slide's settings, from its {{slide}} line, and that line set. */
    function parseArgs(args) {
        var out = {}, re = /([A-Za-z][A-Za-z0-9-]*)=("((?:[^"\\]|\\.)*)"|\S+)/g, m;
        while ((m = re.exec(args || ''))) { out[m[1].toLowerCase()] = m[3] != null ? m[3].replace(/\\"/g, '"') : m[2]; }
        return out;
    }
    function settingsOf(slide) {
        var m = /^\s*\{\{slide(?::([^}]*))?\}\}[ \t]*$/m.exec(slide.text);
        return m ? parseArgs(m[1]) : {};
    }
    function setSetting(slide, key, value) {
        var s = settingsOf(slide);
        if (value == null || value === '' || (key === 'layout' && value === 'content')) { delete s[key]; } else { s[key] = value; }
        var args = Object.keys(s).map(function (k) { var v = s[k]; return k + '=' + (/[\s"]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v); }).join(' ');
        var line = '{{slide' + (args ? ':' + args : '') + '}}';
        if (/^\s*\{\{slide(?::[^}]*)?\}\}[ \t]*$/m.test(slide.text)) { slide.text = slide.text.replace(/^\s*\{\{slide(?::[^}]*)?\}\}[ \t]*$/m, line); }
        else { slide.text = line + '\n' + slide.text; }
    }
    function titleOf(slide, i) {
        var m = /^\s*#{1,6}\s+(.+)$/m.exec(slide.text);
        return m ? m[1].replace(/[*_`]/g, '') : 'Slide ' + (i + 1);
    }

    function notesOf(text) {
        var m = /\{\{notes\}\}([\s\S]*?)\{\{\/notes\}\}/.exec(text);
        return m ? m[1].replace(/^\n+|\s+$/g, '') : '';
    }
    function slideView(slide, i) {
        var v = { index: i + 1, title: titleOf(slide, i), settings: settingsOf(slide), text: slide.text };
        var notes = notesOf(slide.text);
        if (notes) { v.notes = notes; }
        return v;
    }
    /* The deck functions, for the actions module (actions.js). */
    window.yavcSlides = { parseDeck: parseDeck, serializeDeck: serializeDeck, settingsOf: settingsOf, setSetting: setSetting, titleOf: titleOf, notesOf: notesOf, slideView: slideView };

    /* === The applet ================================================== */

    function init(root, opts) {
        opts = opts || {};
        var n = ++count, H = window.pudlHost || {};
        var styledSections = new Set(), styleLifetime = new AbortController();
        var deck = parseDeck(NEW_DECK), path = null, modified = false, at = 0, destroyed = false;
        /* The open decks, one tab each; deck, path, modified and at are the
           front tab's, copied back into it by stash() before a switch. */
        var tabs = [], active = -1;
        var resourceSession = null, resources = null, recovery = null;
        function resourceAsset(file) { return window.yavcUtil.versioned(new URL('../content-kit/' + file, SELF_SRC).href); }
        function tab() { return tabs[active] || null; }
        function dirtyTab(t) { return !!(t && (t.modified || (t === tab() && pageActive() && page.pending()))); }
        function readOnly() { var t = tab(); return !!(resources && t && t.resource && !resources.canWrite(t.resource)); }
        function requireEditable() { if (readOnly()) throw new Error('This deck is read-only. Use Save As to create an editable copy.'); }
        function canSave() { var t = tab(); return !readOnly() && !(resources && t && t.path && !t.resource); }
        function refreshAccess() {
            root.setAttribute('data-read-only', String(readOnly()));
            if (cm && accessComp) cm.dispatch({ effects: accessComp.reconfigure([cmLibs.EditorState.readOnly.of(readOnly()), cmLibs.EditorView.editable.of(!readOnly()), cmLibs.EditorView.contentAttributes.of({ 'aria-readonly': String(readOnly()), tabindex: '0' })]) });
            commandsChanged();
        }
        var settings = Object.assign({}, SETTINGS), mode = 'visual', md = null, page = null, cm = null, cmReady = null;
        var cmSlide = null, cmStates = new WeakMap(), cmExtensions = null, cmLibs = null, accessComp = null;
        var historyPane = 'visual';
        var presenting = null, channel = null, presenterRole = null, fromPage = false, redrawTimer = 0;
        /* On a page of its own the deck and the presenter view come from the
           address; in a window, from the state the host kept. */
        var start = new URLSearchParams(String(opts.state || '').replace(/^\?/, ''));
        if (opts.host !== 'window') {
            var own = new URLSearchParams(location.search);
            if (own.get('file') || own.get('presenter') || own.get('present')) { start = own; }
        }
        root.classList.add('deck', 'deck-' + (opts.fit === 'fill' ? 'fill' : 'flow'));
        root.tabIndex = -1;
        root.innerHTML =
            '<div class="deck-toolbar-slot" data-toolbar-slot></div>' +
            '<div class="tablist doc-tabs deck-tabs" role="tablist" aria-label="Open Decks" data-role="tabs" hidden></div>' +
            '<div class="deck-find" data-role="find-place" hidden></div>' +
            '<div class="deck-main" data-role="main">' +
              '<div class="deck-film" data-role="film" role="listbox" aria-label="Slides"></div>' +
              '<div class="deck-work split" data-role="work" data-split-pane="first">' +
                '<div class="deck-stagebox split-pane" data-role="stagebox"><div class="deck-float-bar" data-role="float-bar" hidden><span>Slide</span></div><div class="deck-stage" data-role="stage"><div class="deck-canvas" data-role="canvas"><section class="deck-slide" data-role="slide"><div class="deck-body doc-page" data-role="body" data-ed-page></div></section></div></div>' +
                  '<div class="deck-notes-view" data-role="notes-view" hidden></div></div>' +
                '<div class="split-handle deck-split" data-role="split" aria-label="Resize the Text" data-split-min="240" data-split-max="60%"></div>' +
                '<div class="deck-text split-pane code-surface" data-role="text"></div>' +
              '</div>' +
            '</div>' +
            '<div class="deck-status" data-role="status"><span data-role="where"></span><span data-role="position"></span><span class="deck-message" data-role="message" role="status" aria-live="polite"></span></div>' +
            '<div class="deck-presenter" data-role="presenter" hidden></div>';
        var q = function (sel) { return root.querySelector(sel); };
        root.addEventListener('focusin', function (e) {
            if (e.target.closest('.cm-editor')) { historyPane = 'text'; }
            else if (e.target.closest('.ProseMirror')) { historyPane = 'visual'; }
            commandsChanged();
        });
        var el = { film: q('[data-role="film"]'), work: q('[data-role="work"]'), stagebox: q('[data-role="stagebox"]'), stage: q('[data-role="stage"]'), canvas: q('[data-role="canvas"]'), slide: q('[data-role="slide"]'),
            body: q('[data-role="body"]'), notesView: q('[data-role="notes-view"]'), split: q('[data-role="split"]'), text: q('[data-role="text"]'), tabsEl: q('[data-role="tabs"]'), floatBar: q('[data-role="float-bar"]'), main: q('[data-role="main"]'), where: q('[data-role="where"]'), message: q('[data-role="message"]'), presenter: q('[data-role="presenter"]'), main: q('[data-role="main"]') };

        /* The applet's settings, kept by the host under its name. */
        function keepSetting(key, value) {
            if (!H.config || !H.config.set) { return; }
            var change = {}; change[key] = value;
            H.config.set('slides', change).catch(function () { });
        }
        /* A confirmation goes in the status strip; an error, which the
           person must act on, is a notice that stays until dismissed, and
           so is help, as an info notice. */
        function say(msg, kind) {
            if (kind) { window.yavcUtil.notice(el.tabsEl, msg, kind); fit(); return; }
            el.message.textContent = msg || '';
        }
        root.addEventListener('yavc:notice-closed', function () { fit(); });
        function commandsChanged() { if (opts.commandsChanged) { opts.commandsChanged(); } tabRow(); }
        function stateString() {
            var p = new URLSearchParams();
            if (path) { p.set('file', path); }
            if (at) { p.set('slide', String(at + 1)); }
            return p.toString().replace(/%2F/g, '/').replace(/%7E/g, '~');
        }
        function announce() { if (opts.changed) { opts.changed(stateString()); } keep(); }
        function current() { return deck.slides[at]; }

        /* === The canvas ============================================== */

        function sizeOf() { return deck.front.size === '4:3' ? [960, 720] : [1280, 720]; }
        function fit() {
            var wh = sizeOf(), box = el.stage.getBoundingClientRect();
            el.canvas.style.width = wh[0] + 'px';
            el.canvas.style.height = wh[1] + 'px';
            var k = Math.min(box.width / wh[0], box.height / wh[1]) || 1;
            el.canvas.style.transform = 'translate(-50%, -50%) scale(' + k + ')';
            el.stage.style.setProperty('--deck-scale', String(k));
        }
        function applySlideSettings(section, slide, exportSettings) {
            styledSections.add(section);
            var s = exportSettings || settingsOf(slide);
            section.setAttribute('data-layout', s.layout || 'content');
            section.setAttribute('data-deck', String(n));
            section.setAttribute('data-slide-index', String(deck.slides.indexOf(slide)));
            var styleKeys = []; if (deckStyle) { styleKeys.push(deckStyle.state().key); }
            var ownStyle = slideStyles && slideStyles.get(deck.slides.indexOf(slide)); if (ownStyle) { styleKeys.push(ownStyle.state().key); }
            if (styleKeys.length) { section.setAttribute('data-md-style', styleKeys.join(' ')); } else { section.removeAttribute('data-md-style'); }
            section.setAttribute('data-theme-name', deck.front.theme || 'plain');
            if (deck.front.lang) { section.setAttribute('lang', deck.front.lang); } else { section.removeAttribute('lang'); }
            section.setAttribute('data-transition', s.transition || deck.front.transition || 'fade');
            if (s.reveal) { section.setAttribute('data-reveal', s.reveal); } else { section.removeAttribute('data-reveal'); }
            section.className = 'deck-slide' + (s['class'] ? ' ' + s['class'].replace(/[^A-Za-z0-9_ -]/g, '') : '');
            /* The deck's colours over the theme's, and the slide's over the
               deck's (docs/slides-design.md, decision 15). */
            var f = deck.front, vars = { '--deck-ink': s.color || f.ink, '--deck-heading': s.heading || f.heading, '--deck-muted': f.muted, '--deck-accent': s.accent || f.accent };
            Object.keys(vars).forEach(function (k) { if (vars[k]) { section.style.setProperty(k, vars[k]); } else { section.style.removeProperty(k); } });
            section.style.background = s.background || f.background || '';
            section.style.backgroundImage = s.image ? 'url("' + s.image.replace(/"/g, '') + '")' : '';
            if (s.image && !/^(\/|https?:)/i.test(s.image) && s.image.indexOf('//') !== 0) { window.yavcMdEditor.pictureFor(s.image, picturesHost()).then(function (url) { if (url && section.isConnected) { section.style.backgroundImage = 'url("' + url + '")'; } }); }
        }
        /* Draws a slide's blocks into an element with the kit's renderer
           (apps/md-editor/kit.js drawBlocks), as the Editor's preview draws
           them; quiet, for a thumbnail or the notes, leaves diagrams and
           applets undrawn. */
        function drawInto(target, text, quiet, exporting) {
            var p;
            try { p = exporting ? currentMacroEngine().exportPreview(text) : currentMacroEngine().preview(text); } catch (err) { if (exporting) { throw err; } target.innerHTML = '<p class="deck-problem">' + esc(err.message) + '</p>'; return; }
            if (exporting) {
                var checked = window.yavcHTML.fragment(p.blocks.map(function (block) { return block.html; }).join(''));
                if (checked.querySelector('.sc-problem')) { throw new Error('Fix the invalid shortcode before exporting or presenting.'); }
            }
            window.yavcMdEditor.drawBlocks(target, p.blocks, quiet ? { pictures: picturesHost(), diagrams: false, applets: false } : { pictures: picturesHost() });
        }
        /* The public site's address, from the page's meta tag. A window
           global would be replaced by any element in a document with that
           id (security review, 2026-11-03). */
        function publicOrigin() {
            var m = document.querySelector('meta[name="pc-public-origin"]'), v = m && m.getAttribute('content');
            return /^https?:\/\/[^/]+$/.test(v || '') ? v : location.origin.replace(/\/\/slides\./, '//');
        }
        /* A slide's speaker notes, as the nodes already drawn and made safe,
           moved rather than written out as HTML and read again, which could
           turn safe markup into something else (security review,
           2026-11-03). */
        function notesNodes(target) {
            var out = document.createDocumentFragment();
            target.querySelectorAll('.sc-notes,.sc-no-export,.sc-draft-note').forEach(function (a) {
                if (!target.contains(a)) { return; }
                var l = a.querySelector('.sc-notes-label'); if (l) { l.remove(); }
                while (a.firstChild) { out.appendChild(a.firstChild); }
            });
            return out;
        }

        /* === The page view on the canvas ============================== */

        /* Where the deck's pictures are, for the kit's picture dialog and
           its loader: beside the deck when it is saved under ~. */
        function picturesHost() {
            return {
                site: function () { return H.fs && H.fs.site ? H.fs.site() : Promise.reject(new Error('there is no file service here')); },
                root: root, say: say,
                macroContext: currentMacroEngine,
                signal: styleLifetime.signal, identity: function () { return deck; }, text: fullText,
                dir: function () { return path ? (path.replace(/\/[^\/]*$/, '') || '~') : null; }
            };
        }
        function pageHost() {
            return {
                root: root, page: el.body, scroll: el.stagebox,
                customName: function (name) { return window.yavcMacroTools && window.yavcMacroTools.metadata(currentMacroEngine()).some(function (item) { return item.name === name; }); },
                text: function () { return current().text; },
                setText: function (text) { fromPage = true; try { takeText(text, 'page'); } finally { fromPage = false; } },
                docOf: function (text) { return deckEngine().then(function (m) { return m.doc(text); }); },
                /* The / menu on the canvas offers the Insert menu's items. */
                inserts: function () { return window.yavcMdEditor ? window.yavcMdEditor.inserts(DECK_INSERTS.concat(customInserts()), picturesHost) : []; },
                /* A picture pressed on the canvas opens the picture dialog. */
                editBlock: function (src) { return window.yavcMdEditor ? window.yavcMdEditor.editBlock(src, picturesHost()) : undefined; },
                markdownOf: function (doc) { return engine().then(function (m) { return m.markdown(doc); }); },
                sourceOf: function (src) { return deckEngine().then(function (m) { return m.source(src); }); },
                wrapOf: function (line) { return deckEngine().then(function (m) { return m.container(line); }); },
                inlineOf: function (src) { return deckEngine().then(function (m) { return m.inline(src); }); },
                blocksOf: function (text) { return deckEngine().then(function (m) { return m.blocks(text); }); },
                draw: function (target, html, diagrams) {
                    window.yavcMdEditor.drawBlocks(target, [{ line: 0, html: html, diagrams: diagrams }], { pictures: picturesHost() });
                },
                keys: function () { return [{ key: 'Mod-s', run: function () { save(); return true; } }, { key: 'Mod-f', run: function () { openFind(); return true; } }]; },
                say: say,
                changed: function () { commandsChanged(); },
                failed: function (text) { say(text, true); setMode('text'); }
            };
        }
        function pageActive() { return !!(page && page.active()); }
        /* A change to the slide's text, from the page, the text pane or a
           command: the deck is told, the other views follow. */
        function takeText(text, from) {
            requireEditable();
            var s = current();
            if (s.text === text) { return; }
            s.text = text;
            modified = true;
            installStyle();
            if (from !== 'text' && cm) { setCM(text); }
            if (from !== 'page' && pageActive()) { page.textChanged(); }
            if (!pageActive()) { scheduleRedraw(); }
            drawThumb(at);
            drawNotes();
            commandsChanged();
            if (slideSearch) slideSearch.changed();
            keep();
        }
        function scheduleRedraw() { clearTimeout(redrawTimer); redrawTimer = setTimeout(function () { if (!pageActive()) { drawSlide(); } }, 250); }
        function drawSlide() {
            applySlideSettings(el.slide, current());
            drawInto(el.body, current().text);
            drawNotes();
            updateLocation();
        }
        function updateLocation() {
            el.where.textContent = (path || 'Not saved yet') + (readOnly() ? ' (read-only)' : '');
            el.where.title = el.where.textContent;
            q('[data-role="position"]').textContent = 'Slide ' + (at + 1) + ' of ' + deck.slides.length;
        }
        function drawNotes() {
            var tmp = document.createElement('div');
            try { drawIntoQuiet(tmp, current().text); } catch (err) { }
            var notes = notesNodes(tmp), has = !!notes.childNodes.length;
            el.notesView.hidden = !has;
            if (has) {
                var label = document.createElement('p'); label.className = 'deck-notes-label'; label.textContent = 'Speaker Notes';
                el.notesView.replaceChildren(label, notes);
            } else { el.notesView.replaceChildren(); }
        }
        function drawIntoQuiet(target, text) { drawInto(target, text, true); }

        /* === The text pane (CodeMirror, as the Editor's) ================ */

        function setCM(text) {
            if (!cm) { return; }
            if (cmSlide !== current()) {
                if (cmSlide) { cmStates.set(cmSlide, cm.state); }
                cmSlide = current();
                var state = cmStates.get(cmSlide);
                cm.setState(state && state.doc.toString() === text ? state : cmLibs.EditorState.create({ doc: text, extensions: cmExtensions }));
                refreshAccess();
                return;
            }
            if (cm.state.doc.toString() === text) { return; }
            fromPage = true;
            try { cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text } }); } finally { fromPage = false; }
        }
        function makeCM() {
            if (cmReady) { return cmReady; }
            cmReady = kit().then(function (K) { return K.macros(); }).then(codeMirror).then(function (CM) {
                if (destroyed) { return null; }
                accessComp = new CM.Compartment();
                var ext = [CM.history(), CM.drawSelection(), CM.highlightActiveLine(), CM.keymap.of([{ key: 'Mod-f', run: function () { openFind(); return true; } }].concat(CM.defaultKeymap, CM.historyKeymap, [CM.indentWithTab])),
                    accessComp.of([CM.EditorState.readOnly.of(readOnly()), CM.EditorView.editable.of(!readOnly())]),
                    CM.EditorState.transactionFilter.of(function (tr) { return tr.docChanged && readOnly() ? [] : tr; }),
                    CM.EditorView.lineWrapping, CM.EditorView.contentAttributes.of({ 'aria-label': 'The Slide\'s Markdown' }),
                    CM.EditorView.updateListener.of(function (u) { if (u.docChanged && !fromPage) { takeText(u.state.doc.toString(), 'text'); } if (u.docChanged || u.selectionSet) commandsChanged(); })];
                if (CM.markdown) { try { ext.push(CM.markdown()); } catch (err) { } }
                ext.push(window.yavcMacroTools.completions(CM, currentMacroEngine));
                if (CM.EditorView.theme) { ext.push(CM.EditorView.theme({ '&': { height: '100%', fontSize: 'var(--text-sm)' }, '.cm-scroller': { fontFamily: 'var(--mono)' }, '.cm-content': { caretColor: 'var(--text)' } })); }
                cmLibs = CM; cmExtensions = ext; cmSlide = current();
                cm = new CM.EditorView({ state: CM.EditorState.create({ doc: current().text, extensions: ext }), parent: el.text });
                refreshAccess();
                return cm;
            });
            return cmReady;
        }

        /* === Views: Visual, Text, Split ================================ */

        /* Where the canvas sits: a side of the Markdown pane, as the first
           or second pane of PUDL's splitter, stacked for top and bottom,
           or floating over the Markdown where the person put it. In
           Visual and Text the one pane shown fills the work area. */
        function applyDock() {
            var dock = DOCKS.some(function (d) { return d[0] === settings.dock; }) ? settings.dock : 'left';
            settings.dock = dock;
            root.setAttribute('data-dock', dock);
            var floating = dock === 'float' && mode === 'split', first = dock === 'left' || dock === 'top';
            el.work.classList.toggle('stacked', dock === 'top' || dock === 'bottom');
            el.floatBar.hidden = !floating;
            el.stagebox.classList.toggle('deck-float', floating);
            if (floating) {
                if (el.stagebox.parentNode !== el.main) { el.main.appendChild(el.stagebox); }
                var f = settings.float || {};
                el.stagebox.style.left = (f.x != null ? f.x : (el.film.hidden ? 0 : el.film.offsetWidth) + 24) + 'px'; el.stagebox.style.top = (f.y != null ? f.y : 32) + 'px';
                el.stagebox.style.width = (f.w || 560) + 'px'; el.stagebox.style.height = (f.h || 360) + 'px';
                el.work.replaceChildren(el.text);
                el.work.removeAttribute('data-split-pane');
                el.work.classList.add('deck-alone');
            } else {
                el.stagebox.removeAttribute('style');
                el.work.classList.remove('deck-alone');
                el.work.replaceChildren.apply(el.work, first ? [el.stagebox, el.split, el.text] : [el.text, el.split, el.stagebox]);
                /* PUDL's splitter shows one pane on data-split-pane and keeps
                   the split value for when both are back. */
                if (mode === 'split') { el.work.removeAttribute('data-split-pane'); }
                else if (mode === 'visual') { el.work.setAttribute('data-split-pane', first ? 'first' : 'second'); }
                else { el.work.setAttribute('data-split-pane', first ? 'second' : 'first'); }
            }
            fit();
        }
        function setDock(dock) {
            settings.dock = dock;
            applyDock();
            commandsChanged();
            keepSetting('dock', settings.dock);
        }
        function keepFloat() {
            var r = el.stagebox.getBoundingClientRect(), m = el.main.getBoundingClientRect();
            settings.float = { x: Math.round(r.left - m.left), y: Math.round(r.top - m.top), w: Math.round(r.width), h: Math.round(r.height) };
            keepSetting('float', settings.float);
        }
        el.floatBar.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) { return; }
            var start = { x: e.clientX, y: e.clientY, left: el.stagebox.offsetLeft, top: el.stagebox.offsetTop };
            el.floatBar.setPointerCapture(e.pointerId);
            function move(ev) {
                var m = el.main.getBoundingClientRect();
                var x = Math.max(0, Math.min(m.width - 80, start.left + ev.clientX - start.x));
                var y = Math.max(0, Math.min(m.height - 40, start.top + ev.clientY - start.y));
                el.stagebox.style.left = x + 'px'; el.stagebox.style.top = y + 'px';
            }
            function up() { el.floatBar.removeEventListener('pointermove', move); el.floatBar.removeEventListener('pointerup', up); keepFloat(); }
            el.floatBar.addEventListener('pointermove', move);
            el.floatBar.addEventListener('pointerup', up);
            e.preventDefault();
        });
        /* A resize keeps the floating canvas's place once it stops, not on
           every frame, since each keep writes the settings file and with it
           the home folder (performance review, 2026-11-03). */
        var floatTimer = 0;
        var floatRO = 'ResizeObserver' in window ? new ResizeObserver(function () {
            if (!el.stagebox.classList.contains('deck-float')) { return; }
            clearTimeout(floatTimer); floatTimer = setTimeout(keepFloat, 400);
        }) : null;
        if (floatRO) { floatRO.observe(el.stagebox); }

        async function setMode(next) {
            mode = ['visual', 'text', 'split'].indexOf(next) >= 0 ? next : 'visual';
            settings.view = mode;
            root.setAttribute('data-view', mode);
            applyDock();
            if (mode !== 'visual') { await makeCM(); if (cm) { setCM(current().text); } }
            if (mode !== 'text') {
                try {
                    await pageView();
                    if (destroyed) { return; }
                    if (!page) { page = window.yavcPageView.attach(pageHost()); window.yavcMdEditor._page = page; }
                    applySlideSettings(el.slide, current());
                    if (readOnly()) { await page.enable(false); drawSlide(); } else await page.enable(true);
                } catch (err) { say('The slide could not be edited on its canvas: ' + err.message, true); if (page) { page.enable(false); } drawSlide(); }
            } else if (page) { await page.enable(false); }
            fit();
            commandsChanged();
            if (window.pudlMenubar) { window.pudlMenubar.refresh(); }
            keepSetting('view', mode);
        }

        /* === The filmstrip ============================================= */

        el.film.addEventListener('keydown', function (e) {
            var by = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -deck.slides.length : e.key === 'End' ? deck.slides.length : 0;
            if (!by) { return; }
            e.preventDefault();
            goTo(at + by).then(function () { var b = el.film.querySelector('[data-slide="' + at + '"]'); if (b) { b.focus(); } });
        });
        function drawFilm() {
            el.film.innerHTML = deck.slides.map(function (s, i) {
                return '<button type="button" class="deck-thumb" data-slide="' + i + '" role="option" aria-selected="' + (i === at) + '" aria-label="' + esc((i + 1) + '. ' + titleOf(s, i)) + '">' +
                    '<span class="deck-thumb-n" aria-hidden="true">' + (i + 1) + '</span><span class="deck-thumb-stage" aria-hidden="true"><span class="deck-thumb-canvas"><section class="deck-slide" data-role="thumb"><div class="deck-body doc-page"></div></section></span></span></button>';
            }).join('');
            deck.slides.forEach(function (s, i) { drawThumb(i); });
            fitThumbs();
            installStyle();
        }
        function drawThumb(i) {
            var b = el.film.querySelector('[data-slide="' + i + '"]');
            if (!b || !md) { return; }
            var section = b.querySelector('section'), body = section.querySelector('.deck-body');
            applySlideSettings(section, deck.slides[i]);
            try { drawIntoQuiet(body, deck.slides[i].text); } catch (err) { }
            body.querySelectorAll('.sc-notes').forEach(function (a) { a.remove(); });
            b.title = titleOf(deck.slides[i], i);
            b.setAttribute('aria-selected', String(i === at));
        }
        function fitThumbs() {
            var wh = sizeOf(), w = el.film.clientWidth - 44;
            if (w <= 0) { return; }
            var k = w / wh[0];
            el.film.querySelectorAll('.deck-thumb-stage').forEach(function (s) { s.style.height = Math.round(wh[1] * k) + 'px'; });
            el.film.querySelectorAll('.deck-thumb-canvas').forEach(function (c) { c.style.width = wh[0] + 'px'; c.style.height = wh[1] + 'px'; c.style.transform = 'scale(' + k + ')'; });
        }
        el.film.addEventListener('click', function (e) {
            var b = e.target.closest('[data-slide]');
            if (b) { goTo(+b.getAttribute('data-slide')); }
        });
        async function goTo(i, fromSearch) {
            if (Math.max(0, Math.min(deck.slides.length - 1, i)) !== at) abortOwnedDialogs(true);
            i = Math.max(0, Math.min(deck.slides.length - 1, i));
            if (pageActive()) { await page.enable(false); }
            at = i;
            if (slideSearch) slideSearch.changed(!fromSearch);
            el.film.querySelectorAll('[data-slide]').forEach(function (b) { b.setAttribute('aria-selected', String(+b.getAttribute('data-slide') === at)); });
            if (cm) { setCM(current().text); }
            applySlideSettings(el.slide, current());
            if (mode !== 'text') {
                if (page && !readOnly()) { try { await page.enable(true); } catch (err) { drawSlide(); } } else { drawSlide(); }
            }
            drawNotes();
            updateLocation();
            announce();
            commandsChanged();
            var b = el.film.querySelector('[data-slide="' + at + '"]');
            if (b && b.scrollIntoView) { b.scrollIntoView({ block: 'nearest' }); }
            await installStyle();
        }

        /* === Slides: new, duplicate, delete, move ======================= */

        function addSlide(layout) {
            requireEditable();
            var text = NEW_SLIDE[layout] || NEW_SLIDE.content;
            deck.slides.splice(at + 1, 0, { text: text });
            modified = true;
            drawFilm();
            goTo(at + 1);
        }
        function duplicateSlide() { requireEditable(); deck.slides.splice(at + 1, 0, { text: current().text }); modified = true; drawFilm(); goTo(at + 1); }
        /* asked: false for an agent's delete@1, which changes only the deck
           in the window, unsaved, and must not wait on a dialog. */
        async function deleteSlide(asked) {
            requireEditable();
            if (deck.slides.length <= 1) { say('A deck keeps at least one slide.'); return; }
            /* There is no undo for a slide, so the person's delete asks (Principles, section 3). */
            if (asked !== false && !(await window.yavcDialog.confirm('Delete slide ' + (at + 1) + '?', '"' + titleOf(current(), at) + '" and its notes go from the deck.', { okLabel: 'Delete', danger: true }))) { return; }
            deck.slides.splice(at, 1);
            modified = true;
            drawFilm();
            goTo(Math.min(at, deck.slides.length - 1));
        }
        function moveSlide(by) {
            requireEditable();
            var to = at + by;
            if (to < 0 || to >= deck.slides.length) { return; }
            var s = deck.slides.splice(at, 1)[0];
            deck.slides.splice(to, 0, s);
            modified = true;
            drawFilm();
            goTo(to);
        }
        function setSlideSetting(key, value) {
            requireEditable();
            var s = current();
            setSetting(s, key, value);
            takeText(s.text, 'command');
            if (pageActive()) { applySlideSettings(el.slide, s); }
        }
        function setFront(key, value) {
            requireEditable();
            if (deck.frontProblem) { say('The front matter cannot be changed here: ' + deck.frontProblem, true); return; }
            if (value == null || value === '') { delete deck.front[key]; } else { deck.front[key] = value; }
            /* Written at once, so a change the engine refuses is known now. */
            serializeDeck(deck);
            frontChanged();
        }
        function frontChanged() {
            installStyle();
            modified = true;
            deck.slides.forEach(function (s, i) { drawThumb(i); });
            applySlideSettings(el.slide, current());
            fit(); fitThumbs();
            commandsChanged();
            keep();
        }
        /* A question with one field, as PUDL's dialog asks it. */
        /* The site's dialogs (static/dialogs.js). */
        var dialogOwners = new Set();
        async function settleForDialog(slideOnly) {
            var owner = deck, slide = current();
            try { if (pageActive()) await page.sync(); }
            catch (err) { return false; }
            return !destroyed && owner === deck && (!slideOnly || slide === current());
        }
        function dialogGuard(slideOnly) {
            var owner = { deck: deck, slide: slideOnly ? current() : null, text: fullText(), controller: new AbortController() };
            dialogOwners.add(owner);
            return { signal: owner.controller.signal,
                current: function () { return !destroyed && !owner.controller.signal.aborted && deck === owner.deck && (!owner.slide || current() === owner.slide) && fullText() === owner.text; },
                release: function () { dialogOwners.delete(owner); }
            };
        }
        function abortOwnedDialogs(slideOnly) {
            dialogOwners.forEach(function (owner) { if (!slideOnly || owner.slide) { owner.controller.abort(); dialogOwners.delete(owner); } });
        }
        async function askText(title, label, value, slideOnly) {
            if (!await settleForDialog(slideOnly)) return null;
            var guard = dialogGuard(slideOnly);
            if (typeof value === 'function') value = value();
            return window.yavcDialog.askText(title, label, value, { signal: guard.signal, validate: function () { return guard.current() ? null : 'The deck changed. Close and reopen this form.'; } })
                .then(function (answer) { return guard.current() ? answer : null; }).finally(guard.release);
        }
        function askChoice(title, body, buttons) { return window.yavcDialog.askChoice(title, body, buttons); }
        async function deckColours() {
            if (!await settleForDialog(false)) return;
            var f = deck.front, guard = dialogGuard(false);
            return window.yavcMdEditor.askColours('Deck Colors', [
                { key: 'ink', label: 'Text', value: f.ink, fallback: '#1a1a1a', help: 'Paragraphs, lists and tables; headings too unless they have a color of their own. Empty is the theme\'s own.' },
                { key: 'heading', label: 'Headings', value: f.heading, fallback: '#1a1a1a', help: 'Every heading, including a title slide\'s title.' },
                { key: 'muted', label: 'Secondary Text', value: f.muted, fallback: '#5c6470', help: 'A title slide\'s subtitle, captions and the speaker notes.' },
                { key: 'accent', label: 'Accent', value: f.accent, fallback: '#1f5fbf', help: 'The rule under a heading, links, and words colored "accent".' },
                { key: 'background', label: 'Background', value: f.background, fallback: '#ffffff', help: 'Every slide, unless the slide sets its own.' }
            ], guard).then(function (v) { if (!v || !guard.current()) return; Object.keys(v).forEach(function (k) { setFront(k, v[k]); }); }).finally(guard.release);
        }
        async function slideColours() {
            if (!await settleForDialog(true)) return;
            var st = settingsOf(current()), guard = dialogGuard(true);
            return window.yavcMdEditor.askColours('Slide Colors', [
                { key: 'color', label: 'Text', value: st.color, fallback: '#1a1a1a', placeholder: 'The deck\'s own', help: 'Paragraphs, lists and tables on this slide.' },
                { key: 'heading', label: 'Headings', value: st.heading, fallback: '#1a1a1a', placeholder: 'The deck\'s own', help: 'This slide\'s headings.' },
                { key: 'accent', label: 'Accent', value: st.accent, fallback: '#1f5fbf', placeholder: 'The deck\'s own', help: 'The rule under the heading, links, and words colored "accent".' },
                { key: 'background', label: 'Background', value: st.background, fallback: '#ffffff', placeholder: 'The deck\'s own', help: 'This slide alone.' }
            ], guard).then(function (v) { if (!v || !guard.current()) return; Object.keys(v).forEach(function (k) { setSlideSetting(k, v[k]); }); }).finally(guard.release);
        }
        /* Cancel is not a submit button, so Enter in the field is OK. */

        /* === Files ===================================================== */

        function fullText() { return serializeDeck(deck); }
        var macroShared = '', macroIdentity = null, macroRevision = 0;
        function currentMacroEngine() { return md && md.withMacros(fullText(), macroIdentity === deck ? macroShared : ''); }
        async function deckEngine() {
            var captured = deck, text = fullText(), host = picturesHost(), directory = host.dir(), revision = ++macroRevision;
            host.dir = function () { return directory; };
            var K = await kit(), M = await K.macros(), prepared = await M.prepare(md, text, host);
            if (!destroyed && revision === macroRevision && deck === captured && fullText() === text) { macroIdentity = deck; macroShared = prepared.shared; }
            return revision === macroRevision ? prepared.engine : md.withMacros(text, macroIdentity === captured ? macroShared : '');
        }
        function customInserts() {
            if (!window.yavcMacroTools || !md) { return []; }
            return window.yavcMacroTools.metadata(currentMacroEngine()).map(function (item) { return { id: 'insert-custom-' + item.name, label: item.name, words: item.name,
                run: async function () {
                    var captured = deck, slide = current(), text = fullText(), context = await deckEngine();
                    if (destroyed || styleLifetime.signal.aborted || deck !== captured || current() !== slide || fullText() !== text) { return; }
                    var source = await window.yavcMacroTools.ask(context, item.name, null, picturesHost());
                    if (!source || deck !== captured || current() !== slide || fullText() !== text) { return; }
                    if (pageActive()) { if (item.kind === 'inline') { page.insertInline(source); } else { page.insertMarkdown(source); } }
                    else if (cm) { if (item.kind === 'inline') { var selection = cm.state.selection.main; cm.dispatch({ changes: { from: selection.from, to: selection.to, insert: source } }); } else { window.yavcMdEditor.textInsert(cm, source); } }
                } }; });
        }
        async function editDefinitions() {
            if (!await settleForDialog(true)) return;
            var captured = deck, slide = current(), front = frontTextOf(deck), text = front + slide.text, K = await kit(), M = await K.macros();
            function unchanged() { return !destroyed && deck === captured && current() === slide && frontTextOf(deck) + slide.text === text; }
            if (!unchanged()) { return; }
            try { await M.manage({ engine: md, text: text, host: picturesHost(), current: unchanged, signal: styleLifetime.signal,
                help: 'These definitions are stored on this slide and are available throughout the deck.',
                save: function (next) { var parsed = parseDeck(next); takeFront(deck, parsed.frontText); takeText(parsed.slides[0].text, 'definitions'); commandsChanged(); } }); }
            catch (err) { say(err.message, true); }
        }
        /* === The deck's stylesheet (docs/slides-design.md, decision 17) ===
           CSS from every {{style}} block, and from the front matter's
           stylesheet file, scoped to this deck's slides with @scope, so it
           reaches the canvas, the thumbnails, the show and the exports and
           nothing else on the page. {{style:slide}} is scoped to its slide. */
        var deckStyle = null, slideStyles = new Map(), styleRevision = 0;
        var styleNotice = document.createElement('div'); styleNotice.className = 'notice warn'; styleNotice.hidden = true; styleNotice.setAttribute('role', 'status');
        styleNotice.innerHTML = '<div class="notice-content"><p class="notice-body"></p></div>'; root.insertBefore(styleNotice, el.main);
        function styleDirectory() { return path && path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : '~'; }
        function styleSections(index) {
            styledSections.forEach(function (section) { if (!root.contains(section)) { styledSections.delete(section); } });
            return Array.from(styledSections).filter(function (section) { return index == null || section.getAttribute('data-slide-index') === String(index); });
        }
        function styleBoundaries(index) { return Array.from(new Set(styleSections(index).map(function (section) { return section.parentElement; }))); }
        function deckCSS() {
            var parts = deckStyle ? [deckStyle.state().css] : []; slideStyles.forEach(function (controller) { parts.push(controller.state().css); }); return parts.join('\n');
        }
        async function installStyle(reload) {
            var revision = ++styleRevision, currentDeck = deck;
            if (!md) { return; }
            try {
                var K = await kit(), D = await K.styles();
                if (destroyed || revision !== styleRevision || currentDeck !== deck) { return; }
                if (!deckStyle) { deckStyle = D.attach({ surfaces: function () { return styleSections(); }, boundaries: function () { return styleBoundaries(); },
                    read: function (p) { return H.fs && H.fs.readText ? H.fs.readText(p) : Promise.resolve(null); } }); }
                var all = deck.slides.map(function (slide) { return md.styles(slide.text); });
                var sharedPath = window.yavcStyleTools.resolve(deck.front.stylesheet, styleDirectory());
                var work = [deckStyle.update({ identity: deck, inline: [].concat.apply([], all.map(function (blocks) { return blocks.filter(function (block) { return !block.slide; }).map(function (block) { return block.css; }); })), stylesheet: sharedPath, reload: reload === true })];
                slideStyles.forEach(function (controller, i) { if (i >= all.length) { controller.destroy(); slideStyles.delete(i); } });
                all.forEach(function (blocks, i) {
                    var controller = slideStyles.get(i);
                    if (!controller) { controller = D.attach({ surfaces: function () { return styleSections(i); }, boundaries: function () { return styleBoundaries(i); } }); slideStyles.set(i, controller); }
                    work.push(controller.update({ identity: deck, inline: blocks.filter(function (block) { return block.slide; }).map(function (block) { return block.css; }) }));
                });
                await Promise.all(work);
                if (destroyed || revision !== styleRevision) { return; }
                var oldShared = macroIdentity === deck ? macroShared : ''; await deckEngine();
                if (destroyed || revision !== styleRevision || currentDeck !== deck) { return; }
                if (oldShared !== macroShared) {
                    deck.slides.forEach(function (_, index) { drawThumb(index); });
                    if (pageActive()) { page.textChanged(true); } else { drawSlide(); } drawNotes();
                }
                commandsChanged();
                var problems = deckStyle.state().problems; slideStyles.forEach(function (controller) { problems = problems.concat(controller.state().problems); });
                problems = Array.from(new Set(problems)); styleNotice.hidden = !problems.length; styleNotice.querySelector('.notice-body').textContent = problems.join(' ');
            } catch (err) { if (!destroyed && revision === styleRevision) { say('Styles could not be applied: ' + err.message, true); } }
        }
        function deckClasses() { var classes = deckStyle ? deckStyle.state().classes : []; slideStyles.forEach(function (controller) { classes = classes.concat(controller.state().classes); }); return Array.from(new Set(classes)).sort(); }
        var sheetWatch = H.fs && H.fs.onChange ? H.fs.onChange(function () { installStyle(true); }) : null;
        async function editStyles(shared) {
            if (!await settleForDialog(true)) return;
            var captured = deck, slide = current(), text = slide.text, front = frontTextOf(deck), K = await kit(); await K.styles();
            function unchanged() { return !destroyed && deck === captured && current() === slide && slide.text === text && frontTextOf(deck) === front; }
            if (!unchanged()) { return; }
            try {
                if (shared) { await window.yavcStyleTools.shared({ path: deck.front.stylesheet, dir: styleDirectory(), current: unchanged, signal: styleLifetime.signal, read: H.fs.readText, write: H.fs.writeText }); }
                else { await window.yavcStyleTools.document({ title: 'Slide Stylesheet', slide: true, text: text, engine: md, stylesheet: deck.front.stylesheet || '', current: unchanged, signal: styleLifetime.signal,
                    save: function (next, path) { takeText(next, 'styles'); if (path !== (deck.front.stylesheet || '')) { setFront('stylesheet', path); } } }); }
                await installStyle(true);
            } catch (err) { say(err.message, true); }
        }

        /* === Tabs: one for each open deck ================================ */

        function tabTitle(t) { return t.path ? t.path.replace(/^.*\//, '') : (t.deck.front.title || 'A New Deck'); }
        function stash() {
            var t = active >= 0 ? tabs[active] : null;
            if (t) { t.deck = deck; t.path = path; t.modified = modified; t.at = at; }
        }
        var tabRowApi = window.yavcDocTabs ? window.yavcDocTabs.attach(el.tabsEl, {
            tabs: function () { stash(); return tabs.map(function (t) { return { name: tabTitle(t), path: t.path, modified: t.modified }; }); },
            active: function () { return active; },
            activate: function (i) { activateTab(i); },
            close: function (i) { return closeTab(i); }
        }) : null;
        function tabRow() { if (tabRowApi) { tabRowApi.render(); } }
        async function activateTab(i) {
            if (!tabs[i]) { return; }
            if (i === active) { tabRow(); return; }
            abortOwnedDialogs(false); if (slideSearch) slideSearch.reset();
            stash();
            if (presenting) { await leave(); }
            active = i;
            var t = tabs[i];
            deck = t.deck; path = t.path; modified = t.modified; at = 0;
            refreshAccess();
            installStyle();
            if (channel) { channel.close(); channel = null; }
            drawFilm();
            await goTo(t.at || 0);
            if (cm) { setCM(current().text); }
            listenForPresenter();
            fit();
            commandsChanged();
            announce();
        }
        function untouched(t) { return !t.path && !dirtyTab(t); }
        /* A deck opens in a tab of its own, unless the front tab is a new
           deck nobody has touched, which it replaces. */
        async function openInTab(text, newPath, slide) {
            stash();
            if (active >= 0 && tabs[active] && untouched(tabs[active])) { load(text, newPath, slide); return; }
            tabs.push({ deck: parseDeck(text), path: newPath || null, modified: false, at: Math.max(0, (slide || 1) - 1) });
            await activateTab(tabs.length - 1);
        }
        async function closeTab(i) {
            var t = tabs[i];
            if (!t) { return; }
            if (dirtyTab(t)) {
                if (i !== active) { await activateTab(i); }
                var choice = await window.yavcDialog.askSave(tabTitle(t));
                if (choice !== 'discard' && choice !== 'save') { return; }
                if (choice === 'save') { await save(); if (dirtyTab(t)) { return; } }
            }
            var front = active;
            tabs.splice(i, 1);
            if (i < front) { front--; } else if (i === front) { front = Math.min(i, tabs.length - 1); }
            if (!tabs.length) { tabs.push({ deck: parseDeck(NEW_DECK), path: null, modified: false, at: 0 }); front = 0; }
            active = -1;
            await activateTab(front);
            keep();
        }

        function load(text, newPath, slide) {
            abortOwnedDialogs(false); if (slideSearch) slideSearch.reset();
            deck = parseDeck(text);
            path = newPath || null;
            modified = false;
            at = 0;
            installStyle();
            drawFilm();
            goTo(Math.max(0, Math.min(deck.slides.length - 1, (slide || 1) - 1)));
            if (cm) { setCM(current().text); }
            fit();
            if (active < 0) { tabs.push({ deck: deck, path: path, modified: false, at: at }); active = tabs.length - 1; }
            stash();
            tabRow();
        }
        async function openPath(p, slide) {
            for (var i = 0; i < tabs.length; i++) {
                if (tabs[i].path === p) { await activateTab(i); if (slide) { await goTo(slide - 1); } return true; }
            }
            if (resources) {
                var snapshot = await resources.read(p);
                if (destroyed) return false;
                stash();
                tabs.push({ deck: parseDeck(snapshot.text), path: p, resource: snapshot, name: snapshot.name, modified: false, at: Math.max(0, (slide || 1) - 1) });
                await activateTab(tabs.length - 1);
                say('Opened ' + (snapshot.name || p) + (readOnly() ? ' (read-only).' : '.'));
                return true;
            }
            if (!H.fs || !H.fs.readText) { say('There is no file service here.', true); return false; }
            var text = await H.fs.readText(p);
            if (text == null) { say('There is no file at ' + p + '.', true); return false; }
            await openInTab(text, p, slide);
            say('Opened ' + p + '.');
            return true;
        }
        async function open() {
            if (!H.fs || !H.fs.open) { return; }
            var res = await H.fs.open({ title: 'Open a Deck', host: root, start: '~', accept: ['.md'] });
            if (!res) { return; }
            if (res.path) { await openPath(res.path); return; }
            await openInTab(res.text, null);
            modified = true;
            say('Opened ' + res.name + '.');
            announce();
        }
        async function save() {
            if (resources) {
                if (!path) return saveAs();
                try { return await saveResource(tab(), path); } catch (err) { say(err.message, true); return false; }
            }
            if (!path) { return saveAs(); }
            var err = await H.fs.writeText(path, fullText());
            if (err) { say('Could not save: ' + err, true); return; }
            modified = false;
            say('Saved ' + path + '.');
            commandsChanged();
        }
        async function saveAs() {
            if (resources) {
                try { return await saveResource(tab(), null); } catch (err) { say(err.message, true); return false; }
            }
            if (!H.fs || !H.fs.save) { return; }
            var name = (deck.front.title || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
            var blob = new Blob([fullText()], { type: 'text/markdown' });
            var res = await H.fs.save({ title: 'Save the Deck As', name: name + '.slides.md', host: root, start: '~/Documents', blob: blob }).catch(function (e) { say(e.message, true); return null; });
            if (!res) { return; }
            if (res.path) { path = res.path; modified = false; say('Saved ' + path + '.'); announce(); }
            /* "Download instead": the dialog leaves the download to the
               applet (pudl-applet-packages README, fs.save). */
            else if (res.download) { window.yavcUtil.download(res.download, blob); say('Downloaded ' + res.download + '.'); }
            commandsChanged();
        }
        async function saveResource(t, destination) {
            if (!t) return Promise.reject(new Error('No deck is open.'));
            if (tab() === t && pageActive()) {
                await page.sync();
                if (destroyed || tab() !== t) throw new Error('The deck changed before saving.');
            }
            stash();
            var submitted = serializeDeck(t.deck);
            var pending = (t.saveQueue || Promise.resolve()).then(async function () {
                if (destroyed || !tabs.includes(t)) throw new Error('The deck closed before its save could run.');
                var accepted;
                if (destination == null) accepted = await resources.saveAs({ name: t.name || tabTitle(t) + '.slides.md', sourceResource: t.path }, submitted, { host: root, signal: styleLifetime.signal });
                else if (destination === t.path && t.resource) accepted = await resources.write(t.resource, submitted);
                else if (destination === t.path && !t.fresh) throw new Error('The recovered deck has no matching revision. Use Save As to preserve a copy.');
                else accepted = await resources.create(destination, submitted);
                if (!accepted || destroyed || !tabs.includes(t)) return false;
                var syncError = null;
                if (tab() === t && pageActive()) {
                    try { if (!resources.canWrite(accepted)) await page.enable(false); else await page.sync(); }
                    catch (err) { syncError = err; if (!resources.canWrite(accepted)) page.freeze(); }
                    if (destroyed || !tabs.includes(t)) return false;
                }
                t.resource = accepted; t.baseline = null; t.conflict = null; t.path = accepted.resource; t.name = accepted.name || t.name;
                t.modified = !!syncError || serializeDeck(t.deck) !== submitted; t.fresh = false;
                if (tab() === t) {
                    path = t.path; modified = t.modified; refreshAccess();
                    if (!syncError && readOnly() && page) { await page.enable(false); drawSlide(); }
                    updateLocation(); announce(); say(syncError ? 'The submitted source was saved, but the newer rich draft could not synchronize. Copy it before leaving. ' + syncError.message : 'Saved ' + (t.name || path) + (modified ? '; newer edits are still unsaved.' : '.'), !!syncError);
                }
                tabRow(); keep(); return true;
            });
            t.saveQueue = pending.catch(function () {}); return pending;
        }
        async function newDeck() {
            stash();
            tabs.push({ deck: parseDeck(NEW_DECK), path: null, modified: false, at: 0 });
            await activateTab(tabs.length - 1);
            say('This is a new deck. Save it to keep it.');
        }
        function editWhole() {
            if (!path) { say('Save the deck first, so the Editor can open it.'); return; }
            if (window.pudlApplets && window.pudlApplets.request && window.pudlApplets.can && window.pudlApplets.can('open', 'file')) {
                window.pudlApplets.request('open', { path: path, kind: 'file' }, root);
            }
        }

        /* === Presenting ================================================ */

        function channelFor() {
            if (!('BroadcastChannel' in window)) { return null; }
            return new BroadcastChannel('yavc-slides:' + (path || 'unsaved'));
        }
        function buildShow(stage) {
            stage.innerHTML = '';
            deck.slides.forEach(function (s, i) {
                var canvas = document.createElement('div');
                canvas.className = 'deck-canvas';
                var size = sizeOf(); canvas.style.width = size[0] + 'px'; canvas.style.height = size[1] + 'px';
                var section = document.createElement('section');
                section.className = 'deck-slide';
                var body = document.createElement('div');
                body.className = 'deck-body doc-page';
                section.appendChild(body);
                canvas.appendChild(section);
                stage.appendChild(canvas);
                applySlideSettings(section, s, currentMacroEngine().exportPreview(s.text).slideSettings);
                drawInto(body, s.text, false, true);
                section.querySelectorAll('.sc-notes').forEach(function (a) { a.remove(); });
            });
            stage.setAttribute('data-theme-name', deck.front.theme || 'plain');
            stage.setAttribute('data-transition', deck.front.transition || 'fade');
        }
        function fitShow(stage) {
            var wh = sizeOf(), w = stage.clientWidth, h = stage.clientHeight, k = Math.min(w / wh[0], h / wh[1]) || 1;
            stage.querySelectorAll('.deck-canvas').forEach(function (c) { c.style.width = wh[0] + 'px'; c.style.height = wh[1] + 'px'; c.style.transform = 'translate(-50%, -50%) scale(' + k + ')'; });
        }
        var showStage = null, showResize = null;
        async function present(fromSlide) {
            if (presenting) { return; }
            await loadScript(HERE + 'present.js' + STAMP);
            if (pageActive()) { await page.enable(false); }
            showStage = document.createElement('div');
            showStage.className = 'deck-show';
            buildShow(showStage);
            root.appendChild(showStage);
            await installStyle();
            root.classList.add('deck-showing');
            channel = channel || channelFor();
            presenting = window.yavcPresent.attach(showStage, {
                start: fromSlide == null ? at : fromSlide,
                onChange: function (i, step) { if (channel) { channel.postMessage({ type: 'at', slide: i, step: step }); } },
                onLeave: leave
            });
            showResize = function () { fitShow(showStage); };
            window.addEventListener('resize', showResize);
            fitShow(showStage);
            if (root.requestFullscreen && !document.fullscreenElement) { root.requestFullscreen().catch(function () { }); }
            showStage.focus();
            if (settings.presenterOnPresent && path) { presenterWindow(); }
            commandsChanged();
        }
        async function leave() {
            if (!presenting) { return; }
            at = presenting.position().slide;
            presenting.destroy();
            /* The focus comes back to the deck, so its keys keep working. */
            setTimeout(function () { try { root.focus({ preventScroll: true }); } catch (err) { } }, 0);
            presenting = null;
            window.removeEventListener('resize', showResize);
            showStage.remove();
            showStage = null;
            root.classList.remove('deck-showing');
            if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen().catch(function () { }); }
            drawFilm();
            await goTo(at);
            commandsChanged();
        }
        function onFullscreenChange() { if (!document.fullscreenElement && presenting && !presenterRole) { leave(); } }
        document.addEventListener('fullscreenchange', onFullscreenChange);
        function presenterWindow() {
            if (!path) { say('Save the deck first, so the presenter window can open it.'); return; }
            /* The presenter opens on this page's own origin, since the show
               and the presenter follow each other over a BroadcastChannel,
               which never crosses origins, and the deck's file is kept
               per origin (DESIGN.md, decision 11): on the desktop that is
               the applet's standalone page at /slides on the same host. */
            var url = new URL(opts.host === 'window' ? '/slides' : location.pathname, location.origin);
            url.search = '?file=' + encodeURIComponent(path).replace(/%2F/g, '/').replace(/%7E/g, '~') + '&presenter=1';
            window.open(url.href, 'yavc-presenter-' + path, 'popup,width=960,height=600'); // check-ignore(window-open-noopener): the site's own page on this origin; the name lets a second press reuse the window

            channel = channel || channelFor();
            if (channel) { channel.postMessage({ type: 'at', slide: presenting ? presenting.position().slide : at, step: presenting ? presenting.position().step : 0 }); }
        }
        /* The presenter view: the current slide, the next, the notes, a
           clock and a timer, following the show through the channel, and
           driving it with the same keys. */
        var clockTimer = 0;
        function becomePresenter() {
            presenterRole = { slide: 0, step: 0, started: Date.now() };
            root.classList.add('deck-presenter-mode');
            el.main.hidden = true;
            root.querySelector('.deck-toolbar-slot').hidden = true;
            root.querySelector('[data-role="status"]').hidden = true;
            el.presenter.hidden = false;
            el.presenter.innerHTML = '<div class="deck-pv-top"><div class="deck-pv-now"><div class="deck-stage" data-role="pv-now"></div></div><div class="deck-pv-side"><div class="deck-pv-clock" data-role="pv-clock"></div><div class="deck-pv-next"><p class="deck-pv-label">Next</p><div class="deck-stage" data-role="pv-next"></div></div></div></div><div class="deck-pv-notes" data-role="pv-notes"></div><p class="deck-pv-help">Arrows, Space, Page Up and Down move the show from here as well. <span data-role="pv-count"></span></p>';
            channel = channel || channelFor();
            function drawPV() {
                var i = presenterRole.slide, now = q('[data-role="pv-now"]'), nxt = q('[data-role="pv-next"]');
                function one(stage, s) {
                    stage.innerHTML = '';
                    if (!s) { stage.innerHTML = '<p class="deck-pv-end">End of the deck</p>'; return; }
                    var canvas = document.createElement('div'); canvas.className = 'deck-canvas';
                    var section = document.createElement('section'); section.className = 'deck-slide';
                    var body = document.createElement('div'); body.className = 'deck-body doc-page';
                    section.appendChild(body); canvas.appendChild(section); stage.appendChild(canvas);
                    applySlideSettings(section, s); drawInto(body, s.text);
                    section.querySelectorAll('.sc-notes').forEach(function (a) { a.remove(); });
                    fitShow(stage);
                }
                one(now, deck.slides[i]); one(nxt, deck.slides[i + 1]);
                var tmp = document.createElement('div');
                try { drawIntoQuiet(tmp, deck.slides[i] ? deck.slides[i].text : ''); } catch (err) { }
                var pvNotes = notesNodes(tmp);
                if (pvNotes.childNodes.length) { q('[data-role="pv-notes"]').replaceChildren(pvNotes); }
                else { var none = document.createElement('p'); none.className = 'deck-pv-none'; none.textContent = 'No notes for this slide.'; q('[data-role="pv-notes"]').replaceChildren(none); }
                q('[data-role="pv-count"]').textContent = 'Slide ' + (i + 1) + ' of ' + deck.slides.length + '.';
                installStyle();
            }
            function tick() {
                var d = new Date(), e = Math.floor((Date.now() - presenterRole.started) / 1000);
                q('[data-role="pv-clock"]').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + Math.floor(e / 60) + ':' + ('0' + (e % 60)).slice(-2);
            }
            clockTimer = setInterval(tick, 1000);
            tick();
            if (channel) {
                channel.onmessage = function (e) {
                    var m = e.data || {};
                    if (m.type === 'at') { presenterRole.slide = m.slide; presenterRole.step = m.step; drawPV(); }
                };
            }
            root.addEventListener('keydown', function (e) {
            if ((e.key === 'PageUp' || e.key === 'PageDown') && !e.ctrlKey && !e.metaKey && !e.altKey && !presenting) {
                e.preventDefault();
                goTo(at + (e.key === 'PageUp' ? -1 : 1));
                return;
            }
                var next = ['ArrowRight', 'ArrowDown', ' ', 'PageDown'].indexOf(e.key) >= 0, prev = ['ArrowLeft', 'ArrowUp', 'PageUp'].indexOf(e.key) >= 0;
                if (!next && !prev) { return; }
                e.preventDefault();
                presenterRole.slide = Math.max(0, Math.min(deck.slides.length - 1, presenterRole.slide + (next ? 1 : -1)));
                presenterRole.step = 0;
                if (channel) { channel.postMessage({ type: 'goto', slide: presenterRole.slide, step: 0 }); }
                drawPV();
            });
            drawPV();
            window.addEventListener('resize', drawPV);
        }
        function listenForPresenter() {
            channel = channel || channelFor();
            if (!channel) { return; }
            channel.onmessage = function (e) {
                var m = e.data || {};
                if (m.type === 'goto' && presenting) { presenting.goTo(m.slide, m.step); }
                else if (m.type === 'goto' && !presenting) { goTo(m.slide); }
            };
        }

        /* === Export and print ========================================== */

        async function captureExport() {
            if (pageActive()) { await page.sync(); }
            var captured = deck, text = fullText();
            function unchanged() { if (destroyed || deck !== captured || fullText() !== text) { throw new Error('The deck changed during export. Export it again.'); } }
            await deckEngine(); await installStyle(); unchanged(); return unchanged;
        }

        async function exportPage() {
            var unchanged = await captureExport();
            await installStyle();
            await loadScript(HERE + 'present.js' + STAMP);
            var css = await fetch('/applets/md-engine/page.css').then(function (r) { return r.text(); }) + '\n' + await fetch(HERE + 'slides.css' + STAMP).then(function (r) { return r.text(); }) + '\n' + deckCSS();
            var js = await fetch(HERE + 'present.js' + STAMP).then(function (r) { return r.text(); });
            var pudl = document.querySelector('link[href*="/pudl/pudl.css"]');
            var pudlHref = pudl ? new URL(pudl.getAttribute('href'), location.href).href : 'https://yavc.app/pudl/pudl.css';
            /* PUDL's stylesheet goes into the page, with its fonts' addresses
               made absolute, so the file presents itself anywhere. */
            var pudlCSS = await fetch(pudlHref).then(function (r) { return r.text(); }).catch(function () { return ''; });
            pudlCSS = pudlCSS.replace(/url\((['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\)/g, function (m, qu, u) { return 'url("' + new URL(u, pudlHref).href + '")'; });
            var stage = document.createElement('div');
            stage.className = 'deck-show deck-export-stage';
            unchanged(); buildShow(stage);
            var theme = document.documentElement.getAttribute('data-theme') || 'dark';
            /* No "<" reaches the page's <style> as itself, so nothing in a
               deck's CSS, a string included, can close it and open markup;
               \3C is the same character to CSS. */
            pudlCSS = pudlCSS.replace(/</g, '\\3C ');
            css = css.replace(/</g, '\\3C ');
            var html = '<!doctype html>\n<html lang="' + esc(deck.front.lang || 'en') + '" data-theme="' + esc(theme) + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(deck.front.title || 'A deck') + '</title>\n' +
                '<style>\n' + pudlCSS + '\n' + css + '\nhtml, body { margin: 0; height: 100%; background: var(--bg); }\n.deck-export { position: fixed; inset: 0; }\n</style>\n</head>\n<body class="deck deck-showing">\n' +
                '<div class="deck-show deck-export" tabindex="0" role="region" aria-label="' + esc(deck.front.title || 'The deck') + '">' + stage.innerHTML + '</div>\n<script>\n' + js + '\nyavcPresent.start(document.querySelector(".deck-show"));\n</script>\n</body>\n</html>\n';
            var name = (deck.front.title || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
            return { name: name + '.html', html: html };
        }
        async function exportHTML() {
            var page = await exportPage();
            window.yavcUtil.download(page.name, new Blob([page.html], { type: 'text/html' }));
            say('Downloaded ' + page.name + '.');
        }
        /* === PowerPoint and PDF (export-pptx.js, export-pdf.js, import-pptx.js) === */

        function officeContext() {
            return { deck: deck, settingsOf: function (slide) { return currentMacroEngine().exportPreview(slide.text).slideSettings; }, titleOf: function (slide, i) { return 'Slide ' + (i + 1); }, notesOf: function (text) {
                var box = document.createElement('div'); box.append(window.yavcHTML.fragment(currentMacroEngine().exportPreview(text).blocks.map(function (b) { return b.html; }).join('')));
                return Array.from(box.querySelectorAll('.sc-notes')).map(function (n) { var label = n.querySelector('.sc-notes-label'); if (label) { label.remove(); } return n.textContent; }).join('\n');
            }, drawInto: function (target, text) { drawInto(target, text, true, true); }, buildShow: buildShow, sizeOf: sizeOf, loadScript: loadScript, here: HERE, stamp: STAMP, deckCSS: deckCSS };
        }
        function fileStem() { return (deck.front.title || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck'; }
        function download(name, blob) { window.yavcUtil.download(name, blob); say('Downloaded ' + name + '.'); }
        async function pptxBlob() {
            var unchanged = await captureExport();
            await loadScript(HERE + 'export-pptx.js' + STAMP);
            unchanged(); var blob = await window.yavcSlidesPptx.build(officeContext()); unchanged(); return blob;
        }
        async function pdfBytes(progress) {
            var unchanged = await captureExport();
            await loadScript(HERE + 'export-pdf.js' + STAMP);
            var ctx = officeContext();
            ctx.pageCSS = await fetch('/applets/md-engine/page.css' + (window.yavcStaticVersion ? '?v=' + encodeURIComponent(window.yavcStaticVersion) : '')).then(function (r) { return r.text(); }).catch(function () { return ''; });
            unchanged(); var bytes = await window.yavcSlidesPdf.build(ctx, progress); unchanged(); return bytes;
        }
        async function exportPPTX() {
            say('Writing the PowerPoint file…');
            try { download(fileStem() + '.pptx', await pptxBlob()); }
            catch (err) { say('The PowerPoint file could not be written: ' + err.message, true); }
        }
        async function exportPDF() {
            try {
                var bytes = await pdfBytes(function (n, of) { say('Drawing slide ' + n + ' of ' + of + '…'); });
                download(fileStem() + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
            } catch (err) { say('The PDF could not be written: ' + err.message, true); }
        }
        async function importPPTXBuffer(buffer, name) {
            await loadScript(HERE + 'import-pptx.js' + STAMP);
            var got = await window.yavcSlidesImport.pptx(buffer, officeContext());
            await openInTab(got.text, null);
            modified = true;
            stash();
            commandsChanged();
            announce();
            say('Imported ' + (name || 'the file') + ': ' + got.slides + ' slide' + (got.slides === 1 ? '' : 's') + (got.pictures ? ', with ' + got.pictures + ' picture' + (got.pictures === 1 ? '' : 's') + ' noted but not kept' : '') + '. Save it to keep it.');
            return got;
        }
        function importPPTX() {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
            input.addEventListener('change', function () {
                var f = input.files && input.files[0];
                if (!f) { return; }
                f.arrayBuffer().then(function (buf) { return importPPTXBuffer(buf, f.name); }).catch(function (err) { say('The file could not be imported: ' + err.message, true); });
            });
            input.click();
        }
        async function printDeck() {
            var unchanged;
            try { unchanged = await captureExport(); } catch (err) { say('The deck could not be printed: ' + err.message, 'problem'); return; }
            var box = document.createElement('div');
            box.className = 'deck-print';
            buildShow(box);
            document.body.appendChild(box);
            document.body.classList.add('deck-printing');
            function done() { box.remove(); document.body.classList.remove('deck-printing'); window.removeEventListener('afterprint', done); }
            window.addEventListener('afterprint', done);
            setTimeout(function () { try { unchanged(); window.print(); } catch (err) { say('The deck could not be printed: ' + err.message, 'problem'); } finally { setTimeout(done, 1000); } }, 300);
        }

        /* === Snapshots and continuity =================================== */

        /* Unsaved decks, guarded (static/doc-tabs.js): a reload keeps them in
           the snapshot, so leaving the page asks only when there is none;
           closing the window discards the snapshot, so closing asks. */
        var unguard = window.yavcDocTabs.guard(root, {
            changed: function () { stash(); return tabs.filter(dirtyTab).map(tabTitle); },
            keptOnReload: function () { if (pageActive() && page.pending()) return false; return resources ? !!snap && snap.flush() : !!H.snapshot; },
            keptOnClose: function () { return false; },
            saveAll: async function () {
                for (var i = 0; i < tabs.length; i++) {
                    if (!dirtyTab(tabs[i])) { continue; }
                    await activateTab(i);
                    await save();
                    if (dirtyTab(tabs[i])) { return false; }
                }
                return true;
            }
        });
        var snap = null, restoring = false, recoveryKept = null;
        function takeSnapshot() {
            if (restoring) return recoveryKept;
            stash();
            return { version: resources ? 2 : undefined, tabs: tabs.map(function (t) { return { path: t.path, name: t.name, text: t.modified ? serializeDeck(t.deck) : null, baseline: resources ? recovery.capture(resources, t.resource, t.baseline) : undefined, slide: t.at || 0 }; }), active: active, mode: mode };
        }
        function keep() { if (snap) { snap.changed(); } }

        /* === Commands ================================================== */

        function insertMarkdown(markdown) {
            if (pageActive() && (mode === 'visual' || !(cm && cm.hasFocus))) { page.insertMarkdown(markdown); return; }
            if (!cm) { takeText(current().text.replace(/\s*$/, '') + '\n\n' + markdown + '\n', 'command'); return; }
            var sel = cm.state.selection.main;
            cm.dispatch({ changes: { from: sel.to, insert: '\n' + markdown + '\n' } });
            cm.focus();
        }
        /* What the deck adds to the kit's Insert menu and / menu. */
        var DECK_INSERTS = [{ id: 'insert-notes', label: 'Speaker Notes', words: 'notes speaker', markdown: '{{notes}}\nWhat to say.\n{{/notes}}' }];
        function editCtx() {
            return {
                page: function () { return page; }, text: function () { return cm; },
                onPage: function () { return pageActive() && (mode === 'visual' || (mode === 'split' && historyPane !== 'text')); },
                blockStyle: function () { if (pageActive() && page.marks) { return page.marks().block || null; } if (!cm) { return null; } var m = /^\s{0,3}(#{1,6})(\s|$)/.exec(cm.state.doc.lineAt(cm.state.selection.main.head).text); return m ? 'h' + m[1].length : 'paragraph'; },
                classes: deckClasses,
                say: say, append: function (md) { takeText(current().text.replace(/\s*$/, '') + '\n\n' + md + '\n', 'command'); }
            };
        }
        var slideSearch = null, searchLoading = null;
        async function openFind() {
            var owner = deck;
            if (!searchLoading) searchLoading = loadScript(window.yavcUtil.versioned(HERE + 'search.js')).catch(function (err) { searchLoading = null; throw err; });
            try {
                await searchLoading; if (destroyed || owner !== deck) return;
                if (!slideSearch) slideSearch = window.yavcSlideSearch.attach({
                    deck: function () { return deck; }, current: current, source: function () { return cm; }, text: fullText,
                    alive: function () { return !destroyed; }, readOnly: readOnly, say: say, place: q('[data-role="find-place"]'), go: function (index) { return goTo(index, true); },
                    textPane: async function () { var owner = deck; if (pageActive()) await page.sync(); if (destroyed || deck !== owner) return; if (mode === 'visual') await setMode('split'); await makeCM(); },
                    replace: function (edits) {
                        requireEditable();
                        edits.forEach(function (changes, slide) {
                            if (slide === current()) cm.dispatch({ changes: changes, userEvent: 'input.replace', annotations: cmLibs.isolateHistory.of('full') });
                            else {
                                var state = cmStates.get(slide);
                                if (!state || state.doc.toString() !== slide.text) state = cmLibs.EditorState.create({ doc: slide.text, extensions: cmExtensions });
                                state = state.update({ changes: changes, userEvent: 'input.replace', annotations: cmLibs.isolateHistory.of('full') }).state;
                                cmStates.set(slide, state); slide.text = state.doc.toString(); drawThumb(deck.slides.indexOf(slide));
                            }
                        });
                        modified = true; installStyle(); keep(); commandsChanged();
                    }
                });
                await slideSearch.open();
            } catch (err) { if (!destroyed) say(err.message, true); }
        }
        function cmd(id, label, glyph, run, more) {
            return Object.assign({ id: id, label: label, glyph: glyph || undefined, run: run }, more || {});
        }
        var editingCommands = null;
        function editing() {
            if (!editingCommands && window.yavcMdEditor) editingCommands = window.yavcMdEditor.editing({
                source: function () { return cm; }, page: function () { return page; },
                rich: function () { return pageActive() && (mode === 'visual' || (mode === 'split' && historyPane !== 'text')); },
                identity: current, alive: function () { return !destroyed && !!md; }, readOnly: readOnly, say: say, changed: commandsChanged
            });
            return editingCommands;
        }
        function commandTable() {
            var ready = !!md, s = current(), st = settingsOf(s);
            var table = [
                cmd('new-deck', 'New Deck', 'file', newDeck),
                cmd('open', 'Open…', 'folder', open, { shortcut: 'Mod+O' }),
                cmd('save', 'Save', 'yavc-save', save, { shortcut: 'Mod+S', disabled: function () { return !ready; } }),
                cmd('save-as', 'Save As…', 'yavc-save-as', saveAs, { disabled: function () { return !!(resources && !resources.canSaveAs()); } }),
                cmd('find', 'Find and Replace…', 'search', openFind, { shortcut: window.yavcUtil.shortcut('Mod-f'), bind: false, disabled: function () { return !ready; } }),
                cmd('undo', 'Undo', 'yavc-undo', function () { return editing().history('undo'); }, { shortcut: window.yavcUtil.shortcut('Mod-z'), bind: false, disabled: function () { return !editing() || !editing().canHistory('undo'); } }),
                cmd('redo', 'Redo', 'yavc-redo', function () { return editing().history('redo'); }, { shortcut: window.yavcUtil.shortcut('Mod-y'), bind: false, disabled: function () { return !editing() || !editing().canHistory('redo'); } }),
                cmd('edit-whole', 'Edit the Whole Deck in the Editor', 'pencil', editWhole, { disabled: function () { return !path; } }),
                cmd('export-html', 'Download as a Page', 'download', exportHTML),
                cmd('export-pptx', 'Download as PowerPoint', 'download', exportPPTX, { disabled: function () { return !ready; } }),
                cmd('export-pdf', 'Download as PDF', 'download', exportPDF, { disabled: function () { return !ready; } }),
                cmd('import-pptx', 'Import from PowerPoint…', 'upload', importPPTX, { disabled: function () { return !ready; } }),
                cmd('print', 'Print…', 'yavc-print', printDeck),
                cmd('slide-new', 'New Slide', 'plus', null, { items: LAYOUTS.map(function (l) { return { id: 'slide-new-' + l[0], label: l[1], run: function () { addSlide(l[0]); } }; }) }),
                cmd('slide-duplicate', 'Duplicate Slide', 'copy', duplicateSlide),
                cmd('slide-delete', 'Delete Slide', null, deleteSlide, { danger: true, disabled: function () { return deck.slides.length <= 1; } }),
                cmd('slide-prev', 'Previous Slide', 'back', function () { goTo(at - 1); }, { shortcut: 'PageUp', disabled: function () { return at === 0; } }),
                cmd('slide-next', 'Next Slide', 'forward', function () { goTo(at + 1); }, { shortcut: 'PageDown', disabled: function () { return at >= deck.slides.length - 1; } }),
                cmd('slide-up', 'Move Slide Up', 'arrow-up', function () { moveSlide(-1); }, { disabled: function () { return at === 0; } }),
                cmd('slide-down', 'Move Slide Down', 'arrow-down', function () { moveSlide(1); }, { disabled: function () { return at >= deck.slides.length - 1; } }),
                { id: 'layout', label: 'Layout', glyph: 'board', current: function () { var f = LAYOUTS.find(function (x) { return x[0] === (st.layout || 'content'); }); return f ? f[1] : null; },
                    items: LAYOUTS.map(function (l) { return { id: 'layout-' + l[0], label: l[1], choice: 'deck-layout', value: l[0], checked: function () { return (settingsOf(current()).layout || 'content') === l[0]; }, run: function () { setSlideSetting('layout', l[0]); } }; }) },
                cmd('reveal', 'Reveal Points One by One', 'list', function () { setSlideSetting('reveal', settingsOf(current()).reveal === 'steps' ? null : 'steps'); }, { checked: function () { return settingsOf(current()).reveal === 'steps'; } }),
                cmd('slide-colours', 'Slide Colors…', 'colour', slideColours),
                cmd('deck-colours', 'Deck Colors…', 'colour', deckColours),
                cmd('deck-stylesheet', 'Stylesheet File…', 'file', function () {
                    askText('The Deck\'s Stylesheet', 'A CSS file of yours, such as ~/themes/mine.css; empty for none', function () { return deck.front.stylesheet || ''; }).then(function (v) { if (v != null) { setFront('stylesheet', v.trim()); } });
                }),
                cmd('deck-style-block', 'Edit Style Blocks…', 'code', function () { return editStyles(false); }, { shortcut: 'Mod+Shift+F' }),
                cmd('custom-shortcodes', 'Custom Shortcodes…', 'code', editDefinitions),
                cmd('deck-shared-stylesheet', 'Edit Shared Stylesheet…', 'file', function () { return editStyles(true); }, {
                    disabled: function () { return !(H.fs && H.fs.writeText && window.yavcStyleTools && /^~\/.+\.css$/i.test(window.yavcStyleTools.resolve(deck.front.stylesheet, styleDirectory()))); },
                    reason: 'Choose a home-folder CSS file in Stylesheet File first. This host also needs a writable file service.' }),
                cmd('slide-class', 'Slide Style…', 'tag', function () {
                    askText('This Slide\'s Style Classes', 'Class names from the stylesheet, separated by spaces; empty for none', function () { return settingsOf(current())['class'] || ''; }, true).then(function (v) { if (v != null) { setSlideSetting('class', v.trim()); } });
                }),
                cmd('styles-help', 'Styling a Deck', 'info', function () { window.open(publicOrigin() + '/slides-styles', '_blank', 'noopener'); }),
                cmd('background-image', 'Background Picture…', 'image', function () { askText('Background Picture', 'The picture\'s address, such as /images/x.png; empty for none', function () { return settingsOf(current()).image || ''; }, true).then(function (v) { if (v != null) { setSlideSetting('image', v.trim()); } }); }),
                { id: 'slide-transition', label: 'Transition', items: TRANSITIONS.map(function (t) { return { id: 'slide-transition-' + t[0], label: t[1], choice: 'deck-slide-transition', value: t[0], checked: function () { return (settingsOf(current()).transition || deck.front.transition || 'fade') === t[0]; }, run: function () { setSlideSetting('transition', t[0] === (deck.front.transition || 'fade') ? null : t[0]); } }; }) },
                cmd('deck-title', 'Properties…', 'tag', async function () {
                    if (!ENGINE || !await settleForDialog(false)) { return; }
                    var guard = dialogGuard(false);
                    serializeDeck(deck);
                    var front = deck.frontProblem ? { problem: deck.frontProblem } : ENGINE.front(deck.frontText || '');
                    kit().then(function (k) {
                        return k.askProperties(front, { title: 'Deck Properties', current: guard.current, signal: guard.signal, hidden: DECK_KEYS, hiddenWhere: 'in the Deck menu',
                            hiddenNote: 'The theme, slide size, transition, colors and stylesheet are set from the Deck menu.' });
                    }).then(function (r) {
                        if (!r || !r.order.length || !guard.current()) { return; }
                        var res;
                        try { res = ENGINE.frontset({ text: deck.frontText || '', set: r.set, order: r.order }); } catch (err) { say(err.message, true); return; }
                        takeFront(deck, res.text);
                        frontChanged();
                    }).finally(guard.release);
                }),
                { id: 'theme', label: 'Theme', glyph: 'theme', current: function () { var f = THEMES.find(function (x) { return x[0] === deck.front.theme; }); return f ? f[1] : null; },
                    items: THEMES.map(function (t) { return { id: 'theme-' + t[0], label: t[1], choice: 'deck-theme', value: t[0], checked: function () { return (deck.front.theme || 'plain') === t[0]; }, run: function () { setFront('theme', t[0]); } }; }) },
                { id: 'size', label: 'Slide Size', items: SIZES.map(function (t) { return { id: 'size-' + t[0].replace(':', '-'), label: t[1], choice: 'deck-size', value: t[0], checked: function () { return (deck.front.size || '16:9') === t[0]; }, run: function () { setFront('size', t[0]); } }; }) },
                { id: 'deck-transition', label: 'Transition for Every Slide', items: TRANSITIONS.map(function (t) { return { id: 'deck-transition-' + t[0], label: t[1], choice: 'deck-transition', value: t[0], checked: function () { return (deck.front.transition || 'fade') === t[0]; }, run: function () { setFront('transition', t[0]); } }; }) },
                cmd('present', 'Present from the Start', 'play', function () { present(0); }, { shortcut: 'Mod+Enter', disabled: function () { return !ready || !!presenting; } }),
                cmd('present-here', 'Present from This Slide', 'forward', function () { present(at); }, { shortcut: 'Mod+Shift+Enter', disabled: function () { return !ready || !!presenting; } }),
                cmd('leave', 'Leave the Show', 'stop', leave, { hidden: function () { return !presenting; } }),
                cmd('presenter', 'Presenter Window', 'new-window', presenterWindow, { disabled: function () { return !path; }, reason: 'Save this deck in this browser before opening the presenter window.' }),
                cmd('presenter-auto', 'Always Show Presenter Window', null, function () { settings.presenterOnPresent = !settings.presenterOnPresent; keepSetting('presenterOnPresent', settings.presenterOnPresent); commandsChanged(); }, { checked: function () { return !!settings.presenterOnPresent; } }),
                cmd('toggle-film', 'Show the Filmstrip', 'panel', function () { settings.filmstrip = !settings.filmstrip; el.film.hidden = !settings.filmstrip; keepSetting('filmstrip', settings.filmstrip); fit(); commandsChanged(); }, { checked: function () { return settings.filmstrip; } }),
                { id: 'dock', label: 'Canvas', glyph: 'dock', current: function () { var d = DOCKS.find(function (x) { return x[0] === settings.dock; }); return d ? d[1] : null; },
                    items: DOCKS.map(function (d) { return { id: 'dock-' + d[0], label: d[1], choice: 'deck-dock', value: d[0], checked: function () { return settings.dock === d[0]; }, run: function () { setDock(d[0]); } }; }) }
            ];
            if (window.yavcMdEditor) { table = table.concat(window.yavcMdEditor.commands(editCtx(), DECK_INSERTS.concat(customInserts()))); }
            [['visual', 'Visual'], ['text', 'Text'], ['split', 'Split']].forEach(function (v) {
                table.push({ id: 'view-' + v[0], label: v[1], choice: 'deck-view', choiceLabel: 'View', value: v[0], checked: function () { return mode === v[0]; }, run: function () { setMode(v[0]); } });
            });
            table = table.concat(editing() ? editing().commands() : [], commonToolbar ? commonToolbar.commands() : [], [{ id: 'view-mode', label: 'View', glyph: 'panel', toolbarChoice: 'deck-view', toolbarPriority: 50, items: ['view-visual', 'view-text', 'view-split'] }]);
            var navigation = /^(new-deck|open|save-as|find|copy|select-all|edit-whole|export-.+|import-pptx|print|slide-prev|slide-next|present|present-here|presenter|presenter-.+|show-.+|leave|view-.+|dock|dock-.+|toggle-film|styles-help|common-toolbar-.+)$/;
            function guard(row) {
                if (!row || typeof row !== 'object') return row;
                var result = Object.assign({}, row);
                if (row.items && Array.isArray(row.items)) result.items = row.items.map(guard);
                if (row.id === 'save') {
                    var saveDisabled = row.disabled;
                    result.disabled = function () { return !canSave() || (typeof saveDisabled === 'function' ? saveDisabled() : !!saveDisabled); };
                    result.reason = 'This deck is read-only or its recovered revision no longer matches. Use Save As.';
                } else if (row.id && !navigation.test(row.id)) {
                    var disabled = row.disabled, run = row.run;
                    result.disabled = function () { return readOnly() || (typeof disabled === 'function' ? disabled() : !!disabled); };
                    result.reason = readOnly() ? 'This deck is read-only.' : row.reason;
                    if (run) result.run = function () { requireEditable(); return run.apply(this, arguments); };
                }
                return result;
            }
            return table.map(guard);
        }
        function toolbars() {
            if (commonToolbar) { return []; }
            return [{ label: 'Slides', ribbon: 'hide', groups: [
                { label: 'File', glyph: 'file', priority: 3, items: ['new-deck', 'open', 'save'] },
                { label: 'Slide', glyph: 'panel', priority: 4, items: ['slide-new', 'slide-duplicate', 'slide-delete', 'slide-up', 'slide-down'] },
                { label: 'Format', glyph: 'bold', priority: 2, items: ['layout', 'style', 'bold', 'italic', 'underline', 'strike', 'code', 'link', 'color', 'bullets', 'numbers', 'insert', 'table', 'box'] },
                { label: 'Show', glyph: 'play', priority: 5, items: ['present', 'presenter'] },
                { label: 'View', glyph: 'panel', priority: 1, end: true, items: [{ choice: 'deck-view' }, 'dock', 'toggle-film'] }
            ] }];
        }
        /* Slides' help is a page of the site, /help/slides, which the
           site's Help menu links to (DESIGN.md, decision 19); Help here adds
           only the styling reference. */
        function menus() {
            return { titles: [
                { label: 'Slides', glyph: 'document', items: H.identity ? H.identity(root, []) : [] },
                { id: 'file', label: 'File', glyph: 'file', items: ['new-deck', 'open', 'import-pptx', 'save', 'save-as', '-', 'edit-whole', '-', 'export-pptx', 'export-pdf', 'export-html', 'print'] },
                { id: 'edit', label: 'Edit', glyph: 'pencil', items: ['undo', 'redo', '-', 'cut', 'copy', 'paste', '-', 'select-all', '-', 'find'] },
                { id: 'slide', label: 'Slide', glyph: 'panel', items: ['slide-new', 'slide-duplicate', 'slide-delete', '-', 'slide-prev', 'slide-next', '-', 'slide-up', 'slide-down', '-', 'layout', 'reveal', 'slide-colours', 'slide-class', 'background-image', 'slide-transition'] },
                { id: 'insert', label: 'Insert', glyph: 'plus', items: ['link', 'insert', 'table', 'box'] },
                { id: 'format', label: 'Format', glyph: 'paragraph', items: window.yavcMdEditor ? window.yavcMdEditor.MENU.format.filter(function (id) { return ['link', 'insert', 'table', 'box'].indexOf(id) < 0; }).filter(function (id, i, ids) { return id !== '-' || (i > 0 && i < ids.length - 1 && ids[i - 1] !== '-'); }) : [] },
                { id: 'deck', label: 'Deck', glyph: 'gear', items: ['deck-title', 'theme', 'deck-colours', '-', 'deck-stylesheet', 'deck-style-block', 'deck-shared-stylesheet', 'custom-shortcodes', '-', 'size', 'deck-transition'] },
                { id: 'show', label: 'Show', glyph: 'play', items: ['present', 'present-here', 'leave', '-', 'presenter', 'presenter-auto'] }
            ], into: { view: ['view-visual', 'view-text', 'view-split', '-', 'dock', 'toggle-film'].concat(commonToolbar ? ['-', 'common-toolbar-show', 'common-toolbar-customize'] : []), help: ['styles-help'] } };
        }
        /* Right-clicks (PUDL's pudl:contextmenu): a slide in the filmstrip
           gets the Slide menu, the canvas and the Markdown pane get Format
           with the slide's own settings after it. */
        root.addEventListener('pudl:contextmenu', function (e) {
            var t = e.detail.target, thumb = t.closest && t.closest('.deck-thumb');
            var own = function (ids) { return window.pudlCommands ? window.pudlCommands.menuRows(ids, root) : ids; };
            if (thumb) {
                var i = +thumb.getAttribute('data-slide');
                /* Going there redraws the filmstrip, so the mark goes on the thumb drawn after. */
                if (i !== at) { goTo(i); }
                e.detail.mark(root.querySelector('.deck-thumb[data-slide="' + i + '"]') || thumb);
                e.detail.add(own(['slide-new', 'slide-duplicate', 'slide-delete', '-', 'slide-up', 'slide-down', '-', 'layout', 'reveal', 'slide-colours', 'slide-class', 'background-image', 'slide-transition']));
                return;
            }
            if (t.closest && (t.closest('.deck-stagebox') || t.closest('.deck-text'))) {
                var rows = window.yavcMdEditor ? window.yavcMdEditor.MENU.format.slice() : [];
                e.detail.add(own(rows.concat(['-', 'layout', 'slide-colours', '-', 'view-visual', 'view-text', 'view-split'])));
            }
        });
        root.addEventListener('keydown', function (e) {
            /* Ctrl+Enter presents, since F5 is the browser's reload; F5 still
               works while the deck itself has the focus. */
            if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); present(e.shiftKey ? at : 0); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
        });
        if (el.split && window.pudlSplit) { /* PUDL's splitter runs by markup. */ }
        var ro = 'ResizeObserver' in window ? new ResizeObserver(function () { fit(); fitThumbs(); }) : null;
        if (ro) { ro.observe(el.stage); ro.observe(el.film); }

        /* === Start ===================================================== */

        var booted = (async function () {
            md = await engine();
            await kit();
            if (destroyed) { return; }
            await loadScript(resourceAsset('resource-session.js'));
            resourceSession = await window.yavcResourceSession.open(H, function (file) { return loadScript(resourceAsset(file)); });
            if (destroyed) return;
            if (resourceSession) { resources = resourceSession.client; recovery = resourceSession.recovery; }
            restoring = true;
            if (H.snapshot) snap = H.snapshot.join(root, takeSnapshot, { validate: resourceSession ? resourceSession.validate : function (value) { if (value && value.version === 2) throw new Error('This recovery snapshot requires its resource host. Its saved copy has been retained.'); } });
            recoveryKept = snap && snap.kept;
            if (resources && (!snap || typeof snap.flush !== 'function')) { if (snap) snap.leave(); snap = null; throw new Error('Resource editing requires recovery write acknowledgement.'); }
            /* Decks parsed before the engine came read their front matter now. */
            if (deck.frontUnread) { takeFront(deck, deck.frontText); }
            tabs.forEach(function (t) { if (t.deck && t.deck.frontUnread) { takeFront(t.deck, t.deck.frontText); } });
            if (H.config && H.config.load) { try { var c = await H.config.load('slides', SETTINGS); Object.assign(settings, c || {}); } catch (err) { } }
            if (settings.filmstrip === false) { el.film.hidden = true; }
            var kept = snap && snap.kept;
            var file = start.get('file');
            if (start.get('presenter')) {
                if (file) { await openPath(file).catch(function () { return false; }); }
                becomePresenter();
                return;
            }
            /* The tabs kept across a reload come back first, unsaved text
               and all; then the address's file comes to the front. */
            if (kept && kept.tabs) {
                for (var ki = 0; ki < kept.tabs.length; ki++) {
                    var kt = kept.tabs[ki], ktext = kt.text;
                    if (resources && kt.path) {
                        var restored = await recovery.restore(resources, kt.path, kt.baseline, ktext);
                        if (destroyed) return;
                        tabs.push({ deck: parseDeck(restored.text), path: kt.path, name: (restored.snapshot && restored.snapshot.name) || kt.name,
                            resource: restored.snapshot, baseline: restored.baseline, conflict: restored.conflict, modified: restored.modified, at: kt.slide || 0 });
                        continue;
                    }
                    if (ktext == null && kt.path && H.fs && H.fs.readText) { ktext = await H.fs.readText(kt.path).catch(function () { return null; }); }
                    if (ktext == null) { continue; }
                    tabs.push({ deck: parseDeck(ktext), path: kt.path || null, modified: kt.text != null, at: kt.slide || 0 });
                }
                if (tabs.length) { await activateTab(Math.max(0, Math.min(kept.active || 0, tabs.length - 1))); }
            }
            if (file) { await openPath(file, parseInt(start.get('slide') || '1', 10)).catch(function (err) { say(err.message, true); return false; }); }
            if (!tabs.length) { load(NEW_DECK, null); }
            restoring = false;
            listenForPresenter();
            await setMode(kept && kept.mode ? kept.mode : settings.view);
            if (tabs.some(function (t) { return !!t.conflict; })) say('Some recovered drafts no longer match their original revision. Use Save As to preserve a copy.', true);
            if (start.get('present')) { present(parseInt(start.get('slide') || '1', 10) - 1); }
            announce();
        })().catch(function (err) { if (!destroyed) { root.innerHTML = '<div class="notice danger" role="alert"><div class="notice-content"><p class="notice-title">Slides could not start</p><p class="notice-body">' + esc(err.message) + '</p></div></div>'; } });

        /* === The live actions ============================================ */

        function slideNo(i) {
            if (i == null) { return at; }
            i = Math.floor(Number(i));
            if (!(i >= 1 && i <= deck.slides.length)) { throw new Error('there is no slide ' + i + '; the deck has ' + deck.slides.length); }
            return i - 1;
        }
        function deckView() {
            return { index: active + 1, path: path, modified: modified, slide: at + 1, count: deck.slides.length, front: Object.assign({}, deck.front),
                slides: deck.slides.map(function (s, i) { return { index: i + 1, title: titleOf(s, i), settings: settingsOf(s) }; }),
                presenting: !!presenting, view: mode, dock: settings.dock };
        }
        function placed() { return { index: at + 1, count: deck.slides.length }; }
        async function atSlide(i) { i = slideNo(i); if (i !== at) { await goTo(i); } return i; }
        var liveActions = {
            'table@1': async function (input) {
                await booted;
                if (!pageActive() || !page.inTable()) { throw new Error('Select a table cell in Visual or Split view.'); }
                if (!page.run(input.op)) { throw new Error('The table command is unavailable for this selection.'); }
                await page.sync(); return { output: { changed: true } };
            },
            'format@1': async function (input) {
                await booted;
                if (editCtx().onPage()) { if (!page.run(input.op)) { throw new Error('This format is unavailable for the selection.'); } await page.sync(); }
                else { window.yavcMdEditor.textFormat(cm, input.op, editCtx()); }
                return { output: { formatted: true } };
            },
            'define@1': async function () { await booted; if (pageActive()) { await page.sync(); } return { output: (await deckEngine()).macros() }; },
            'deck@1': async function () { await booted; return { output: deckView() }; },
            'slide@1': async function (input) { await booted; var i = slideNo(input.index); return { output: slideView(deck.slides[i], i) }; },
            'text@1': async function () { await booted; return { output: { path: path, text: fullText() } }; },
            'go@1': async function (input) { await booted; await goTo(slideNo(input.index)); return { output: { index: at + 1 } }; },
            'load@1': async function (input) {
                await booted;
                /* A deck an agent gives never takes the name of a file that
                   exists, or the person's next Save would overwrite it unasked
                   (security review, 2026-11-03). */
                if (input.path && H.fs && H.fs.readText) {
                    var there = await H.fs.readText(String(input.path)).catch(function () { return ''; });
                    if (there != null) { throw new Error('there is already a file at ' + input.path + '; open it, or give the deck another name'); }
                }
                if (presenting) { await leave(); }
                await openInTab(String(input.text), input.path || null, input.slide);
                if (resources) { tab().resource = null; tab().fresh = !!input.path; }
                modified = true;
                stash();
                commandsChanged();
                announce();
                return { output: { index: active + 1, path: path, slide: at + 1, count: deck.slides.length } };
            },
            'decks@1': async function () {
                await booted;
                stash();
                return { output: { active: active + 1, decks: tabs.map(function (t, i) { return { index: i + 1, title: t.deck.front.title || '', path: t.path, modified: !!t.modified, slide: (t.at || 0) + 1, count: t.deck.slides.length }; }) } };
            },
            'switch@1': async function (input) {
                await booted;
                var i = Math.floor(Number(input.index));
                if (!(i >= 1 && i <= tabs.length)) { throw new Error('there is no deck ' + i + '; ' + tabs.length + ' are open'); }
                await activateTab(i - 1);
                return { output: { index: active + 1 } };
            },
            'close@1': async function (input) {
                await booted;
                var i = input.index == null ? active : Math.floor(Number(input.index)) - 1;
                if (!tabs[i]) { throw new Error('there is no deck ' + (i + 1)); }
                var n = tabs.length;
                await closeTab(i);
                return { output: { closed: tabs.length < n || n === 1, open: tabs.length } };
            },
            'open@1': async function (input) {
                await booted;
                if (presenting) { await leave(); }
                var ok = await openPath(input.path, input.slide);
                if (!ok) { throw new Error('there is no file at ' + input.path); }
                announce();
                return { output: { path: path, slide: at + 1, count: deck.slides.length } };
            },
            'save@1': async function (input) {
                await booted;
                if (resources) {
                    var destination = input.path ? String(input.path) : path;
                    if (!destination) throw new Error('Choose a destination for the deck.');
                    await saveResource(tab(), destination);
                    return { output: { path: path } };
                }
                if (input.path) { path = String(input.path); }
                if (!path) { throw new Error('the deck has no file yet; give a path such as ~/talks/intro.slides.md'); }
                if (!H.fs || !H.fs.writeText) { throw new Error('there is no file service here'); }
                var err = await H.fs.writeText(path, fullText());
                if (err) { throw new Error('could not save: ' + err); }
                modified = false;
                say('Saved ' + path + '.');
                announce();
                commandsChanged();
                return { output: { path: path } };
            },
            'set-text@1': async function (input) {
                await booted;
                var i = await atSlide(input.index);
                takeText(String(input.text), 'command');
                if (pageActive()) { applySlideSettings(el.slide, current()); }
                return { output: slideView(deck.slides[i], i) };
            },
            'insert@1': async function (input) {
                await booted;
                var i = await atSlide(input.index);
                takeText(current().text.replace(/\s*$/, '') + '\n\n' + String(input.markdown).replace(/\s*$/, '') + '\n', 'command');
                return { output: slideView(deck.slides[i], i) };
            },
            'add@1': async function (input) {
                await booted;
                var after = input.after == null ? at + 1 : Math.floor(Number(input.after));
                if (!(after >= 0 && after <= deck.slides.length)) { throw new Error('after must be from 0 to ' + deck.slides.length); }
                var text = input.text != null ? String(input.text) : (NEW_SLIDE[input.layout] || NEW_SLIDE.content);
                deck.slides.splice(after, 0, { text: text });
                modified = true;
                drawFilm();
                await goTo(after);
                return { output: placed() };
            },
            'duplicate@1': async function (input) { await booted; await atSlide(input.index); duplicateSlide(); await booted; return { output: placed() }; },
            'delete@1': async function (input) {
                await booted;
                if (deck.slides.length <= 1) { throw new Error('a deck keeps at least one slide'); }
                await atSlide(input.index);
                await deleteSlide(false);
                return { output: placed() };
            },
            'move@1': async function (input) {
                await booted;
                var i = slideNo(input.index), to = slideNo(input.to);
                var s = deck.slides.splice(i, 1)[0];
                deck.slides.splice(to, 0, s);
                modified = true;
                drawFilm();
                await goTo(to);
                return { output: placed() };
            },
            'set-slide@1': async function (input) {
                await booted;
                var i = await atSlide(input.index);
                ['layout', 'background', 'image', 'reveal', 'transition', 'class', 'color', 'heading', 'accent'].forEach(function (k) {
                    if (input[k] != null) { setSlideSetting(k, String(input[k])); }
                });
                return { output: { index: i + 1, settings: settingsOf(current()) } };
            },
            'set-deck@1': async function (input) {
                await booted;
                if (deck.frontProblem) { throw new Error('the front matter cannot be changed here: ' + deck.frontProblem); }
                var set = {}, order = [];
                ['title', 'author', 'subject', 'keywords', 'lang', 'date', 'theme', 'size', 'transition', 'ink', 'heading', 'muted', 'accent', 'background', 'stylesheet'].forEach(function (k) {
                    if (input[k] != null) { set[k] = String(input[k]) || null; order.push(k); }
                });
                Object.keys(input.properties || {}).forEach(function (k) {
                    var v = input.properties[k];
                    set[k] = v == null || v === '' ? null : String(v); order.push(k);
                });
                if (order.length) {
                    serializeDeck(deck);
                    var res = (await engine()).frontset({ text: deck.frontText || '', set: set, order: order });
                    takeFront(deck, res.text);
                    frontChanged();
                }
                return { output: { front: Object.assign({}, deck.front) } };
            },
            'view@1': async function (input) {
                await booted;
                if (input.dock) { setDock(input.dock); }
                if (input.mode) { await setMode(input.mode); }
                if (input.filmstrip != null && !!input.filmstrip !== !!settings.filmstrip) {
                    settings.filmstrip = !!input.filmstrip; el.film.hidden = !settings.filmstrip;
                    keepSetting('filmstrip', settings.filmstrip);
                    fit(); commandsChanged();
                }
                return { output: { mode: mode, filmstrip: !!settings.filmstrip, dock: settings.dock } };
            },
            'show@1': async function (input) {
                await booted;
                if (presenting) { throw new Error('the deck is being presented already'); }
                await present(input.from == null ? 0 : slideNo(input.from));
                return { output: { presenting: true, slide: (presenting ? presenting.position().slide : at) + 1 } };
            },
            'leave@1': async function () { await booted; await leave(); return { output: { presenting: false, slide: at + 1 } }; },
            'export@1': async function () {
                await booted;
                var page = await exportPage();
                return { output: { title: deck.front.title || '' }, artifacts: [{ key: 'page', name: page.name, mime: 'text/html', data: page.html }] };
            },
            'export-pptx@1': async function () {
                await booted;
                var blob = await pptxBlob();
                return { output: { title: deck.front.title || '', slides: deck.slides.length }, artifacts: [{ key: 'pptx', name: fileStem() + '.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', data: new Uint8Array(await blob.arrayBuffer()) }] };
            },
            'export-pdf@1': async function () {
                await booted;
                var bytes = await pdfBytes();
                return { output: { title: deck.front.title || '', slides: deck.slides.length }, artifacts: [{ key: 'pdf', name: fileStem() + '.pdf', mime: 'application/pdf', data: bytes }] };
            },
            'import-pptx@1': async function (input) {
                await booted;
                var bin = atob(String(input.data)), bytes = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
                var got = await importPPTXBuffer(bytes.buffer, input.name);
                return { output: { index: active + 1, title: got.title, slides: got.slides, pictures: got.pictures } };
            }
        };
        ['table', 'format', 'set-text', 'insert', 'add', 'duplicate', 'delete', 'move', 'set-slide', 'set-deck'].forEach(function (name) {
            var original = liveActions[name + '@1'];
            if (original) liveActions[name + '@1'] = async function (input) { await booted; requireEditable(); return original(input); };
        });
        var detachLive = window.pudlApplets && window.pudlApplets.attach ? window.pudlApplets.attach('yavc.slides', liveActions) : null;
        var commonToolbar = H.commandToolbar ? H.commandToolbar.attach(root, { app: 'slides', label: 'Slides', table: commandTable,
            defaults: ['save', '-', 'undo', 'redo', '-', 'slide-new', 'slide-duplicate', 'layout', '-', 'style', 'bold', 'italic', 'link', '-', 'present', 'presenter', 'view-mode'] }) : null;

        return {
            ready: booted,
            state: stateString,
            setState: function (s) {
                var p = new URLSearchParams(String(s || '').replace(/^\?/, ''));
                var file = p.get('file');
                if (p.get('presenter')) { return; }
                booted.then(function () {
                    var slide = parseInt(p.get('slide') || '1', 10);
                    if (file && file !== path) { openPath(file, slide).then(function () { if (p.get('present')) { present(slide - 1); } }); }
                    else { goTo(slide - 1); if (p.get('present')) { present(slide - 1); } }
                });
            },
            commandTable: commandTable, toolbars: toolbars, menus: menus,
            destroy: function () {
                if (commonToolbar) { commonToolbar.destroy(); }
                destroyed = true;
                abortOwnedDialogs(false); if (slideSearch) slideSearch.reset();
                styleLifetime.abort();
                if (detachLive) { detachLive(); }
                styleRevision++; if (deckStyle) { deckStyle.destroy(); } slideStyles.forEach(function (controller) { controller.destroy(); });
                styledSections.clear();
                if (sheetWatch) { sheetWatch(); }
                if (presenting) { presenting.destroy(); }
                if (page) { try { page.enable(false); } catch (err) { } }
                if (cm) { cm.destroy(); }
                if (ro) { ro.disconnect(); }
                if (floatRO) { floatRO.disconnect(); }
                if (snap) { snap.leave(); }
                if (channel) { channel.close(); }
                clearInterval(clockTimer);
                clearTimeout(redrawTimer);
                clearTimeout(floatTimer);
                unguard();
                /* Nothing outlives the applet: a document listener would keep
                   the whole closed deck alive (performance review, 2026-11-03).
                   The pictures' addresses are the kit's, shared, and released
                   when their files change. */
                document.removeEventListener('fullscreenchange', onFullscreenChange);
            }
        };
    }

    window.pudlApplets.register('slides', { init: init });
})();
