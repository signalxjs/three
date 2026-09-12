import { defineLibConfig } from '@sigx/vite/lib';

export default defineLibConfig({
    entry: {
        index: 'src/index.ts'
    },
    external: [/@sigx\/.*/, 'three', /^three\//],
    // <Canvas> and friends are TSX. Target runtime-core's jsx factory directly:
    // the components render under whichever renderer hosts them.
    jsx: true,
    importSource: '@sigx/runtime-core',
    root: import.meta.url
});
