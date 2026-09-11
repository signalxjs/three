import { isComputed, isSignal } from '@sigx/reactivity';
import type { MaybeSignal } from './types.js';

/**
 * Resolve a {@link MaybeSignal}: call getters, unwrap signal handles (primitive
 * signals, computeds — anything `isSignal`/`isComputed` recognises), pass
 * everything else through. Tracks as usual.
 *
 * A plain object that merely has a `value` property is NOT unwrapped (it is
 * indistinguishable from data); hand it over as a getter (`() => obj.value`).
 * Same contract as `@sigx/use`'s `toValue`.
 */
export function toValue<T>(source: MaybeSignal<T>): T {
    if (typeof source === 'function') return (source as () => T)();
    if (isComputed(source) || isSignal(source)) return (source as { value: T }).value;
    return source as T;
}
