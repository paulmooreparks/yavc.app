// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Runs the package tests: the tests that load the built content package from a host of their own, as Dinah, GK Companion and PFO
// do, in every browser. Each test serves the package itself, so no server is started here. Build the package first:
//
//   go run ./cmd/yavc-content -out /tmp/package
//   node scripts/run-package-tests.mjs /tmp/package
//
// The tests are listed in scripts/package-tests.txt, one per line, and a line may end with " | " and the browsers to use, such as
// "test-x.cjs | chromium firefox". Blank lines and lines that begin with # are ignored. A test that fails fails the run, and the run
// goes on to the others. Environment: PACKAGE_ENGINES (default chromium firefox webkit), PACKAGE_TIMEOUT the seconds one test may
// take (default 900), PACKAGE_LOGS where each test's full output is kept. Playwright must be resolvable, by NODE_PATH or by an
// install beside the repository. PACKAGE_SHARD selects a one-based index/count pair, such as 1/2, by list position. PACKAGE_LIST_ONLY=1
// prints the selected plan as JSON without running browsers, so callers can verify the union of their shards.
// PACKAGE_RESULTS writes an incremental JSON ledger; PACKAGE_PROFILE labels its package (default full, or docs for the Docs-only package).
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const artifact = process.argv[2] && resolve(process.argv[2]);
if (!artifact) { console.error('Give the folder of the built package: node scripts/run-package-tests.mjs <package folder> [test file names]'); process.exit(2); }
const engines = (process.env.PACKAGE_ENGINES || 'chromium firefox webkit').split(/\s+/).filter(Boolean);
const limit = Number(process.env.PACKAGE_TIMEOUT || 900) * 1000;
const logs = process.env.PACKAGE_LOGS || join(tmpdir(), 'yavc-package-test-logs');
mkdirSync(logs, { recursive: true });

const named = process.argv.slice(3);
let tests = named.length ? named.map(name => ({ name, engines })) :
    readFileSync(join(root, 'scripts', 'package-tests.txt'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(line => {
        const [name, only] = line.split('|').map(part => part.trim());
        return { name, engines: only ? engines.filter(engine => only.split(/\s+/).includes(engine)) : engines };
    });
for (const test of tests) { if (!/^test-[\w.-]+\.cjs$/.test(test.name)) { console.error('Not a test file name: ' + test.name); process.exit(2); } }
if (process.env.PACKAGE_SHARD) {
    const shard = /^([1-9]\d*)\/([1-9]\d*)$/.exec(process.env.PACKAGE_SHARD);
    const index = shard && Number(shard[1]), count = shard && Number(shard[2]);
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count) {
        console.error('PACKAGE_SHARD must be an index/count pair with 1 <= index <= count.'); process.exit(2);
    }
    tests = tests.filter((test, position) => position % count === index - 1);
}
tests = tests.filter(test => test.engines.length);
if (process.env.PACKAGE_LIST_ONLY === '1') { console.log(JSON.stringify(tests)); process.exit(0); }
if (!tests.length) { console.error('No package tests selected.'); process.exit(2); }

function run(test) {
    return new Promise(done => {
        const started = Date.now();
        let output = '';
        const child = spawn(process.execPath, [join('scripts', test.name), artifact, ...test.engines], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
        const timer = setTimeout(() => { output += '\nTimed out after ' + limit / 1000 + ' seconds.\n'; child.kill(); }, limit);
        child.on('error', error => { output += String(error); });
        child.on('exit', code => {
            clearTimeout(timer);
            writeFileSync(join(logs, test.name + '.log'), output);
            done({ name: test.name, pass: code === 0, seconds: Math.round((Date.now() - started) / 1000), output });
        });
    });
}

const results = [];
const ledger = [];
const saveLedger = () => {
    if (process.env.PACKAGE_RESULTS) { writeFileSync(process.env.PACKAGE_RESULTS, JSON.stringify(ledger, null, 2) + '\n'); }
};
saveLedger();
for (const test of tests) {
    const result = await run(test);
    results.push(result);
    for (const engine of test.engines) {
        ledger.push({ profile: process.env.PACKAGE_PROFILE || 'full', test: test.name, engine, pass: result.pass, duration: result.seconds });
    }
    saveLedger();
    console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + ' (' + result.seconds + ' s) in ' + test.engines.join(', '));
    if (!result.pass) { console.log(result.output.split(/\r?\n/).filter(l => l.trim() && !/^\s+at .*node:/.test(l)).slice(-14).map(l => '    ' + l.slice(0, 300)).join('\n')); }
}
const failed = results.filter(r => !r.pass);
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' package tests passed.');
if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(', ')); process.exit(1); }
