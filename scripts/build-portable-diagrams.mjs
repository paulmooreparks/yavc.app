// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Compatibility entry point for the complete portable content release builder.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw new Error('Supply a new output directory outside the checkout.');
execFileSync('go',['run','./cmd/yavc-content','-out',resolve(process.argv[2])],{cwd:root,stdio:'inherit'});
