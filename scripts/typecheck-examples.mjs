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
import { spawnSync } from 'node:child_process';

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
    // A full --noEmit pass is what CI runs anyway. Both streams are captured:
    // tsgo may report diagnostics (incl. the TS18003 empty-program case this
    // guards against) on either.
    const result = spawnSync('pnpm', ['exec', 'tsgo', '--noEmit', '-p', tsconfig], {
        cwd: repoRoot,
        encoding: 'utf-8',
        shell: true
    });
    const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.status !== 0 || /TS18003/.test(text)) {
        console.error(`❌ ${rel}\n${text.trim() || (result.error ? result.error.message : `exit code ${result.status}`)}`);
        failed++;
        continue;
    }
    console.log(`✅ ${rel}`);
}

if (failed) {
    console.error(`\n${failed} example(s) failed type-checking.`);
    process.exit(1);
}
console.log(`\nAll ${examples.length} example(s) type-check.`);
