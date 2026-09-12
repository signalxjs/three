/** @jsxImportSource @sigx/runtime-core */
/**
 * `<Physics>` — a Rapier world stepped on the frame loop's fixed timestep.
 *
 * Initialises the wasm module asynchronously and mounts its children only
 * once the world exists, so a `<RigidBody>` never sees an empty context.
 * Each fixed step: `world.step()`, drain collision events, snapshot poses.
 * Each frame (before the app's `useFrame` callbacks): write interpolated
 * poses to the bodies' groups.
 */
import { signal, watch } from '@sigx/reactivity';
import { component, defineProvide, Fragment, jsx, type Define, type JSXElement } from '@sigx/runtime-core';
import { useFixedUpdate, useFrame } from '@sigx/runtime-three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { useRapier, type Rapier, type RapierContext } from './context.js';
import { drainEvents } from './events.js';
import { snapshot, writeTransforms } from './sync.js';
import { Debug } from './Debug.js';

export type PhysicsProps =
    & Define.Prop<'gravity', [number, number, number]>
    & Define.Prop<'timeStep', number>
    & Define.Prop<'maxSubSteps', number>
    & Define.Prop<'interpolate', boolean>
    & Define.Prop<'paused', boolean>
    & Define.Prop<'debug', boolean>
    & Define.Prop<'onReady', (ctx: RapierContext) => void>
    & Define.Slot<'default'>;

async function loadRapier(): Promise<Rapier> {
    const mod = await import('@dimforge/rapier3d-compat');
    const R = ((mod as { default?: Rapier }).default ?? mod) as Rapier;
    await R.init();
    return R;
}

export const Physics = component<PhysicsProps>((ctx) => {
    const { props, slots } = ctx;
    const ready = signal(false);
    let disposed = false;

    const context: RapierContext = {
        rapier: null,
        world: null,
        eventQueue: null,
        ready,
        bodies: new Map(),
        colliders: new Map(),
        get step() {
            return props.timeStep ?? 1 / 60;
        },
        interpolate: props.interpolate ?? true,
        isPaused: () => props.paused === true
    };
    defineProvide(useRapier, () => context);

    const gravity = (): RAPIER.Vector3 => {
        const g = props.gravity ?? [0, -9.81, 0];
        return { x: g[0], y: g[1], z: g[2] } as RAPIER.Vector3;
    };

    loadRapier().then(
        (R) => {
            if (disposed) return;
            context.rapier = R;
            context.world = new R.World(gravity());
            context.eventQueue = new R.EventQueue(true);
            ready.value = true;
            props.onReady?.(context);
        },
        (error: unknown) => {
            console.error('[sigx/three-rapier] failed to initialise Rapier', error);
        }
    );

    watch(() => props.gravity, () => {
        if (context.world) context.world.gravity = gravity();
    });
    watch(() => props.interpolate, (v) => {
        context.interpolate = v ?? true;
    });

    const fixed = useFixedUpdate((step) => {
        const world = context.world;
        if (world === null || context.isPaused()) return;
        world.timestep = step;
        world.step(context.eventQueue!);
        drainEvents(context);
        snapshot(context);
    }, { step: props.timeStep, maxSubSteps: props.maxSubSteps });

    useFrame(() => {
        if (context.world === null) return;
        writeTransforms(context, context.isPaused() ? 1 : fixed.alpha());
    }, { priority: -100 });

    ctx.onUnmounted(() => {
        disposed = true;
        context.bodies.clear();
        context.colliders.clear();
        context.eventQueue?.free();
        context.world?.free();
        context.world = null;
        context.eventQueue = null;
    });

    return () => {
        if (!ready.value) return undefined;
        return jsx(Fragment, {
            children: [slots.default?.() ?? null, props.debug ? jsx(Debug, {}) : null]
        }) as JSXElement;
    };
}, { name: 'Physics' });
