/**
 * Ambient declarations shared by the workspace's type-check program and by
 * every example (each example's tsconfig names this file in its `include`).
 *
 * Package sources reference `__DEV__`, the compile-time flag each package
 * declares in its own `src/env.d.ts` and the bundler replaces. Examples and
 * tests resolve packages to SOURCE through the path aliases, so the flag has
 * to be declared once here for their programs too.
 */

/** Compile-time dev flag: `false` in the prod dist, a NODE_ENV check in dev. */
declare const __DEV__: boolean;

/**
 * The package's own version, replaced at build time by `defineLibConfig`
 * from its package.json; `vitest.setup.ts` defines it for tests. Read via
 * `typeof` so an unbundled evaluation resolves to `'unknown'`, not a throw.
 */
declare const __SIGX_VERSION__: string;
