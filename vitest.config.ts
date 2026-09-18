import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    // Vite 8 compiles JSX with Oxc. The renderer packages target
    // `@sigx/runtime-core` directly (renderer-neutral jsx factory); a test that
    // needs the DOM renderer imports it explicitly.
    oxc: {
        jsx: {
            runtime: 'automatic',
            importSource: '@sigx/runtime-core'
        }
    },
    test: {
        // three's scene graph is pure JS — no DOM needed. Tests for <Canvas>
        // and the input composables opt in per file with
        // `// @vitest-environment happy-dom`.
        environment: 'node',
        setupFiles: ['./vitest.setup.ts'],
        include: ['packages/**/__tests__/**/*.test.{ts,tsx}'],
        exclude: ['**/node_modules/**', '**/dist/**'],
        // Rapier's wasm init in a fresh worker can take a while on CI.
        testTimeout: 20_000,
        typecheck: {
            enabled: true,
            include: ['packages/**/__tests__/**/*.test-d.{ts,tsx}']
        },
        benchmark: {
            include: ['packages/**/benchmarks/**/*.bench.{ts,tsx}']
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['packages/*/src/**/*.{ts,tsx}'],
            exclude: ['**/*.d.ts']
        }
    },
    resolve: {
        alias: {
            // Longest-prefix aliases first, or '@sigx/three-runtime' would
            // swallow its own subpath imports.
            '@sigx/three-runtime/internals': here('packages/three-runtime/src/internals.ts'),
            '@sigx/three-runtime/platform': here('packages/three-runtime/src/platform.ts'),
            '@sigx/three-runtime/jsx-runtime': here('packages/three-runtime/src/jsx-runtime.ts'),
            '@sigx/three-runtime/jsx-dev-runtime': here('packages/three-runtime/src/jsx-runtime.ts'),
            '@sigx/three-runtime/webgl': here('packages/three-runtime/src/webgl.ts'),
            '@sigx/three-runtime/webgpu': here('packages/three-runtime/src/webgpu.ts'),
            '@sigx/three-runtime': here('packages/three-runtime/src/index.ts'),
            '@sigx/three-rapier': here('packages/three-rapier/src/index.ts'),
            '@sigx/three': here('packages/three/src/index.ts')
        }
    }
});
