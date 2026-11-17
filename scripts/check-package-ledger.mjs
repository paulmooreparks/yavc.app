// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Require the full list and the Docs profile exactly once per supported engine across downloaded shard artifacts.
// node scripts/check-package-ledger.mjs <downloaded artifacts folder>
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const engines = ['chromium', 'firefox', 'webkit'];
const root = resolve(import.meta.dirname, '..');
const folder = process.argv[2];
if (!folder) { console.error('Give the folder containing downloaded package ledgers.'); process.exit(2); }
const key = row => JSON.stringify([row.profile, row.test, row.engine]);
const expected = new Map();
for (const line of readFileSync(join(root, 'scripts/package-tests.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))) {
    const [test, only] = line.split('|').map(s => s.trim());
    for (const engine of only ? only.split(/\s+/) : engines) {
        if (!engines.includes(engine)) { throw new Error('Unknown package engine: ' + engine); }
        const id = key({ profile: 'full', test, engine });
        if (expected.has(id)) { throw new Error('Duplicate package-list entry: ' + id); }
        expected.set(id, 0);
    }
}
for (const engine of engines) { expected.set(key({ profile: 'docs', test: 'test-docs-profile.cjs', engine }), 0); }
const failures = [];
let files = 0;
function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { visit(path); continue; }
        if (!entry.name.endsWith('.results.json')) { continue; }
        files++;
        const rows = JSON.parse(readFileSync(path, 'utf8'));
        if (!Array.isArray(rows)) { throw new Error('Invalid package ledger: ' + path); }
        for (const row of rows) {
            const id = key(row);
            if (!expected.has(id)) { failures.push('Unexpected test: ' + id); continue; }
            expected.set(id, expected.get(id) + 1);
            if (row.pass !== true) { failures.push('Failed test: ' + id); }
            if (!Number.isFinite(row.duration) || row.duration < 0) { failures.push('Invalid duration: ' + id); }
        }
    }
}
visit(folder);
for (const [id, count] of expected) { if (count !== 1) { failures.push('Expected once, received ' + count + ': ' + id); } }
console.log('Package ledger: ' + expected.size + ' required test/engine/profile results across ' + files + ' files.');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Every required package test passed exactly once.');
