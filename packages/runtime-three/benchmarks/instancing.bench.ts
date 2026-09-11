import { bench, describe } from 'vitest';
import * as THREE from 'three';
import { jsx, Fragment } from '@sigx/runtime-core';
import { objectRef } from '@sigx/runtime-three';
import { benchRoot, sharedGeometry, sharedMaterial } from './bench-harness.js';

const N = 10_000;

describe(`${N} objects per frame: instancedMesh vs meshes`, () => {
    {
        const root = benchRoot();
        const ref = objectRef<THREE.InstancedMesh>();
        root.render(jsx('instancedMesh', { ref, args: [sharedGeometry, sharedMaterial, N] }));
        const inst = ref.current!;
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        let t = 0;
        root.subscribe(() => {
            t += 0.016;
            for (let i = 0; i < N; i++) {
                p.set(Math.sin(t + i), 0, 0);
                inst.setMatrixAt(i, m.compose(p, q, s));
            }
            inst.instanceMatrix.needsUpdate = true;
        });
        bench('instancedMesh setMatrixAt', () => {
            root.advance(0.016);
        });
    }
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
        bench('10k meshes position.x', () => {
            root.advance(0.016);
        });
    }
});
