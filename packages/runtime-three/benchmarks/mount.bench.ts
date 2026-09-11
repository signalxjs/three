import { bench, describe } from 'vitest';
import { jsx, Fragment } from '@sigx/runtime-core';
import { benchRoot, sharedGeometry, sharedMaterial } from './bench-harness.js';

const N = 10_000;

describe(`mount ${N} meshes`, () => {
    bench('shared geometry/material via props', () => {
        const root = benchRoot();
        root.render(jsx(Fragment, {
            children: Array.from({ length: N }, (_, i) => jsx('mesh', { key: i, geometry: sharedGeometry, material: sharedMaterial, position: [i, 0, 0] }))
        }));
        root.unmount();
    });

    bench('own geometry/material children (1k)', () => {
        const root = benchRoot();
        root.render(jsx(Fragment, {
            children: Array.from({ length: 1000 }, (_, i) => jsx('mesh', {
                key: i,
                children: [jsx('boxGeometry', { args: [1, 1, 1] }), jsx('meshBasicMaterial', { color: 'red' })]
            }))
        }));
        root.unmount();
    });
});
