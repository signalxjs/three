import { onScopeDispose } from '@sigx/reactivity';
import { onUnmounted } from '@sigx/runtime-core';
import { getCurrentInstance } from '@sigx/runtime-core/internals';

/**
 * Register teardown with the enclosing component (setup), else the active
 * reactive scope. Returns `false` when there is neither — the caller keeps
 * the returned `stop()` then.
 */
export function tryOnDispose(fn: () => void): boolean {
    if (getCurrentInstance()) {
        onUnmounted(fn);
        return true;
    }
    return onScopeDispose(fn);
}

/** `true` in a browser, `false` on the server / in Node. Every composable is a no-op without it. */
export const isBrowser: boolean = typeof window !== 'undefined' && typeof document !== 'undefined';

export const noop = (): void => {};
