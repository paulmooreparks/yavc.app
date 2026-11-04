/* Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0 */
/* Diagrams: D2 and Mermaid diagrams as text files (docs/diagrams-design.md).
   A diagram is one file, something.d2 or something.mmd (decision 1),
   edited as text in CodeMirror with the drawing beside it, as Slides puts
   a slide's canvas beside its Markdown (decision 15). D2 draws through D2
   itself in a worker (apps/diagram-kit/d2.js) and Mermaid through the
   vendored Mermaid (the editing kit's drawMermaid), so a diagram's text
   never leaves the browser. This is milestone D2, text first: the visual
   editor comes in D3, and Preview stands where Visual will.

   State: file=<path>&view=<text|preview|split>. */
(function () {
    'use strict';

    var esc = window.yavcUtil.esc, loadScript = window.yavcUtil.loadScript, versioned = window.yavcUtil.versioned;

    /* The shared parts, each loaded once: the editing kit (CodeMirror, its
       theme and Mermaid), the colouring for D2 and Mermaid, and the D2
       engine's client. */
    /* Every caller gets the same promise, so work queued on a part runs
       in the order it was asked for, whether or not the part had loaded:
       a fresh Promise.resolve for a later caller could otherwise run
       before an earlier caller's, and an older drawing replace a newer. */
    var loaded = {};
    function once(key, src, global) {
        if (!loaded[key]) {
            loaded[key] = window[global] ? Promise.resolve(window[global]) : loadScript(versioned(src)).then(function () {
                if (!window[global]) { throw new Error(src + ' did not load'); }
                return window[global];
            });
            loaded[key].catch(function () { loaded[key] = null; });
        }
        return loaded[key];
    }
    function kit() { return once('kit', '/applets/md-editor/kit.js', 'yavcMdEditor'); }
    function modes() { return once('modes', '/applets/diagram-kit/modes.js', 'yavcDiagramModes'); }
    function d2() { return once('d2', '/applets/diagram-kit/d2.js', 'yavcD2Engine'); }

    /* The styles New offers (decision 7). A style is a starter text; the
       style itself is read from the text, never recorded in the file. */
    var D2_STYLES = [
        { id: 'flowchart', label: 'Flowchart', text: 'direction: right\n\nstart: Start {shape: oval}\ncheck: Is it ready? {shape: diamond}\nwork: Do the work\ndone: Done {shape: oval}\n\nstart -> check\ncheck -> work: no\nwork -> check\ncheck -> done: yes\n' },
        { id: 'architecture', label: 'Architecture', text: 'direction: right\n\nreader: Reader {shape: person}\nsite: The site {\n  web: Web server\n  app: Application\n  web -> app\n}\ndb: Database {shape: cylinder}\njobs: Jobs {shape: queue}\n\nreader -> site.web: HTTPS\nsite.app -> db: reads and writes\nsite.app -> jobs: sends work\n' },
        { id: 'sequence', label: 'Sequence', text: 'shape: sequence_diagram\n\nreader: Reader\npage: Page\nengine: Engine\n\nreader -> page: types the text\npage -> engine: compile\nengine -> page: the drawing\npage -> reader: shows it\n' },
        { id: 'entity', label: 'Entity Relationship', text: 'users: {\n  shape: sql_table\n  id: int {constraint: primary_key}\n  name: varchar\n  email: varchar {constraint: unique}\n}\n\nposts: {\n  shape: sql_table\n  id: int {constraint: primary_key}\n  author: int {constraint: foreign_key}\n  title: varchar\n}\n\nposts.author -> users.id\n' },
        { id: 'class', label: 'Class', text: 'Shape: {\n  shape: class\n  +name: string\n  +area(): float\n}\n\nCircle: {\n  shape: class\n  -radius: float\n  +area(): float\n}\n\nCircle -> Shape: extends\n' },
        { id: 'state', label: 'State Machine', text: 'direction: right\n\nidle: Idle {shape: oval}\nrunning: Running {shape: oval}\ndone: Done {shape: oval}\n\nidle -> running: start\nrunning -> idle: pause\nrunning -> done: finish\n' },
        { id: 'org', label: 'Org Chart', text: 'direction: down\n\nchief: Chief Executive {shape: person}\ntech: Technology {shape: person}\nmoney: Finance {shape: person}\nbuild: Developers {shape: person}\n\nchief -> tech\nchief -> money\ntech -> build\n' },
        { id: 'grid', label: 'Grid', text: 'grid-columns: 3\n\none: One\ntwo: Two\nthree: Three\nfour: Four\nfive: Five\nsix: Six\n' }
    ];
    var MERMAID_STYLES = [
        { id: 'mm-flowchart', label: 'Flowchart', text: 'flowchart LR\n    start([Start]) --> check{Is it ready?}\n    check -- no --> work[Do the work]\n    work --> check\n    check -- yes --> done([Done])\n' },
        { id: 'mm-sequence', label: 'Sequence', text: 'sequenceDiagram\n    participant R as Reader\n    participant P as Page\n    R->>P: types the text\n    P-->>R: shows the drawing\n' },
        { id: 'mm-class', label: 'Class', text: 'classDiagram\n    class Shape {\n        +String name\n        +area() float\n    }\n    class Circle {\n        -float radius\n        +area() float\n    }\n    Shape <|-- Circle\n' },
        { id: 'mm-state', label: 'State Machine', text: 'stateDiagram-v2\n    [*] --> Idle\n    Idle --> Running: start\n    Running --> Idle: pause\n    Running --> [*]: finish\n' },
        { id: 'mm-entity', label: 'Entity Relationship', text: 'erDiagram\n    USER ||--o{ POST : writes\n    USER {\n        int id\n        string name\n    }\n    POST {\n        int id\n        string title\n    }\n' },
        { id: 'mm-gantt', label: 'Gantt Chart', text: 'gantt\n    title A plan\n    dateFormat YYYY-MM-DD\n    section Design\n    Write it down :a1, 2026-11-02, 3d\n    Review it :after a1, 2d\n    section Build\n    Build it :2026-11-09, 5d\n' },
        { id: 'mm-pie', label: 'Pie Chart', text: 'pie title Where the time goes\n    "Writing" : 45\n    "Reading" : 30\n    "Meetings" : 25\n' },
        { id: 'mm-mindmap', label: 'Mind Map', text: 'mindmap\n  root((Diagrams))\n    D2\n      Flowcharts\n      Architecture\n    Mermaid\n      Charts\n      Timelines\n' },
        { id: 'mm-timeline', label: 'Timeline', text: 'timeline\n    title The site\n    2026-10 : The desktop\n    2026-11 : The Editor : Slides\n    2026-12 : Diagrams\n' },
        { id: 'mm-journey', label: 'User Journey', text: 'journey\n    title Drawing a diagram\n    section Start\n      Open Diagrams: 5: Reader\n      Choose a style: 4: Reader\n    section Finish\n      Save it: 5: Reader\n' },
        { id: 'mm-git', label: 'Git Graph', text: 'gitGraph\n    commit\n    branch feature\n    commit\n    checkout main\n    merge feature\n    commit\n' }
    ];
    var EXT = { d2: '.d2', mermaid: '.mmd' };
    var KIND_NAME = { d2: 'D2', mermaid: 'Mermaid' };
    var VIEWS = [['text', 'Text'], ['preview', 'Preview'], ['split', 'Split']];
    /* Where the drawing sits beside the text, as Slides docks its canvas. */
    var DOCKS = [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom']];
    var SETTINGS = { view: 'split', dock: 'left', fit: true };
    var DRAW_DELAY = 300;

    function kindOf(path, text) {
        var p = String(path || '').toLowerCase();
        if (/\.d2$/.test(p)) { return 'd2'; }
        if (/\.(mmd|mermaid)$/.test(p)) { return 'mermaid'; }
        /* A text with no suffix to go by: Mermaid begins with its type. */
        return /^\s*(%%[^\n]*\n\s*)*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart)\b/.test(text || '') ? 'mermaid' : 'd2';
    }
    function baseName(path) { return String(path || '').replace(/^.*\//, ''); }

    var count = 0;

    function init(root, opts) {
        opts = opts || {};
        var n = ++count, H = window.pudlHost || {};
        var tabs = [], active = -1, untitled = 0, destroyed = false;
        var settings = Object.assign({}, SETTINGS);
        var CM = null, cm = null, langs = {}, drawTimer = 0, drawSeq = 0, waiters = [], quiet = false;
        var start = new URLSearchParams(String(opts.state || '').replace(/^\?/, ''));
        if (opts.host !== 'window') {
            var own = new URLSearchParams(location.search);
            if (own.get('file')) { start = own; }
        }
        root.classList.add('dg', 'dg-' + (opts.fit === 'fill' ? 'fill' : 'flow'));
        root.tabIndex = -1;
        root.innerHTML =
            '<div class="dg-toolbar-slot" data-toolbar-slot></div>' +
            '<div class="tablist doc-tabs dg-tabs" role="tablist" aria-label="Open Diagrams" data-role="tabs" hidden></div>' +
            '<div class="dg-main" data-role="main">' +
              '<div class="dg-work split" data-role="work">' +
                '<div class="dg-stagebox split-pane" data-role="stagebox">' +
                  '<div class="dg-stage" data-role="stage" tabindex="0" role="region" aria-label="The Drawing"><div class="dg-canvas" data-role="canvas"></div></div>' +
                '</div>' +
                '<div class="split-handle dg-split" data-role="split" aria-label="Resize the Text" data-split-min="200" data-split-max="70%"></div>' +
                '<div class="dg-text split-pane code-surface" data-role="text"></div>' +
              '</div>' +
            '</div>' +
            '<div class="dg-status" data-role="status"><span data-role="where"></span><span data-role="kind"></span><span data-role="state"></span><span class="dg-message" data-role="message" role="status" aria-live="polite"></span></div>';
        var q = function (sel) { return root.querySelector(sel); };
        var el = { tabsEl: q('[data-role="tabs"]'), work: q('[data-role="work"]'), stagebox: q('[data-role="stagebox"]'), stage: q('[data-role="stage"]'), canvas: q('[data-role="canvas"]'),
            split: q('[data-role="split"]'), text: q('[data-role="text"]'), where: q('[data-role="where"]'), kind: q('[data-role="kind"]'), state: q('[data-role="state"]'), message: q('[data-role="message"]') };

        function keepSetting(key, value) {
            if (!H.config || !H.config.set) { return; }
            var change = {}; change[key] = value;
            H.config.set('diagrams', change).catch(function () { });
        }
        /* A confirmation goes in the status line, as in Slides; a fault the
           person must deal with is the site's notice beside what failed,
           which stays until it is dismissed or put right (decision 15). */
        function say(msg, kind) {
            if (kind) { window.yavcUtil.notice(el.tabsEl, msg, kind); return; }
            el.message.textContent = msg || '';
        }
        function commandsChanged() { if (opts.commandsChanged) { opts.commandsChanged(); } tabRow(); }
        function current() { return tabs[active] || null; }
        function stateString() {
            var t = current(), p = new URLSearchParams();
            if (t && t.path) { p.set('file', t.path); }
            if (t && t.view && t.view !== settings.view) { p.set('view', t.view); }
            return p.toString().replace(/%2F/g, '/').replace(/%7E/g, '~');
        }
        function announce() { if (opts.changed) { opts.changed(stateString()); } keep(); }

        /* === The text (CodeMirror) ======================================= */

        function language(kind) {
            if (!langs[kind]) { langs[kind] = window.yavcDiagramModes[kind](CM); }
            return langs[kind];
        }
        /* Each tab keeps its own editor state, so its undo history and its
           cursor survive a switch to another tab and back. */
        function stateFor(t, text) {
            var ext = [CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.history(), CM.drawSelection(), CM.highlightActiveLine(), CM.bracketMatching(), CM.closeBrackets(),
                CM.keymap.of([].concat(CM.closeBracketsKeymap, CM.completionKeymap, CM.lintKeymap, CM.defaultKeymap, CM.historyKeymap, [CM.indentWithTab])),
                CM.indentUnit.of('  '),
                window.yavcMdEditor.codeTheme(CM), language(t.kind),
                CM.EditorView.contentAttributes.of({ 'aria-label': 'The Diagram\'s Text' }),
                CM.linter(lintSource, { delay: DRAW_DELAY }), CM.lintGutter(),
                CM.EditorView.updateListener.of(function (u) { if (u.docChanged && !quiet) { textChanged(u.state.doc.toString()); } })];
            if (t.kind === 'd2') { ext.push(CM.autocompletion({ override: [complete], activateOnTyping: true })); }
            return CM.EditorState.create({ doc: text, extensions: ext });
        }
        function showTab(t) {
            if (!cm) { cm = new CM.EditorView({ state: t.state, parent: el.text }); return; }
            quiet = true;
            try { cm.setState(t.state); } finally { quiet = false; }
        }
        /* The text a command replaces, as one change, so Undo takes it back. */
        function replaceText(text) {
            var t = current();
            if (!t || !cm || cm.state.doc.toString() === text) { return; }
            cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text } });
        }
        function textChanged(text) {
            var t = current();
            if (!t) { return; }
            t.text = text;
            if (!t.modified) { t.modified = true; commandsChanged(); }
            scheduleDraw();
            keep();
        }

        /* Completions from D2's own language service, run in the engine
           (docs/diagrams-design.md, "What this means for the Editor"). They
           come unasked after a dot or a colon, and with Ctrl+Space anywhere. */
        function complete(ctx) {
            var word = ctx.matchBefore(/[\w-]*/), before = ctx.state.doc.sliceString(Math.max(0, word.from - 2), word.from);
            if (!ctx.explicit && !/[.:]\s?$/.test(before)) { return null; }
            var line = ctx.state.doc.lineAt(ctx.pos);
            return d2().then(function (E) {
                /* D2's service answers for the place a word begins, not part
                   way through one, so it is asked there and CodeMirror
                   narrows the list by what has been typed. */
                return E.call('completions', { text: ctx.state.doc.toString(), line: line.number - 1, column: word.from - line.from }, 'complete-' + n);
            }).then(function (out) {
                if (!out || !out.items || !out.items.length) { return null; }
                return { from: word.from, validFor: /^[\w-]*$/, options: out.items.map(function (it) {
                    return { label: it.label, detail: it.detail || undefined, apply: it.insert || it.label, type: it.kind === 'shape' ? 'type' : it.kind === 'style' ? 'property' : 'keyword' };
                }) };
            }).catch(function () { return null; });
        }

        /* The mistakes in the text are marked where they are, as the
           drawing finds them: the linter waits for the drawing of the text
           it was asked about. */
        function lintSource(view) {
            var text = view.state.doc.toString();
            return new Promise(function (resolve) { waiters.push({ text: text, resolve: resolve, doc: view.state.doc, kind: (current() || {}).kind }); });
        }
        function settle(text, problems) {
            var left = [];
            waiters.forEach(function (w) {
                if (w.text === text) { w.resolve(diagnostics(w.doc, w.kind, problems)); }
                else if (destroyed) { w.resolve([]); }
                else { left.push(w); }
            });
            waiters = left.filter(function (w) { return w.text === (current() || {}).text; });
            left.forEach(function (w) { if (waiters.indexOf(w) < 0) { w.resolve([]); } });
        }
        function diagnostics(doc, kind, problems) {
            var out = [];
            (problems || []).forEach(function (p) {
                var line = p.line;
                if (kind === 'mermaid' && !line) { var m = /line (\d+)/i.exec(p.message); line = m ? +m[1] : 0; }
                if (!(line >= 1 && line <= doc.lines)) { return; }
                var l = doc.line(line), from = l.from, to = l.to;
                if (kind === 'd2' && p.to > p.from && p.from >= l.from && p.to <= doc.length) { from = p.from; to = p.to; }
                else if (kind === 'd2' && p.column > 1) { from = Math.min(l.to, l.from + p.column - 1); }
                out.push({ from: from, to: Math.max(to, from), severity: 'error', message: p.message });
            });
            return out;
        }

        /* === The drawing ================================================== */

        function scheduleDraw() { clearTimeout(drawTimer); drawTimer = setTimeout(drawNow, DRAW_DELAY); }
        function altOf(t) { return 'The diagram ' + (t.path ? baseName(t.path) : t.name); }
        /* Draws the front tab's text. A mistake keeps the last good drawing,
           dimmed, with the site's notice above it saying what and where
           (decision 5). */
        function drawNow() {
            clearTimeout(drawTimer);
            var t = current();
            if (!t) { return Promise.resolve(); }
            var text = t.text, seq = ++drawSeq;
            el.state.textContent = 'Drawing…';
            var drawn = t.kind === 'd2'
                ? d2().then(function (E) { return E.draw(t.place, text, { keep: true, report: false, alt: altOf(t) }); })
                : kit().then(function (K) { return K.drawMermaid(t.place, text, { keep: true, report: false }); });
            return drawn.then(function (out) {
                /* No answer means another drawing of this place replaced
                   this one; if this is still the newest, it draws again. */
                if (!out) { if (seq === drawSeq) { scheduleDraw(); } return; }
                var problems = out.problems || (out.problem ? [{ message: out.problem, line: 0 }] : []);
                if (seq === drawSeq && t === current()) {
                    t.problems = problems;
                    if (!problems.length) { t.svg = out.svg; t.size = out.width ? { w: out.width, h: out.height } : sizeOfSvg(out.svg); }
                    showOutcome(t);
                }
                settle(text, problems);
            }, function (err) {
                var problems = [{ message: String((err && err.message) || err), line: 0 }];
                if (seq === drawSeq && t === current()) { t.problems = problems; showOutcome(t); }
                settle(text, problems);
            });
        }
        function showOutcome(t) {
            var p = t.problems || [];
            if (p.length) {
                var first = p[0], where = first.line > 0 ? 'Line ' + first.line + ': ' : '';
                var more = p.length > 1 ? ' (and ' + (p.length - 1) + ' more)' : '';
                window.yavcUtil.notice(el.stage, 'The diagram could not be drawn. ' + where + first.message + more, 'problem');
                el.state.textContent = p.length === 1 ? 'One mistake' : p.length + ' mistakes';
            } else {
                window.yavcUtil.notice(el.stage, '');
                el.state.textContent = 'Drawn';
            }
            commandsChanged();
        }
        /* A Mermaid drawing's size, from its viewBox, for a picture of it. */
        function sizeOfSvg(svg) {
            var m = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg || '');
            return m ? { w: Math.ceil(+m[1]), h: Math.ceil(+m[2]) } : null;
        }
        function applyFit() { el.canvas.classList.toggle('dg-fit', !!settings.fit); }

        /* === Views ======================================================== */

        function viewOf(t) { return t && VIEWS.some(function (v) { return v[0] === t.view; }) ? t.view : settings.view; }
        function applyDock() {
            var dock = DOCKS.some(function (d) { return d[0] === settings.dock; }) ? settings.dock : 'left';
            var view = viewOf(current()), first = dock === 'left' || dock === 'top';
            root.setAttribute('data-dock', dock);
            root.setAttribute('data-view', view);
            el.work.classList.toggle('stacked', dock === 'top' || dock === 'bottom');
            el.work.replaceChildren.apply(el.work, first ? [el.stagebox, el.split, el.text] : [el.text, el.split, el.stagebox]);
            /* PUDL's splitter shows one pane on data-split-pane, and keeps
               where the handle was for when both are back. */
            if (view === 'split') { el.work.removeAttribute('data-split-pane'); }
            else if (view === 'preview') { el.work.setAttribute('data-split-pane', first ? 'first' : 'second'); }
            else { el.work.setAttribute('data-split-pane', first ? 'second' : 'first'); }
            if (cm) { cm.requestMeasure(); }
        }
        function setView(view) {
            var t = current();
            if (!VIEWS.some(function (v) { return v[0] === view; })) { return; }
            if (t) { t.view = view; }
            settings.view = view;
            keepSetting('view', view);
            applyDock();
            if (view !== 'preview' && cm) { cm.focus(); }
            commandsChanged();
            if (window.pudlMenubar) { window.pudlMenubar.refresh(); }
            announce();
        }
        function setDock(dock) { settings.dock = dock; applyDock(); commandsChanged(); keepSetting('dock', dock); }

        /* === Tabs ========================================================= */

        function tabTitle(t) { return t.path ? baseName(t.path) : t.name; }
        var tabRowApi = window.yavcDocTabs ? window.yavcDocTabs.attach(el.tabsEl, {
            tabs: function () { return tabs.map(function (t) { return { name: tabTitle(t), path: t.path, modified: t.modified }; }); },
            active: function () { return active; },
            activate: function (i) { activateTab(i); },
            close: function (i) { return closeTab(i); }
        }) : null;
        function tabRow() { if (tabRowApi) { tabRowApi.render(); } }
        function makeTab(text, path, kind, view) {
            kind = kind || kindOf(path, text);
            /* Each tab draws into a place of its own, so a drawing that
               finishes after a switch lands in its own tab, never over the
               tab in front, and a tab comes back with its last drawing. */
            var place = document.createElement('div');
            place.className = 'dg-place';
            var t = { path: path || null, kind: kind, text: text, modified: false, view: view || null, problems: [], svg: null, size: null, place: place };
            if (!path) { untitled++; t.name = 'untitled-' + untitled + EXT[kind]; }
            t.state = stateFor(t, text);
            return t;
        }
        function stash() { var t = current(); if (t && cm) { t.state = cm.state; } }
        function activateTab(i) {
            if (!tabs[i]) { return; }
            stash();
            active = i;
            var t = tabs[i];
            showTab(t);
            el.canvas.replaceChildren(t.place);
            el.where.textContent = t.path || 'Not saved yet';
            el.kind.textContent = KIND_NAME[t.kind];
            applyDock();
            drawNow();
            commandsChanged();
            announce();
        }
        function untouched(t) { return t && !t.path && !t.modified; }
        /* A diagram opens in a tab of its own, unless the front tab is a new
           diagram nobody has touched, which it replaces. */
        function openInTab(text, path, kind, view) {
            stash();
            var t = makeTab(text, path, kind, view);
            if (untouched(current()) && tabs.length) { tabs[active] = t; activateTab(active); return t; }
            tabs.push(t);
            activateTab(tabs.length - 1);
            return t;
        }
        async function closeTab(i) {
            var t = tabs[i];
            if (!t) { return; }
            if (t.modified) {
                if (i !== active) { activateTab(i); }
                var choice = await window.yavcDialog.askSave(tabTitle(t));
                if (choice !== 'discard' && choice !== 'save') { return; }
                if (choice === 'save') { await save(); if (t.modified) { return; } }
            }
            stash();
            var front = active;
            tabs.splice(i, 1);
            if (i < front) { front--; } else if (i === front) { front = Math.min(i, tabs.length - 1); }
            if (!tabs.length) { tabs.push(makeTab(D2_STYLES[0].text, null, 'd2')); front = 0; }
            active = -1;
            activateTab(front);
        }

        /* === Files ======================================================== */

        async function openPath(p, view) {
            for (var i = 0; i < tabs.length; i++) {
                if (tabs[i].path === p) { activateTab(i); if (view) { setView(view); } return true; }
            }
            if (!H.fs || !H.fs.readText) { say('There is no file service here.', true); return false; }
            var text = await H.fs.readText(p);
            if (text == null) { say('There is no file at ' + p + '.', true); return false; }
            openInTab(text, p, null, view);
            say('Opened ' + p + '.');
            return true;
        }
        async function open() {
            if (!H.fs || !H.fs.open) { return; }
            var res = await H.fs.open({ title: 'Open a Diagram', host: root, start: '~', accept: ['.d2', '.mmd', '.mermaid'] });
            if (!res) { return; }
            if (res.path) { await openPath(res.path); return; }
            var t = openInTab(res.text, null, kindOf(res.name, res.text));
            t.modified = true;
            say('Opened ' + res.name + '.');
            commandsChanged();
        }
        async function save() {
            var t = current();
            if (!t) { return; }
            if (!t.path) { return saveAs(); }
            var err = await H.fs.writeText(t.path, t.text);
            if (err) { say('Could not save: ' + err, true); return; }
            t.modified = false;
            say('Saved ' + t.path + '.');
            commandsChanged();
            keep();
        }
        async function saveAs() {
            var t = current();
            if (!t || !H.fs || !H.fs.save) { return; }
            var blob = new Blob([t.text], { type: 'text/plain' });
            var res = await H.fs.save({ title: 'Save the Diagram As', name: tabTitle(t), host: root, start: t.path ? t.path.replace(/\/[^\/]*$/, '') : '~/Documents', blob: blob }).catch(function (e) { say(e.message, true); return null; });
            if (!res) { return; }
            if (res.path) {
                t.path = res.path;
                t.modified = false;
                /* A new suffix may make it the other language. */
                var kind = kindOf(res.path, t.text);
                if (kind !== t.kind) { t.kind = kind; stash(); t.state = stateFor(t, t.text); showTab(t); el.kind.textContent = KIND_NAME[kind]; drawNow(); }
                el.where.textContent = t.path;
                say('Saved ' + t.path + '.');
                announce();
            } else if (res.download) { window.yavcUtil.download(res.download, blob); say('Downloaded ' + res.download + '.'); }
            commandsChanged();
        }
        function newDiagram(style, kind) {
            openInTab(style.text, null, kind, null);
            say('This is a new ' + style.label.toLowerCase() + '. Save it to keep it.');
        }
        function editInEditor() {
            var t = current();
            if (!t || !t.path) { say('Save the diagram first, so the Editor can open it.'); return; }
            if (window.pudlApplets && window.pudlApplets.can && window.pudlApplets.can('open', 'file')) {
                window.pudlApplets.request('open', { path: t.path, kind: 'file' }, root);
            }
        }

        /* === Export (decision 14) ========================================= */

        function stem(t) { return tabTitle(t).replace(/\.(d2|mmd|mermaid)$/i, '') || 'diagram'; }
        function drawable() { var t = current(); return !!(t && t.svg && !(t.problems && t.problems.length)); }
        function needDrawing() { say('The diagram has a mistake in it, so there is no drawing to export. Put the mistake right first.', 'warn'); }
        function downloadSVG() {
            var t = current();
            if (!drawable()) { needDrawing(); return; }
            window.yavcUtil.download(stem(t) + '.svg', new Blob([t.svg], { type: 'image/svg+xml' }));
            say('Downloaded ' + stem(t) + '.svg.');
        }
        /* A picture of the drawing at one, two or three times its size, drawn
           from the SVG through an image, which loads nothing from outside. */
        function pngOf(t, scale) {
            return new Promise(function (resolve, reject) {
                var size = t.size || { w: 800, h: 600 };
                var img = new Image();
                img.onload = function () {
                    var c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(size.w * scale));
                    c.height = Math.max(1, Math.round(size.h * scale));
                    var g = c.getContext('2d');
                    g.drawImage(img, 0, 0, c.width, c.height);
                    c.toBlob(function (b) { if (b) { resolve(b); } else { reject(new Error('the browser could not make the picture')); } }, 'image/png');
                };
                img.onerror = function () { reject(new Error('the drawing could not be read as a picture')); };
                var svg = t.svg;
                if (!/<svg[^>]*\swidth=/.test(svg)) { svg = svg.replace(/<svg\b/, '<svg width="' + size.w + '" height="' + size.h + '"'); }
                img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            });
        }
        function downloadPNG(scale) {
            var t = current();
            if (!drawable()) { needDrawing(); return; }
            var name = stem(t) + (scale > 1 ? '@' + scale + 'x' : '') + '.png';
            pngOf(t, scale).then(function (blob) { window.yavcUtil.download(name, blob); say('Downloaded ' + name + '.'); })
                .catch(function (err) { say('The picture could not be made: ' + err.message, true); });
        }
        function downloadSource() {
            var t = current();
            if (!t) { return; }
            window.yavcUtil.download(tabTitle(t), new Blob([t.text], { type: 'text/plain' }));
            say('Downloaded ' + tabTitle(t) + '.');
        }
        /* The diagram as a fenced block, which the Editor and Slides draw
           wherever it is pasted, and which carries its source with it
           (decision 9). The {{diagram}} shortcode, by reference, comes with
           the embedding work. */
        function copyEmbed() {
            var t = current();
            if (!t) { return; }
            var fence = /```/.test(t.text) ? '~~~~' : '```';
            var block = fence + (t.kind === 'd2' ? 'd2' : 'mermaid') + '\n' + t.text.replace(/\s+$/, '') + '\n' + fence + '\n';
            if (!navigator.clipboard || !navigator.clipboard.writeText) { say('This browser does not let the page write to the clipboard.', true); return; }
            navigator.clipboard.writeText(block).then(function () { say('Copied as a fenced block. Paste it into a document in the Editor or a slide.'); },
                function () { say('The clipboard could not be written to.', true); });
        }
        /* D2's own formatting of the text (decision 5), as one change. */
        function formatText() {
            var t = current();
            if (!t || t.kind !== 'd2') { return; }
            d2().then(function (E) { return E.call('format', { text: t.text }); }).then(function (out) {
                if (!out) { return; }
                if (out.problems && out.problems.length) { say('The text has a mistake in it, so it was not tidied. Put the mistake right first.', 'warn'); return; }
                if (out.text === t.text) { say('The text was tidy already.'); return; }
                replaceText(out.text);
                say('Tidied the text. Undo puts it back as it was.');
            }).catch(function (err) { say('The text could not be tidied: ' + err.message, true); });
        }

        /* === Snapshots and continuity ===================================== */

        var unguard = window.yavcDocTabs.guard(root, {
            changed: function () { return tabs.filter(function (t) { return t.modified; }).map(tabTitle); },
            keptOnReload: function () { return !!H.snapshot; },
            keptOnClose: function () { return false; },
            saveAll: async function () {
                for (var i = 0; i < tabs.length; i++) {
                    if (!tabs[i].modified) { continue; }
                    activateTab(i);
                    await save();
                    if (tabs[i].modified) { return false; }
                }
                return true;
            }
        });
        var snap = H.snapshot ? H.snapshot.join(root, function () {
            return { tabs: tabs.map(function (t) { return { path: t.path, name: t.name || null, kind: t.kind, text: t.modified ? t.text : null, view: t.view || null }; }), active: active };
        }) : null;
        function keep() { if (snap) { snap.changed(); } }

        /* === Commands ===================================================== */

        function cmd(id, label, glyph, run, more) { return Object.assign({ id: id, label: label, glyph: glyph || undefined, run: run }, more || {}); }
        function isD2() { var t = current(); return !!(t && t.kind === 'd2'); }
        function commandTable() {
            var table = [
                cmd('new', 'New Diagram', 'file', null, { items: D2_STYLES.map(function (s) { return { id: 'new-' + s.id, label: s.label, run: function () { newDiagram(s, 'd2'); } }; }) }),
                cmd('new-mermaid', 'New Mermaid Diagram', 'file', null, { items: MERMAID_STYLES.map(function (s) { return { id: 'new-' + s.id, label: s.label, run: function () { newDiagram(s, 'mermaid'); } }; }) }),
                cmd('open', 'Open…', 'folder', open, { shortcut: 'Mod+O' }),
                cmd('save', 'Save', 'yavc-save', save, { shortcut: 'Mod+S', disabled: function () { return !current(); } }),
                cmd('save-as', 'Save As…', null, saveAs, { disabled: function () { return !current(); } }),
                cmd('edit-in-editor', 'Open in the Editor', 'pencil', editInEditor, { disabled: function () { var c = current(); return !(c && c.path); } }),
                cmd('export-svg', 'Download as SVG', 'download', downloadSVG, { disabled: function () { return !drawable(); } }),
                cmd('export-png', 'Download as PNG', 'download', null, { disabled: function () { return !drawable(); }, items: [1, 2, 3].map(function (k) { return { id: 'export-png-' + k, label: k === 1 ? 'Actual Size' : k + ' Times the Size', run: function () { downloadPNG(k); } }; }) }),
                cmd('export-source', 'Download the Text', 'download', downloadSource, { disabled: function () { return !current(); } }),
                cmd('copy-embed', 'Copy as Embed', 'copy', copyEmbed, { disabled: function () { return !current(); } }),
                cmd('format-text', 'Tidy the Text', 'code', formatText, { hidden: function () { return !isD2(); } }),
                cmd('redraw', 'Draw Again', 'reload', function () { drawNow(); }),
                cmd('fit', 'Fit the Drawing to the Pane', 'maximize', function () { settings.fit = !settings.fit; applyFit(); keepSetting('fit', settings.fit); commandsChanged(); }, { checked: function () { return !!settings.fit; } }),
                { id: 'dock', label: 'Drawing', glyph: 'dock', current: function () { var d = DOCKS.find(function (x) { return x[0] === settings.dock; }); return d ? d[1] : null; },
                    items: DOCKS.map(function (d) { return { id: 'dock-' + d[0], label: d[1], choice: 'dg-dock', value: d[0], checked: function () { return settings.dock === d[0]; }, run: function () { setDock(d[0]); } }; }) }
            ];
            VIEWS.forEach(function (v) {
                table.push({ id: 'view-' + v[0], label: v[1], choice: 'dg-view', choiceLabel: 'View', value: v[0], checked: function () { return viewOf(current()) === v[0]; }, run: function () { setView(v[0]); } });
            });
            return table;
        }
        function toolbars() {
            return [{ label: 'Diagrams', ribbon: 'hide', groups: [
                { label: 'File', glyph: 'file', priority: 3, items: ['new', 'open', 'save'] },
                { label: 'Diagram', glyph: 'code', priority: 2, items: ['format-text', 'copy-embed', 'export-svg', 'export-png'] },
                { label: 'View', glyph: 'panel', priority: 1, end: true, items: [{ choice: 'dg-view' }, 'dock', 'fit'] }
            ] }];
        }
        /* Diagrams' help is a page of the site, /help/diagrams, which the
           site's Help menu links to (DESIGN.md, decision 19). */
        function menus() {
            return { titles: [
                { label: 'Diagrams', glyph: 'document', items: H.identity ? H.identity(root, []) : [] },
                { id: 'file', label: 'File', glyph: 'file', items: ['new', 'new-mermaid', 'open', 'save', 'save-as', '-', 'edit-in-editor', '-', 'export-svg', 'export-png', 'export-source'] },
                { id: 'diagram', label: 'Diagram', glyph: 'code', items: ['format-text', 'redraw', '-', 'copy-embed'] }
            ], into: { view: ['view-text', 'view-preview', 'view-split', '-', 'dock', 'fit'] } };
        }
        root.addEventListener('pudl:contextmenu', function (e) {
            var t = e.detail.target;
            var own = function (ids) { return window.pudlCommands ? window.pudlCommands.menuRows(ids, root) : ids; };
            if (t.closest && t.closest('.dg-stagebox')) { e.detail.add(own(['copy-embed', 'export-svg', 'export-png', '-', 'fit', 'redraw'])); }
            else if (t.closest && t.closest('.dg-text')) { e.detail.add(own(['format-text', 'copy-embed', '-', 'view-text', 'view-preview', 'view-split'])); }
        });

        /* === Start ======================================================== */

        var booted = (async function () {
            var got = await Promise.all([kit(), modes()]);
            CM = await got[0].libs();
            if (destroyed) { return; }
            if (H.config && H.config.load) { try { Object.assign(settings, (await H.config.load('diagrams', SETTINGS)) || {}); } catch (err) { } }
            applyFit();
            /* The tabs kept across a reload come back first, unsaved text and
               all; then the address's file comes to the front. */
            var kept = snap && snap.kept;
            if (kept && kept.tabs) {
                for (var i = 0; i < kept.tabs.length; i++) {
                    var k = kept.tabs[i], text = k.text;
                    if (text == null && k.path && H.fs && H.fs.readText) { text = await H.fs.readText(k.path).catch(function () { return null; }); }
                    if (text == null) { continue; }
                    var t = makeTab(text, k.path || null, k.kind === 'mermaid' ? 'mermaid' : k.kind === 'd2' ? 'd2' : null, k.view);
                    if (!k.path && k.name && /^untitled-\d+\.(d2|mmd)$/.test(k.name)) { t.name = k.name; untitled = Math.max(untitled, +/\d+/.exec(k.name)[0]); }
                    t.modified = k.text != null;
                    tabs.push(t);
                }
                if (tabs.length) { activateTab(Math.max(0, Math.min(kept.active || 0, tabs.length - 1))); }
            }
            var file = start.get('file'), view = start.get('view');
            if (file) { await openPath(file, view).catch(function (err) { say(err.message, true); return false; }); }
            if (!tabs.length) { tabs.push(makeTab(D2_STYLES[0].text, null, 'd2')); activateTab(0); }
            if (view && !file) { setView(view); }
            announce();
        })().catch(function (err) { if (!destroyed) { root.innerHTML = '<div class="notice danger" role="alert"><div class="notice-content"><p class="notice-title">Diagrams could not start</p><p class="notice-body">' + esc(err.message) + '</p></div></div>'; } });

        /* === The live actions (actions.json, decision 13) ================= */

        function tabNo(i) {
            if (i == null) { if (active < 0) { throw new Error('no diagram is open'); } return active; }
            i = Math.floor(Number(i));
            if (!(i >= 1 && i <= tabs.length)) { throw new Error('there is no diagram ' + i + '; ' + tabs.length + ' are open'); }
            return i - 1;
        }
        function summary(t, i) { return { index: i + 1, name: tabTitle(t), path: t.path, kind: t.kind, modified: !!t.modified, view: viewOf(t) }; }
        async function front(i) { var k = tabNo(i); if (k !== active) { activateTab(k); } return current(); }
        async function drawnNow() { await drawNow(); var t = current(); return { drawn: !(t.problems && t.problems.length), problems: (t.problems || []).map(function (p) { return { message: p.message, line: p.line || 0 }; }) }; }
        var liveActions = {
            'diagrams@1': async function () { await booted; stash(); return { output: { active: active + 1, diagrams: tabs.map(summary) } }; },
            'diagram@1': async function (input) {
                await booted;
                var i = tabNo(input.index), t = tabs[i];
                if (i === active) { stash(); }
                return { output: Object.assign(summary(t, i), { text: t.text, problems: (t.problems || []).map(function (p) { return { message: p.message, line: p.line || 0 }; }) }) };
            },
            'new@1': async function (input) {
                await booted;
                var kind = input.kind === 'mermaid' ? 'mermaid' : 'd2', list = kind === 'd2' ? D2_STYLES : MERMAID_STYLES;
                var style = list.find(function (s) { return s.id === input.style || s.id === 'mm-' + input.style; }) || list[0];
                var t = openInTab(input.text != null ? String(input.text) : style.text, null, kind, null);
                if (input.text != null) { t.modified = true; commandsChanged(); }
                return { output: Object.assign(summary(t, active), await drawnNow()) };
            },
            'open-file@1': async function (input) {
                await booted;
                var ok = await openPath(String(input.path), input.view);
                if (!ok) { throw new Error('there is no file at ' + input.path); }
                return { output: summary(current(), active) };
            },
            'set-text@1': async function (input) {
                await booted;
                await front(input.index);
                replaceText(String(input.text));
                return { output: Object.assign(summary(current(), active), await drawnNow()) };
            },
            'save@1': async function (input) {
                await booted;
                var t = await front(input.index);
                if (input.path) {
                    /* An agent's diagram never takes the name of a file that
                       exists, or saving would overwrite it unasked. */
                    var to = String(input.path);
                    if (to !== t.path && H.fs && H.fs.readText) {
                        var there = await H.fs.readText(to).catch(function () { return null; });
                        if (there != null) { throw new Error('there is already a file at ' + to + '; open it, or give the diagram another name'); }
                    }
                    t.path = to;
                }
                if (!t.path) { throw new Error('the diagram has no file yet; give a path such as ~/diagrams/plan.d2'); }
                if (!H.fs || !H.fs.writeText) { throw new Error('there is no file service here'); }
                var err = await H.fs.writeText(t.path, t.text);
                if (err) { throw new Error('could not save: ' + err); }
                t.modified = false;
                el.where.textContent = t.path;
                say('Saved ' + t.path + '.');
                commandsChanged();
                announce();
                return { output: summary(t, active) };
            },
            'close@1': async function (input) {
                await booted;
                var i = tabNo(input.index), before = tabs.length;
                await closeTab(i);
                return { output: { closed: tabs.length < before || before === 1, open: tabs.length } };
            },
            'view@1': async function (input) {
                await booted;
                if (input.dock) { setDock(String(input.dock)); }
                if (input.mode) { setView(String(input.mode)); }
                return { output: { mode: viewOf(current()), dock: settings.dock } };
            },
            'outline@1': async function (input) {
                await booted;
                var t = await front(input.index);
                if (t.kind !== 'd2') { throw new Error('an outline is read from D2 diagrams; this one is Mermaid'); }
                var out = await (await d2()).call('outline', { text: t.text });
                return { output: { shapes: out.shapes || [], connections: out.connections || [], boards: out.boards || [], problems: out.problems || [] } };
            },
            'format@1': async function (input) {
                await booted;
                var t = await front(input.index);
                if (t.kind !== 'd2') { throw new Error('only D2 text is tidied; this diagram is Mermaid'); }
                var out = await (await d2()).call('format', { text: t.text });
                if (out.problems && out.problems.length) { throw new Error('the text has a mistake on line ' + (out.problems[0].line || 1) + ': ' + out.problems[0].message); }
                var changed = out.text !== t.text;
                replaceText(out.text);
                return { output: { index: active + 1, changed: changed } };
            },
            'render@1': async function (input) {
                await booted;
                var t = await front(input.index);
                var got = await drawnNow();
                if (!got.drawn) { throw new Error('the diagram has a mistake: ' + (got.problems[0] ? got.problems[0].message : 'unknown')); }
                if (input.format === 'png') {
                    var scale = Math.max(1, Math.min(3, Math.floor(Number(input.scale) || 2)));
                    var blob = await pngOf(t, scale);
                    return { output: { name: stem(t) + '.png', width: t.size ? t.size.w * scale : 0, height: t.size ? t.size.h * scale : 0 }, artifacts: [{ key: 'png', name: stem(t) + '.png', mime: 'image/png', data: new Uint8Array(await blob.arrayBuffer()) }] };
                }
                return { output: { name: stem(t) + '.svg', width: t.size ? t.size.w : 0, height: t.size ? t.size.h : 0 }, artifacts: [{ key: 'svg', name: stem(t) + '.svg', mime: 'image/svg+xml', data: t.svg }] };
            }
        };
        var detachLive = window.pudlApplets && window.pudlApplets.attach ? window.pudlApplets.attach('yavc.diagrams', liveActions) : null;

        return {
            ready: booted,
            state: stateString,
            setState: function (s) {
                var p = new URLSearchParams(String(s || '').replace(/^\?/, ''));
                booted.then(function () {
                    var file = p.get('file'), view = p.get('view');
                    var t = current();
                    if (file && (!t || file !== t.path)) { openPath(file, view); }
                    else if (view) { setView(view); }
                });
            },
            commandTable: commandTable, toolbars: toolbars, menus: menus,
            destroy: function () {
                destroyed = true;
                clearTimeout(drawTimer);
                settle(null, []);
                if (detachLive) { detachLive(); }
                if (cm) { cm.destroy(); }
                if (snap) { snap.leave(); }
                unguard();
            }
        };
    }

    window.pudlApplets.register('diagrams', { init: init });
})();
