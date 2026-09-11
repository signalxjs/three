import { isComputed, isSignal } from '@sigx/reactivity';
import type { MaybeSignal } from './types.js';

/** Resolve a {@link MaybeSignal}: call getters, unwrap `{ value }` handles, pass values through. Tracks as usual. */
export function toValue<T>(source: MaybeSignal<T>): T {
    if (typeof source === 'function') return (source as () => T)();
    if (isComputed(source) || isSignal(source)) return (source as { value: T }).value;
    return source as T;
}
