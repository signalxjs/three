import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Tests run against package sources, which use the `__DEV__` compile-time
// flag. A static `define` won't do: Vite substitutes `process.env.NODE_ENV`
// inside define values at transform time, freezing the flag, while a suite
// may flip NODE_ENV at runtime to exercise production branches. A global
// getter keeps the lookup dynamic per access. (Same setup as signalxjs/core.)
Object.defineProperty(globalThis, '__DEV__', {
    configurable: true,
    get: () => process.env.NODE_ENV !== 'production'
});

// The version `defineLibConfig` stamps into a package build; all packages here
// are on one version line (bump-version.js), so any manifest is the truth.
const { version } = JSON.parse(
    readFileSync(join(process.cwd(), 'packages/runtime-three/package.json'), 'utf-8')
) as { version: string };
Object.defineProperty(globalThis, '__SIGX_VERSION__', {
    configurable: true,
    value: version
});
