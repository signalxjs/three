import { useThree } from '@sigx/three-runtime';
import { isBrowser, noop } from './scope.js';

/** Runs before the app's `useFrame` callbacks (input polling). */
export const PRIORITY_FIRST = -1_000_000;
/** Runs after the app's `useFrame` callbacks (edge clearing, matrix commits). */
export const PRIORITY_LAST = 1_000_000;

/**
 * Run `fn` once per frame at the given priority — on the enclosing three
 * root's loop when there is one, else on `requestAnimationFrame` (the input
 * composables also work in a DOM component above `<Canvas>`).
 * Returns a stop.
 */
export function frameHook(fn: (delta: number) => void, priority: number): () => void {
    let store: ReturnType<typeof useThree> | null = null;
    try {
        store = useThree();
    } catch {
        store = null;
    }
    if (store !== null) return store.subscribe((_, delta) => fn(delta), priority);
    if (!isBrowser) return noop;
    let id = 0;
    let last = -1;
    const tick = (t: number): void => {
        const delta = last < 0 ? 0 : (t - last) / 1000;
        last = t;
        fn(delta);
        id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
}
