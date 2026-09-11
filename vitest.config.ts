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
            // Longest-prefix aliases first, or '@sigx/runtime-three' would
            // swallow its own subpath imports.
            '@sigx/runtime-three/internals': here('packages/runtime-three/src/internals.ts'),
            '@sigx/runtime-three/platform': here('packages/runtime-three/src/platform.ts'),
            '@sigx/runtime-three/jsx-runtime': here('packages/runtime-three/src/jsx-runtime.ts'),
            '@sigx/runtime-three/jsx-dev-runtime': here('packages/runtime-three/src/jsx-runtime.ts'),
            '@sigx/runtime-three/webgl': here('packages/runtime-three/src/webgl.ts'),
            '@sigx/runtime-three/webgpu': here('packages/runtime-three/src/webgpu.ts'),
            '@sigx/runtime-three': here('packages/runtime-three/src/index.ts'),
            '@sigx/three-rapier': here('packages/three-rapier/src/index.ts'),
            '@sigx/three': here('packages/three/src/index.ts')
        }
    }
});
