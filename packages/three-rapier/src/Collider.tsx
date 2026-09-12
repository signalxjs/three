/** @jsxImportSource @sigx/runtime-core */
/**
 * `<Collider>` — an explicit collision shape. Inside a `<RigidBody>` it
 * attaches to that body; on its own it is a fixed collider in the world.
 */
import { component, type Define } from '@sigx/runtime-core';
import { Euler, Quaternion } from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { applyColliderOptions } from './auto-colliders.js';
import { useBodyHandle, useRapier, type CollisionHandler, type CollisionHandlers } from './context.js';

export type ColliderShape = 'cuboid' | 'ball' | 'capsule' | 'cylinder' | 'cone' | 'hull' | 'trimesh';

export type ColliderProps =
    & Define.Prop<'shape', ColliderShape, true>
    /**
     * cuboid: [hx, hy, hz] · ball: [radius] · capsule/cylinder/cone: [halfHeight, radius] ·
     * hull: [Float32Array] · trimesh: [Float32Array vertices, Uint32Array indices]
     */
    & Define.Prop<'args', unknown[], true>
    & Define.Prop<'position', [number, number, number]>
    & Define.Prop<'rotation', [number, number, number]>
    & Define.Prop<'sensor', boolean>
    & Define.Prop<'friction', number>
    & Define.Prop<'restitution', number>
    & Define.Prop<'density', number>
    & Define.Prop<'onCollisionEnter', CollisionHandler>
    & Define.Prop<'onCollisionExit', CollisionHandler>
    & Define.Prop<'onIntersectionEnter', CollisionHandler>
    & Define.Prop<'onIntersectionExit', CollisionHandler>
    & Define.Expose<{ readonly raw: RAPIER.Collider | null }>;

const euler = new Euler();
const quat = new Quaternion();

export function colliderDesc(R: typeof RAPIER, shape: ColliderShape, args: unknown[]): RAPIER.ColliderDesc | null {
    const a = args as number[];
    switch (shape) {
        case 'cuboid':
            return R.ColliderDesc.cuboid(a[0], a[1], a[2]);
        case 'ball':
            return R.ColliderDesc.ball(a[0]);
        case 'capsule':
            return R.ColliderDesc.capsule(a[0], a[1]);
        case 'cylinder':
            return R.ColliderDesc.cylinder(a[0], a[1]);
        case 'cone':
            return R.ColliderDesc.cone(a[0], a[1]);
        case 'hull':
            return R.ColliderDesc.convexHull(args[0] as Float32Array);
        case 'trimesh':
            return R.ColliderDesc.trimesh(args[0] as Float32Array, args[1] as Uint32Array);
    }
    return null;
}

export const Collider = component<ColliderProps>((ctx) => {
    const { props } = ctx;
    const rapier = useRapier();
    const body = useBodyHandle();
    let standalone: RAPIER.Collider | null = null;
    let detach: (() => void) | null = null;

    const handlers: CollisionHandlers = {
        get onCollisionEnter() {
            return props.onCollisionEnter;
        },
        get onCollisionExit() {
            return props.onCollisionExit;
        },
        get onIntersectionEnter() {
            return props.onIntersectionEnter;
        },
        get onIntersectionExit() {
            return props.onIntersectionExit;
        }
    };
    const hasEvents = (): boolean => !!(props.onCollisionEnter || props.onCollisionExit || props.onIntersectionEnter || props.onIntersectionExit);

    ctx.expose({
        get raw() {
            return standalone;
        }
    });

    // Runs in setup (before the parent body mounts): the body queues it.
    const R = rapier.rapier;
    const world = rapier.world;
    if (R !== null && world !== null) {
        const desc = colliderDesc(R, props.shape, props.args);
        if (desc !== null) {
            applyColliderOptions(R, desc, { friction: props.friction, restitution: props.restitution, density: props.density, sensor: props.sensor, events: hasEvents() });
            const p = props.position;
            if (p) desc.setTranslation(p[0], p[1], p[2]);
            const r = props.rotation;
            if (r) {
                quat.setFromEuler(euler.set(r[0], r[1], r[2]));
                desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
            }
            if (body !== null) {
                detach = body.attach(desc, hasEvents() ? handlers : null);
            } else {
                standalone = world.createCollider(desc);
                rapier.colliders.set(standalone.handle, { collider: standalone, body: null, handlers: hasEvents() ? handlers : null });
            }
        }
    }

    ctx.onUnmounted(() => {
        detach?.();
        detach = null;
        if (standalone !== null && rapier.world !== null) {
            rapier.colliders.delete(standalone.handle);
            rapier.world.removeCollider(standalone, true);
            standalone = null;
        }
    });

    return () => undefined;
}, { name: 'Collider' });
