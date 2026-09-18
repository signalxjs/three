import * as THREE from 'three';
import { createRoot, extend, type RootOptions, type ThreeRoot } from '@sigx/three-runtime';

extend({
    Mesh: THREE.Mesh,
    Group: THREE.Group,
    BoxGeometry: THREE.BoxGeometry,
    MeshBasicMaterial: THREE.MeshBasicMaterial,
    InstancedMesh: THREE.InstancedMesh
});

/** A headless root with a renderer that records nothing. */
export function benchRoot(options: Partial<RootOptions> = {}): ThreeRoot {
    return createRoot(null, {
        gl: { render() {} },
        scheduler: { request: () => 0, cancel() {}, now: () => 0 },
        size: { width: 800, height: 600 },
        frameloop: 'never',
        ...options
    });
}

export const sharedGeometry = new THREE.BoxGeometry();
export const sharedMaterial = new THREE.MeshBasicMaterial();
