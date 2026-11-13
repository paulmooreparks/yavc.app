// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// The example in examples/diagram-picture, run against the built content package in each browser: a page with no applet draws a canvas with a
// picture the host supplies and a Mermaid diagram as PNGs with their sizes, reports a missing picture as a problem, rejects an invalid diagram
// with its mistake, and ends a Mermaid drawing with AbortError and nothing left behind (docs/diagram-picture-contract.md).
//   node scripts/test-diagram-picture-example.cjs <extracted package> [chromium firefox webkit]
const path = require('node:path');
const { run } = require(path.join(__dirname, '..', 'examples', 'diagram-picture', 'driver.cjs'));
if (!process.argv[2]) { console.error('usage: node scripts/test-diagram-picture-example.cjs <extracted package> [engines]'); process.exit(2); }
run(process.argv[2], process.argv.slice(3).length ? process.argv.slice(3) : ['chromium', 'firefox', 'webkit'], () => {}).then(report => {
    for (const engine of Object.keys(report)) { console.log(engine + ': a page with no applet draws a canvas and a Mermaid diagram as PNGs, reports a missing picture, refuses an invalid diagram, and ends an aborted drawing with nothing left behind, and fetches no engine before its kind is drawn'); }
}).catch(error => { console.error(error); process.exitCode = 1; });
