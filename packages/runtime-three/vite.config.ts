import { defineLibConfig } from '@sigx/vite/lib';

export default defineLibConfig({
    entry: {
        index: 'src/index.ts'
    },
    // three is a peer: never bundle it (two copies of three break instanceof
    // checks and double the bundle). `three/webgpu`, `three/addons/*` likewise.
    external: [/@sigx\/.*/, 'three', /^three\//],
    root: import.meta.url
});
