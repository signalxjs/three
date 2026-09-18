import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { jsx, Fragment, component, signal } from '@sigx/runtime-core';
import { objectRef } from '@sigx/three-runtime';
import { createTestRoot } from './harness.js';

describe('mount', () => {
    it('renders a mesh with geometry and material into the scene', () => {
        const t = createTestRoot();
        t.render(
            jsx('mesh', {
                children: [
                    jsx('boxGeometry', { args: [2, 3, 4] }),
                    jsx('meshStandardMaterial', { color: 'hotpink' })
                ]
            })
        );
        expect(t.scene.children).toHaveLength(1);
        const mesh = t.scene.children[0] as THREE.Mesh;
        expect(mesh).toBeInstanceOf(THREE.Mesh);
        const geo = mesh.geometry as THREE.BoxGeometry;
        expect(geo).toBeInstanceOf(THREE.BoxGeometry);
        expect(geo.parameters.width).toBe(2);
        expect(geo.parameters.height).toBe(3);
        expect(geo.parameters.depth).toBe(4);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        expect(mat.color.getHexString()).toBe(new THREE.Color('hotpink').getHexString());
        // geometry/material are attached, not scene children
        expect(mesh.children).toHaveLength(0);
        t.unmount();
    });

    it('nests groups and keeps three child order equal to declared order', () => {
        const t = createTestRoot();
        t.render(
            jsx('group', {
                children: [
                    jsx('mesh', { name: 'a' }),
                    jsx('mesh', { name: 'b' }),
                    jsx('group', { name: 'c', children: jsx('mesh', { name: 'd' }) })
                ]
            })
        );
        const group = t.scene.children[0] as THREE.Group;
        expect(group.children.map((c) => c.name)).toEqual(['a', 'b', 'c']);
        expect((group.children[2] as THREE.Group).children[0].name).toBe('d');
        t.unmount();
    });

    it('<primitive object> mounts a user-owned object and never disposes it', () => {
        const t = createTestRoot();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        const dispose = vi.spyOn(mesh.geometry, 'dispose');
        t.render(jsx('primitive', { object: mesh, name: 'prim' }));
        expect(t.scene.children[0]).toBe(mesh);
        expect(mesh.name).toBe('prim');
        t.render(null);
        expect(t.scene.children).toHaveLength(0);
        expect(dispose).not.toHaveBeenCalled();
        t.unmount();
    });

    it('a ref receives the host node; objectRef unwraps the three object', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        let rawNode: unknown = null;
        t.render(
            jsx(Fragment, {
                children: [
                    jsx('mesh', { ref }),
                    jsx('group', { ref: (n: unknown) => { rawNode = n; } })
                ]
            })
        );
        expect(ref.current).toBeInstanceOf(THREE.Mesh);
        expect((rawNode as { object: unknown }).object).toBeInstanceOf(THREE.Group);
        t.render(null);
        expect(ref.current).toBeNull();
        t.unmount();
    });

    it('unmount removes objects and disposes owned geometry/material', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', { ref, children: [jsx('boxGeometry', {}), jsx('meshBasicMaterial', {})] }));
        const mesh = ref.current!;
        const g = vi.spyOn(mesh.geometry, 'dispose');
        const m = vi.spyOn(mesh.material as THREE.Material, 'dispose');
        t.render(null);
        expect(t.scene.children).toHaveLength(0);
        expect(g).toHaveBeenCalledTimes(1);
        expect(m).toHaveBeenCalledTimes(1);
        t.unmount();
    });

    it('dispose={null} opts out of disposal', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', { ref, children: jsx('boxGeometry', { dispose: null }) }));
        const g = vi.spyOn(ref.current!.geometry, 'dispose');
        t.render(null);
        expect(g).not.toHaveBeenCalled();
        t.unmount();
    });

    it('components render into the scene and re-render on signal change', () => {
        const t = createTestRoot();
        const count = signal(1);
        const Boxes = component(() => () =>
            jsx(Fragment, {
                children: Array.from({ length: count.value }, (_, i) => jsx('mesh', { key: i, name: `m${i}` }))
            })
        );
        t.render(jsx(Boxes, {}));
        expect(t.scene.children.map((c) => c.name)).toEqual(['m0']);
        count.value = 3;
        expect(t.scene.children.map((c) => c.name)).toEqual(['m0', 'm1', 'm2']);
        count.value = 2;
        expect(t.scene.children.map((c) => c.name)).toEqual(['m0', 'm1']);
        t.unmount();
    });

    it('text children never enter the scene graph', () => {
        const t = createTestRoot();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        t.render(jsx('group', { children: ['hello', jsx('mesh', {})] }));
        const group = t.scene.children[0] as THREE.Group;
        expect(group.children).toHaveLength(1);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/cannot render text/));
        warn.mockRestore();
        t.unmount();
    });

    it('conditional children toggle without disturbing siblings', () => {
        const t = createTestRoot();
        const show = signal(false);
        const App = component(() => () =>
            jsx('group', {
                children: [
                    jsx('mesh', { name: 'first' }),
                    show.value ? jsx('mesh', { name: 'middle' }) : null,
                    jsx('mesh', { name: 'last' })
                ]
            })
        );
        t.render(jsx(App, {}));
        const group = t.scene.children[0] as THREE.Group;
        expect(group.children.map((c) => c.name)).toEqual(['first', 'last']);
        show.value = true;
        expect(group.children.map((c) => c.name)).toEqual(['first', 'middle', 'last']);
        show.value = false;
        expect(group.children.map((c) => c.name)).toEqual(['first', 'last']);
        t.unmount();
    });
});
