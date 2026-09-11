/** @jsxImportSource @sigx/runtime-core */
/**
 * `<Debug>` — Rapier's debug lines (collider outlines, joints) as
 * `lineSegments`. Development aid: `world.debugRender()` allocates per frame.
 */
import { component, jsx, type JSXElement } from '@sigx/runtime-core';
import { useFrame } from '@sigx/runtime-three';
import { BufferAttribute, BufferGeometry } from 'three';
import { useRapier } from './context.js';

export const Debug = component((ctx) => {
    const rapier = useRapier();
    const geometry = new BufferGeometry();
    // Attributes exist from the start (an empty world renders zero segments).
    let capacity = 3;
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array((capacity / 3) * 4), 4));
    geometry.setDrawRange(0, 0);

    useFrame(() => {
        const world = rapier.world;
        if (world === null) return;
        const buffers = world.debugRender();
        const vertices = buffers.vertices;
        const colors = buffers.colors;
        if (vertices.length > capacity) {
            capacity = vertices.length;
            geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity), 3));
            geometry.setAttribute('color', new BufferAttribute(new Float32Array((capacity / 3) * 4), 4));
        }
        const position = geometry.getAttribute('position') as BufferAttribute;
        const color = geometry.getAttribute('color') as BufferAttribute;
        (position.array as Float32Array).set(vertices);
        (color.array as Float32Array).set(colors);
        position.needsUpdate = true;
        color.needsUpdate = true;
        geometry.setDrawRange(0, vertices.length / 3);
    }, { priority: -50 });

    ctx.onUnmounted(() => geometry.dispose());

    return () =>
        jsx('lineSegments', {
            frustumCulled: false,
            renderOrder: 1000,
            children: [
                jsx('primitive', { object: geometry, attach: 'geometry' }),
                jsx('lineBasicMaterial', { vertexColors: true, transparent: true, depthTest: false })
            ]
        }) as JSXElement;
}, { name: 'PhysicsDebug' });
