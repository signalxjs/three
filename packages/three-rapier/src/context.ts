/**
 * The physics context `<Physics>` provides and `useRapier()` reads.
 */
import { defineInjectable } from '@sigx/runtime-core';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Object3D, Quaternion, Vector3 } from 'three';

export type Rapier = typeof RAPIER;

export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}
export interface QuatLike extends Vec3Like {
    w: number;
}

/** What a collision / intersection handler receives. The object is REUSED between dispatches — do not retain it. */
export interface CollisionPayload {
    /** The body whose handler is running (null for a standalone collider). */
    target: RigidBodyApi | null;
    /** The other body (null for a standalone collider). */
    other: RigidBodyApi | null;
    targetCollider: RAPIER.Collider;
    otherCollider: RAPIER.Collider;
}
export type CollisionHandler = (payload: CollisionPayload) => void;

export interface CollisionHandlers {
    onCollisionEnter?: CollisionHandler;
    onCollisionExit?: CollisionHandler;
    onIntersectionEnter?: CollisionHandler;
    onIntersectionExit?: CollisionHandler;
}

/** Imperative access to a body, via `<RigidBody ref>`. */
export interface RigidBodyApi {
    /** The Rapier body, once mounted. */
    readonly raw: RAPIER.RigidBody | null;
    /** The three.js group the body drives. */
    readonly group: Object3D | null;
    readonly handle: number;
    applyImpulse(impulse: Vec3Like, wake?: boolean): void;
    applyTorqueImpulse(torque: Vec3Like, wake?: boolean): void;
    addForce(force: Vec3Like, wake?: boolean): void;
    resetForces(wake?: boolean): void;
    setLinvel(velocity: Vec3Like, wake?: boolean): void;
    setAngvel(velocity: Vec3Like, wake?: boolean): void;
    setTranslation(position: Vec3Like, wake?: boolean): void;
    setRotation(rotation: QuatLike, wake?: boolean): void;
    setNextKinematicTranslation(position: Vec3Like): void;
    setNextKinematicRotation(rotation: QuatLike): void;
    /** Read into `out` (no allocation). */
    linvel(out: Vector3): Vector3;
    angvel(out: Vector3): Vector3;
    translation(out: Vector3): Vector3;
    rotation(out: Quaternion): Quaternion;
    sleep(): void;
    wakeUp(): void;
    isSleeping(): boolean;
}

/** Per-body bookkeeping. */
export interface BodyRecord {
    body: RAPIER.RigidBody;
    group: Object3D;
    api: RigidBodyApi;
    /** Pose at the previous / current step: x y z qx qy qz qw. */
    prev: Float32Array;
    curr: Float32Array;
    /** Fixed bodies are written once. */
    fixed: boolean;
    written: boolean;
    handlers: CollisionHandlers;
    onSleep?: () => void;
    onWake?: () => void;
    sleeping: boolean;
    colliders: number[];
}

export interface ColliderRecord {
    collider: RAPIER.Collider;
    body: BodyRecord | null;
    handlers: CollisionHandlers | null;
}

export interface RapierContext {
    /** The module, once initialised. */
    rapier: Rapier | null;
    world: RAPIER.World | null;
    eventQueue: RAPIER.EventQueue | null;
    /** Reactive: whether the world exists. `<Physics>` mounts its children only then. */
    readonly ready: { readonly value: boolean };
    /** Bodies by handle. */
    readonly bodies: Map<number, BodyRecord>;
    /** Colliders by handle. */
    readonly colliders: Map<number, ColliderRecord>;
    readonly step: number;
    interpolate: boolean;
    isPaused(): boolean;
}

/**
 * The physics context (`world`, `rapier`, the body registry). Throws outside
 * `<Physics>`.
 */
export const useRapier = defineInjectable<RapierContext>('sigx:three:rapier', {
    hint: 'Render the component inside <Physics>.'
});

/** A parent `<RigidBody>` hands its child `<Collider>`s this; null when the collider is standalone. */
export interface BodyHandle {
    /** Attach a collider to this body (queued until the body exists). Returns a detach. */
    attach(desc: RAPIER.ColliderDesc, handlers: CollisionHandlers | null): () => void;
}

export const useBodyHandle = defineInjectable<BodyHandle | null>(() => null, { name: 'sigx:three:rapier:body' });
