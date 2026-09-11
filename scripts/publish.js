#!/usr/bin/env node

/**
 * SignalX - Publish Script
 *
 * Publishes all packages in this repo to npm in dependency order.
 *
 * Usage:
 *   node scripts/publish.js [--dry-run] [--tag <tag>] [--provenance] [--allow-dirty]
 *
 * Options:
 *   --dry-run      Show what would be published without actually publishing
 *   --tag          Publish with a specific tag (e.g., beta, next)
 *   --provenance   Attach an npm provenance attestation. Requires running in a
 *                  GitHub Actions workflow with `permissions: id-token: write`.
 *   --allow-dirty  Bypass the clean-working-tree check
 *
 * Auth (same model as sigx core/lynx): whatever npm auth is ambient —
 * your `npm login` session locally, or trusted publishing (OIDC) in GitHub
 * Actions. No token plumbing; this script never touches ~/.npmrc.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Packages in dependency order (dependencies first).
// Other SignalX packages (router, store, ssg, daisyui, runtime-terminal, etc.)
// live in their own repos under https://github.com/signalxjs and are published
// from there.
const PACKAGES = [
    'packages/runtime-three',
    'packages/three',
    'packages/three-rapier',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tagIndex = args.indexOf('--tag');
const tag = tagIndex !== -1 ? args[tagIndex + 1] : null;
if (tagIndex !== -1 && (!tag || tag.startsWith('--'))) {
    // Fail fast: a missing value would silently publish under `latest`.
    console.error('❌ --tag needs a value, e.g. --tag beta');
    process.exit(1);
}
const provenance = args.includes('--provenance');
const allowDirty = args.includes('--allow-dirty');

function getPackageInfo(packagePath) {
    const packageJsonPath = join(rootDir, packagePath, 'package.json');
    if (!existsSync(packageJsonPath)) {
        return null;
    }
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return {
        name: packageJson.name,
        version: packageJson.version,
        path: packagePath,
    };
}

function isAlreadyPublished(name, version) {
    try {
        const result = execSync(`npm view ${name}@${version} version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        return result === version;
    } catch {
        return false;
    }
}

function publishPackage(pkg) {
    const fullPath = join(rootDir, pkg.path);
    // Use pnpm publish to automatically convert workspace:^ to actual versions
    const publishCmd = dryRun
        ? 'pnpm pack --dry-run'
        : `pnpm publish --access public --no-git-checks${tag ? ` --tag ${tag}` : ''}${provenance ? ' --provenance' : ''}`;

    console.log(`\n📦 ${dryRun ? 'Would publish' : 'Publishing'}: ${pkg.name}@${pkg.version}`);
    console.log(`   Path: ${pkg.path}`);

    // Skip if already published
    if (!dryRun && isAlreadyPublished(pkg.name, pkg.version)) {
        console.log(`   ⏭️  Skipped: ${pkg.name}@${pkg.version} (already published)`);
        return 'skipped';
    }

    try {
        execSync(publishCmd, {
            cwd: fullPath,
            stdio: 'inherit'
        });
        console.log(`   ✅ ${dryRun ? 'Ready' : 'Published'}: ${pkg.name}@${pkg.version}`);
        return 'published';
    } catch (error) {
        console.error(`   ❌ Failed: ${pkg.name}`);
        return 'failed';
    }
}

async function main() {
    console.log('🚀 SignalX Publisher');
    console.log('================================');

    // Lockstep guard (same model as sigx core/lynx): refuse to publish when
    // the publishable packages disagree on version.
    execSync('node scripts/check-versions.js', { cwd: rootDir, stdio: 'inherit' });

    // Pre-flight: a real publish should come from a clean, committed tree.
    if (!dryRun && !allowDirty) {
        const status = execSync('git status --porcelain', { cwd: rootDir }).toString().trim();
        if (status) {
            console.error('❌ Working tree is not clean. Commit or stash first, or pass --allow-dirty.');
            process.exit(1);
        }
    }

    if (dryRun) {
        console.log('🔍 DRY RUN MODE - No packages will be published\n');
    }

    if (tag) {
        console.log(`🏷️  Publishing with tag: ${tag}\n`);
    }

    if (provenance) {
        console.log('🔏 Provenance attestations enabled\n');
    }

    // Trusted publishing (npm OIDC) acquires a token at publish time, not
    // before — skip the whoami precheck in that mode (it would fail because
    // no token exists yet). ACTIONS_ID_TOKEN_REQUEST_TOKEN is set by GitHub
    // Actions when a job has `permissions: id-token: write`.
    const isTrustedPublishing = !!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

    if (isTrustedPublishing) {
        console.log('🔐 Trusted publishing (OIDC) — skipping npm whoami precheck\n');
    } else {
        try {
            const whoami = execSync('npm whoami', { encoding: 'utf-8' }).trim();
            console.log(`👤 Logged in as: ${whoami}\n`);
        } catch {
            console.error('❌ Not logged in to npm. Run: npm login');
            throw new Error('npm login required');
        }
    }

    // Build all packages first
    console.log('🔨 Building all packages...');
    try {
        execSync('pnpm run build', { cwd: rootDir, stdio: 'inherit' });
        console.log('✅ Build complete\n');
    } catch {
        throw new Error('Build failed');
    }

    // Publish packages in order
    const results = { published: [], skipped: [], failed: [] };

    for (const packagePath of PACKAGES) {
        const pkg = getPackageInfo(packagePath);
        if (!pkg) {
            console.warn(`⚠️  Skipping ${packagePath}: package.json not found`);
            continue;
        }

        const result = publishPackage(pkg);
        if (result === 'published') {
            results.published.push(pkg.name);
        } else if (result === 'skipped') {
            results.skipped.push(pkg.name);
        } else {
            results.failed.push(pkg.name);
            if (!dryRun) {
                console.error('\n⚠️  Stopping due to publish failure');
                break;
            }
        }
    }

    // Summary
    console.log('\n================================');
    console.log('📊 Summary');
    console.log('================================');
    if (results.published.length > 0) {
        console.log(`✅ ${dryRun ? 'Ready' : 'Published'}: ${results.published.length} packages`);
        console.log(`   ${results.published.join(', ')}`);
    }
    if (results.skipped.length > 0) {
        console.log(`⏭️  Skipped: ${results.skipped.length} packages (already published)`);
    }
    if (results.failed.length > 0) {
        console.log(`❌ Failed: ${results.failed.length} packages`);
        console.log(`   ${results.failed.join(', ')}`);
    }

    if (!dryRun && results.failed.length === 0) {
        console.log('\n🎉 All packages up to date!');
    }

    // Surface partial-publish failures as a non-zero exit so CI doesn't
    // mark a broken release as success — npm rejects, GH release publishes
    // anyway, npm-vs-tag drift, etc.
    if (results.failed.length > 0) {
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
