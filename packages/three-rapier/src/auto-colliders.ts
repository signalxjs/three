/**
 * Colliders generated from a body's mesh descendants.
 */
import { Box3, Matrix4, Quaternion, Vector3, type BufferGeometry, type Mesh, type Object3D } from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from './context.js';

export type AutoCollider = 'cuboid' | 'ball' | 'hull' | 'trimesh';

export interface ColliderOptions {
    friction?: number;
    restitution?: number;
    density?: number;
    sensor?: boolean;
    /** Emit collision events for these colliders. */
    events?: boolean;
}

const inverse = new Matrix4();
const relative = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const box = new Box3();
const center = new Vector3();
const size = new Vector3();

export function applyColliderOptions(R: Rapier, desc: RAPIER.ColliderDesc, options: ColliderOptions): RAPIER.ColliderDesc {
    if (options.friction !== undefined) desc.setFriction(options.friction);
    if (options.restitution !== undefined) desc.setRestitution(options.restitution);
    if (options.density !== undefined) desc.setDensity(options.density);
    if (options.sensor) desc.setSensor(true);
    if (options.events) desc.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    return desc;
}

function scaledPositions(geometry: BufferGeometry, s: Vector3): Float32Array {
    const attr = geometry.getAttribute('position');
    const n = attr.count;
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        out[i * 3] = attr.getX(i) * s.x;
        out[i * 3 + 1] = attr.getY(i) * s.y;
        out[i * 3 + 2] = attr.getZ(i) * s.z;
    }
    return out;
}

/** One collider desc for a mesh, expressed relative to `group`. */
export function colliderForMesh(R: Rapier, mesh: Mesh, group: Object3D, kind: AutoCollider): RAPIER.ColliderDesc | null {
    const geometry = mesh.geometry;
    inverse.copy(group.matrixWorld).invert();
    relative.multiplyMatrices(inverse, mesh.matrixWorld);
    relative.decompose(position, quaternion, scale);

    let desc: RAPIER.ColliderDesc | null = null;
    switch (kind) {
        case 'cuboid': {
            if (geometry.boundingBox === null) geometry.computeBoundingBox();
            box.copy(geometry.boundingBox!);
            box.getSize(size);
            box.getCenter(center);
            desc = R.ColliderDesc.cuboid((size.x * scale.x) / 2, (size.y * scale.y) / 2, (size.z * scale.z) / 2);
            center.multiply(scale).applyQuaternion(quaternion).add(position);
            desc.setTranslation(center.x, center.y, center.z).setRotation(quaternion);
            return desc;
        }
        case 'ball': {
            if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
            const sphere = geometry.boundingSphere!;
            desc = R.ColliderDesc.ball(sphere.radius * Math.max(scale.x, scale.y, scale.z));
            center.copy(sphere.center).multiply(scale).applyQuaternion(quaternion).add(position);
            desc.setTranslation(center.x, center.y, center.z);
            return desc;
        }
        case 'hull': {
            desc = R.ColliderDesc.convexHull(scaledPositions(geometry, scale));
            if (desc === null) return null;
            desc.setTranslation(position.x, position.y, position.z).setRotation(quaternion);
            return desc;
        }
        case 'trimesh': {
            const vertices = scaledPositions(geometry, scale);
            const index = geometry.getIndex();
            const indices = index ? Uint32Array.from(index.array) : Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i);
            desc = R.ColliderDesc.trimesh(vertices, indices);
            desc.setTranslation(position.x, position.y, position.z).setRotation(quaternion);
            return desc;
        }
    }
    return null;
}

/** Collider descs for every mesh under `group`. */
export function autoColliders(R: Rapier, group: Object3D, kind: AutoCollider, options: ColliderOptions): RAPIER.ColliderDesc[] {
    group.updateWorldMatrix(true, true);
    const descs: RAPIER.ColliderDesc[] = [];
    group.traverse((o) => {
        if ((o as Mesh).isMesh !== true) return;
        const desc = colliderForMesh(R, o as Mesh, group, kind);
        if (desc !== null) descs.push(applyColliderOptions(R, desc, options));
    });
    return descs;
}
