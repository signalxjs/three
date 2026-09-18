import { defineLibConfig } from '@sigx/vite/lib';

export default defineLibConfig({
    entry: {
        index: 'src/index.ts',
        internals: 'src/internals.ts',
        // Side-effect entry: platform identity (default mount + element type).
        // Its OWN dist file so sideEffects can name it precisely — the index
        // entry stays fully tree-shakeable.
        platform: 'src/platform.ts',
        'jsx-runtime': 'src/jsx-runtime.ts',
        webgl: 'src/webgl.ts',
        // three/webgpu stays out of the main bundle.
        webgpu: 'src/webgpu.ts'
    },
    // three is a peer: never bundle it (two copies of three break instanceof
    // checks and double the bundle). `three/webgpu`, `three/addons/*` likewise.
    external: [/@sigx\/.*/, 'three', /^three\//],
    root: import.meta.url
});
