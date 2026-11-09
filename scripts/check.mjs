#!/usr/bin/env node
// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
//
// The project's own checks on its browser code, stylesheets and text: the
// rules that keep what a review fixed from coming back (docs/review.md).
// scripts/check.sh runs it with the Go checks; CI runs that on every push.
//
//   node scripts/check.mjs            every rule over the whole tree
//   node scripts/check.mjs --since R  also the rules that compare with git ref R
//
// Each rule has an id, says what it guards and why, and reports
// file:line: message. A line may opt out of one rule with a comment that
// gives the reason: check-ignore(rule-id): why.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const args = process.argv.slice(2);
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;

// Code that is not the project's own: vendored libraries, built output.
const SKIP = [/^\.claude\//, /(^|\/)vendor\//, /^web\/pudl\//, /(^|\/)node_modules\//, /^\.git\//, /^data\//, /^\.local\//,
  /^apps\/md-engine\/(yavc-md\.wasm|wasm_exec\.js)$/, /^apps\/diagram-kit\/(yavc-d2\.wasm|wasm_exec\.js)$/,
  // This reproducible bundle includes third-party documentation containing
  // example HTML/JS. Its own sources are checked below and its input/output
  // hashes are enforced by the language-service module test.
  /^apps\/md-editor\/language-service\/worker\.js$/, /\.min\.js$/];
const TEXT = new Set(['.js', '.mjs', '.go', '.css', '.html', '.md', '.json', '.sh', '.yml', '.yaml', '.xfer']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name), rel = relative(ROOT, full).split(sep).join('/');
    if (SKIP.some((re) => re.test(rel + (statSync(full).isDirectory() ? '/' : '')))) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT.has(extname(name))) out.push(rel);
  }
  return out;
}

const files = walk(ROOT);
const text = new Map(files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
const problems = [];
function report(rule, file, index, message) {
  const src = text.get(file) || '';
  const line = index == null ? 0 : src.slice(0, index).split('\n').length;
  const lineText = line ? src.split('\n')[line - 1] : '';
  if (new RegExp('check-ignore\\(' + rule + '\\):\\s*\\S').test(lineText)) return;
  problems.push({ rule, file, line, message });
}
function each(re, src, fn) { re.lastIndex = 0; let m; while ((m = re.exec(src))) fn(m); }
const js = files.filter((f) => /\.m?js$/.test(f));
const css = files.filter((f) => f.endsWith('.css'));

const rules = [];

// Every script parses. A syntax error in one applet's script stops only that
// applet, silently, so it is caught here rather than in the browser.
rules.push({ id: 'js-syntax', run() {
  for (const f of js) {
    try { new vm.Script(text.get(f).replace(/^#!.*/, ''), { filename: f }); }
    catch (err) {
      if (f.endsWith('.mjs') || /^\s*(import|export)\s/m.test(text.get(f))) continue; // modules are checked by node --check below
      report('js-syntax', f, null, err.message);
    }
  }
  for (const f of js.filter((f) => f.endsWith('.mjs') || /^\s*(import|export)\s/m.test(text.get(f)))) {
    try { execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'pipe' }); }
    catch (err) { report('js-syntax', f, null, String(err.stderr || err.message).split('\n')[0]); }
  }
} });

// Paul's standing style rule: no em-dash in anything committed
// (C:\Users\paul\.claude\CLAUDE.md, "Output style: no em-dashes").
rules.push({ id: 'no-em-dash', run() {
  for (const f of files) each(/\u2014/g, text.get(f), (m) => report('no-em-dash', f, m.index, 'an em-dash; use a comma, colon, semicolon or parentheses'));
} });

// A glyph a command uses is drawn outside the applet too, in the menu bar,
// the ribbon and context menus, which are popovers at the top of the page.
// So it must be one of PUDL's glyphs or defined on the root of site.css,
// not inside an applet's own rule or a theme-conditional block, where the
// popover cannot see it and draws a blank square (review of 2026-11-03).
function rootGlyphs() {
  const defined = new Set();
  each(/--glyph-([a-z0-9-]+)\s*:/g, readFileSync(join(ROOT, 'web/pudl/pudl.css'), 'utf8'), (m) => defined.add(m[1]));
  // The site's stylesheet, and a package's own, which is loaded at page level.
  for (const f of css) {
    const src = text.get(f).replace(/\/\*[\s\S]*?\*\//g, '');
    each(/(?<=^|\})\s*([^{}]+)\{([^{}]*)\}/g, src, (m) => {
      if (m[1].trim() !== ':root') return;
      each(/--(glyph|yavc-glyph)-([a-z0-9-]+)\s*:/g, m[2], (g) => defined.add((g[1] === 'yavc-glyph' ? 'yavc-' : '') + g[2]));
    });
  }
  return defined;
}
rules.push({ id: 'glyph-defined', run() {
  const defined = rootGlyphs();
  const sources = js.filter((f) => /^(apps|applets|internal\/web\/static)\//.test(f));
  for (const f of sources) {
    // A command's glyph, by name or as cmd(id, label, glyph, ...).
    each(/\bglyph:\s*'([a-z0-9-]+)'|\bcmd\(\s*'[^']*'\s*,\s*'(?:[^'\\]|\\.)*'\s*,\s*'([a-z0-9-]+)'/g, text.get(f), (m) => {
      const name = m[1] || m[2];
      if (!defined.has(name)) report('glyph-defined', f, m.index, `the command glyph "${name}" is neither PUDL's nor defined on :root in a stylesheet`);
    });
  }
  for (const f of files.filter((f) => /\.(html|js)$/.test(f) && !f.startsWith('scripts/'))) {
    each(/var\(--yavc-glyph-([a-z0-9-]+)\)/g, text.get(f), (m) => {
      if (!defined.has('yavc-' + m[1])) report('glyph-defined', f, m.index, `--yavc-glyph-${m[1]} is used but not defined on :root in site.css`);
    });
  }
} });

// The editing kit's FORMATS table gives each format's glyph as the third
// entry of its row, ['bold', 'Bold', 'bold', 'Mod-b'], which the rule above
// does not read, so a format with a glyph nobody defined drew a blank square
// in every menu and toolbar (found when Highlight, Superscript and Subscript
// were added, 2026-11-03).
rules.push({ id: 'format-glyph-defined', run() {
  const f = 'apps/md-editor/kit.js';
  const src = text.get(f);
  if (!src) return;
  const block = /var FORMATS = \[([\s\S]*?)\n    \];/.exec(src);
  if (!block) { report('format-glyph-defined', f, null, 'the FORMATS table was not found, so its glyphs were not checked'); return; }
  const defined = rootGlyphs();
  const from = src.indexOf(block[1]);
  each(/\['[a-z]+',\s*'(?:[^'\\]|\\.)*',\s*'([a-z0-9-]+)'/g, block[1], (m) => {
    if (!defined.has(m[1])) report('format-glyph-defined', f, from + m.index, `the format glyph "${m[1]}" is neither PUDL's nor defined on :root in a stylesheet`);
  });
} });

// The site's own glyphs are named yavc-*, so none shadows a glyph PUDL
// has or adds later (PUDL review, 2026-11-03). The installed packages
// under applets/ keep their own names.
rules.push({ id: 'glyph-namespace', run() {
  const pudl = new Set();
  each(/--glyph-([a-z0-9-]+)\s*:/g, readFileSync(join(ROOT, 'web/pudl/pudl.css'), 'utf8'), (m) => pudl.add(m[1]));
  for (const f of css.filter((f) => !f.startsWith('applets/'))) {
    each(/--glyph-([a-z0-9-]+)\s*:\s*url\(/g, text.get(f), (m) => {
      if (pudl.has(m[1])) report('glyph-namespace', f, m.index, `--glyph-${m[1]} redefines one of PUDL's glyphs`);
      else if (!m[1].startsWith('yavc-')) report('glyph-namespace', f, m.index, `--glyph-${m[1]} is the site's own glyph; name it --glyph-yavc-${m[1]}`);
    });
  }
} });

// A new window opened from the page cannot reach back into it.
rules.push({ id: 'window-open-noopener', run() {
  // The call's line and the next, since an address may run long.
  for (const f of js) each(/window\.open\(/g, text.get(f), (m) => {
    const src = text.get(f), start = src.lastIndexOf('\n', m.index) + 1;
    let end = src.indexOf('\n', m.index); end = src.indexOf('\n', end + 1); if (end < 0) end = src.length;
    if (!/noopener/.test(src.slice(start, end))) report('window-open-noopener', f, m.index, 'window.open without noopener');
  });
  for (const f of files.filter((f) => /\.(html|js|md)$/.test(f))) each(/target=["\\']+_blank["\\']+(?![^>]*rel=["\\']+[^"']*noopener)/g, text.get(f), (m) => {
    report('window-open-noopener', f, m.index, 'target="_blank" without rel="noopener"');
  });
} });

// An applet's version changes with its files, so the registry and the
// browser's cache take the new code (a standing rule of the repository).
// Every Go module compiled into the D2 engine has its licence listed in
// apps/diagram-kit/LICENSES.md, which is served beside the engine, so a
// dependency that D2 or a later change brings in cannot reach readers
// without its notice (docs/diagrams-design.md, safety). The list comes from
// the Go tool itself, building for the browser as the image does.
rules.push({ id: 'engine-licences', run() {
  const f = 'apps/diagram-kit/LICENSES.md';
  const listed = text.get(f) || '';
  let modules;
  try {
    modules = execFileSync('go', ['list', '-deps', '-f', '{{with .Module}}{{.Path}}{{end}}', './cmd/yavc-d2'],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GOOS: 'js', GOARCH: 'wasm' }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    report('engine-licences', 'cmd/yavc-d2', null, 'the Go tool could not list the engine\'s modules: ' + String(err.stderr || err.message).split('\n')[0]);
    return;
  }
  for (const m of new Set(modules.split('\n').map((s) => s.trim()).filter((s) => s && s !== 'yavc.app'))) {
    if (!listed.includes('`' + m + '`')) report('engine-licences', f, null, `the module ${m} is compiled into the D2 engine but its licence is not listed here`);
  }
} });

rules.push({ id: 'applet-version-bump', needsSince: true, run() {
  const changed = execFileSync('git', ['diff', '--name-only', since, '--', 'apps', 'applets'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const folders = new Set(changed.map((f) => f.split('/').slice(0, 2).join('/')).filter((d) => {
    try { return statSync(join(ROOT, d, 'applet.json')).isFile(); } catch { return false; }
  }));
  for (const d of folders) {
    const files = changed.filter((f) => f.startsWith(d + '/'));
    if (files.length === 1 && files[0] === d + '/applet.json') continue;
    const was = (() => { try { return JSON.parse(execFileSync('git', ['show', `${since}:${d}/applet.json`], { cwd: ROOT, encoding: 'utf8' })).version; } catch { return null; } })();
    const now = JSON.parse(readFileSync(join(ROOT, d, 'applet.json'), 'utf8')).version;
    if (was && was === now) report('applet-version-bump', d + '/applet.json', null, `${d} changed since ${since} but its version is still ${now}`);
  }
} });

// A PUDL component that needs its script works only if the layout loads
// that script; without it the markup draws but does nothing (the
// splitters were dead until 2026-11-03).
rules.push({ id: 'pudl-script-loaded', run() {
  const layout = text.get('internal/web/templates/layout.html') || '';
  const needs = [
    [/\bsplit-handle\b/, 'pudl-split.js'], [/\bdata-date\b/, 'pudl-date.js'], [/\bnumber-field\b/, 'pudl-fields.js'],
    [/\bpudlToast\b/, 'pudl-toast.js'], [/\bcard disclosure\b|\bpudlDisclose\b/, 'pudl-disclose.js'], [/\brole=["\\']*tree\b/, 'pudl-tree.js'],
    [/\bdata-code-actions\b/, 'pudl-code.js'], [/\bdata-combo\b/, 'pudl-combo.js'], [/\bdata-reorder\b/, 'pudl-reorder.js'],
    // List boxes need their PUDL keyboard and selection behavior on every host page.
    [/\bdata-listbox\b|\bpudlListbox\b/, 'pudl-listbox.js']
  ];
  const sources = files.filter((f) => /^(apps|internal\/web)\//.test(f) && /\.(js|html|go)$/.test(f));
  for (const [re, script] of needs) {
    if (layout.includes('/pudl/' + script)) continue;
    for (const f of sources) {
      const m = re.exec(text.get(f));
      if (m) { report('pudl-script-loaded', f, m.index, `uses a PUDL component that needs ${script}, which the layout does not load`); break; }
    }
  }
} });

// An action that hands back the person's own content (a document's text,
// a slide, the notes, the Terminal's screen, a list of open files, an
// export) declares files.read, so an agent without it is asked first
// (security review, 2026-11-03). The few that only echo what the agent
// itself just gave are listed with the reason.
const ECHOES = {
  'yavc.docs/set-text@1': 'returns the text the agent set',
  'yavc.docs/new@1': 'a new, empty document',
  'yavc.editor/set-text@1': 'returns the text the agent set',
  'yavc.editor/new@1': 'a new, empty document',
  'yavc.slides/set-text@1': 'returns the slide the agent wrote',
  'yavc.slides/parse@1': 'parses text the agent gave',
  'yavc.slides/make@1': 'makes a deck from what the agent gave'
};
rules.push({ id: 'action-reads-declare', run() {
  for (const f of files.filter((f) => /^apps\/[^/]+\/actions\.json$/.test(f))) {
    let m; try { m = JSON.parse(text.get(f)); } catch (err) { report('action-reads-declare', f, null, 'not valid JSON: ' + err.message); continue; }
    for (const a of m.actions || []) {
      const out = JSON.stringify((a.outputSchema || {}).properties || {});
      const content = /"(text|notes|screen|documents|decks|html)"\s*:/.test(out) || (a.capabilities || []).includes('artifact.create');
      if (content && !(a.capabilities || []).includes('files.read') && !ECHOES[a.ref]) {
        report('action-reads-declare', f, text.get(f).indexOf('"' + a.ref + '"'), `${a.ref} returns the person's content but does not declare files.read`);
      }
    }
  }
} });

// Only the person's own typing holds every capability; anything else that
// passes grant: 'all' to the broker must say why on the same line.
rules.push({ id: 'grant-all', run() {
  for (const f of js.filter((f) => /^(apps|internal\/web\/static)\//.test(f))) {
    each(/grant:\s*'all'/g, text.get(f), (m) => report('grant-all', f, m.index, "grant: 'all' gives every capability without asking"));
  }
} });

// A document may embed the site's games and tools but never its own
// applications, which hold the person's files and settings; the sanitizer
// keeps the list, and every applet under apps/ must be on it.
rules.push({ id: 'not-embedded-complete', run() {
  const src = text.get('apps/md-engine/safe-html.js') || '';
  const m = /NOT_EMBEDDED\s*=\s*\[([^\]]*)\]/.exec(src);
  const listed = m ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
  for (const f of files.filter((f) => /^apps\/[^/]+\/applet\.json$/.test(f))) {
    const name = JSON.parse(text.get(f)).name || f.split('/')[1];
    if (!listed.includes(name)) report('not-embedded-complete', 'apps/md-engine/safe-html.js', m ? m.index : null, `the site's own applet ${name} is missing from NOT_EMBEDDED`);
  }
} });

// Every one of the site's own applications has a help page, a Markdown
// file at pages/help/{name}.md served at /help/{name}, and every link to a
// help page leads to one that exists (DESIGN.md, decision 19). Files' help
// had been a dialog inside the applet and the guides had drifted from the
// commands, so the help is pages and this keeps the set whole. A help page
// for an installed package under applets/ is allowed too.
rules.push({ id: 'help-pages', run() {
  const packages = new Set(files.filter((f) => /^(apps|applets)\/[^/]+\/applet\.json$/.test(f)).map((f) => f.split('/')[1]));
  const helpPages = new Set(files.filter((f) => /^pages\/help\/[^/]+\.md$/.test(f)).map((f) => f.slice('pages/help/'.length, -3)));
  for (const f of files.filter((f) => /^apps\/[^/]+\/applet\.json$/.test(f))) {
    const name = f.split('/')[1];
    if (!helpPages.has(name)) report('help-pages', f, null, `the site's own applet ${name} has no help page at pages/help/${name}.md`);
  }
  for (const name of helpPages) {
    if (name !== 'index' && !packages.has(name)) report('help-pages', `pages/help/${name}.md`, null, `no package is called ${name}, so this help page is never served`);
  }
  const sources = files.filter((f) => /^(pages|site\/home|apps|internal\/web)\//.test(f) && /\.(md|js|html|go)$/.test(f) && !f.endsWith('_test.go'));
  for (const f of sources) {
    each(/["'(]\/help\/([a-z][a-z0-9-]*)/g, text.get(f), (m) => {
      if (!helpPages.has(m[1]) || m[1] === 'index') report('help-pages', f, m.index, `a link to /help/${m[1]}, which is not a help page`);
    });
  }
} });

// One shared implementation of each small thing (review of 2026-11-03):
// the escaper, the script loader, the download and the dialogs live in
// static/yavc-util.js and static/dialogs.js, and nothing else in the site's
// own code makes its own. The installed packages under applets/ and the
// workers and the exported presentation, which cannot reach the site's
// scripts, are outside this rule.
const SITE = js.filter((f) => /^(apps|internal\/web\/static)\//.test(f) && !/worker\.js$/.test(f) && !/^apps\/slides\/present\.js$/.test(f));
const SHARED_HOMES = [
  [/function\s+esc\s*\(/g, 'internal/web/static/yavc-util.js', 'an HTML escaper of its own; use yavcUtil.esc'],
  [/createElement\(\s*'script'\s*\)/g, 'internal/web/static/yavc-util.js', 'a script loader of its own; use yavcUtil.loadScript'],
  [/\.download\s*=\s*/g, 'internal/web/static/yavc-util.js', 'a download of its own; use yavcUtil.download'],
  [/createElement\(\s*'dialog'\s*\)/g, 'internal/web/static/dialogs.js', "a dialog of its own; use yavcDialog (static/dialogs.js)"],
  [/window\.yavcMd\s*[.[]/g, 'apps/md-engine/loader.js', 'the Markdown engine called directly; go through its loader, whose calls throw on errors'],
  [/['"]\/(js|css)\//g, null, "a parkscomputing.com address (/js/, /css/) that this site does not serve"],
  [/\.replace\(\s*'Mod-'\s*,/g, 'internal/web/static/yavc-util.js', 'a shortcut spelled by hand; use yavcUtil.shortcut'],
  [/mermaid\.render\(|data-preview-diagram/g, 'apps/md-editor/kit.js', "a renderer of its own; draw the engine's blocks with yavcMdEditor.drawBlocks"],
  [/classList\.toggle\(\s*'[a-z-]*(status|message)-error'/g, null, 'an error drawn in a status line; an error is a notice (yavcUtil.notice)']
];
rules.push({ id: 'one-shared-implementation', run() {
  for (const f of SITE) {
    for (const [re, home, why] of SHARED_HOMES) {
      if (f === home) continue;
      each(re, text.get(f), (m) => report('one-shared-implementation', f, m.index, why));
    }
  }
} });

// Every label is title case: a menu title or item, a command, a button, a
// dialog's title, a tab, a field's label (Paul, DESIGN.md decision 18). A
// label had drifted between sentence case and title case from one
// application to the next. Chicago style: the first and the last word and
// every major word are capitalised, and the minor words below are not,
// unless first or last. A word that is not plain letters (a file name, a
// path, a key, a product such as yavc.app) is left as it is, and so is a
// string that is a sentence. The rule reads the label of cmd(id, label, ...)
// and every label: '...' in the site's own scripts, aria-label attributes
// there and in the layout, and the short text of the layout's links,
// buttons and menu items. A string that runs on with + is checked only for
// the words it has, so its last word may be a minor one.
const MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'as', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'via', 'with', 'from', 'into', 'per']);
function titleCaseProblem(label, { continues = false, continued = false } = {}) {
  const s = label.replace(/\\'/g, "'").replace(/(…|\.\.\.)$/, '').trim();
  if (!s || /[.?!;:](\s|$)/.test(s)) return null; // a sentence, or nothing
  const words = s.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^[("'“]+|[)"',”]+$/g, '');
    if (!/^[a-z][a-z'’-]*$/.test(w)) continue; // capitalised already, or not a plain word
    const first = i === 0 && !continued, last = i === words.length - 1 && !continues && words.length > 1;
    if (first || last || !MINOR_WORDS.has(w)) return w;
  }
  return null;
}
const LABEL_SOURCES = js.filter((f) => /^(apps|internal\/web\/static)\//.test(f));
rules.push({ id: 'title-case-labels', run() {
  const flag = (f, src, m, label, where) => {
    const before = src.slice(0, m.index + m[0].length - label.length - 1), after = src.slice(m.index + m[0].length);
    const word = titleCaseProblem(label, { continued: /\+\s*$/.test(before), continues: /^\s*\+/.test(after) });
    if (word) report('title-case-labels', f, m.index, `${where} "${label}" is not title case ("${word}")`);
  };
  for (const f of LABEL_SOURCES) {
    const src = text.get(f);
    each(/\bcmd\(\s*'[^']*'\s*,\s*'((?:[^'\\\n]|\\.)*)'/g, src, (m) => flag(f, src, m, m[1], 'the command label'));
    each(/\blabel:\s*'((?:[^'\\\n]|\\.)*)'/g, src, (m) => flag(f, src, m, m[1], 'the label'));
    // An attribute in markup a script builds, unless the script splices a
    // value into it.
    each(/\baria-label="([^"{}<>]+)"/g, src, (m) => { if (!/'\s*\+|\+\s*'/.test(m[1])) flag(f, src, m, m[1], 'the aria-label'); });
  }
  for (const f of files.filter((f) => /^internal\/web\/templates\/.*\.html$/.test(f))) {
    const src = text.get(f);
    each(/\b(?:aria-label|data-tooltip|title)="([^"{}<>]+)"/g, src, (m) => flag(f, src, m, m[1], 'the attribute'));
    // The text right after a link, button or menu item opens, or right before
    // a link or button closes; a template action reads as a capitalised word.
    each(/<(?:a|button|li)\b[^>]*>([^<]+)<|>([^<>]+)<\/(?:a|button)>/g, src, (m) => {
      const raw = m[1] ?? m[2], label = raw.replace(/\{\{[^}]*\}\}/g, 'X').replace(/&amp;/g, '&').trim();
      if (!label || label.split(/\s+/).length > 6) return;
      const word = titleCaseProblem(label);
      if (word) report('title-case-labels', f, m.index, `the menu or link text "${raw.trim()}" is not title case ("${word}")`);
    });
  }
} });

// The extracted workspace cannot regain the site's storage or route assumptions.
// Optional host capabilities belong in its documented adapter instead.
rules.push({id:'workspace-host-boundary',run(){
  for(const f of files.filter(f=>/^apps\/(?:content-kit|text-workspace|md-editor|md-engine|diagram-kit|diagrams|editor|docs|slides)\//.test(f)&&/\.(?:js|mjs|md|json|css)$/.test(f)&&!f.includes('/test/'))){
    each(/\bGK[ -]Companion\b/gi,text.get(f)||'',m=>report('workspace-host-boundary',f,m.index,'private host product references must stay outside the portable release'));
  }
  for(const f of js.filter(f=>f.startsWith('apps/text-workspace/'))){
    each(/\b(?:pcSiteFs|pcConfig|pcSnapshot|pcAdmin|pcLoadWindow|localStorage|sessionStorage)\b|['"]\/(?:static|applets)\//g,text.get(f),m=>report('workspace-host-boundary',f,m.index,'a site storage/global/path dependency escaped the host adapter'));
    each(/\bGK\s+Companion\b/g,text.get(f),m=>report('workspace-host-boundary',f,m.index,'host-specific product commentary must stay outside the portable workspace'));
  }
  for(const f of ['apps/editor/editor.js','apps/docs/docs.js']){
    each(/\b(?:EditorView|EditorState|CodeMirror|ProseMirror)\b/g,text.get(f)||'',m=>report('workspace-host-boundary',f,m.index,'editing implementation belongs in the shared workspace'));
  }
}});

let ran = 0;
for (const r of rules) {
  if (r.needsSince && !since) continue;
  r.run();
  ran++;
}
for (const p of problems) console.log(`${p.file}${p.line ? ':' + p.line : ''}: [${p.rule}] ${p.message}`);
console.log(`${ran} rules over ${files.length} files: ${problems.length ? problems.length + ' problem' + (problems.length === 1 ? '' : 's') : 'clean'}`);
process.exit(problems.length ? 1 : 0);
