import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { jsx } from '@sigx/runtime-core';
import { objectRef } from '@sigx/runtime-three';
import { createTestRoot } from './harness.js';

describe('attach', () => {
    it('attaches a texture to a material slot with attach="map"', () => {
        const t = createTestRoot();
        const matRef = objectRef<THREE.MeshBasicMaterial>();
        const texRef = objectRef<THREE.Texture>();
        t.render(jsx('mesh', { children: jsx('meshBasicMaterial', { ref: matRef, children: jsx('texture', { ref: texRef, attach: 'map' }) }) }));
        expect(matRef.current!.map).toBe(texRef.current);
        t.render(jsx('mesh', { children: jsx('meshBasicMaterial', { ref: matRef }) }));
        expect(matRef.current!.map).toBeNull();
        t.unmount();
    });

    it('attaches through a dashed path on the mesh (material-map)', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', { ref, children: [jsx('meshBasicMaterial', {}), jsx('texture', { attach: 'material-map' })] }));
        expect((ref.current!.material as THREE.MeshBasicMaterial).map).toBeInstanceOf(THREE.Texture);
        t.unmount();
    });

    it('attaches into an array slot (material-0 / material-1)', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', {
            ref,
            material: [],
            children: [
                jsx('meshBasicMaterial', { attach: 'material-0', name: 'a' }),
                jsx('meshStandardMaterial', { attach: 'material-1', name: 'b' })
            ]
        }));
        const materials = ref.current!.material as THREE.Material[];
        expect(materials.map((m) => m.name)).toEqual(['a', 'b']);
        t.unmount();
    });

    it('supports a function attach with cleanup', () => {
        const t = createTestRoot();
        const log: string[] = [];
        t.render(jsx('mesh', {
            children: jsx('boxGeometry', {
                attach: (parent: THREE.Mesh, self: THREE.BoxGeometry) => {
                    parent.geometry = self;
                    log.push('attach');
                    return () => log.push('detach');
                }
            })
        }));
        expect(log).toEqual(['attach']);
        t.render(null);
        expect(log).toEqual(['attach', 'detach']);
        t.unmount();
    });

    it('fog attaches to the scene by kind', () => {
        const t = createTestRoot();
        t.render(jsx('fog', { args: ['#ffffff', 1, 10] }));
        expect(t.scene.fog).toBeInstanceOf(THREE.Fog);
        t.render(null);
        expect(t.scene.fog).toBeNull();
        t.unmount();
    });

    it('errors on a non-Object3D child without an attach', () => {
        const t = createTestRoot();
        expect(() => t.render(jsx('mesh', { children: jsx('texture', {}) }))).toThrow(/explicit attach/);
        t.unmount();
    });
});
