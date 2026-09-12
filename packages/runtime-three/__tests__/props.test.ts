import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { jsx, component, signal } from '@sigx/runtime-core';
import { batch, computed } from '@sigx/reactivity';
import { objectRef } from '@sigx/runtime-three';
import { createTestRoot } from './harness.js';

describe('props', () => {
    it('applies tuples, scalars and instances to vectors in place', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', { ref, position: [1, 2, 3], scale: 2, rotation: [0, Math.PI, 0, 'YXZ'] }));
        const mesh = ref.current!;
        const pos = mesh.position;
        expect(pos.toArray()).toEqual([1, 2, 3]);
        expect(mesh.scale.toArray()).toEqual([2, 2, 2]);
        expect(mesh.rotation.y).toBeCloseTo(Math.PI);
        expect(mesh.rotation.order).toBe('YXZ');
        t.render(jsx('mesh', { ref, position: new THREE.Vector3(4, 5, 6) }));
        expect(mesh.position).toBe(pos); // same instance, copied into
        expect(pos.toArray()).toEqual([4, 5, 6]);
        t.unmount();
    });

    it('sets colors from strings, numbers and Color instances', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.MeshBasicMaterial>();
        t.render(jsx('mesh', { children: jsx('meshBasicMaterial', { ref, color: 'red' }) }));
        const mat = ref.current!;
        expect(mat.color.getHex()).toBe(0xff0000);
        t.render(jsx('mesh', { children: jsx('meshBasicMaterial', { ref, color: 0x00ff00 }) }));
        expect(mat.color.getHex()).toBe(0x00ff00);
        t.render(jsx('mesh', { children: jsx('meshBasicMaterial', { ref, color: new THREE.Color('blue') }) }));
        expect(mat.color.getHex()).toBe(0x0000ff);
        t.unmount();
    });

    it('resolves dashed paths', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', { ref, 'position-x': 7, 'scale-z': 3, children: jsx('meshBasicMaterial', {}) }));
        const mesh = ref.current!;
        expect(mesh.position.x).toBe(7);
        expect(mesh.scale.z).toBe(3);
        t.render(jsx('mesh', { ref, 'material-color': 'green', 'material-opacity': 0.5, children: jsx('meshBasicMaterial', {}) }));
        expect((mesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x008000);
        expect((mesh.material as THREE.MeshBasicMaterial).opacity).toBe(0.5);
        t.unmount();
    });

    it('assigns plain values, merges userData, and treats three callbacks as properties', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        const onBeforeRender = vi.fn();
        t.render(jsx('mesh', { ref, name: 'm', visible: false, renderOrder: 3, userData: { a: 1 }, onBeforeRender }));
        const mesh = ref.current!;
        expect(mesh.name).toBe('m');
        expect(mesh.visible).toBe(false);
        expect(mesh.renderOrder).toBe(3);
        expect(mesh.userData).toEqual({ a: 1 });
        expect(mesh.onBeforeRender).toBe(onBeforeRender);
        t.render(jsx('mesh', { ref, userData: { b: 2 } }));
        expect(mesh.userData).toEqual({ a: 1, b: 2 });
        expect(Object.prototype.hasOwnProperty.call(mesh, 'onBeforeRender')).toBe(false);
        t.unmount();
    });

    it('restores class defaults when a prop is removed', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', { ref, position: [1, 1, 1], visible: false, renderOrder: 9 }));
        const mesh = ref.current!;
        t.render(jsx('mesh', { ref }));
        expect(mesh.position.toArray()).toEqual([0, 0, 0]);
        expect(mesh.visible).toBe(true);
        expect(mesh.renderOrder).toBe(0);
        t.unmount();
    });

    it('raycast={null} disables raycasting on the object', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', { ref, raycast: null }));
        expect(ref.current!.raycast).not.toBe(THREE.Mesh.prototype.raycast);
        // a removed prop arrives as null too — stays disabled
        t.render(jsx('mesh', { ref }));
        expect(ref.current!.raycast).not.toBe(THREE.Mesh.prototype.raycast);
        t.render(jsx('mesh', { ref, raycast: THREE.Mesh.prototype.raycast }));
        expect(ref.current!.raycast).toBe(THREE.Mesh.prototype.raycast);
        t.unmount();
    });

    it('reconstructs the object when args change and re-places children', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.Mesh>();
        const geoRef = objectRef<THREE.BoxGeometry>();
        t.render(jsx('mesh', { ref, name: 'm', children: jsx('boxGeometry', { ref: geoRef, args: [1, 1, 1] }) }));
        const first = geoRef.current!;
        const dispose = vi.spyOn(first, 'dispose');
        t.render(jsx('mesh', { ref, name: 'm', children: jsx('boxGeometry', { ref: geoRef, args: [2, 2, 2] }) }));
        const second = geoRef.current!;
        expect(second).not.toBe(first);
        expect(second.parameters.width).toBe(2);
        expect(ref.current!.geometry).toBe(second);
        expect(dispose).toHaveBeenCalledTimes(1);
        // same args → no reconstruction
        t.render(jsx('mesh', { ref, name: 'm', children: jsx('boxGeometry', { ref: geoRef, args: [2, 2, 2] }) }));
        expect(geoRef.current).toBe(second);
        t.unmount();
    });

    it('reconstructing an Object3D keeps its scene position and children', () => {
        const t = createTestRoot();
        const ref = objectRef<THREE.InstancedMesh>();
        const App = component<{ count: number }>((ctx) => () =>
            jsx('group', {
                children: [
                    jsx('mesh', { name: 'before' }),
                    jsx('instancedMesh', { ref, name: 'inst', args: [undefined, undefined, ctx.props.count], children: jsx('boxGeometry', {}) }),
                    jsx('mesh', { name: 'after' })
                ]
            })
        );
        const count = signal(10);
        const Outer = component(() => () => jsx(App, { count: count.value }));
        t.render(jsx(Outer, {}));
        const group = t.scene.children[0] as THREE.Group;
        const first = ref.current!;
        expect(first.count).toBe(10);
        expect(first.geometry).toBeInstanceOf(THREE.BoxGeometry);
        count.value = 20;
        const second = ref.current!;
        expect(second).not.toBe(first);
        expect(second.count).toBe(20);
        expect(group.children.map((c) => c.name)).toEqual(['before', 'inst', 'after']);
        expect(second.geometry).toBeInstanceOf(THREE.BoxGeometry);
        t.unmount();
    });

    it('signal-bound props update the object without re-rendering the component', () => {
        const t = createTestRoot();
        const x = signal(1);
        const color = signal('red');
        const doubled = computed(() => x.value * 2);
        const ref = objectRef<THREE.Mesh>();
        const matRef = objectRef<THREE.MeshBasicMaterial>();
        let renders = 0;
        const App = component(() => () => {
            renders++;
            return jsx('mesh', {
                ref,
                'position-x': x,
                'position-y': doubled,
                'position-z': () => x.value + 100,
                children: jsx('meshBasicMaterial', { ref: matRef, color })
            });
        });
        t.render(jsx(App, {}));
        const mesh = ref.current!;
        expect(renders).toBe(1);
        expect(mesh.position.toArray()).toEqual([1, 2, 101]);
        expect(matRef.current!.color.getHex()).toBe(0xff0000);
        batch(() => {
            x.value = 5;
            color.value = 'blue';
        });
        expect(renders).toBe(1);
        expect(mesh.position.toArray()).toEqual([5, 10, 105]);
        expect(matRef.current!.color.getHex()).toBe(0x0000ff);
        t.render(null);
        x.value = 9;
        expect(mesh.position.x).toBe(5); // binding stopped on unmount
        t.unmount();
    });

    it('a reactive object bound to a vector tracks its fields', () => {
        const t = createTestRoot();
        const state = signal({ pos: { x: 1, y: 2, z: 3 } });
        const ref = objectRef<THREE.Mesh>();
        t.render(jsx('mesh', { ref, position: state.pos }));
        expect(ref.current!.position.toArray()).toEqual([1, 2, 3]);
        state.pos.x = 10;
        expect(ref.current!.position.x).toBe(10);
        t.unmount();
    });
});
