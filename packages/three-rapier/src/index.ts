/**
 * @sigx/three-rapier — Rapier physics for @sigx/three.
 *
 * `<Physics>` owns a Rapier world stepped on the frame loop's fixed timestep;
 * `<RigidBody>` drives a `<group>` from a body (with auto-generated
 * colliders from its meshes); `<Collider>` adds explicit shapes; `<Debug>`
 * draws the collider outlines. Rapier itself (`@dimforge/rapier3d-compat`)
 * is a peer and is imported lazily by `<Physics>`.
 */
export { Physics } from './Physics.js';
export type { PhysicsProps } from './Physics.js';
export { RigidBody } from './RigidBody.js';
export type { RigidBodyProps, RigidBodyType } from './RigidBody.js';
export { Collider, colliderDesc } from './Collider.js';
export type { ColliderProps, ColliderShape } from './Collider.js';
export { Debug } from './Debug.js';
export { useRapier, useBodyHandle } from './context.js';
export type {
    RapierContext,
    RigidBodyApi,
    CollisionPayload,
    CollisionHandler,
    CollisionHandlers,
    BodyRecord,
    ColliderRecord,
    BodyHandle,
    Vec3Like,
    QuatLike,
    Rapier
} from './context.js';
export { autoColliders, colliderForMesh, applyColliderOptions } from './auto-colliders.js';
export type { AutoCollider, ColliderOptions } from './auto-colliders.js';
