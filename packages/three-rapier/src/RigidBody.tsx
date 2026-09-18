/** @jsxImportSource @sigx/runtime-core */
/**
 * `<RigidBody>` — a `<group>` driven by a Rapier body.
 *
 * Place it directly under `<Physics>` (or under untransformed parents): the
 * body lives in world space and its pose is written to the group's local
 * transform.
 */
import { toRaw, watch } from '@sigx/reactivity';
import { component, defineProvide, jsx, type Define, type JSXElement } from '@sigx/runtime-core';
import { objectRef } from '@sigx/three-runtime';
import { Euler, Quaternion, type Group, type Vector3 } from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { autoColliders, applyColliderOptions, type AutoCollider } from './auto-colliders.js';
import {
    useBodyHandle,
    useRapier,
    type BodyHandle,
    type BodyRecord,
    type CollisionHandler,
    type CollisionHandlers,
    type QuatLike,
    type RigidBodyApi,
    type Vec3Like
} from './context.js';
import { seedPose } from './sync.js';

export type RigidBodyType = 'dynamic' | 'fixed' | 'kinematicPosition' | 'kinematicVelocity';

export type RigidBodyProps =
    & Define.Prop<'type', RigidBodyType>
    & Define.Prop<'colliders', AutoCollider | false>
    & Define.Prop<'position', [number, number, number]>
    & Define.Prop<'rotation', [number, number, number]>
    & Define.Prop<'quaternion', [number, number, number, number]>
    & Define.Prop<'linvel', [number, number, number]>
    & Define.Prop<'angvel', [number, number, number]>
    & Define.Prop<'mass', number>
    & Define.Prop<'linearDamping', number>
    & Define.Prop<'angularDamping', number>
    & Define.Prop<'gravityScale', number>
    & Define.Prop<'ccd', boolean>
    & Define.Prop<'canSleep', boolean>
    & Define.Prop<'lockRotations', boolean>
    & Define.Prop<'enabledRotations', [boolean, boolean, boolean]>
    & Define.Prop<'friction', number>
    & Define.Prop<'restitution', number>
    & Define.Prop<'density', number>
    & Define.Prop<'sensor', boolean>
    & Define.Prop<'userData', unknown>
    & Define.Prop<'onCollisionEnter', CollisionHandler>
    & Define.Prop<'onCollisionExit', CollisionHandler>
    & Define.Prop<'onIntersectionEnter', CollisionHandler>
    & Define.Prop<'onIntersectionExit', CollisionHandler>
    & Define.Prop<'onSleep', () => void>
    & Define.Prop<'onWake', () => void>
    & Define.Slot<'default'>
    & Define.Expose<RigidBodyApi>;

const euler = new Euler();
const quat = new Quaternion();

function bodyType(R: typeof RAPIER, type: RigidBodyType | undefined): RAPIER.RigidBodyType {
    switch (type) {
        case 'fixed':
            return R.RigidBodyType.Fixed;
        case 'kinematicPosition':
            return R.RigidBodyType.KinematicPositionBased;
        case 'kinematicVelocity':
            return R.RigidBodyType.KinematicVelocityBased;
        default:
            return R.RigidBodyType.Dynamic;
    }
}

export const RigidBody = component<RigidBodyProps>((ctx) => {
    const { props, slots } = ctx;
    const rapier = useRapier();
    const group = objectRef<Group>();
    let record: BodyRecord | null = null;
    const pendingColliders: Array<{ desc: RAPIER.ColliderDesc; handlers: CollisionHandlers | null; attached: RAPIER.Collider | null }> = [];

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

    const raw = (): RAPIER.RigidBody | null => record?.body ?? null;
    const api: RigidBodyApi = {
        get raw() {
            return raw();
        },
        get group() {
            return group.current;
        },
        get handle() {
            return record?.body.handle ?? -1;
        },
        applyImpulse: (v, wake = true) => raw()?.applyImpulse(v, wake),
        applyTorqueImpulse: (v, wake = true) => raw()?.applyTorqueImpulse(v, wake),
        addForce: (v, wake = true) => raw()?.addForce(v, wake),
        resetForces: (wake = true) => raw()?.resetForces(wake),
        setLinvel: (v, wake = true) => raw()?.setLinvel(v, wake),
        setAngvel: (v, wake = true) => raw()?.setAngvel(v, wake),
        setTranslation: (v: Vec3Like, wake = true) => {
            raw()?.setTranslation(v, wake);
            if (record) seedPose(record);
        },
        setRotation: (q: QuatLike, wake = true) => {
            raw()?.setRotation(q, wake);
            if (record) seedPose(record);
        },
        setNextKinematicTranslation: (v) => raw()?.setNextKinematicTranslation(v),
        setNextKinematicRotation: (q) => raw()?.setNextKinematicRotation(q),
        linvel: (out: Vector3) => {
            const v = raw()?.linvel();
            return v ? out.set(v.x, v.y, v.z) : out.set(0, 0, 0);
        },
        angvel: (out: Vector3) => {
            const v = raw()?.angvel();
            return v ? out.set(v.x, v.y, v.z) : out.set(0, 0, 0);
        },
        translation: (out: Vector3) => {
            const v = raw()?.translation();
            return v ? out.set(v.x, v.y, v.z) : out.set(0, 0, 0);
        },
        rotation: (out: Quaternion) => {
            const q = raw()?.rotation();
            return q ? out.set(q.x, q.y, q.z, q.w) : out.identity();
        },
        sleep: () => raw()?.sleep(),
        wakeUp: () => raw()?.wakeUp(),
        isSleeping: () => raw()?.isSleeping() ?? false
    };
    ctx.expose(api);

    // Child <Collider>s attach through this; they mount before the body exists.
    const bodyHandle: BodyHandle = {
        attach(desc, colliderHandlers) {
            const entry = { desc, handlers: colliderHandlers, attached: null as RAPIER.Collider | null };
            pendingColliders.push(entry);
            if (record !== null) attachCollider(entry);
            return () => {
                const i = pendingColliders.indexOf(entry);
                if (i !== -1) pendingColliders.splice(i, 1);
                if (entry.attached !== null && rapier.world !== null) {
                    rapier.colliders.delete(entry.attached.handle);
                    rapier.world.removeCollider(entry.attached, true);
                    entry.attached = null;
                }
            };
        }
    };
    defineProvide(useBodyHandle, () => bodyHandle);

    function attachCollider(entry: { desc: RAPIER.ColliderDesc; handlers: CollisionHandlers | null; attached: RAPIER.Collider | null }): void {
        const world = rapier.world!;
        const rec = record!;
        const collider = world.createCollider(entry.desc, rec.body);
        entry.attached = collider;
        rec.colliders.push(collider.handle);
        rapier.colliders.set(collider.handle, { collider, body: rec, handlers: entry.handlers });
    }

    function hasEvents(): boolean {
        return !!(props.onCollisionEnter || props.onCollisionExit || props.onIntersectionEnter || props.onIntersectionExit);
    }

    ctx.onMounted(() => {
        const R = rapier.rapier;
        const world = rapier.world;
        const g = group.current;
        if (R === null || world === null || g === null) return;

        const desc = new R.RigidBodyDesc(bodyType(R, props.type));
        const p = props.position;
        if (p) {
            desc.setTranslation(p[0], p[1], p[2]);
            g.position.set(p[0], p[1], p[2]);
        } else {
            desc.setTranslation(g.position.x, g.position.y, g.position.z);
        }
        if (props.quaternion) {
            const q = props.quaternion;
            quat.set(q[0], q[1], q[2], q[3]);
        } else if (props.rotation) {
            const r = props.rotation;
            quat.setFromEuler(euler.set(r[0], r[1], r[2]));
        } else {
            quat.copy(g.quaternion);
        }
        g.quaternion.copy(quat);
        desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
        if (props.linvel) desc.setLinvel(props.linvel[0], props.linvel[1], props.linvel[2]);
        if (props.angvel) desc.setAngvel({ x: props.angvel[0], y: props.angvel[1], z: props.angvel[2] });
        if (props.mass !== undefined) desc.setAdditionalMass(props.mass);
        if (props.linearDamping !== undefined) desc.setLinearDamping(props.linearDamping);
        if (props.angularDamping !== undefined) desc.setAngularDamping(props.angularDamping);
        if (props.gravityScale !== undefined) desc.setGravityScale(props.gravityScale);
        if (props.ccd) desc.setCcdEnabled(true);
        if (props.canSleep === false) desc.setCanSleep(false);
        if (props.lockRotations) desc.lockRotations();
        if (props.enabledRotations) desc.enabledRotations(props.enabledRotations[0], props.enabledRotations[1], props.enabledRotations[2]);
        if (props.userData !== undefined) desc.setUserData(toRaw(props.userData));

        const body = world.createRigidBody(desc);
        const rec: BodyRecord = {
            body,
            group: g,
            api,
            prev: new Float32Array(7),
            curr: new Float32Array(7),
            fixed: props.type === 'fixed',
            written: false,
            handlers,
            onSleep: props.onSleep,
            onWake: props.onWake,
            sleeping: false,
            colliders: []
        };
        seedPose(rec);
        record = rec;
        rapier.bodies.set(body.handle, rec);

        const kind = props.colliders === undefined ? 'cuboid' : props.colliders;
        if (kind !== false) {
            const options = { friction: props.friction, restitution: props.restitution, density: props.density, sensor: props.sensor, events: hasEvents() };
            for (const cd of autoColliders(R, g, kind, options)) {
                const collider = world.createCollider(cd, body);
                rec.colliders.push(collider.handle);
                rapier.colliders.set(collider.handle, { collider, body: rec, handlers: null });
            }
        }
        for (const entry of pendingColliders) {
            if (hasEvents()) applyColliderOptions(R, entry.desc, { events: true });
            attachCollider(entry);
        }
    });

    watch(() => props.type, (type) => {
        const R = rapier.rapier;
        if (record !== null && R !== null) {
            record.body.setBodyType(bodyType(R, type), true);
            record.fixed = type === 'fixed';
            record.written = false;
        }
    });

    ctx.onUnmounted(() => {
        const rec = record;
        record = null;
        if (rec === null || rapier.world === null) return;
        for (const h of rec.colliders) rapier.colliders.delete(h);
        for (const entry of pendingColliders) entry.attached = null;
        rapier.bodies.delete(rec.body.handle);
        rapier.world.removeRigidBody(rec.body);
    });

    return () => jsx('group', { ref: group, children: slots.default?.() ?? null }) as JSXElement;
}, { name: 'RigidBody' });
