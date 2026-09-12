/**
 * Composables for components rendered inside a three root.
 */
import { onScopeDispose } from '@sigx/reactivity';
import { defineInjectable, onUnmounted } from '@sigx/runtime-core';
import { getCurrentInstance, type InjectionToken } from '@sigx/runtime-core/internals';
import type { ThreeNode } from './node.js';
import type { FixedCallback, FixedHandle, FrameCallback } from './loop.js';
import type { ThreeState } from './root.js';

/**
 * The root's state (`gl`, `scene`, `camera`, `size`, `clock`, `invalidate`,
 * …). Throws outside a three root.
 */
export const useThree = defineInjectable<ThreeState>('sigx:three:root', {
    hint: 'Call it inside a component rendered by a three root — under <Canvas>, or a tree mounted with createRoot() / threeMount.'
});

/** The injection token behind `useThree`, for app-level provides (`threeMount`). */
export const ROOT_TOKEN = useThree._token as InjectionToken<ThreeState>;

/** Register a teardown with the enclosing component, else the active reactive scope. */
function disposeWith(fn: () => void): void {
    if (getCurrentInstance()) onUnmounted(fn);
    else onScopeDispose(fn);
}

export interface UseFrameOptions {
    /** Ordering: ascending, default 0. Negative runs before the app's callbacks, positive after. */
    priority?: number;
    /**
     * Take over rendering: while a `manual` subscriber exists the loop does not
     * call `gl.render` — you do (post-processing, multiple passes, render-to-texture).
     */
    manual?: boolean;
}

/**
 * Run `cb` every frame. Subscribers run in ascending `priority`; `manual`
 * hands rendering to you. Returns the unsubscribe; also unsubscribed on unmount.
 */
export function useFrame(cb: FrameCallback, opts?: UseFrameOptions): () => void {
    const off = useThree().subscribe(cb, opts?.priority ?? 0, opts?.manual === true);
    disposeWith(off);
    return off;
}

/**
 * Run `cb` on a fixed timestep (default the root's `fixedStep`, 1/60 s),
 * accumulating real time and stepping at most `maxSubSteps` times per frame.
 * `handle.alpha()` is the interpolation factor for rendering between steps.
 */
export function useFixedUpdate(cb: FixedCallback, opts?: { step?: number; maxSubSteps?: number }): FixedHandle {
    const handle = useThree().subscribeFixed(cb, opts);
    disposeWith(handle.stop);
    return handle;
}

/** The reactive size/dpr/frameloop primitives — safe to read in a render function. */
export function useSize(): ThreeState['reactive'] {
    return useThree().reactive;
}

/** A callback ref that resolves the host node to its three.js object on read. */
export type ObjectRef<T> = ((node: ThreeNode<T> | null) => void) & {
    /** The three.js object, or `null` before mount / after unmount. */
    readonly current: T | null;
    /** The host node core handed the ref. */
    readonly node: ThreeNode<T> | null;
};

/**
 * `const mesh = objectRef<Mesh>(); <mesh ref={mesh} />; mesh.current!.rotation.y += dt`
 *
 * Core hands a `ref` the HOST node — and it does so right after the props are
 * patched, BEFORE the three.js object is constructed (that happens on
 * insertion, because constructor `args` are props). `current` is therefore a
 * getter: it resolves the node's object when you read it, and keeps pointing
 * at the live object after an `args` change reconstructs it.
 */
export function objectRef<T = unknown>(): ObjectRef<T> {
    let node: ThreeNode<T> | null = null;
    const ref = ((n: ThreeNode<T> | null) => {
        node = n;
    }) as ObjectRef<T>;
    Object.defineProperties(ref, {
        current: { enumerable: true, get: () => (node === null ? null : node.object) },
        node: { enumerable: true, get: () => node }
    });
    return ref;
}
