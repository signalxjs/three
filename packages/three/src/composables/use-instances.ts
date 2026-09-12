import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import type { ThreeNode } from '@sigx/runtime-three';

export interface Instances {
    readonly count: number;
    /** xyz per instance. */
    readonly position: Float32Array;
    /** xyzw per instance (identity by default). */
    readonly quaternion: Float32Array;
    /** xyz per instance (1 by default). */
    readonly scale: Float32Array;
    /** rgb per instance, when `color: true`. */
    readonly color: Float32Array | null;
    /** The mesh, once mounted. */
    readonly mesh: InstancedMesh | null;
    /** Pass as `ref` to the `<instancedMesh>`. */
    ref(node: ThreeNode<InstancedMesh> | null): void;
    setPosition(i: number, x: number, y: number, z: number): void;
    setQuaternion(i: number, x: number, y: number, z: number, w: number): void;
    setScale(i: number, x: number, y: number, z: number): void;
    setColor(i: number, r: number, g: number, b: number): void;
    /** Compose every instance matrix into the mesh and flag the buffers for upload. Call once per frame after your updates. */
    commit(): void;
}

export interface UseInstancesOptions {
    /** Allocate a per-instance color buffer (`instanceColor`). Default false. */
    color?: boolean;
}

/**
 * Typed-array-backed transforms for an `<instancedMesh>`: write positions /
 * rotations / scales into flat arrays in `useFrame`, then `commit()` composes
 * them into the instance matrices with one scratch `Matrix4` — no allocation
 * per instance or frame.
 *
 * @example
 * ```tsx
 * const rocks = useInstances(500);
 * useFrame((_, dt) => {
 *     for (let i = 0; i < rocks.count; i++) rocks.position[i * 3] += dt;
 *     rocks.commit();
 * });
 * return () => <instancedMesh ref={rocks.ref} args={[geometry, material, rocks.count]} frustumCulled={false} />;
 * ```
 */
export function useInstances(count: number, options: UseInstancesOptions = {}): Instances {
    const position = new Float32Array(count * 3);
    const quaternion = new Float32Array(count * 4);
    const scale = new Float32Array(count * 3);
    const color = options.color ? new Float32Array(count * 3) : null;
    for (let i = 0; i < count; i++) {
        quaternion[i * 4 + 3] = 1;
        scale[i * 3] = scale[i * 3 + 1] = scale[i * 3 + 2] = 1;
        if (color) color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = 1;
    }
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    const c = new Color();
    let mesh: InstancedMesh | null = null;
    let node: ThreeNode<InstancedMesh> | null = null;

    return {
        count,
        position,
        quaternion,
        scale,
        color,
        get mesh() {
            return node?.object ?? mesh;
        },
        ref(n) {
            node = n;
            mesh = n?.object ?? null;
        },
        setPosition(i, x, y, z) {
            const o = i * 3;
            position[o] = x;
            position[o + 1] = y;
            position[o + 2] = z;
        },
        setQuaternion(i, x, y, z, w) {
            const o = i * 4;
            quaternion[o] = x;
            quaternion[o + 1] = y;
            quaternion[o + 2] = z;
            quaternion[o + 3] = w;
        },
        setScale(i, x, y, z) {
            const o = i * 3;
            scale[o] = x;
            scale[o + 1] = y;
            scale[o + 2] = z;
        },
        setColor(i, r, g, b) {
            if (color === null) return;
            const o = i * 3;
            color[o] = r;
            color[o + 1] = g;
            color[o + 2] = b;
        },
        commit() {
            const target = node?.object ?? mesh;
            if (target === null || target === undefined) return;
            const array = target.instanceMatrix.array as Float32Array;
            for (let i = 0; i < count; i++) {
                p.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
                q.set(quaternion[i * 4], quaternion[i * 4 + 1], quaternion[i * 4 + 2], quaternion[i * 4 + 3]);
                s.set(scale[i * 3], scale[i * 3 + 1], scale[i * 3 + 2]);
                m.compose(p, q, s);
                m.toArray(array, i * 16);
            }
            target.instanceMatrix.needsUpdate = true;
            if (color !== null) {
                if (target.instanceColor === null) {
                    for (let i = 0; i < count; i++) target.setColorAt(i, c.setRGB(color[i * 3], color[i * 3 + 1], color[i * 3 + 2]));
                } else {
                    (target.instanceColor.array as Float32Array).set(color);
                }
                target.instanceColor!.needsUpdate = true;
            }
        }
    };
}
