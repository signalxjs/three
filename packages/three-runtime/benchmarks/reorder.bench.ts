import { bench, describe } from 'vitest';
import { signal } from '@sigx/reactivity';
import { jsx, component } from '@sigx/runtime-core';
import { benchRoot, sharedGeometry, sharedMaterial } from './bench-harness.js';

const N = 1000;

describe(`keyed reorder of ${N} meshes`, () => {
    const root = benchRoot();
    const order = signal({ list: Array.from({ length: N }, (_, i) => i) });
    const List = component(() => () =>
        jsx('group', { children: order.list.map((i) => jsx('mesh', { key: i, geometry: sharedGeometry, material: sharedMaterial })) })
    );
    root.render(jsx(List, {}));

    bench('reverse', () => {
        order.list = order.list.slice().reverse();
    });

    bench('rotate by one', () => {
        const l = order.list;
        order.list = l.slice(1).concat(l[0]);
    });

    bench('remove middle + append', () => {
        const l = order.list.slice();
        const removed = l.splice(N >> 1, 1)[0];
        l.push(removed);
        order.list = l;
    });
});
