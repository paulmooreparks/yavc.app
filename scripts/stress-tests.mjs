// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Runs the same tests again and again for a fixed time, to reproduce a failure that nobody can reproduce on demand. The stress
// workflow starts it on the hosted runner (.github/workflows/stress.yml); it is not meant for a working desktop.
//
//   node scripts/stress-tests.mjs site    <minutes> test-a.cjs [test-b.cjs ...]
//   node scripts/stress-tests.mjs package <minutes> <package folder> test-a.cjs [test-b.cjs ...]
//
// Each round runs the named tests once through the usual runner (run-site-tests.mjs or run-package-tests.mjs), with the runner's own
// environment (SITE_ENGINE, SITE_JOBS, PACKAGE_ENGINES and so on). A round's logs go to a folder of its own under STRESS_LOGS
// (default: a new folder in the temporary folder). The logs of a round that passed are deleted, and those of a round that failed
// are kept. A new round starts only while time is left, so the run ends within one round of the limit. The exit status is 1 when
// any round failed, which is the outcome a stress run is looking for, and 0 when every round passed.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [kind, minutesText, ...rest] = process.argv.slice(2);
const minutes = Number(minutesText);
const folder = kind === 'package' ? rest.shift() : null;
const tests = rest;
const usage = 'node scripts/stress-tests.mjs site|package <minutes> [<package folder>] test-a.cjs [test-b.cjs ...]';
if (!['site', 'package'].includes(kind) || !(minutes > 0 && minutes <= 300) || !tests.length || (kind === 'package' && !folder)) { console.error(usage); process.exit(2); }
for (const name of tests) { if (!/^test-[\w.-]+\.cjs$/.test(name)) { console.error('Not a test file name: ' + name); process.exit(2); } }

const logs = process.env.STRESS_LOGS ? resolve(process.env.STRESS_LOGS) : mkdtempSync(join(tmpdir(), 'yavc-stress-'));
mkdirSync(logs, { recursive: true });
const runner = kind === 'site' ? ['scripts/run-site-tests.mjs', ...tests] : ['scripts/run-package-tests.mjs', resolve(folder), ...tests];
const logVariable = kind === 'site' ? 'SITE_LOGS' : 'PACKAGE_LOGS';

function round(number) {
    return new Promise(done => {
        const roundLogs = join(logs, 'round-' + String(number).padStart(4, '0'));
        let output = '';
        const child = spawn(process.execPath, runner, { cwd: root, env: { ...process.env, [logVariable]: roundLogs }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
        child.on('error', error => { output += String(error); });
        child.on('exit', code => done({ number, pass: code === 0, output, roundLogs }));
    });
}

const started = Date.now(), deadline = started + minutes * 60000, failures = [];
let rounds = 0;
console.log('Stress: ' + tests.join(' ') + ' (' + kind + ') for ' + minutes + ' minutes. Logs: ' + logs);
while (Date.now() < deadline) {
    const result = await round(++rounds);
    if (result.pass) { rmSync(result.roundLogs, { recursive: true, force: true }); }
    else {
        failures.push(result);
        console.log('Round ' + result.number + ' FAILED. Its logs are in ' + result.roundLogs);
        console.log(result.output.split(/\r?\n/).filter(line => line.trim()).slice(-30).map(line => '    ' + line.slice(0, 300)).join('\n'));
    }
    if (rounds % 10 === 0) { console.log(rounds + ' rounds, ' + failures.length + ' failed, ' + Math.round((Date.now() - started) / 60000) + ' minutes.'); }
}
const summary = rounds + ' rounds in ' + Math.round((Date.now() - started) / 60000) + ' minutes: ' + (rounds - failures.length) + ' passed, ' + failures.length + ' failed' +
    (failures.length ? ' (rounds ' + failures.map(f => f.number).join(', ') + ').' : '.');
console.log('\n' + summary);
if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Stress run\n\n' + tests.map(name => '`' + name + '`').join(' ') + ', ' + kind + ' tests.\n\n' + summary + '\n');
}
process.exit(failures.length ? 1 : 0);
