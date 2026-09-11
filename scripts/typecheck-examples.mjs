#!/usr/bin/env node
/**
 * typecheck-examples.mjs — type-check every example against its OWN tsconfig.
 *
 * The root `pnpm typecheck` program is the packages (tsconfig.json excludes
 * `examples`), and the examples are the copy-paste surface, so a type error
 * there is a user-facing bug. One program per example, never a shared one.
 *
 * Fails an example that has no tsconfig, and one whose config resolves to an
 * empty program (TS18003 reads like a pass — an example inheriting the root's
 * `"exclude": ["examples"]` excludes its own sources).
 *
 * Run via `pnpm typecheck:examples`. Also runs in CI.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = join(repoRoot, 'examples');

if (!existsSync(examplesDir)) {
    console.log('typecheck-examples: no examples/ directory — nothing to check.');
    process.exit(0);
}

const examples = readdirSync(examplesDir)
    .map((name) => join(examplesDir, name))
    .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, 'package.json')));

if (examples.length === 0) {
    console.log('typecheck-examples: no examples yet — nothing to check.');
    process.exit(0);
}

let failed = 0;
for (const dir of examples) {
    const rel = relative(repoRoot, dir);
    const tsconfig = join(dir, 'tsconfig.json');
    if (!existsSync(tsconfig)) {
        console.error(`❌ ${rel}: no tsconfig.json (every example needs one, extending the root config)`);
        failed++;
        continue;
    }
    try {
        // `--listFilesOnly` would be cheaper, but tsgo's flag coverage varies
        // between previews; a full --noEmit pass is what CI runs anyway.
        const out = execSync(`pnpm exec tsgo --noEmit -p "${tsconfig}"`, {
            cwd: repoRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        if (/TS18003/.test(out)) throw new Error('empty program (TS18003)');
        console.log(`✅ ${rel}`);
    } catch (err) {
        const text = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n');
        console.error(`❌ ${rel}\n${text}`);
        failed++;
    }
}

if (failed) {
    console.error(`\n${failed} example(s) failed type-checking.`);
    process.exit(1);
}
console.log(`\nAll ${examples.length} example(s) type-check.`);
