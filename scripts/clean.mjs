#!/usr/bin/env node
// `pnpm clean` — remove every build output and dependency tree in the
// workspace. A Node script rather than a shell one-liner so it behaves the
// same on Windows, macOS and Linux.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rm = (p) => rmSync(p, { recursive: true, force: true });

for (const group of ['packages', 'examples']) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
        rm(join(dir, entry, 'dist'));
        rm(join(dir, entry, 'node_modules'));
    }
}
rm(join(root, 'node_modules'));
rm(join(root, 'coverage'));
console.log('clean: removed dist/, node_modules/ and coverage/');
