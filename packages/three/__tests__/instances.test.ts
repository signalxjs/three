import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { jsx } from '@sigx/runtime-core';
import { useInstances } from '@sigx/three';
import { createTestRoot } from '../../runtime-three/__tests__/harness.js';

describe('useInstances', () => {
    it('composes typed-array transforms into the instance matrices without allocating per instance', () => {
        const t = createTestRoot();
        const inst = useInstances(3, { color: true });
        expect(inst.quaternion[3]).toBe(1);
        expect(inst.scale[0]).toBe(1);
        t.render(jsx('instancedMesh', { ref: inst.ref, args: [new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 3] }));
        const mesh = inst.mesh!;
        expect(mesh).toBeInstanceOf(THREE.InstancedMesh);

        inst.setPosition(1, 5, 6, 7);
        inst.setScale(2, 2, 2, 2);
        inst.setColor(0, 1, 0, 0);
        const before = new THREE.Matrix4();
        const m = new THREE.Matrix4();
        const versionBefore = mesh.instanceMatrix.version;
        inst.commit();
        expect(mesh.instanceMatrix.version).toBeGreaterThan(versionBefore); // needsUpdate = true bumps it
        mesh.getMatrixAt(1, m);
        const p = new THREE.Vector3();
        m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
        expect(p.toArray()).toEqual([5, 6, 7]);
        mesh.getMatrixAt(2, m);
        expect(m.elements[0]).toBe(2);
        mesh.getMatrixAt(0, before);
        expect(before.elements[12]).toBe(0);
        const c = new THREE.Color();
        mesh.getColorAt(0, c);
        expect(c.r).toBe(1);
        expect(c.g).toBe(0);

        // steady state: repeated commits are idempotent
        inst.commit();
        inst.commit();
        mesh.getMatrixAt(1, m);
        m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
        expect(p.toArray()).toEqual([5, 6, 7]);
        t.unmount();
    });
});
