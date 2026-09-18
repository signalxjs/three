/**
 * The three update paths, per frame, over 10k meshes.
 *
 * (a) useFrame + refs is the floor. (b) signal-bound props cost per CHANGED
 * value (one effect each) — the worst case here changes all 10k, the
 * realistic case (b2) changes 100. (c) a component re-render costs per
 * element in the component regardless of how many changed.
 */
import { bench, describe } from 'vitest';
import * as THREE from 'three';
import { batch, signal } from '@sigx/reactivity';
import { jsx, Fragment, component } from '@sigx/runtime-core';
import { objectRef } from '@sigx/three-runtime';
import { benchRoot, sharedGeometry, sharedMaterial } from './bench-harness.js';

const N = 10_000;

describe(`per-frame update of ${N} positions`, () => {
    // (a) useFrame + refs
    {
        const root = benchRoot();
        const refs = Array.from({ length: N }, () => objectRef<THREE.Mesh>());
        root.render(jsx(Fragment, { children: refs.map((ref, i) => jsx('mesh', { key: i, ref, geometry: sharedGeometry, material: sharedMaterial })) }));
        const objects = refs.map((r) => r.current!);
        let t = 0;
        root.subscribe(() => {
            t += 0.016;
            for (let i = 0; i < objects.length; i++) objects[i].position.x = Math.sin(t + i);
        });
        bench('(a) useFrame writes position.x directly', () => {
            root.advance(0.016);
        });
    }

    // (b) signal-bound props
    {
        const root = benchRoot();
        const signals = Array.from({ length: N }, () => signal(0));
        root.render(jsx(Fragment, { children: signals.map((s, i) => jsx('mesh', { key: i, 'position-x': s, geometry: sharedGeometry, material: sharedMaterial })) }));
        let t = 0;
        bench('(b) 10k signal-bound position-x in one batch', () => {
            t += 0.016;
            batch(() => {
                for (let i = 0; i < signals.length; i++) signals[i].value = Math.sin(t + i);
            });
        });
    }

    // (b2) signal-bound props, 100 of 10k change per frame
    {
        const root = benchRoot();
        const signals = Array.from({ length: N }, () => signal(0));
        root.render(jsx(Fragment, { children: signals.map((s, i) => jsx('mesh', { key: i, 'position-x': s, geometry: sharedGeometry, material: sharedMaterial })) }));
        let t = 0;
        bench('(b2) 100 of 10k signal-bound position-x change', () => {
            t += 0.016;
            batch(() => {
                for (let i = 0; i < 100; i++) signals[i * 100].value = Math.sin(t + i);
            });
        });
    }

    // (c) component re-render
    {
        const root = benchRoot();
        const time = signal(0);
        const App = component(() => () =>
            jsx(Fragment, {
                children: Array.from({ length: N }, (_, i) => jsx('mesh', { key: i, 'position-x': Math.sin(time.value + i), geometry: sharedGeometry, material: sharedMaterial }))
            })
        );
        root.render(jsx(App, {}));
        bench('(c) component re-render + vnode diff', () => {
            time.value += 0.016;
        });
    }
});
