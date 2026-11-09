// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{compare}=require('./obsidian-proof/compare.cjs'),{fixtures}=require('./obsidian-proof/fixtures.cjs');
test('Native Canvas observer permits documented default heads and harmless disjoint order only',()=>{
    const doc=fixtures().extended,changed=structuredClone(doc);
    delete changed.edges[0].fromEnd;delete changed.edges[0].toEnd;[changed.nodes[5],changed.nodes[6]]=[changed.nodes[6],changed.nodes[5]];assert.doesNotThrow(()=>compare(changed,doc));
    const overlap=structuredClone(doc);[overlap.nodes[0],overlap.nodes[1]]=[overlap.nodes[1],overlap.nodes[0]];assert.throws(()=>compare(overlap,doc),/Overlapping node order/);
    const geometry=structuredClone(doc);geometry.nodes[1].width++;assert.throws(()=>compare(geometry,doc));
    const metadata=structuredClone(doc);delete metadata.nodes[1].foreign;assert.throws(()=>compare(metadata,doc));
    const endpoint=structuredClone(doc);endpoint.edges[0].toEnd='none';assert.throws(()=>compare(endpoint,doc));
});
