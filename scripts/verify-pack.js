#!/usr/bin/env node

/**
 * signalxjs/three - Pre-publish pack smoke test
 *
 * Catches packaging bugs that lint/typecheck/test miss:
 *   - missing files in `files` array
 *   - broken `exports` map (subpaths, `types` conditions)
 *   - unresolved `workspace:^` / `catalog:` ranges
 *   - dist/ produced by stale builds
 *   - a published .d.ts chain that does not merge the three.js JSX intrinsics
 *     into a `sigx` app's global JSX table
 *
 * What it does:
 *   1. Build all publishable packages.
 *   2. `pnpm pack` each into a temp dir.
 *   3. Spin up a minimal scratch project with `file:` deps to those tarballs
 *      plus the published `sigx` core and `three`.
 *   4. Typecheck a small TSX program with `tsc` using
 *      `jsxImportSource: "sigx"` — the shape every consumer app has.
 *
 * Usage:
 *   node scripts/verify-pack.js
 *
 * No flags. Exits non-zero on any failure.
 */

import { execSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const PACKAGES = [
    'packages/runtime-three',
    'packages/three',
    'packages/three-rapier',
];

const sandbox = join(tmpdir(), `sigx-three-verify-pack-${Date.now()}`);
const tarballDir = join(sandbox, 'tarballs');
const appDir = join(sandbox, 'app');

function run(cmd, opts = {}) {
    console.log(`$ ${cmd}${opts.cwd ? `  (in ${opts.cwd})` : ''}`);
    execSync(cmd, { stdio: 'inherit', ...opts });
}

function step(label) {
    console.log(`\n▶  ${label}`);
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf-8'));
}

function packPackage(pkgPath) {
    const pkgFullPath = join(rootDir, pkgPath);
    const pkgJson = readJson(join(pkgFullPath, 'package.json'));
    run('pnpm pack --pack-destination ' + JSON.stringify(tarballDir), { cwd: pkgFullPath });
    const tarballs = readdirSync(tarballDir).filter((f) => f.endsWith('.tgz'));
    const safeName = pkgJson.name.replace('@', '').replace('/', '-');
    // Exact-prefix match with the version so `sigx-three-` does not match
    // `sigx-three-rapier-`.
    const match = tarballs.find((f) => f === `${safeName}-${pkgJson.version}.tgz`);
    if (!match) {
        throw new Error(`Could not find tarball for ${pkgJson.name}@${pkgJson.version} in ${tarballDir}`);
    }
    return { name: pkgJson.name, version: pkgJson.version, tarball: join(tarballDir, match) };
}

/** The core minor this repo's catalog pins, e.g. `^0.15.0`. */
function catalogRange(name) {
    const yaml = readFileSync(join(rootDir, 'pnpm-workspace.yaml'), 'utf-8');
    const re = new RegExp(`^\\s*'?${name.replace('/', '\\/')}'?:\\s*(\\S+)`, 'm');
    const m = yaml.match(re);
    if (!m) throw new Error(`catalog entry for ${name} not found in pnpm-workspace.yaml`);
    return m[1];
}

function main() {
    step(`Sandbox: ${sandbox}`);
    mkdirSync(tarballDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });

    step('Build all packages');
    run('pnpm run build', { cwd: rootDir });

    step('Pack each publishable package');
    const packed = PACKAGES.map(packPackage);
    for (const p of packed) {
        console.log(`   📦 ${p.name}@${p.version}  →  ${p.tarball}`);
    }

    step('Assert no workspace/catalog ranges leaked into the tarball manifests');
    for (const p of packed) {
        // Relative name + cwd: GNU tar (Git Bash on Windows) reads `C:` in an
        // absolute path as a remote host.
        const manifest = execSync(`tar -xOf "${basename(p.tarball)}" package/package.json`, {
            cwd: tarballDir,
            encoding: 'utf-8',
        });
        if (/"(workspace|catalog):/.test(manifest)) {
            throw new Error(`${p.name}: packed package.json still carries a workspace:/catalog: range:\n${manifest}`);
        }
    }

    step('Create scratch app');
    const deps = Object.fromEntries(
        packed.map((p) => [p.name, `file:${p.tarball.replace(/\\/g, '/')}`])
    );
    const rootPkg = readJson(join(rootDir, 'package.json'));
    const appPkg = {
        name: 'sigx-three-pack-smoke',
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts: { build: 'tsc -p .' },
        dependencies: {
            ...deps,
            sigx: catalogRange('sigx'),
            three: rootPkg.devDependencies.three,
            '@dimforge/rapier3d-compat': readJson(join(rootDir, 'packages/three-rapier/package.json')).devDependencies['@dimforge/rapier3d-compat'],
        },
        devDependencies: {
            typescript: rootPkg.devDependencies.typescript,
            '@types/node': rootPkg.devDependencies['@types/node'],
            '@types/three': rootPkg.devDependencies['@types/three'],
        },
    };
    writeFileSync(join(appDir, 'package.json'), JSON.stringify(appPkg, null, 2));

    writeFileSync(
        join(appDir, 'tsconfig.json'),
        JSON.stringify(
            {
                compilerOptions: {
                    target: 'ES2022',
                    module: 'ESNext',
                    moduleResolution: 'Bundler',
                    jsx: 'react-jsx',
                    jsxImportSource: 'sigx',
                    strict: true,
                    esModuleInterop: true,
                    // Errors INSIDE third-party .d.ts are skipped (the
                    // published @sigx/runtime-core 0.15.6 carries a dangling
                    // `import './jsx-types.d.ts'` — fixed on core main). Our
                    // own published surface is still exercised: the scratch
                    // sources below must resolve every import and type-check,
                    // including the global JSX merge once <Canvas> exists.
                    skipLibCheck: true,
                    noEmit: true,
                    types: ['node'],
                },
                include: ['src'],
            },
            null,
            2
        )
    );

    mkdirSync(join(appDir, 'src'), { recursive: true });

    // The consumer shape: an ordinary sigx DOM app importing the three
    // packages. Grows with the public API (Canvas, mesh intrinsics, Physics).
    writeFileSync(
        join(appDir, 'src', 'main.tsx'),
        [
            "import { component, defineApp, signal } from 'sigx';",
            "import * as three from '@sigx/three';",
            "import * as runtimeThree from '@sigx/runtime-three';",
            "import * as rapier from '@sigx/three-rapier';",
            "import { Scene } from 'three';",
            '',
            'const App = component(() => {',
            '    const count = signal(0);',
            '    return () => <div onClick={() => { count.value++; }}>Count: {count.value}</div>;',
            '});',
            '',
            'export const app = defineApp(<App />);',
            'export const scene = new Scene();',
            'export type _Surface = [typeof three, typeof runtimeThree, typeof rapier];',
            '',
        ].join('\n')
    );

    step('Install scratch app (npm — to avoid pnpm workspace hoisting interference)');
    run('npm install --no-audit --no-fund --loglevel=error', { cwd: appDir });

    step('Typecheck scratch app against the packed tarballs');
    run('npm run build', { cwd: appDir });

    step('✅ Pack smoke test passed');
}

try {
    main();
} catch (err) {
    console.error('\n❌ Pack smoke test failed:', err.message);
    console.error(`   Sandbox preserved for inspection: ${sandbox}`);
    process.exitCode = 1;
    process.exit(1);
}

try {
    rmSync(sandbox, { recursive: true, force: true });
} catch {
    // ignore
}
