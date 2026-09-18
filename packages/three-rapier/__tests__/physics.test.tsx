import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { signal } from '@sigx/reactivity';
import { component, type JSXElement } from '@sigx/runtime-core';
import { Physics, RigidBody, Collider, type RapierContext, type RigidBodyApi, type CollisionPayload } from '@sigx/three-rapier';
import { createTestRoot, type TestRoot } from '../../three-runtime/__tests__/harness.js';

beforeAll(async () => {
    // Warm the wasm once; <Physics> awaits the same module.
    const R = await import('@dimforge/rapier3d-compat');
    await ((R as any).default ?? R).init();
});

/** Mount a scene under <Physics> and resolve once the world exists. */
function mountPhysics(t: TestRoot, children: () => JSXElement, props: Record<string, unknown> = {}): Promise<RapierContext> {
    return new Promise((resolve) => {
        const App = component(() => () => (
            <Physics onReady={(ctx: RapierContext) => resolve(ctx)} {...props}>
                {children()}
            </Physics>
        ));
        t.render(<App />);
    });
}

function step(t: TestRoot, seconds: number): void {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) t.state.advance(1 / 60);
}

describe('<Physics> / <RigidBody>', () => {
    it('mounts children only once the world is ready and lets a dynamic body fall', async () => {
        const t = createTestRoot();
        let cube: RigidBodyApi | null = null;
        let rendered = false;
        const Box = component(() => {
            rendered = true;
            return () => (
                <RigidBody ref={(a: RigidBodyApi | null) => { cube = a; }} position={[0, 5, 0]}>
                    <mesh><boxGeometry args={[1, 1, 1]} /></mesh>
                </RigidBody>
            );
        });
        const ready = mountPhysics(t, () => <Box />);
        expect(rendered).toBe(false);
        const ctx = await ready;
        // The slot mounts on the reactive `ready` flip (synchronous once resolved).
        expect(rendered).toBe(true);
        expect(ctx.world!.bodies.len()).toBe(1);
        const group = cube!.group!;
        expect(group.position.y).toBe(5);
        step(t, 1);
        expect(group.position.y).toBeLessThan(2);
        expect(group.position.y).toBeGreaterThan(-5);
        t.unmount();
    });

    it('a fixed ground stops a falling ball and fires collision enter / exit', async () => {
        const t = createTestRoot();
        const enter = vi.fn();
        const exit = vi.fn();
        let ballApi: RigidBodyApi | null = null;
        let payload: CollisionPayload | null = null;
        const Scene = component(() => () => (
            <>
                <RigidBody type="fixed" colliders="cuboid">
                    <mesh position={[0, -0.5, 0]}><boxGeometry args={[20, 1, 20]} /></mesh>
                </RigidBody>
                <RigidBody
                    ref={(api: RigidBodyApi | null) => { ballApi = api; }}
                    position={[0, 3, 0]}
                    colliders="ball"
                    restitution={0.9}
                    onCollisionEnter={(p: CollisionPayload) => { enter(); payload = { ...p }; }}
                    onCollisionExit={exit}
                >
                    <mesh><sphereGeometry args={[0.5, 8, 8]} /></mesh>
                </RigidBody>
            </>
        ));
        const ctx = await mountPhysics(t, () => <Scene />);
        expect(ctx.world!.bodies.len()).toBe(2);
        step(t, 1.5);
        expect(enter).toHaveBeenCalled();
        expect(exit).toHaveBeenCalled(); // it bounced
        expect(payload!.target).not.toBeNull();
        expect(payload!.other).not.toBeNull();
        expect(payload!.target).not.toBe(payload!.other);
        step(t, 3);
        const api = ballApi!;
        const p = new THREE.Vector3();
        api.translation(p);
        expect(p.y).toBeGreaterThan(0.4);   // resting on the ground, not through it
        expect(p.y).toBeLessThan(1);
        t.unmount();
    });

    it('a standalone sensor collider reports intersections', async () => {
        const t = createTestRoot();
        const enter = vi.fn();
        const exit = vi.fn();
        const Scene = component(() => () => (
            <>
                <Collider shape="cuboid" args={[2, 0.5, 2]} position={[0, 2, 0]} sensor onIntersectionEnter={enter} onIntersectionExit={exit} />
                <RigidBody position={[0, 5, 0]} colliders="ball">
                    <mesh><sphereGeometry args={[0.25, 8, 8]} /></mesh>
                </RigidBody>
            </>
        ));
        await mountPhysics(t, () => <Scene />);
        step(t, 2);
        expect(enter).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);
        t.unmount();
    });

    it('explicit child colliders attach to the body; unmounting a body frees it', async () => {
        const t = createTestRoot();
        const show = signal(true);
        const Scene = component(() => () => (
            <>
                {show.value ? (
                    <RigidBody position={[0, 1, 0]} colliders={false}>
                        <Collider shape="ball" args={[0.5]} />
                        <Collider shape="cuboid" args={[0.2, 0.2, 0.2]} position={[1, 0, 0]} />
                    </RigidBody>
                ) : null}
            </>
        ));
        const ctx = await mountPhysics(t, () => <Scene />);
        expect(ctx.world!.bodies.len()).toBe(1);
        expect(ctx.world!.colliders.len()).toBe(2);
        expect(ctx.colliders.size).toBe(2);
        show.value = false;
        expect(ctx.world!.bodies.len()).toBe(0);
        expect(ctx.world!.colliders.len()).toBe(0);
        expect(ctx.bodies.size).toBe(0);
        expect(ctx.colliders.size).toBe(0);
        t.unmount();
    });

    it('the api applies impulses and reads velocities without allocating on read', async () => {
        const t = createTestRoot();
        let api: RigidBodyApi | null = null;
        const Scene = component(() => () => (
            <RigidBody ref={(a: RigidBodyApi | null) => { api = a; }} position={[0, 0, 0]} gravityScale={0} colliders="ball">
                <mesh><sphereGeometry args={[0.5, 8, 8]} /></mesh>
            </RigidBody>
        ));
        await mountPhysics(t, () => <Scene />);
        api!.applyImpulse({ x: 0, y: 0, z: 5 });
        step(t, 0.5);
        const v = new THREE.Vector3();
        expect(api!.linvel(v)).toBe(v);
        expect(v.z).toBeGreaterThan(0);
        const p = new THREE.Vector3();
        api!.translation(p);
        expect(p.z).toBeGreaterThan(0);
        expect(api!.group!.position.z).toBeGreaterThan(0);
        t.unmount();
    });

    it('paused stops stepping; interpolation writes between steps', async () => {
        const t = createTestRoot();
        const paused = signal(false);
        let cube: RigidBodyApi | null = null;
        const ready = new Promise<RapierContext>((resolve) => {
            // `paused` is read in render, so a change re-renders <Physics> with the new prop.
            const App = component(() => () => (
                <Physics paused={paused.value} onReady={resolve}>
                    <RigidBody ref={(a: RigidBodyApi | null) => { cube = a; }} position={[0, 5, 0]}>
                        <mesh><boxGeometry args={[1, 1, 1]} /></mesh>
                    </RigidBody>
                </Physics>
            ));
            t.render(<App />);
        });
        await ready;
        step(t, 0.5);
        expect(cube!.group!.position.y).toBeLessThan(5);
        paused.value = true;
        // Pausing snaps the render pose to the last full step (one interpolation
        // step of catch-up), then nothing moves.
        step(t, 1 / 60);
        const y = cube!.group!.position.y;
        step(t, 0.5);
        expect(cube!.group!.position.y).toBe(y);
        paused.value = false;
        step(t, 0.5);
        expect(cube!.group!.position.y).toBeLessThan(y);
        t.unmount();
    });
});
