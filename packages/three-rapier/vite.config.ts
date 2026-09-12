import { defineLibConfig } from '@sigx/vite/lib';

export default defineLibConfig({
    entry: {
        index: 'src/index.ts'
    },
    // Rapier's wasm build is a peer: the app owns the (large) single copy.
    external: [/@sigx\/.*/, 'three', /^three\//, '@dimforge/rapier3d-compat'],
    jsx: true,
    importSource: '@sigx/runtime-core',
    root: import.meta.url
});
