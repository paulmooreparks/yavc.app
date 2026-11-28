// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Runs the site tests, each against a fresh server with its own empty data folder, and fails if any of them does.
//
//   node scripts/run-site-tests.mjs                 the tests in scripts/site-tests.txt
//   node scripts/run-site-tests.mjs --all           every test that talks to a server, to find which pass (nothing is promised)
//   node scripts/run-site-tests.mjs a.cjs b.cjs     only those tests
//
// The list file has one test per line. A line may end with " | " and the server flags that test needs, such as
// "test-x.cjs | -document-grouping tabbed". Blank lines and lines that begin with # are ignored. A test joins the list when
// it passes, and it is taken off only by deciding that it is wrong.
//
// A test that fails in one browser for a reason somebody has written down can be set aside in scripts/site-tests-set-aside.txt, with
// the browser, the date, an owner and the reason. A run of the list skips it in that browser and says so. A test given by name is
// always run, so a set-aside test can still be run to work on it. The server flags of a listed test apply when it is given by name.
//
// Environment: SITE_SERVER is the built server (default ./yavc), SITE_ENGINE the browser (default chromium), SITE_JOBS how many
// tests run at once (default 2), SITE_TIMEOUT the seconds one test may take (default 600), SITE_LOGS where each test's full output is kept.
// Without SITE_LOGS every run writes to a new folder under the temporary folder's yavc-site-test-logs, so a later run never
// replaces the log of a failure. Playwright must be resolvable, by NODE_PATH or by an install beside the repository.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import http from 'node:http';
import net from 'node:net';

const root = resolve(import.meta.dirname, '..');
const server = resolve(process.env.SITE_SERVER || join(root, process.platform === 'win32' ? 'yavc.exe' : 'yavc'));
const engine = process.env.SITE_ENGINE || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) { console.error('SITE_ENGINE must be chromium, firefox or webkit.'); process.exit(2); }
const jobs = Math.max(1, Number(process.env.SITE_JOBS || 2));
const limit = Number(process.env.SITE_TIMEOUT || 600) * 1000;
const logs = process.env.SITE_LOGS || join(tmpdir(), 'yavc-site-test-logs', new Date().toISOString().replace(/[:.]/g, '-') + '-' + engine + '-' + process.pid);
mkdirSync(logs, { recursive: true });

function parseList(text) {
    return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
        const [name, flags] = line.split('|').map(part => part.trim());
        return { name, flags: flags ? flags.split(/\s+/) : [] };
    });
}
/* A set-aside line is "test | browser | date | owner | reason". Every part is required, because a test set aside with no date and no
   owner is a test nobody will bring back. */
function parseSetAside(text) {
    return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
        const [name, browser, date, owner, ...reason] = line.split('|').map(part => part.trim());
        const entry = { name, browser, date, owner, reason: reason.join(' | ') };
        if (!/^test-[\w.-]+\.cjs$/.test(name || '') || !['chromium', 'firefox', 'webkit'].includes(browser) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !owner || !entry.reason) {
            console.error('A set-aside line needs a test, a browser, a date, an owner and a reason: ' + line); process.exit(2);
        }
        return entry;
    });
}
const args = process.argv.slice(2);
const listed = parseList(readFileSync(join(root, 'scripts', 'site-tests.txt'), 'utf8'));
const setAside = parseSetAside(readFileSync(join(root, 'scripts', 'site-tests-set-aside.txt'), 'utf8'));
for (const entry of setAside) { if (!listed.some(test => test.name === entry.name)) { console.error('A set-aside test is not in scripts/site-tests.txt: ' + entry.name); process.exit(2); } }
let tests, skipped = [];
if (args.includes('--all')) {
    tests = readdirSync(join(root, 'scripts')).filter(f => /^test-.*\.cjs$/.test(f) && readFileSync(join(root, 'scripts', f), 'utf8').includes('YAVC_CHROME_TEST_PORT')).sort().map(name => ({ name, flags: [] }));
} else if (args.length) {
    tests = args.map(name => ({ name, flags: listed.find(test => test.name === name)?.flags || [] }));
} else {
    skipped = setAside.filter(entry => entry.browser === engine);
    tests = listed.filter(test => !skipped.some(entry => entry.name === test.name));
}
for (const test of tests) { if (!/^test-[\w.-]+\.cjs$/.test(test.name)) { console.error('Not a site test file name: ' + test.name); process.exit(2); } }
console.log('Logs: ' + logs);
for (const entry of skipped) { console.log('SET ASIDE ' + entry.name + ' in ' + engine + ' since ' + entry.date + ', owner ' + entry.owner + ': ' + entry.reason); }

/* The operating system chooses a port that is free now. Another process could take it before the server does, so a test whose server
   did not start is tried again on a new port. */
function freePort() {
    return new Promise((done, fail) => { const probe = net.createServer(); probe.on('error', fail); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); }); });
}
function up(port) {
    return new Promise(done => { const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, response => { response.resume(); done(true); }); request.on('error', () => done(false)); request.on('timeout', () => { request.destroy(); done(false); }); });
}
async function waitFor(port, process_) {
    for (let i = 0; i < 100; i++) { if (process_.exitCode !== null) { return false; } if (await up(port)) { return true; } await new Promise(r => setTimeout(r, 200)); }
    return false;
}
function kill(child) {
    if (child.exitCode !== null) { return Promise.resolve(); }
    return new Promise(done => { child.once('exit', done); child.kill(process.platform === 'win32' ? undefined : 'SIGKILL'); setTimeout(done, 3000); });
}

async function runOne(test, port) {
    /* One try on one port. */
    const started = Date.now(), data = mkdtempSync(join(tmpdir(), 'yavc-site-data-')), log = join(logs, test.name + '.log');
    let output = '', status = 'fail';
    const host = spawn(server, ['-addr', '127.0.0.1:' + port, '-data', data, ...test.flags], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let hostOutput = ''; host.stdout.on('data', d => { hostOutput += d; }); host.stderr.on('data', d => { hostOutput += d; });
    try {
        if (!await waitFor(port, host)) { output = 'The server did not start.\n' + hostOutput; }
        else {
            const env = { ...process.env, YAVC_CHROME_TEST_PORT: String(port), CANVAS_TEST_URL: 'http://127.0.0.1:' + port + '/' };
            const child = spawn(process.execPath, [join('scripts', test.name), engine], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
            child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
            const timer = setTimeout(() => { output += '\nTimed out after ' + limit / 1000 + ' seconds.\n'; child.kill(); }, limit);
            const code = await new Promise(done => { child.on('exit', done); child.on('error', () => done(1)); });
            clearTimeout(timer);
            status = code === 0 ? 'pass' : 'fail';
        }
    } finally { await kill(host); try { rmSync(data, { recursive: true, force: true }); } catch { /* Windows may still hold the folder. */ } }
    writeFileSync(log, output + '\n--- server ---\n' + hostOutput);
    return { name: test.name, status, seconds: Math.round((Date.now() - started) / 1000), output };
}

const results = [], queue = tests.slice();
async function worker() {
    while (queue.length) {
        const test = queue.shift();
        let result = await runOne(test, await freePort());
        for (let again = 0; again < 2 && result.status !== 'pass' && result.output.startsWith('The server did not start.'); again++) { result = await runOne(test, await freePort()); }
        results.push(result);
        console.log((result.status === 'pass' ? 'PASS ' : 'FAIL ') + result.name + ' (' + result.seconds + ' s)');
        if (result.status !== 'pass') { console.log(result.output.split(/\r?\n/).filter(l => l.trim() && !/^\s+at .*node:/.test(l)).slice(-14).map(l => '    ' + l.slice(0, 300)).join('\n')); }
    }
}
await Promise.all(Array.from({ length: Math.min(jobs, tests.length) }, worker));
const failed = results.filter(r => r.status !== 'pass');
console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' site tests passed in ' + engine + '.' + (skipped.length ? ' ' + skipped.length + ' set aside.' : ''));
if (args.includes('--all')) { console.log('PASSING:\n' + results.filter(r => r.status === 'pass').map(r => r.name).sort().join('\n')); }
if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(', ')); process.exit(1); }
