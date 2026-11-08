// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs/promises'), path = require('node:path');
const assert = require('node:assert/strict'), crypto = require('node:crypto');

(async function () {
    const artifact = path.resolve(process.argv[2]);
    const base = new URL(process.argv[3] || 'http://127.0.0.1:8445/applets/');
    const local = JSON.parse(await fs.readFile(path.join(artifact, 'manifest.json'), 'utf8'));
    const response = await fetch(new URL('content-kit/release.json', base));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), local);
    let count = 0;
    for (const file of local.files.filter(file => file.path.startsWith('content/'))) {
        const url = new URL(file.path.slice('content/'.length), base);
        const served = await fetch(url);
        assert.equal(served.status, 200, url.href);
        const digest = crypto.createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex');
        assert.equal(digest, file.sha256, url.href);
        count++;
    }
    console.log(count + ' served assets match portable release ' + local.digest);
})().catch(error => { console.error(error); process.exitCode = 1; });
